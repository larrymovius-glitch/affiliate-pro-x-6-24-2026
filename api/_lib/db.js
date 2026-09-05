import { adminClient } from "./supabase.js";
import { TABLES } from "./tables.js";

function parseSort(sortStr) {
  if (!sortStr || typeof sortStr !== "string") return null;
  const descending = sortStr.startsWith("-");
  return { field: descending ? sortStr.slice(1) : sortStr, ascending: !descending };
}

function applyFilters(query, filters = {}) {
  let q = query;
  for (const [key, value] of Object.entries(filters || {})) {
    if (value && typeof value === "object" && "$in" in value) {
      q = q.in(key, value.$in);
    } else if (value && typeof value === "object" && "$gt" in value) {
      q = q.gt(key, value.$gt);
    } else if (value && typeof value === "object" && "$regex" in value) {
      // Only ever used for simple "^prefix_" checks in this codebase.
      const prefix = String(value.$regex).replace(/^\^/, "").replace(/\\_/g, "_");
      q = q.like(key, `${prefix}%`);
    } else {
      q = q.eq(key, value);
    }
  }
  return q;
}

// Service-role entity client — equivalent to base44.asServiceRole.entities.X.
// All server-side scoping (e.g. "only this user's rows") is done by passing
// explicit filters, same as the original functions did via created_by_id.
export function db() {
  const supabase = adminClient();

  function entity(name) {
    const table = TABLES[name] || name;
    return {
      // Note: Supabase caps a bare select at ~1000 rows. A caller that must see
      // every row pages with a keyset cursor -- filter({ id: { $gt: lastId } })
      // ordered by id -- not OFFSET. OFFSET paging over a non-unique sort skips
      // rows at page boundaries on ties or concurrent writes, which is why no
      // offset option is offered here.
      async list(sort, limit) {
        let q = supabase.from(table).select("*");
        const s = parseSort(sort);
        if (s) q = q.order(s.field, { ascending: s.ascending });
        if (limit) q = q.limit(limit);
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
      },
      async filter(filters = {}, sort, limit) {
        let q = applyFilters(supabase.from(table).select("*"), filters);
        const s = parseSort(sort);
        if (s) q = q.order(s.field, { ascending: s.ascending });
        if (limit) q = q.limit(limit);
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
      },
      async get(id) {
        const { data, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
        if (error) throw error;
        return data;
      },
      async create(payload) {
        const { data, error } = await supabase.from(table).insert(payload).select().single();
        if (error) throw error;
        return data;
      },
      async bulkCreate(payloads) {
        const { data, error } = await supabase.from(table).insert(payloads).select();
        if (error) throw error;
        return data || [];
      },
      async update(id, payload) {
        const { data, error } = await supabase.from(table).update(payload).eq("id", id).select().single();
        if (error) throw error;
        return data;
      },
      async delete(id) {
        const { error } = await supabase.from(table).delete().eq("id", id);
        if (error) throw error;
        return true;
      },
      async deleteWhere(filters = {}) {
        const { error } = await applyFilters(supabase.from(table).delete(), filters);
        if (error) throw error;
        return true;
      },
    };
  }

  return new Proxy({}, { get: (_target, name) => entity(String(name)) });
}

/**
 * Add to an AffiliateLink's counters without reading them first.
 *
 * The entity `update` above cannot do this safely: every caller had to read the
 * row, add in JavaScript, and write the sum back, so two postbacks arriving
 * together both read the same starting value and the later write discarded the
 * earlier one. On clicks that undercounts; on earnings it loses money, and
 * earnings is what requestPayout.js treats as a withdrawable balance.
 *
 * `increment_link_stats` does the arithmetic in one UPDATE, where Postgres holds
 * a row lock for the statement, so concurrent callers queue instead of
 * clobbering. Execute is granted to service_role only -- were it callable by a
 * signed-in user it would be a way to mint earnings and withdraw them.
 *
 * Pass negatives to reverse a sale (refund/chargeback). conversions is floored
 * at 0 inside the function; earnings is not, so a clawback survives.
 *
 * @param {string} linkId
 * @param {{clicks?: number, conversions?: number, earnings?: number}} deltas
 */
export async function incrementLinkStats(linkId, { clicks = 0, conversions = 0, earnings = 0 } = {}) {
  const { error } = await adminClient().rpc("increment_link_stats", {
    p_link_id: linkId,
    p_clicks: clicks,
    p_conversions: conversions,
    p_earnings: earnings,
  });
  if (error) throw error;
}
