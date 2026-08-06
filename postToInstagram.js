import { db } from "./_lib/db.js";
import { adminClient, getAuthedUser } from "./_lib/supabase.js";

// Same note as postToLinkedIn.js — reads from `social_connections`, which
// nothing populates yet without a new Instagram OAuth connect flow.
export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (user.role !== "admin") return res.status(403).json({ error: "Forbidden: Admin access required to publish to the shared Instagram account" });

    const admin = adminClient();
    const { data: connection } = await admin
      .from("social_connections")
      .select("access_token")
      .eq("platform", "instagram")
      .maybeSingle();

    if (!connection?.access_token) return res.status(400).json({ error: "Instagram is not connected yet." });
    const accessToken = connection.access_token;

    const userRes = await fetch("https://graph.instagram.com/me?fields=id,username", { headers: { Authorization: `Bearer ${accessToken}` } });
    const userData = await userRes.json();
    if (!userData.id) return res.status(400).json({ error: "Instagram account not found", details: userData });

    const instagramUserId = userData.id;
    const { postContent, imageUrl } = req.body || {};

    const mediaCreateRes = await fetch(`https://graph.instagram.com/${instagramUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ image_url: imageUrl, caption: postContent, access_token: accessToken }),
    });
    const mediaData = await mediaCreateRes.json();
    if (mediaData.error) return res.status(400).json({ error: "Failed to create media", details: mediaData.error });

    const publishRes = await fetch(`https://graph.instagram.com/${instagramUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: mediaData.id, access_token: accessToken }),
    });
    const publishData = await publishRes.json();
    if (publishData.error) return res.status(400).json({ error: "Failed to publish", details: publishData.error });

    const savedPost = await db().GeneratedPost.create({
      created_by_id: user.id,
      content: postContent,
      platform: "instagram",
      status: "posted",
      product_name: "Instagram Auto Post",
      ai_score: 10,
    });

    res.status(200).json({ success: true, postId: publishData.id, instagramPostId: savedPost.id, message: "Posted to Instagram successfully!" });
  } catch (error) {
    console.error("Instagram post error:", error);
    res.status(500).json({ error: error.message });
  }
}
