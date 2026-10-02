import { db } from "./_lib/db.js";
import { adminClient, getAuthedUser } from "./_lib/supabase.js";

// Publishes a text post to the caller's own LinkedIn, using the token
// api/linkedinCallback.js stored. Share on LinkedIn's documented endpoint for
// members is the UGC API (/v2/ugcPosts), authored by the member's Person URN.
// That URN is built from the OpenID Connect `sub` /v2/userinfo returns -- the
// old /v2/me profile call needs r_liteprofile, which new apps can't be granted.

export function buildSharePayload(personUrn, text) {
  return {
    author: personUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NONE",
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };
}

export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { postContent, affiliateLink, test } = req.body || {};

    const { data: connection } = await adminClient()
      .from("social_connections")
      .select("access_token, expires_at")
      .eq("user_id", user.id)
      .eq("platform", "linkedin")
      .maybeSingle();

    if (!connection?.access_token) {
      return res.status(400).json({ error: "Connect LinkedIn on the Social page first." });
    }
    // LinkedIn gives apps like this one no way to renew a token, so an expired
    // connection can only be fixed by reconnecting.
    if (connection.expires_at && new Date(connection.expires_at).getTime() <= Date.now()) {
      return res.status(400).json({ error: "Your LinkedIn connection has expired. Reconnect it on the Social page." });
    }
    const accessToken = connection.access_token;

    if (test) return res.status(200).json({ connected: true });
    if (!postContent) return res.status(400).json({ error: "Post content is required" });

    const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (meRes.status === 401) {
      return res.status(400).json({ error: "LinkedIn no longer accepts this connection. Reconnect it on the Social page." });
    }
    const me = await meRes.json().catch(() => ({}));
    if (!meRes.ok || !me?.sub) {
      console.error("LinkedIn userinfo failed:", meRes.status, me?.message);
      return res.status(400).json({ error: "Could not read your LinkedIn profile. Reconnect it on the Social page." });
    }

    const fullContent = affiliateLink ? `${postContent}\n\n${affiliateLink}` : postContent;
    const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(buildSharePayload(`urn:li:person:${me.sub}`, fullContent)),
    });
    if (!postRes.ok) {
      const details = await postRes.json().catch(() => ({}));
      console.error("LinkedIn rejected the post:", postRes.status, details);
      return res.status(400).json({ error: "LinkedIn rejected the post.", details });
    }

    // A successful share is 201 Created with the post's id in the X-RestLi-Id
    // header and possibly an empty body -- parsing the body unconditionally
    // would turn a post that went out into a 500.
    const postId = postRes.headers.get("x-restli-id") || (await postRes.json().catch(() => ({})))?.id || null;

    const savedPost = await db().GeneratedPost.create({
      created_by_id: user.id,
      content: fullContent,
      platform: "linkedin",
      status: "posted",
      published_at: new Date().toISOString(),
      product_name: "LinkedIn Auto Post",
      ai_score: 10,
    });

    return res.status(200).json({ success: true, postId, linkedInPostId: savedPost.id, message: "Posted to LinkedIn." });
  } catch (error) {
    console.error("LinkedIn post error:", error);
    return res.status(500).json({ error: error.message });
  }
}
