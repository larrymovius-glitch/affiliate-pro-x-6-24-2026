import { db } from "./_lib/db.js";
import { getAuthedUser, isCronRequest } from "./_lib/supabase.js";

const dayMs = 24 * 60 * 60 * 1000;
function scoreLink(link) {
  return (Number(link?.clicks) || 0) + (Number(link?.conversions) || 0) * 10 + (Number(link?.earnings) || 0) * 2;
}

export default async function handler(req, res) {
  try {
    const body = req.body || {};
    const cronOk = isCronRequest(req, body);
    const { user } = await getAuthedUser(req);
    const selfOnly = body.self_only === true && !!user;

    if (!cronOk && user?.role !== "admin" && !selfOnly) return res.status(403).json({ error: "Forbidden" });

    const D = db();
    const filters = selfOnly ? { autopilot_enabled: true, created_by_id: user.id } : { autopilot_enabled: true };
    const posts = await D.GeneratedPost.filter(filters, "-created_date", 500);
    const groups = {};

    for (const post of posts) {
      const key = `${post.created_by_id || "system"}:${post.product_id || post.product_name}`;
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
      let selected = groupPosts.find((p) => Number(p.variant_number) === (activeDay % 3) + 1) || groupPosts[0];
      let selectedStatus = "running";

      if (activeDay >= 3) {
        let bestScore = -1;
        for (const post of groupPosts) {
          const link = post.link_id ? await D.AffiliateLink.get(post.link_id) : null;
          const score = scoreLink(link);
          if (score > bestScore) { bestScore = score; selected = post; }
        }
        selectedStatus = "weekly_winner";
      }

      for (const post of groupPosts) {
        const isSelected = post.id === selected.id;
        await D.GeneratedPost.update(post.id, {
          status: isSelected ? "posted" : "draft",
          autopilot_status: isSelected ? selectedStatus : "queued",
          last_selected_at: isSelected ? new Date().toISOString() : post.last_selected_at,
          week_starts_at: nextWeekStart,
        });
        updated += 1;
      }
    }

    res.status(200).json({ success: true, groups: Object.keys(groups).length, updated });
  } catch (error) {
    console.error("optimizeAutopilotPosts failed:", error);
    res.status(500).json({ error: error.message });
  }
}
