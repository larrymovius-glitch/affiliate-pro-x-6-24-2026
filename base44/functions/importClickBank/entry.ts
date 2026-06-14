import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = Deno.env.get('CLICKBANK_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'ClickBank API key not configured' }, { status: 500 });
    }

    // ClickBank API - fetch affiliate account data
    // The API key format suggests this is a developer/clerk API key
    const headers = {
      'Authorization': apiKey,
      'Accept': 'application/json',
    };

    // Try to fetch the account's promoted products (hoplinks)
    const response = await fetch('https://api.clickbank.com/rest/1.3/orders/list', {
      headers,
    });

    // Also try fetching the marketplace data for promoted products
    const accountResponse = await fetch('https://api.clickbank.com/rest/1.3/accounts/promotional', {
      headers,
    });

    let products = [];
    let rawData = {};

    if (accountResponse.ok) {
      rawData = await accountResponse.json();
    } else {
      // Try alternative endpoint
      const altResponse = await fetch('https://api.clickbank.com/rest/1.3/analytics/affiliate/summary', {
        headers,
      });

      if (altResponse.ok) {
        rawData = await altResponse.json();
      } else {
        const errorText = await altResponse.text();
        return Response.json({
          error: 'ClickBank API error',
          status: altResponse.status,
          details: errorText,
          tried: 'analytics/affiliate/summary'
        }, { status: 400 });
      }
    }

    return Response.json({ success: true, data: rawData });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});