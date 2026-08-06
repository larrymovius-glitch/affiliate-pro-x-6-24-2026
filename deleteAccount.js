import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { db } from "./_lib/db.js";
import { adminClient, getAuthedUser } from "./_lib/supabase.js";

export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: "Current password is required" });

    // Re-verify credentials with a plain anon-key client before deleting anything.
    const verify = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { error: signInError } = await verify.auth.signInWithPassword({ email: user.email, password });
    if (signInError) {
      console.warn("Account deletion credential verification failed for user:", user.id);
      return res.status(401).json({ error: "The current password is incorrect" });
    }

    // Cancel any active Stripe subscriptions so deleted accounts stop being billed.
    try {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (stripeKey) {
        const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
        const customers = await stripe.customers.list({ email: user.email, limit: 10 });
        for (const customer of customers.data) {
          const subs = await stripe.subscriptions.list({ customer: customer.id, status: "active", limit: 10 });
          for (const sub of subs.data) {
            await stripe.subscriptions.cancel(sub.id);
            console.log("Canceled Stripe subscription:", sub.id);
          }
        }
      }
    } catch (stripeError) {
      console.error("Stripe subscription cancellation failed:", stripeError.message);
    }

    const D = db();
    const [links, products, campaigns, payouts, posts, adReviews, adAssets, schedules] = await Promise.all([
      D.AffiliateLink.filter({ created_by_id: user.id }),
      D.Product.filter({ created_by_id: user.id }),
      D.Campaign.filter({ created_by_id: user.id }),
      D.Payout.filter({ created_by_id: user.id }),
      D.GeneratedPost.filter({ created_by_id: user.id }),
      D.AdReview.filter({ created_by_id: user.id }),
      D.AdAsset.filter({ created_by_id: user.id }),
      D.PayoutSchedule.filter({ created_by_id: user.id }),
    ]);

    await Promise.all([
      ...links.map((r) => D.AffiliateLink.delete(r.id)),
      ...products.map((r) => D.Product.delete(r.id)),
      ...campaigns.map((r) => D.Campaign.delete(r.id)),
      ...payouts.map((r) => D.Payout.delete(r.id)),
      ...posts.map((r) => D.GeneratedPost.delete(r.id)),
      ...adReviews.map((r) => D.AdReview.delete(r.id)),
      ...adAssets.map((r) => D.AdAsset.delete(r.id)),
      ...schedules.map((r) => D.PayoutSchedule.delete(r.id)),
    ]);

    // Re-verify the target matches the caller, then delete the real auth
    // account. Deleting auth.users cascades to the profiles row (and
    // anything else with an ON DELETE CASCADE foreign key to it).
    const target = await D.User.get(user.id);
    if (!target || target.email !== user.email) {
      return res.status(403).json({ error: "Account verification failed" });
    }
    const admin = adminClient();
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("deleteAccount error:", error);
    res.status(500).json({ error: error.message });
  }
}
