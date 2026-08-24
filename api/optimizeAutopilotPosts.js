import { db } from "./_lib/db.js";
import { getAuthedUser, isCronRequest } from "./_lib/supabase.js";
import { createAutopilotPack } from "./createAutopilotPack.js";

// Autopilot rotation.
//
// Three ad variants per product go out together and get 48 hours. At the end
// of the cycle each variant is judged on its own merit, not against its
// siblings: anything that drew interaction stays running, anything still at
// zero is archived. If every variant that actually went out drew nothing, the
// copy is the problem and the group is marked for fresh creative.
//
// This deliberately does NOT pick a best-of-three. The previous version scored
// the variants against each other and kept the highest -- but with no traffic
// all three score zero, and "highest" then resolves to whichever row sorted
// first. That promotes creation order while looking like a measurement.
const CYCLE_HOURS = 48;
const CYCLE_MS = CYCLE_HOURS * 60 * 60 * 1000;

// Nothing in this app publishes a post on its own: Instagram and LinkedIn have
// no OAuth connect flow, so `status` only reaches 'posted' when a human marks
// it. A variant sitting at zero therefore usually means "never went out",
// not "bad ad". Only a post that actually went out is allowed to fail, or the
// rotation would archive good copy and order fresh creative forever, spending
// model tokens to learn nothing.
const WENT_OUT = new Set(["posted", "published"]);

// After this many rounds of new copy with nothing landing, the product or the
// channel is the problem, not the wording. Stop and surface it.
const MAX_REGENERATIONS = 3;

function interactionOf(link) {
  return (
    (Number(link?.clicks) || 0) +
    (Number(link?.conversions) || 0) +
    (Number(link?.earnings) || 0)
  );
}

export function groupKey(post) {
  return `${post.created_by_id || "system"}:${post.product_id || post.product_name}`;
}

/**
 * Decide what happens to one product's variants at the end of a cycle.
 * Pure, so the rules are testable without a database.
 *
 * @param {Array<{id: string, status?: string, interaction: number}>} variants
 * @param {number} regenerations how many times this group already got new copy
 * @returns {{ outcome: string, keep: string[], archive: string[] }}
 */
export function decideCycle(variants, regenerations = 0) {
  const wentOut = variants.filter((v) => WENT_OUT.has(v.status));

  // Never posted anywhere -- there is nothing to judge yet.
  if (wentOut.length === 0) {
    return { outcome: "awaiting_post", keep: variants.map((v) => v.id), archive: [] };
  }

  const earned = wentOut.filter((v) => v.interaction > 0);

  if (earned.length > 0) {
    // Anything that drew interaction survives; the rest are done.
    const keep = new Set(earned.map((v) => v.id));
    return {
      outcome: "kept",
      keep: [...keep],
      archive: variants.filter((v) => !keep.has(v.id)).map((v) => v.id),
    };
  }

  // Everything that went out drew nothing.
  if (regenerations >= MAX_REGENERATIONS) {
    return { outcome: "needs_attention", keep: [], archive: variants.map((v) => v.id) };
  }
  return { outcome: "needs_new_creative", keep: [], archive: variants.map((v) => v.id) };
}

export default async function handler(req, res) {
  try {
    const body = req.body || {};
    const cronOk = isCronRequest(req, body);
    const { user } = await getAuthedUser(req);
    const selfOnly = body.self_only === true && !!user;

    if (!cronOk && user?.role !== "admin" && !selfOnly) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const D = db();
    const filters = selfOnly
      ? { autopilot_enabled: true, created_by_id: user.id }
      : { autopilot_enabled: true };
    const posts = await D.GeneratedPost.filter(filters, "-created_at", 500);

    const groups = {};
    for (const post of posts) {
      const key = groupKey(post);
      (groups[key] ||= []).push(post);
    }

    const now = Date.now();
    const summary = { cycles_due: 0, kept: 0, archived: 0, awaiting_post: 0, needs_new_creative: 0, needs_attention: 0 };

    for (const groupPosts of Object.values(groups)) {
      const first = groupPosts[0];
      const startedAt = first.cycle_starts_at || first.week_starts_at || first.created_at;
      const elapsed = startedAt ? now - new Date(startedAt).getTime() : 0;

      // Mid-cycle: leave the group alone. The ads are still running.
      if (startedAt && elapsed < CYCLE_MS) continue;
      summary.cycles_due += 1;

      // Each variant has its own AffiliateLink, so interaction is per-variant.
      const variants = [];
      for (const post of groupPosts) {
        const link = post.link_id ? await D.AffiliateLink.get(post.link_id) : null;
        variants.push({ id: post.id, status: post.status, interaction: interactionOf(link) });
      }

      const regenerations = Number(first.regenerations) || 0;
      const { outcome, keep, archive } = decideCycle(variants, regenerations);
      summary[outcome] = (summary[outcome] || 0) + 1;

      const keepSet = new Set(keep);
      const cycleStartsAt = new Date().toISOString();
      const bumped = outcome === "needs_new_creative" ? regenerations + 1 : regenerations;

      for (const post of groupPosts) {
        const surviving = keepSet.has(post.id);
        await D.GeneratedPost.update(post.id, {
          status: surviving ? post.status : "archived",
          autopilot_status: surviving ? outcome : outcome === "awaiting_post" ? "awaiting_post" : "dropped",
          last_selected_at: surviving ? cycleStartsAt : post.last_selected_at,
          // awaiting_post must not restart the clock, or a post nobody has put
          // out yet would be re-judged every 48 hours forever.
          cycle_starts_at: outcome === "awaiting_post" ? post.cycle_starts_at || cycleStartsAt : cycleStartsAt,
          regenerations: bumped,
        });
        if (surviving) summary.kept += 1;
        else summary.archived += 1;
      }

      if (outcome === "needs_new_creative") {
        const owner = await D.User.get(first.created_by_id);
        await createAutopilotPack({
          user: owner,
          payload: {
            niche: first.niche || "all",
            product_ids: [first.product_id],
            regeneration: bumped,
            archive_existing: false,
          },
          origin: `https://${req.headers.host}`,
        });
      }
    }

    res.status(200).json({ success: true, groups: Object.keys(groups).length, cycle_hours: CYCLE_HOURS, ...summary });
  } catch (error) {
    console.error("optimizeAutopilotPosts failed:", error);
    res.status(500).json({ error: error.message });
  }
}
