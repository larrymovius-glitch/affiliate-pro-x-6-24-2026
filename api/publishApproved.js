import { assemblePost, bodyProblem, facebookEligibility } from "./_lib/facebookPosts.js";
import { publishToPage } from "./_lib/facebookPublish.js";
import { approvalProblem, audit, isApprovalMethod } from "./_lib/postApprovals.js";
import { adminClient, getAuthedUser } from "./_lib/supabase.js";

// Publishes ONE draft from pending_approvals, and only because its owner just
// approved it -- by tap, voice, keyboard or switch device, which all count the
// same. The AI never calls this; nothing posts from a draft any other way.
//
// Body: { approvalId, method, transcript?, body? }
//   body       -- the owner's edited wording, re-checked and re-assembled
//                 with the #ad disclosure and tracked link.
//   transcript -- for voice approvals, the words that were heard, kept on
//                 the receipt.
const APP_ORIGIN = process.env.APP_ORIGIN || "https://apx.amhere4utoday.com";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const { user } = await getAuthedUser(req);
    if (!user?.id) return res.status(401).json({ error: "Please log in again." });

    const { approvalId, method, transcript, body: editedBody } = req.body || {};
    if (!isApprovalMethod(method)) return res.status(400).json({ error: "Say how the post was approved." });
    if (!approvalId) return res.status(400).json({ error: "Which post?" });

    const admin = adminClient();
    const { data: row } = await admin.from("pending_approvals").select("*").eq("id", approvalId).maybeSingle();
    const refusal = approvalProblem(row, user);
    if (refusal) return res.status(refusal.status).json({ error: refusal.error });

    // Re-check the product against today's rules: a vendor rule or the
    // product itself may have changed since the draft was written.
    const [{ data: product }, { data: link }] = await Promise.all([
      admin.from("products").select("*").eq("id", row.product_id).eq("created_by_id", user.id).maybeSingle(),
      admin.from("affiliate_links").select("id, product_id, short_code, destination_url, is_active").eq("id", row.link_id).eq("created_by_id", user.id).maybeSingle(),
    ]);
    const verdict = facebookEligibility(product, link);
    if (verdict.status !== "post") {
      return res.status(409).json({ error: `This product can't be posted right now: ${verdict.reason}` });
    }

    let message = row.message;
    let body = row.body;
    const edited = typeof editedBody === "string" && editedBody.trim() && editedBody.trim() !== row.body;
    if (edited) {
      body = editedBody.trim();
      const problem = bodyProblem(body, product);
      if (problem) return res.status(422).json({ error: `Your change can't go out because it ${problem}. Try different wording.` });
      message = assemblePost({ product, link, body, origin: APP_ORIGIN });
    }

    // Claim the draft so a double tap, or two devices, can't post it twice.
    const decidedAt = new Date().toISOString();
    const { data: claimed } = await admin
      .from("pending_approvals")
      .update({ status: "publishing", decided_via: method, decided_at: decidedAt, body, message })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed?.length) return res.status(409).json({ error: "That post was already handled." });

    if (edited) {
      await audit(admin, { user_id: user.id, approval_id: row.id, action: "edited", method, detail: { before: row.body, after: body } });
    }
    await audit(admin, { user_id: user.id, approval_id: row.id, action: "approved", method, transcript, detail: { product: row.product_name, message } });

    const { data: connection } = await admin
      .from("social_connections")
      .select("access_token, account_id, account_name")
      .eq("user_id", user.id)
      .eq("platform", "facebook")
      .maybeSingle();

    const outcome = connection?.access_token
      ? await publishToPage(connection, { message, imageUrl: row.image_url, videoUrl: row.video_url })
      : { ok: false, reason: "reconnect_needed", detail: "No Facebook Page connected" };

    if (!outcome.ok) {
      await admin.from("pending_approvals").update({ status: "failed", error: outcome.detail || outcome.reason }).eq("id", row.id);
      await audit(admin, { user_id: user.id, approval_id: row.id, action: "publish_failed", method: "system", detail: { reason: outcome.reason, detail: outcome.detail } });
      const error =
        outcome.reason === "reconnect_needed"
          ? "Facebook needs you to reconnect your Page on the Social page, then try again."
          : outcome.reason === "blocked"
            ? `This post can't go out: it ${outcome.detail}.`
            : "Facebook didn't accept the post. Try again later, or pick a different one.";
      return res.status(502).json({ error, reason: outcome.reason });
    }

    const now = new Date().toISOString();
    await admin.from("pending_approvals").update({ status: "published", published_at: now, external_post_id: outcome.postId }).eq("id", row.id);
    await admin.from("generated_posts").insert({
      created_by_id: user.id,
      link_id: row.link_id,
      product_id: row.product_id,
      product_name: row.product_name,
      platform: "facebook",
      content: message,
      status: "posted",
      published_at: now,
      created_at: now,
    });
    await audit(admin, { user_id: user.id, approval_id: row.id, action: "published", method: "system", detail: { facebook_post_id: outcome.postId, page: connection.account_name } });

    // One post a day: the other options from the same batch are set aside.
    const { data: siblings } = await admin
      .from("pending_approvals")
      .update({ status: "skipped" })
      .eq("user_id", user.id)
      .eq("batch_id", row.batch_id)
      .eq("status", "pending")
      .select("id, product_name");
    for (const s of siblings || []) {
      await audit(admin, { user_id: user.id, approval_id: s.id, action: "skipped", method: "system", detail: { product: s.product_name, why: "another option was posted" } });
    }

    return res.status(200).json({ published: true, product: row.product_name, page: connection.account_name, facebookPostId: outcome.postId });
  } catch (error) {
    console.error("publishApproved failed:", error);
    return res.status(500).json({ error: "Something went wrong. Nothing was posted." });
  }
}
