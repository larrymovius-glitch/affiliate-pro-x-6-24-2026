import { PAID_TIER } from "../stripeWebhook.js";

/**
 * Grants access the moment a subscription goes ACTIVE. Shared by
 * capturePaypalSubscription.js (the /payment-success redirect path) and
 * paypalWebhook.js's BILLING.SUBSCRIPTION.ACTIVATED handler -- whichever of
 * the two hears it first does the work; the other finds the row already
 * marked and no-ops.
 *
 * Deliberately does NOT record a charge amount (leaves the original
 * `pending` row's amount at 0, just flips its status). PayPal fires
 * BILLING.SUBSCRIPTION.ACTIVATED *and* PAYMENT.SALE.COMPLETED for a
 * subscription's first payment, and there's no reliable local way to tell
 * whether both will actually arrive for a given subscription -- rather than
 * guess, only one path is ever allowed to write a dollar amount:
 * recordPaypalSubscriptionCharge, driven solely by PAYMENT.SALE.COMPLETED,
 * one real PayPal "sale" object per call. That keeps revenue totals and
 * grantLifetimeIfEarned's cumulative sum correct regardless of whether the
 * first charge's SALE.COMPLETED lands before, after, or instead of ACTIVATED.
 *
 * @param {any} D - db() instance
 * @param {{ subscriptionId: string, userId: string|null, planType: string }} params
 * @returns {Promise<"activated"|"skipped">}
 */
export async function activatePaypalSubscription(D, { subscriptionId, userId, planType }) {
  const existing = await D.Payment.filter({ transaction_id: subscriptionId });
  const checkoutRow = existing[0];
  if (checkoutRow?.status === "completed") return "skipped";

  const resolvedUserId = userId || checkoutRow?.user_id || null;
  const resolvedPlanType = planType || checkoutRow?.plan_type || "monthly";

  if (checkoutRow) {
    await D.Payment.update(checkoutRow.id, {
      status: "completed",
      description: `PayPal ${resolvedPlanType} subscription activated (charge recorded separately)`,
    });
  } else {
    await D.Payment.create({
      user_id: resolvedUserId,
      amount: 0,
      currency: "usd",
      status: "completed",
      payment_method: "paypal",
      transaction_id: subscriptionId,
      plan_type: resolvedPlanType,
      veteran_status: "regular",
      description: `PayPal ${resolvedPlanType} subscription activated (charge recorded separately)`,
    });
  }

  if (resolvedUserId) {
    await D.User.update(resolvedUserId, { subscription_tier: PAID_TIER });
  } else {
    console.error("PayPal subscription activated with no user_id on file, tier not granted:", subscriptionId);
  }

  return "activated";
}

/**
 * Records one real PayPal subscription charge -- first payment or renewal,
 * treated identically. Keyed by `saleId`, PayPal's own unique ID for that
 * specific sale, so a retried or duplicate webhook delivery can't double-count
 * it. This is the only function in the PayPal subscription flow that ever
 * writes a nonzero amount, by design -- see activatePaypalSubscription above.
 *
 * @param {any} D
 * @param {{ saleId: string, subscriptionId: string, userId: string|null, planType: string, amount: number, currency: string }} params
 * @returns {Promise<"recorded"|"skipped">}
 */
export async function recordPaypalSubscriptionCharge(D, { saleId, subscriptionId, userId, planType, amount, currency }) {
  const existing = await D.Payment.filter({ transaction_id: saleId });
  if (existing.length > 0) return "skipped";

  await D.Payment.create({
    user_id: userId || null,
    amount,
    currency,
    status: "completed",
    payment_method: "paypal",
    transaction_id: saleId,
    plan_type: planType || "monthly",
    veteran_status: "regular",
    description: `PayPal ${planType || "subscription"} charge for subscription ${subscriptionId}`,
  });

  return "recorded";
}
