import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delete all user-owned entities
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

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});