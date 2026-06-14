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
    const devKey = 'DEV-123456789012345678901234567890123456';
    const authHeader = `${devKey}:${clerkKey}`;

    // First check API status
    const statusRes = await fetch(
      `https://api.clickbank.com/rest/1.3/analytics/status`,
      {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
        }
      }
    );
    const statusText = await statusRes.text();

    // Try the orders list endpoint to find promoted vendors
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const ordersRes = await fetch(
      `https://api.clickbank.com/rest/1.3/orders/list?affiliate=${nickname}&startDate=${startDate}&endDate=${endDate}`,
      {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
        }
      }
    );
    const ordersStatus = ordersRes.status;
    const ordersText = await ordersRes.text();

    // Try analytics by site dimension
    const params = new URLSearchParams({
      account: nickname,
      startDate,
      endDate,
    });

    const analyticsRes = await fetch(
      `https://api.clickbank.com/rest/1.3/analytics/affiliate/site?${params}`,
      {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
        }
      }
    );
    const analyticsStatus = analyticsRes.status;
    const analyticsText = await analyticsRes.text();

    return Response.json({
      debug: true,
      statusCheck: { status: statusRes.status, body: statusText },
      orders: { status: ordersStatus, body: ordersText.substring(0, 500) },
      analytics: { status: analyticsStatus, body: analyticsText.substring(0, 500) },
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});