import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const nickname = body.nickname || 'apxalaska';

    const clerkKey = Deno.env.get('CLICKBANK_API_KEY');
    // Universal stand-in dev key per ClickBank's Aug 2023 update
    const devKey = 'DEV-123456789012345678901234567890123456';

    const authHeader = `${devKey}:${clerkKey}`;

    // Fetch affiliate analytics to get promoted products
    const analyticsRes = await fetch(
      `https://api.clickbank.com/rest/1.3/analytics/affiliate/summary?site=${nickname}`,
      {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
        }
      }
    );

    if (!analyticsRes.ok) {
      const errText = await analyticsRes.text();
      return Response.json({ error: 'ClickBank API error', status: analyticsRes.status, details: errText }, { status: 400 });
    }

    const analyticsData = await analyticsRes.json();

    // Also try to fetch order list to find vendor sites promoted
    const ordersRes = await fetch(
      `https://api.clickbank.com/rest/1.3/orders/list?affiliate=${nickname}&startDate=2020-01-01&endDate=2026-12-31`,
      {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
        }
      }
    );

    let ordersData = null;
    if (ordersRes.ok) {
      ordersData = await ordersRes.json();
    }

    return Response.json({ success: true, analytics: analyticsData, orders: ordersData });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});