import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get LinkedIn connection for the current app user
    const { accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection("6a3a1c4e98737984ce1e0230");
    
    const { postContent, affiliateLink } = await req.json();

    if (!postContent) {
      return Response.json({ error: 'Post content is required' }, { status: 400 });
    }

    // Post to LinkedIn using the API
    // LinkedIn uses person URN for posting: urn:li:person:{personId}
    // First, get the person's URN from the token
    const profileRes = await fetch('https://api.linkedin.com/v2/me?projection=(id,firstName,lastName,profilePicture(displayImage~:playableStreams))', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });

    if (!profileRes.ok) {
      const errorData = await profileRes.json();
      return Response.json({ error: 'Failed to get LinkedIn profile', details: errorData }, { status: 400 });
    }

    const profile = await profileRes.json();
    const personUrn = `urn:li:person:${profile.id}`;

    // Create a LinkedIn post (text-only or with image)
    const postPayload = {
      author: personUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: postContent
          },
          shareMediaCategory: 'NONE'
        }
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
      }
    };

    const postRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify(postPayload)
    });

    if (!postRes.ok) {
      const errorData = await postRes.json();
      return Response.json({ error: 'Failed to create LinkedIn post', details: errorData }, { status: 400 });
    }

    const postData = await postRes.json();
    const postId = postData.id;

    // Save post record
    const savedPost = await base44.entities.GeneratedPost.create({
      content: postContent,
      platform: "linkedin",
      status: "posted",
      product_name: "LinkedIn Auto Post",
      ai_score: 10
    });

    return Response.json({ 
      success: true, 
      postId: postId,
      linkedInPostId: savedPost.id,
      message: 'Posted to LinkedIn successfully!'
    });

  } catch (error) {
    console.error('LinkedIn post error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});