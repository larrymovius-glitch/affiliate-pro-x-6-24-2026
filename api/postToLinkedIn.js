import { db } from "./_lib/db.js";
import { adminClient, getAuthedUser } from "./_lib/supabase.js";

// NOTE: Base44's "connectors" system (which handled the LinkedIn OAuth
// dance internally) has no Supabase equivalent. This reads the access
// token from a new `social_connections` table instead — see the SQL
// snippet provided alongside this port. Nothing populates that table yet;
// a real LinkedIn OAuth connect flow still needs to be built (similar in
// shape to the eBay one) before this function will have a token to use.
export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const body = req.body || {};
    const { postContent, affiliateLink, test } = body;

    const admin = adminClient();
    const { data: connection } = await admin
      .from("social_connections")
      .select("access_token")
      .eq("user_id", user.id)
      .eq("platform", "linkedin")
      .maybeSingle();

    if (!connection?.access_token) {
      return res.status(400).json({ error: "LinkedIn is not connected for this account yet." });
    }
    const accessToken = connection.access_token;

    if (test) return res.status(200).json({ connected: true });
    if (!postContent) return res.status(400).json({ error: "Post content is required" });

    const profileRes = await fetch("https://api.linkedin.com/v2/me?projection=(id,firstName,lastName,profilePicture(displayImage~:playableStreams))", {
      headers: { Authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" },
    });
    if (!profileRes.ok) return res.status(400).json({ error: "Failed to get LinkedIn profile", details: await profileRes.json() });

    const profile = await profileRes.json();
    const personUrn = `urn:li:person:${profile.id}`;
    const fullContent = affiliateLink ? `${postContent}\n\n${affiliateLink}` : postContent;

    const postPayload = {
      author: personUrn,
      lifecycleState: "PUBLISHED",
      specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: fullContent }, shareMediaCategory: "NONE" } },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    };

    const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
      body: JSON.stringify(postPayload),
    });
    if (!postRes.ok) return res.status(400).json({ error: "Failed to create LinkedIn post", details: await postRes.json() });

    const postData = await postRes.json();
    const savedPost = await db().GeneratedPost.create({
      created_by_id: user.id,
      content: fullContent,
      platform: "linkedin",
      status: "posted",
      product_name: "LinkedIn Auto Post",
      ai_score: 10,
    });

    res.status(200).json({ success: true, postId: postData.id, linkedInPostId: savedPost.id, message: "Posted to LinkedIn successfully!" });
  } catch (error) {
    console.error("LinkedIn post error:", error);
    res.status(500).json({ error: error.message });
  }
}
