import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Public click tracker: /functions/trackClick?code=<short_code>
// Increments the link's click count (awaited, so no lost clicks) and redirects to the destination URL.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    let code = url.searchParams.get('code');
    if (!code) {
      try {
        const body = await req.json();
        code = body?.code || null;
      } catch (_) { /* no body */ }
    }

    if (!code) {
      return Response.json({ error: 'Missing code parameter' }, { status: 400 });
    }

    const links = await base44.asServiceRole.entities.AffiliateLink.filter({ short_code: code });
    if (!links || links.length === 0) {
      return Response.json({ error: 'Link not found' }, { status: 404 });
    }

    const link = links[0];

    // Awaited write — click is recorded before we redirect
    await base44.asServiceRole.entities.AffiliateLink.update(link.id, {
      clicks: (link.clicks || 0) + 1
    });

    return new Response(null, {
      status: 302,
      headers: { Location: link.destination_url }
    });
  } catch (error) {
    console.error('trackClick error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});