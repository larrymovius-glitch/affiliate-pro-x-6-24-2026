import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const dayMs = 24 * 60 * 60 * 1000;

function scoreLink(link) {
  return (Number(link?.clicks) || 0) + ((Number(link?.conversions) || 0) * 10) + ((Number(link?.earnings) || 0) * 2);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let payload = {};
    try { payload = await req.json(); } catch (_) { payload = {}; }

    const cronSecret = Deno.env.get('CRON_SECRET');
    const providedSecret = payload.secret || new URL(req.url).searchParams.get('secret');
    const cronOk = !!cronSecret && providedSecret === cronSecret;

    let user = null;
    try { user = await base44.auth.me(); } catch (_) { user = null; }
    const selfOnly = payload.self_only === true && !!user;

    if (!cronOk && user?.role !== 'admin' && !selfOnly) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const entityClient = cronOk || user?.role === 'admin' ? base44.asServiceRole.entities : base44.entities;
    const posts = await entityClient.GeneratedPost.filter({ autopilot_enabled: true }, '-created_date', 500);
    const groups = {};

    for (const post of posts) {
      const key = `${post.created_by_id || 'system'}:${post.product_id || post.product_name}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(post);
    }

    let updated = 0;
    for (const groupPosts of Object.values(groups)) {
      const first = groupPosts[0];
      const weekStart = first.week_starts_at ? new Date(first.week_starts_at).getTime() : Date.now();
      const elapsedDays = Math.floor((Date.now() - weekStart) / dayMs);
      const startsNewWeek = elapsedDays >= 7;
      const activeDay = startsNewWeek ? 0 : elapsedDays;
      const nextWeekStart = startsNewWeek ? new Date().toISOString() : first.week_starts_at;
      let selected = groupPosts.find((post) => Number(post.variant_number) === (activeDay % 3) + 1) || groupPosts[0];
      let selectedStatus = 'running';

      if (activeDay >= 3) {
        let bestScore = -1;
        for (const post of groupPosts) {
          const link = post.link_id ? await entityClient.AffiliateLink.get(post.link_id) : null;
          const score = scoreLink(link);
          if (score > bestScore) {
            bestScore = score;
            selected = post;
          }
        }
        selectedStatus = 'weekly_winner';
      }

      for (const post of groupPosts) {
        const isSelected = post.id === selected.id;
        await entityClient.GeneratedPost.update(post.id, {
          status: isSelected ? 'posted' : 'draft',
          autopilot_status: isSelected ? selectedStatus : 'queued',
          last_selected_at: isSelected ? new Date().toISOString() : post.last_selected_at,
          week_starts_at: nextWeekStart
        });
        updated += 1;
      }
    }

    return Response.json({ success: true, groups: Object.keys(groups).length, updated });
  } catch (error) {
    console.error('optimizeAutopilotPosts failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});