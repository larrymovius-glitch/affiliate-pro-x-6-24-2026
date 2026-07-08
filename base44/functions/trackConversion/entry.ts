import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Secure conversion postback URL: /functions/trackConversion?secret=<CONVERSION_SECRET>&code=<short_code>&amount=<earnings>
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
    const expected = Deno.env.get("CONVERSION_SECRET");
    if (!secret || !expected || secret !== expected) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const code = url.searchParams.get('code') || body.code;
    // Networks send a test ping with unsubstituted placeholders (e.g. "[tid]") when you save the URL.
    // Respond 200 OK to those so the URL validates, and log it.
    if (!code || code.includes('[') || code.includes('{')) {
      console.log('Test ping or missing code — responding OK. code:', code, 'app:', Deno.env.get("BASE44_APP_ID"));
      return new Response('OK', { status: 200 });
    }

    const rawAmount = url.searchParams.get('amount') || body.amount || 0;
    const amount = Number(rawAmount);
    const safeAmount = Number.isNaN(amount) || amount < 0 ? 0 : amount;

    const links = await base44.asServiceRole.entities.AffiliateLink.filter({ short_code: code });
    if (!links || links.length === 0) {
      console.warn('Conversion received for unknown code:', code);
      return new Response('OK', { status: 200 });
    }

    const link = links[0];
    const now = new Date().toISOString();
    await base44.asServiceRole.entities.AffiliateLink.update(link.id, {
      conversions: (link.conversions || 0) + 1,
      earnings: (link.earnings || 0) + safeAmount
    });

    await base44.asServiceRole.entities.ConversionEvent.create({
      created_by_id: link.created_by_id,
      owner_user_id: link.created_by_id,
      link_id: link.id,
      short_code: link.short_code,
      product_name: link.product_name || '',
      amount: safeAmount,
      converted_at: now
    });

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('trackConversion error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});