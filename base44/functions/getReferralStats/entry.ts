import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Returns how many people signed up using this user's referral code.
// Uses service-role access since counting other users' records isn't
// something a regular user's own RLS permissions should need to cover.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = base44.asServiceRole;

    // Generate a referral code on first request if this user doesn't have one yet.
    let referralCode = user.referral_code;
    if (!referralCode) {
      const base = (user.full_name || user.email || "friend").replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
      const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
      referralCode = `${base || "VET"}${suffix}`;
      await db.entities.User.update(user.id, { referral_code: referralCode });
    }

    const referred = await db.entities.User.filter({ referred_by_code: referralCode });

    return Response.json({
      referral_code: referralCode,
      referred_count: referred.length,
    });
  } catch (error) {
    console.error('getReferralStats error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
