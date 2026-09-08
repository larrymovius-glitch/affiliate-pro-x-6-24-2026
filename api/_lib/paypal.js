// Set PAYPAL_ENV=sandbox in Vercel to test with fake money via a PayPal
// sandbox test-buyer account (developer.paypal.com > Sandbox > Accounts).
// Unset (or anything else) stays on live - real cards, real charges.
// Note: VITE_PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET below must ALSO be
// swapped to the matching sandbox app's credentials - PAYPAL_ENV only
// switches the API host, not which app's ID/secret gets used.
const PAYPAL_API_BASE =
  process.env.PAYPAL_ENV === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";

export async function getPaypalAccessToken() {
  const clientId = process.env.VITE_PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PayPal is not configured (missing client ID or secret)");
  }

  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_description || "Failed to authenticate with PayPal");
  return data.access_token;
}

export async function paypalFetch(path, options = {}) {
  const token = await getPaypalAccessToken();
  const res = await fetch(`${PAYPAL_API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || data?.details?.[0]?.description || `PayPal API error (${res.status})`;
    throw new Error(message);
  }
  return data;
}

/**
 * PayPal doesn't sign webhooks with a shared secret the way Stripe does --
 * verifying one means calling PayPal's own verification endpoint with the
 * transmission headers it sent plus the raw event body. PAYPAL_WEBHOOK_ID
 * identifies which webhook subscription (created once in the PayPal
 * dashboard, pointing at /api/paypalWebhook) this check is for; PayPal
 * rejects a mismatched one.
 *
 * @param {Record<string, string>} headers
 * @param {any} body
 * @returns {Promise<boolean>}
 */
export async function verifyPaypalWebhookSignature(headers, body) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID is not configured");

  const result = await paypalFetch("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: JSON.stringify({
      auth_algo: headers["paypal-auth-algo"],
      cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"],
      transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"],
      webhook_id: webhookId,
      webhook_event: body,
    }),
  });

  return result.verification_status === "SUCCESS";
}

export async function cancelPaypalSubscription(subscriptionId, reason) {
  await paypalFetch(`/v1/billing/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason: reason || "Upgraded to lifetime access" }),
  });
}
