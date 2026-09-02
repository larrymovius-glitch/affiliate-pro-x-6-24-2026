import { getAuthedUser } from "./_lib/supabase.js";
import { paypalFetch } from "./_lib/paypal.js";

// PayPal checkout currently only covers the one-time Lifetime plan.
// Monthly/Yearly stay Stripe-only until PayPal subscriptions are built.
const LIFETIME_PRICE = "997.00";

export default async function handler(req, res) {
  try {
    if (!process.env.VITE_PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      console.error("PayPal checkout error: PayPal credentials not configured");
      return res.status(500).json({ error: "Payment configuration is incomplete" });
    }

    const { user } = await getAuthedUser(req);
    const { planType } = req.body || {};

    if (planType !== "lifetime") {
      return res.status(400).json({ error: "PayPal checkout is currently available for the Lifetime plan only" });
    }

    if (["verified_veteran", "disabled_vet", "homeless_vet"].includes(user?.veteran_status)) {
      return res.status(200).json({ message: "Veteran discount applied - free access granted", veteranAccess: true });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const order = await paypalFetch("/v2/checkout/orders", {
      method: "POST",
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: user?.id || "",
            description: "Affiliate Pro X - Lifetime Access",
            amount: { currency_code: "USD", value: LIFETIME_PRICE },
          },
        ],
        application_context: {
          brand_name: "Affiliate Pro X",
          user_action: "PAY_NOW",
          return_url: `${origin}/payment-success`,
          cancel_url: `${origin}/pricing?canceled=true`,
        },
      }),
    });

    const approveLink = order.links?.find((l) => l.rel === "approve")?.href;
    if (!approveLink) throw new Error("PayPal did not return an approval link");

    res.status(200).json({ url: approveLink, orderId: order.id });
  } catch (error) {
    console.error("PayPal checkout error:", error);
    res.status(500).json({ error: error.message });
  }
}
