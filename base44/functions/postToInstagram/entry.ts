import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required to publish to the shared Instagram account' }, { status: 403 });
    }

    // Get Instagram connection
    const { accessToken } = await base44.asServiceRole.connectors.getConnection("instagram");

    // Get Instagram user ID first (token in header, not URL)
    const userRes = await fetch('https://graph.instagram.com/me?fields=id,username', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const userData = await userRes.json();

    if (!userData.id) {
      return Response.json({ error: 'Instagram account not found', details: userData }, { status: 400 });
    }

    const instagramUserId = userData.id;
    const { postContent, imageUrl } = await req.json();

    // Create the media container (token in POST body, not URL)
    const mediaCreateRes = await fetch(`https://graph.instagram.com/${instagramUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        image_url: imageUrl,
        caption: postContent,
        access_token: accessToken
      })
    });
    const mediaData = await mediaCreateRes.json();

    if (mediaData.error) {
      return Response.json({ error: 'Failed to create media', details: mediaData.error }, { status: 400 });
    }

    const creationId = mediaData.id;

    // Publish the media
    const publishRes = await fetch(`https://graph.instagram.com/${instagramUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        creation_id: creationId,
        access_token: accessToken
      })
    });
    const publishData = await publishRes.json();

    if (publishData.error) {
      return Response.json({ error: 'Failed to publish', details: publishData.error }, { status: 400 });
    }

    // Save post record
    const savedPost = await base44.entities.GeneratedPost.create({
      content: postContent,
      platform: "instagram",
      status: "posted",
      product_name: "Instagram Auto Post",
      ai_score: 10
    });

    return Response.json({
      success: true,
      postId: publishData.id,
      instagramPostId: savedPost.id,
      message: 'Posted to Instagram successfully!'
    });

  } catch (error) {
    console.error('Instagram post error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});