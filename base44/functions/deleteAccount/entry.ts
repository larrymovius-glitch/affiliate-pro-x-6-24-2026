import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Cancel any active Stripe subscriptions so deleted accounts stop being billed
    try {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (stripeKey) {
        const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
        const customers = await stripe.customers.list({ email: user.email, limit: 10 });
        for (const customer of customers.data) {
          const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'active', limit: 10 });
          for (const sub of subs.data) {
            await stripe.subscriptions.cancel(sub.id);
            console.log('Canceled Stripe subscription:', sub.id);
          }
        }
      }
    } catch (stripeError) {
      console.error('Stripe subscription cancellation failed:', stripeError.message);
    }

    // Delete all user-owned entities (Payment rows are kept as financial records)
    const [links, products, campaigns, payouts, posts, adReviews, adAssets, schedules] = await Promise.all([
      base44.entities.AffiliateLink.filter({ created_by_id: user.id }),
      base44.entities.Product.filter({ created_by_id: user.id }),
      base44.entities.Campaign.filter({ created_by_id: user.id }),
      base44.entities.Payout.filter({ created_by_id: user.id }),
      base44.entities.GeneratedPost.filter({ created_by_id: user.id }),
      base44.entities.AdReview.filter({ created_by_id: user.id }),
      base44.entities.AdAsset.filter({ created_by_id: user.id }),
      base44.entities.PayoutSchedule.filter({ created_by_id: user.id }),
    ]);

    await Promise.all([
      ...links.map(r => base44.entities.AffiliateLink.delete(r.id)),
      ...products.map(r => base44.entities.Product.delete(r.id)),
      ...campaigns.map(r => base44.entities.Campaign.delete(r.id)),
      ...payouts.map(r => base44.entities.Payout.delete(r.id)),
      ...posts.map(r => base44.entities.GeneratedPost.delete(r.id)),
      ...adReviews.map(r => base44.entities.AdReview.delete(r.id)),
      ...adAssets.map(r => base44.entities.AdAsset.delete(r.id)),
      ...schedules.map(r => base44.entities.PayoutSchedule.delete(r.id)),
    ]);

    // Finally, delete the User record itself
    await base44.asServiceRole.entities.User.delete(user.id);

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});