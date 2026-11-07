import { invokeLLM } from "./_lib/llm.js";
import {
  assemblePost,
  bodyProblem,
  fallbackBody,
  bodyPrompt,
  pickPostOptions,
  REPOST_AFTER_DAYS,
} from "./_lib/facebookPosts.js";
import { publishToPage } from "./_lib/facebookPublish.js";
import { audit, DRAFT_TTL_DAYS, isApprovalMethod, OPTIONS_PER_DAY } from "./_lib/postApprovals.js";
import { adminClient, getAuthedUser, isCronRequest } from "./_lib/supabase.js";

// The daily Facebook step for every connected Page (Vercel cron in
// vercel.json), or for the caller's own Page when a signed-in person asks.
//
// What it does depends on the Page's post_mode (see _lib/postApprovals.js):
//   - "approve": writes up to OPTIONS_PER_DAY drafts for the owner to flick
//     through and approve one (api/publishApproved.js publishes it);
//   - "auto": publishes one post, as it always has.
// Which products qualify, and whether their picture may be used, is decided
// in _lib/facebookPosts.js. Every post opens with the #ad disclosure and
// carries the tracked /r/ link, so clicks show up in the app.
//
// Body options:
//   dry_run: true  -- return what would be written, change nothing.
//   fresh: true    -- "Show me different ones": skip today's waiting drafts
//                     and write new ones for other products.
//   method         -- how the person asked for "fresh" (tap/voice/keyboard/switch).

// Cron requests arrive on whatever host Vercel calls; links must always point
// at the public app.
const APP_ORIGIN = process.env.APP_ORIGIN || "https://apx.amhere4utoday.com";

async function writeBody(product) {
  try {
    const { text } = await invokeLLM({ prompt: bodyPrompt(product) });
    const body = String(text || "").trim().replace(/^["“]|["”]$/g, "");
    const problem = bodyProblem(body, product);
    if (!problem) return body;
    console.log("facebookAutoPost: model text refused:", problem);
  } catch (error) {
    console.error("facebookAutoPost: writing failed, using plain text:", error?.message);
  }
  return fallbackBody(product);
}

async function reachable(url) {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok;
  } catch {
    return false;
  }
}

async function notify(admin, userId, title, body, linkTo = "/social") {
  await admin.from("notifications").insert({ user_id: userId, type: "general", title, body, link_to: linkTo, read: false });
}

async function loadInputs(admin, userId) {
  const since = new Date(Date.now() - REPOST_AFTER_DAYS * 86400000).toISOString();
  const [{ data: products }, { data: links }, { data: recentPosts }, { data: videos }] = await Promise.all([
    admin.from("products").select("*").eq("created_by_id", userId).eq("is_active", true),
    admin.from("affiliate_links").select("id, product_id, short_code, destination_url, clicks, is_active").eq("created_by_id", userId).eq("is_active", true),
    admin.from("generated_posts").select("product_id, published_at").eq("created_by_id", userId).eq("platform", "facebook").gte("published_at", since),
    admin.from("ad_assets").select("product_id, file_url, file_type, is_official, created_at").eq("created_by_id", userId).eq("file_type", "video").not("product_id", "is", null),
  ]);
  return { products: products || [], links: links || [], recentPosts: recentPosts || [], videos: videos || [] };
}

/** Writes the finished post for one picked option. */
async function buildPost(option) {
  const body = await writeBody(option.product);
  const message = assemblePost({ product: option.product, link: option.link, body, origin: APP_ORIGIN });
  const imageUrl = option.withImage ? option.product.image_url : null;
  // A saved video can point at a link that has since expired; post the
  // picture instead of handing Facebook a dead file.
  const videoUrl = option.video && (await reachable(option.video.file_url)) ? option.video.file_url : null;
  return { body, message, imageUrl, videoUrl };
}

async function recordPublished(admin, userId, option, message, now) {
  await admin.from("generated_posts").insert({
    created_by_id: userId,
    link_id: option.link_id,
    product_id: option.product_id,
    product_name: option.product_name,
    platform: "facebook",
    content: message,
    status: "posted",
    published_at: now,
    created_at: now,
  });
}

/** "auto" mode: publish one post now, as the app always has. */
async function autoPostFor(admin, connection, { dryRun }) {
  const userId = connection.user_id;
  const { options, held } = pickPostOptions({ ...(await loadInputs(admin, userId)), count: 1 });
  const next = options[0];
  if (!next) return { posted: false, reason: "Nothing ready to post today.", held: held.length };

  const post = await buildPost(next);
  if (dryRun) return { posted: false, dryRun: true, product: next.product.name, ...post, held: held.length };

  const outcome = await publishToPage(connection, post);
  if (!outcome.ok) {
    console.error("facebookAutoPost: publish failed", userId, outcome);
    await audit(admin, { user_id: userId, action: "publish_failed", detail: { mode: "auto", product: next.product.name, reason: outcome.reason, detail: outcome.detail } });
    await notify(
      admin,
      userId,
      "Today's Facebook post didn't go out",
      outcome.reason === "reconnect_needed"
        ? "Facebook stopped accepting the app's connection to your Page. Open the Social page and click Reconnect."
        : `Facebook refused the post for ${next.product.name}. It will try a product again tomorrow.`
    );
    return { posted: false, reason: outcome.reason, product: next.product.name };
  }

  const now = new Date().toISOString();
  await recordPublished(admin, userId, { link_id: next.link.id, product_id: next.product.id, product_name: next.product.name }, post.message, now);
  await audit(admin, {
    user_id: userId,
    action: "published",
    detail: { mode: "auto", product: next.product.name, facebook_post_id: outcome.postId, page: connection.account_name, message: post.message },
  });
  return { posted: true, product: next.product.name, video: Boolean(post.videoUrl), facebookPostId: outcome.postId, held: held.length };
}

/** Retires drafts nobody acted on within DRAFT_TTL_DAYS. */
async function expireStale(admin, userId) {
  const cutoff = new Date(Date.now() - DRAFT_TTL_DAYS * 86400000).toISOString();
  const { data: stale } = await admin
    .from("pending_approvals")
    .update({ status: "expired" })
    .eq("user_id", userId)
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .select("id, product_name");
  for (const row of stale || []) {
    await audit(admin, { user_id: userId, approval_id: row.id, action: "expired", detail: { product: row.product_name } });
  }
}

/** "approve" mode: write today's options for the owner to choose from. */
async function draftFor(admin, connection, { dryRun, fresh, method }) {
  const userId = connection.user_id;
  if (!dryRun) await expireStale(admin, userId);

  const { data: waiting } = await admin
    .from("pending_approvals")
    .select("id, product_id, product_name")
    .eq("user_id", userId)
    .eq("status", "pending");

  if (waiting?.length && !fresh) {
    return { drafted: 0, waiting: waiting.length, reason: "Posts are already waiting for your OK." };
  }

  const exclude = (waiting || []).map((w) => w.product_id).filter(Boolean);
  const { options, held } = pickPostOptions({ ...(await loadInputs(admin, userId)), count: OPTIONS_PER_DAY, exclude });
  if (!options.length) {
    return { drafted: 0, reason: fresh ? "No other products are ready to offer right now." : "Nothing ready to post today.", held: held.length };
  }

  const posts = [];
  for (const option of options) posts.push({ option, ...(await buildPost(option)) });
  if (dryRun) {
    return { drafted: 0, dryRun: true, options: posts.map((p) => ({ product: p.option.product.name, message: p.message, imageUrl: p.imageUrl, videoUrl: p.videoUrl })), held: held.length };
  }

  // The new options replace the ones the person asked to swap out.
  if (fresh && waiting?.length) {
    await admin.from("pending_approvals").update({ status: "skipped", decided_at: new Date().toISOString(), decided_via: isApprovalMethod(method) ? method : null }).in("id", waiting.map((w) => w.id)).eq("status", "pending");
    for (const w of waiting) {
      await audit(admin, { user_id: userId, approval_id: w.id, action: "skipped", method: isApprovalMethod(method) ? method : "system", detail: { product: w.product_name, why: "asked for different options" } });
    }
  }

  const batchId = crypto.randomUUID();
  const { data: rows, error } = await admin
    .from("pending_approvals")
    .insert(
      posts.map((p, i) => ({
        user_id: userId,
        platform: "facebook",
        batch_id: batchId,
        option_number: i + 1,
        product_id: p.option.product.id,
        link_id: p.option.link.id,
        product_name: p.option.product.name,
        page_id: connection.account_id,
        page_name: connection.account_name,
        body: p.body,
        message: p.message,
        image_url: p.imageUrl,
        video_url: p.videoUrl,
      }))
    )
    .select("id, product_name");
  if (error) throw error;

  for (const row of rows || []) {
    await audit(admin, { user_id: userId, approval_id: row.id, action: "drafted", detail: { product: row.product_name } });
  }
  if (!fresh) {
    await notify(
      admin,
      userId,
      rows.length === 1 ? "Your Facebook post is ready to review" : `${rows.length} Facebook posts are ready to review`,
      "Pick the one you like and approve it, or skip today. Nothing posts until you say so.",
      "/"
    );
  }
  return { drafted: rows.length, held: held.length };
}

export default async function handler(req, res) {
  try {
    const body = req.body || {};
    const cronOk = isCronRequest(req, body);
    const { user } = cronOk ? { user: null } : await getAuthedUser(req);
    if (!cronOk && !user) return res.status(401).json({ error: "Unauthorized" });

    const admin = adminClient();
    let query = admin.from("social_connections").select("user_id, access_token, account_id, account_name, post_mode").eq("platform", "facebook");
    if (!cronOk) query = query.eq("user_id", user.id);
    const { data: connections, error } = await query;
    if (error) throw error;

    if (!connections?.length) {
      return res.status(cronOk ? 200 : 400).json({ error: cronOk ? undefined : "Connect your Facebook Page first.", results: [] });
    }

    const options = { dryRun: body.dry_run === true, fresh: !cronOk && body.fresh === true, method: body.method };
    const results = [];
    for (const connection of connections) {
      try {
        const mode = connection.post_mode === "auto" ? "auto" : "approve";
        const outcome = mode === "auto" ? await autoPostFor(admin, connection, options) : await draftFor(admin, connection, options);
        results.push({ user_id: connection.user_id, page: connection.account_name, mode, ...outcome });
      } catch (err) {
        console.error("facebookAutoPost: failed for", connection.user_id, err);
        results.push({ user_id: connection.user_id, posted: false, reason: "unexpected" });
      }
    }
    return res.status(200).json({
      posted: results.filter((r) => r.posted).length,
      drafted: results.reduce((n, r) => n + (r.drafted || 0), 0),
      results,
    });
  } catch (error) {
    console.error("facebookAutoPost failed:", error);
    return res.status(500).json({ error: error.message });
  }
}
