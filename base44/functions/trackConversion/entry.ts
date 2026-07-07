import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Secure conversion postback: /functions/trackConversion?secret=<CONVERSION_SECRET>&code=<short_code>&amount=<earnings>
// Networks (ClickBank, Digistore24, etc.) call this URL when a sale happens.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);

    let body = {};
    try {
      body = await req.json();
    } catch (_) { /* no body */ }

    const secret = url.searchParams.get('secret') || body.secret;
    if (!secret || secret !== Deno.env.get("CONVERSION_SECRET")) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const code = url.searchParams.get('code') || body.code;
    if (!code) {
      return Response.json({ error: 'Missing code parameter' }, { status: 400 });
    }

    const rawAmount = url.searchParams.get('amount') || body.amount || 0;
    const amount = Number(rawAmount);
    if (Number.isNaN(amount) || amount < 0) {
      return Response.json({ error: 'Invalid amount' }, { status: 400 });
    }

    const links = await base44.asServiceRole.entities.AffiliateLink.filter({ short_code: code });
    if (!links || links.length === 0) {
      return Response.json({ error: 'Link not found' }, { status: 404 });
    }

    const link = links[0];
    await base44.asServiceRole.entities.AffiliateLink.update(link.id, {
      conversions: (link.conversions || 0) + 1,
      earnings: (link.earnings || 0) + amount
    });

    return Response.json({ success: true, short_code: code, recorded_amount: amount });
  } catch (error) {
    console.error('trackConversion error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});