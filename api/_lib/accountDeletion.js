// Deleting an account completely: its subscription, its data, and its login.
// Shared by a user deleting their own account (api/deleteAccount.js) and an
// admin removing one (api/adminDeleteUser.js).
//
// The login (auth.users) goes last and must go: removing only the profiles
// row -- what the admin page's Remove User used to do -- left the login in
// place, so the person could neither sign in properly nor sign up again with
// the same email.
//
// Payment rows are deliberately kept: they are the record of money taken, and
// the subscription webhooks count them (see CLAUDE.md). payments.user_id is
// ON DELETE SET NULL, so the row survives the login going; payer_email is
// stamped on it first so it still says who paid.

import Stripe from "stripe";

/** Cancels any active Stripe subscriptions, so a deleted account stops being billed. */
export async function cancelStripeSubscriptions(email) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || !email) return;
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const customers = await stripe.customers.list({ email, limit: 10 });
    for (const customer of customers.data) {
      const subs = await stripe.subscriptions.list({ customer: customer.id, status: "active", limit: 10 });
      for (const sub of subs.data) {
        await stripe.subscriptions.cancel(sub.id);
        console.log("Canceled Stripe subscription:", sub.id);
      }
    }
  } catch (stripeError) {
    console.error("Stripe subscription cancellation failed:", stripeError.message);
  }
}

const OWNED = ["AffiliateLink", "Product", "Campaign", "Payout", "GeneratedPost", "AdReview", "AdAsset", "PayoutSchedule", "CreativeImport"];

/**
 * Deletes everything the account owns, then its login (which cascades to the
 * profiles row). Re-reads the profile first and refuses if it doesn't match
 * the email being deleted, so a stale or mixed-up id can't remove someone
 * else.
 *
 * @param {{ D: any, admin: any, userId: string, email: string }} args
 */
export async function deleteAccountCompletely({ D, admin, userId, email }) {
  const target = await D.User.get(userId);
  if (!target || target.email !== email) throw Object.assign(new Error("Account verification failed"), { status: 403 });

  await cancelStripeSubscriptions(email);

  const rows = await Promise.all(OWNED.map((name) => D[name].filter({ created_by_id: userId })));
  await Promise.all(OWNED.flatMap((name, i) => rows[i].map((r) => D[name].delete(r.id))));

  const payments = await D.Payment.filter({ user_id: userId });
  await Promise.all(payments.map((p) => D.Payment.update(p.id, { payer_email: email })));

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}
