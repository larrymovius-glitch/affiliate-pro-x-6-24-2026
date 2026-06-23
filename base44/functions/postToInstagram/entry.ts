import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get Instagram connection
    const { accessToken } = await base44.asServiceRole.connectors.getConnection("instagram");
    
    // Get Instagram user ID first
    const userRes = await fetch(
      `https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`
    );
    const userData = await userRes.json();
    
    if (!userData.id) {
      return Response.json({ error: 'Instagram account not found', details: userData }, { status: 400 });
    }

    const instagramUserId = userData.id;

    // Create media container (image post)
    const { postContent, imageUrl, affiliateLink } = await req.json();

    // First, create the media container
    const mediaCreateRes = await fetch(
      `https://graph.instagram.com/${instagramUserId}/media?image_url=${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(postContent)}&access_token=${accessToken}`,
      { method: 'POST' }
    );
    const mediaData = await mediaCreateRes.json();
    
    if (mediaData.error) {
      return Response.json({ error: 'Failed to create media', details: mediaData.error }, { status: 400 });
    }

    const creationId = mediaData.id;

    // Publish the media
    const publishRes = await fetch(
      `https://graph.instagram.com/${instagramUserId}/media_publish?creation_id=${creationId}&access_token=${accessToken}`,
      { method: 'POST' }
    );
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
      ai_score: 10,
      posted_at: new Date().toISOString()
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