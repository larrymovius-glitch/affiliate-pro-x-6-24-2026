// The admin-only $1/month test subscription (docs/test-subscription.md).
// Shared by api/createStripeCheckout.js, api/createPaypalOrder.js and
// api/stripeWebhook.js so the gate and the plan name live in one place.

export const TEST_SUBSCRIPTION_PLAN = "test_subscription";

// A non-admin who POSTs this planType directly must be rejected
// server-side -- hiding the Pricing card is convenience only, not a gate.
export function canUseTestSubscription(user) {
  return user?.role === "admin";
}

// The live `subscriptions` table has a CHECK constraint allowing only
// monthly | yearly | lifetime (it is managed in Supabase, not this repo).
// Writing "test_subscription" there makes every customer.subscription.*
// webhook fail with a 500, so a cancelled test never downgrades. The test
// really is a monthly plan, so it is stored as "monthly" in that one table;
// Payment rows and Stripe metadata keep "test_subscription".
export function subscriptionTablePlanType(planType) {
  return planType === TEST_SUBSCRIPTION_PLAN ? "monthly" : planType;
}
