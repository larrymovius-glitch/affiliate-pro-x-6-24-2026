import { invokeLLM } from "./_lib/llm.js";
import {
  assemblePost,
  bodyProblem,
  bodyPrompt,
  fallbackBody,
  needsReconnect,
  pickNextPost,
  publishRequest,
  REPOST_AFTER_DAYS,
} from "./_lib/facebookPosts.js";
import { adminClient, getAuthedUser, isCronRequest } from "./_lib/supabase.js";

// Posts one product a day to each connected Facebook Page.
//
// Runs on the daily Vercel cron in vercel.json for every connection. A
// signed-in person can also call it to post one right now, to their own Page
// only ("Post one now" on the Social page).
//
// Which product, and whether its picture may be used, is decided in
// _lib/facebookPosts.js. Every post opens with the #ad disclosure and carries
// the tracked /r/ link, so clicks show up in the app.

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

async function notify(admin, userId, title, body) {
  await admin.from("notifications").insert({ user_id: userId, type: "general", title, body, link_to: "/social", read: false });
}

async function postFor(admin, connection, { dryRun = false } = {}) {
  const userId = connection.user_id;
  const since = new Date(Date.now() - REPOST_AFTER_DAYS * 86400000).toISOString();

  const [{ data: products }, { data: links }, { data: recentPosts }, { data: videos }] = await Promise.all([
    admin.from("products").select("*").eq("created_by_id", userId).eq("is_active", true),
    admin.from("affiliate_links").select("id, product_id, short_code, destination_url, clicks, is_active").eq("created_by_id", userId).eq("is_active", true),
    admin.from("generated_posts").select("product_id, published_at").eq("created_by_id", userId).eq("platform", "facebook").gte("published_at", since),
    admin.from("ad_assets").select("product_id, file_url, file_type, is_official, created_at").eq("created_by_id", userId).eq("file_type", "video").not("product_id", "is", null),
  ]);

  const { next, held } = pickNextPost({ products: products || [], links: links || [], recentPosts: recentPosts || [], videos: videos || [] });
  if (!next) return { posted: false, reason: "Nothing ready to post today.", held: held.length };

  const body = await writeBody(next.product);
  const message = assemblePost({ product: next.product, link: next.link, body, origin: APP_ORIGIN });
  const imageUrl = next.withImage ? next.product.image_url : null;
  // A saved video can point at a link that has since expired; post the
  // picture instead of handing Facebook a dead file.
  const videoUrl = next.video && (await reachable(next.video.file_url)) ? next.video.file_url : null;
  if (dryRun) return { posted: false, dryRun: true, product: next.product.name, message, imageUrl, videoUrl, held: held.length };

  const request = publishRequest({ pageId: connection.account_id, pageToken: connection.access_token, message, imageUrl, videoUrl });
  const r = await fetch(request.url, { method: "POST", body: request.body });
  const result = await r.json().catch(() => ({}));
  if (!r.ok || result.error) {
    const reconnect = needsReconnect(result.error);
    console.error("facebookAutoPost: publish failed", userId, result.error);
    await notify(
      admin,
      userId,
      "Today's Facebook post didn't go out",
      reconnect
        ? "Facebook stopped accepting the app's connection to your Page. Open the Social page and click Reconnect."
        : `Facebook refused the post for ${next.product.name}. It will try a product again tomorrow.`
    );
    return { posted: false, reason: reconnect ? "reconnect_needed" : "facebook_error", product: next.product.name };
  }

  const now = new Date().toISOString();
  await admin.from("generated_posts").insert({
    created_by_id: userId,
    link_id: next.link.id,
    product_id: next.product.id,
    product_name: next.product.name,
    platform: "facebook",
    content: message,
    status: "posted",
    published_at: now,
    created_at: now,
  });

  return { posted: true, product: next.product.name, video: Boolean(videoUrl), facebookPostId: result.post_id || result.id, held: held.length };
}

export default async function handler(req, res) {
  try {
    const body = req.body || {};
    const cronOk = isCronRequest(req, body);
    const { user } = cronOk ? { user: null } : await getAuthedUser(req);
    if (!cronOk && !user) return res.status(401).json({ error: "Unauthorized" });

    const admin = adminClient();
    let query = admin.from("social_connections").select("user_id, access_token, account_id, account_name").eq("platform", "facebook");
    if (!cronOk) query = query.eq("user_id", user.id);
    const { data: connections, error } = await query;
    if (error) throw error;

    if (!connections?.length) {
      return res.status(cronOk ? 200 : 400).json({ error: cronOk ? undefined : "Connect your Facebook Page first.", results: [] });
    }

    const results = [];
    for (const connection of connections) {
      try {
        results.push({ user_id: connection.user_id, page: connection.account_name, ...(await postFor(admin, connection, { dryRun: body.dry_run === true })) });
      } catch (err) {
        console.error("facebookAutoPost: failed for", connection.user_id, err);
        results.push({ user_id: connection.user_id, posted: false, reason: "unexpected" });
      }
    }
    return res.status(200).json({ posted: results.filter((r) => r.posted).length, results });
  } catch (error) {
    console.error("facebookAutoPost failed:", error);
    return res.status(500).json({ error: error.message });
  }
}
