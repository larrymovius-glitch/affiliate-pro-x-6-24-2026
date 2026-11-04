# Test subscription — $1/month, admin only

This verifies the live subscription path — the part PayPal Monthly/Yearly
had never completed — without spending $29 or $290.

A test subscription is a real $1/month live charge, on both Stripe and
PayPal. It grants the same `pro` tier a paid plan does, deliberately:
that is the part worth verifying. Reset the tier from Admin afterwards
to test the upgrade again, and cancel the subscription so it does not
keep billing $1/month.

## What it tests

- Stripe: Checkout session (subscription mode) -> webhook
  `checkout.session.completed` / `customer.subscription.created` ->
  `Payment` row -> `subscription_tier: pro`.
- PayPal: subscription creation against a Billing Plan -> approval in
  PayPal -> `/payment-success?subscription_id=...` ->
  `capturePaypalSubscription` -> `BILLING.SUBSCRIPTION.ACTIVATED`
  webhook -> `Payment` row -> `subscription_tier: pro`, plus
  `PAYMENT.SALE.COMPLETED` recording the $1 charge separately.

It does NOT test a one-time purchase (Lifetime).

## Where the name `test_subscription` is stored

- `Payment` rows and Stripe metadata say `test_subscription`.
- The `subscriptions` table says `monthly`. Its live CHECK constraint
  only allows `monthly`, `yearly` and `lifetime`, and writing anything
  else made every `customer.subscription.*` webhook fail, so a cancelled
  test never downgraded. See `subscriptionTablePlanType` in
  `api/_lib/testSubscription.js`.

## Setup — PayPal first (do this once)

Stripe needs nothing in a dashboard: the $1/month price is created
automatically by lookup key `affiliate_pro_x_test_subscription`,
the same way Monthly/Yearly prices are.

PayPal cannot subscribe to an arbitrary price — it needs a
pre-existing Billing Plan:

1. In PayPal, go to Pay & Get Paid -> Subscriptions -> Plans.
   Switch to **Live** (not Sandbox, unless you are testing in sandbox
   with `PAYPAL_ENV=sandbox` and sandbox credentials throughout).
2. Create a plan: $1.00 USD, billing cycle **monthly**, name
   "Affiliate Pro X Test Subscription ($1/month)".
3. Copy the plan ID (`P-...`).
4. In Vercel, add the environment variable:
   `PAYPAL_TEST_PLAN_ID=<that P-... id>`
5. Redeploy. Server-side env vars only take effect on the next deploy.

Without step 4, clicking "Test $1/mo with PayPal" returns
"PayPal test subscription is not configured yet" — that is the
expected, safe failure, not a checkout bug.

## How to run the test (as admin)

1. Sign in as an admin (`role === "admin"` in `profiles`).
2. Go to Pricing. Below the paid plans you will see an amber
   "Subscription Test — $1/month" card. It is hidden from non-admins.
3. Click "Test $1/mo with Stripe" or "Test $1/mo with PayPal".
   Approve the $1/month subscription in Stripe / PayPal.
4. You should land on `/payment-success`, then be `pro` on the
   Dashboard. Check in Supabase / Admin:
   - a `Payment` row with `plan_type: "test_subscription"`,
     `status: "completed"`, `payment_method: "stripe"` or `"paypal"`;
   - for PayPal, a second $1 charge row once
     `PAYMENT.SALE.COMPLETED` arrives (the activation row itself
     stays at amount 0 by design — see `api/_lib/paypalSubscriptions.js`);
   - your `profiles.subscription_tier` is `pro`;
   - for Stripe, the webhook log in Stripe shows 2xx, not 5xx.
5. Cancel the subscription in Stripe / PayPal, and reset the tier
   from Admin if you want to run the test again.

## Safety — the gate is server-side

`api/createStripeCheckout.js` and `api/createPaypalOrder.js` both
reject `planType: "test_subscription"` with a 403 unless
`user.role === "admin"` (`canUseTestSubscription` in
`api/_lib/testSubscription.js`). Hiding the Pricing card is
convenience only — see `tests/test-subscription.test.mjs`.

The $1 counts toward the $997 lifetime threshold in
`grantLifetimeIfEarned`, the same as any other subscription
payment. That is harmless at $1, and is the existing behaviour
for Monthly/Yearly too.

Cancelling any Stripe subscription drops the user to `free` unless
they own Lifetime (`downgradeIfEligible`) — it does not check for
another active subscription. So don't run this test on an account
that also has a real paid Monthly/Yearly plan.

## After the test

- Cancel the test subscription in the provider (Stripe Dashboard
  -> Subscriptions, or PayPal -> Settings -> Payments -> Manage
  automatic payments) so it does not renew at $1/month.
- In Admin, reset the test user's tier to `free` if you want to
  verify the upgrade again from scratch.
