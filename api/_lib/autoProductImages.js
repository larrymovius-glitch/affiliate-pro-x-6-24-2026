import {
  getClickBankAffiliateId,
  getDigistoreAffiliateId,
  CLICKBANK_AFFILIATE_ID,
  DIGISTORE_AFFILIATE_ID,
} from "./affiliates.js";
import { detectNetwork } from "./tracking.js";
import { findVendorImage, unsafePageReason } from "./productImages.js";

// Runs the picture finder (productImages.js) on its own, so a product added
// anywhere -- the Products page, a link, a CSV import, the trending syncs,
// Maya -- gets a picture without anyone asking. Products are created in
// eight places, five of them straight from the browser into Supabase, so
// rather than wire a call into each, a short cron sweeps up every product
// that has never been looked at. A second, nightly pass retries the ones
// still without a picture: sales pages change, and a page that was down
// comes back.
//
// Every lookup is noted on the product (image_lookup_at, image_lookup_note),
// found or not. A picture found this way is saved as image_source
// 'sales_page', so vendors that allow only their own creatives still refuse
// it in an ad (vendorCreativeCheck) -- finding a picture never makes an ad
// permissible that wasn't. It only ever fills an empty picture; one already
// set, by anyone, is never replaced.

// The nightly retry runs inside this UTC window (2-6am US Eastern). The cron
// fires every few minutes, so a late run still lands inside it.
const NIGHT_START_UTC = 6;
const NIGHT_END_UTC = 10;
// A product is retried at most once a night.
const RETRY_AFTER_MS = 20 * 60 * 60 * 1000;
const NEW_PER_RUN = 40;
const RETRIES_PER_RUN = 40;
const PARALLEL = 4;
// Leaves headroom under Vercel's 300s function limit.
const DEFAULT_BUDGET_MS = 200_000;

function hostOf(url) {
  try {
    return new URL(String(url || "")).hostname;
  } catch {
    return "";
  }
}

export function isEbayProduct(p) {
  return detectNetwork(hostOf(p.url), String(p.category || "").split("_")[0]) === "ebay";
}

/** Every id this user earns under. findVendorImage refuses any address with one in it. */
export function affiliateIdsFor(user) {
  return [
    getClickBankAffiliateId(user),
    getDigistoreAffiliateId(user),
    CLICKBANK_AFFILIATE_ID,
    DIGISTORE_AFFILIATE_ID,
    ...Object.values(user?.affiliate_network_ids || {}),
  ].filter(Boolean);
}

export function isNightPass(date) {
  const h = date.getUTCHours();
  return h >= NIGHT_START_UTC && h < NIGHT_END_UTC;
}

/**
 * The Supabase side of the sweep. Kept apart so the sweep runs in tests
 * against an in-memory store.
 *
 * @param {any} client service-role Supabase client
 */
export function supabaseImageStore(client) {
  const MISSING = "image_url.is.null,image_url.eq.";
  return {
    async listNeverTried(limit) {
      const { data, error } = await client.from("products").select("*").or(MISSING).is("image_lookup_at", null).order("created_at", { ascending: true }).limit(limit);
      if (error) throw error;
      return data || [];
    },
    async listTriedBefore(iso, limit) {
      const { data, error } = await client.from("products").select("*").or(MISSING).lt("image_lookup_at", iso).order("image_lookup_at", { ascending: true }).limit(limit);
      if (error) throw error;
      return data || [];
    },
    async owners(ids) {
      if (!ids.length) return [];
      const { data, error } = await client.from("profiles").select("*").in("id", ids);
      if (error) throw error;
      return data || [];
    },
    /** Fills the picture only if it is still empty -- never overwrites one set meanwhile. */
    async saveImage(id, fields) {
      const { data, error } = await client.from("products").update(fields).eq("id", id).or(MISSING).select("id");
      if (error) throw error;
      return (data || []).length > 0;
    },
    async note(id, fields) {
      const { error } = await client.from("products").update(fields).eq("id", id);
      if (error) throw error;
    },
  };
}

/**
 * One sweep: every product never looked at, then -- at night -- the ones
 * still missing a picture since yesterday's attempt.
 *
 * @param {{ store: ReturnType<typeof supabaseImageStore>, ownHosts?: string[], fetch?: typeof fetch, now?: () => Date, budgetMs?: number, retry?: boolean }} deps
 *        `ownHosts` are every hostname this app answers on, whose /r/ links
 *        count a click. `retry` overrides the night-window check (for a
 *        manual run).
 */
export async function sweepProductImages({ store, ownHosts = [], fetch, now = () => new Date(), budgetMs = DEFAULT_BUDGET_MS, retry }) {
  const started = now();
  const night = retry ?? isNightPass(started);

  const fresh = await store.listNeverTried(NEW_PER_RUN);
  const retries = night ? await store.listTriedBefore(new Date(started.getTime() - RETRY_AFTER_MS).toISOString(), RETRIES_PER_RUN) : [];
  const products = [...fresh, ...retries.filter((r) => !fresh.some((f) => f.id === r.id))];

  const ownerIds = [...new Set(products.map((p) => p.created_by_id).filter(Boolean))];
  const owners = new Map((await store.owners(ownerIds)).map((u) => [u.id, u]));

  const saved = [];
  const missed = [];
  let deferred = 0;

  for (let i = 0; i < products.length; i += PARALLEL) {
    if (now().getTime() - started.getTime() > budgetMs) {
      deferred = products.length - i;
      break;
    }
    const batch = products.slice(i, i + PARALLEL);
    await Promise.all(
      batch.map(async (p) => {
        const at = now().toISOString();
        let found;
        // findVendorImage takes one own host; the rest are checked here.
        const ownLink = ownHosts.map((h) => unsafePageReason(p.url, h)).find((r) => r && r.startsWith("one of this app's own"));
        try {
          found = ownLink
            ? { error: `Not opened: ${ownLink}.` }
            : await findVendorImage(p.url, {
                fetch,
                ownHost: ownHosts[0],
                affiliateIds: affiliateIdsFor(owners.get(p.created_by_id)),
                productName: p.name,
                networkHint: p.category,
              });
        } catch (err) {
          found = { error: `the finder failed (${err?.message || err})` };
        }

        if ("image_url" in found && found.image_url) {
          const filled = await store.saveImage(p.id, {
            image_url: found.image_url,
            // eBay sends its own photos and has no vendor creative rules.
            image_source: isEbayProduct(p) ? null : "sales_page",
            image_lookup_at: at,
            image_lookup_note: `Found on ${found.page} (${found.found_via}).`.slice(0, 500),
          });
          if (filled) {
            saved.push({ product_id: p.id, name: p.name, image_url: found.image_url });
            return;
          }
          // A picture was set by someone else while this one was looked up.
          await store.note(p.id, { image_lookup_at: at, image_lookup_note: "Skipped: a picture was added while this one was being looked up." });
          return;
        }
        const reason = String(found.error || "nothing found").slice(0, 500);
        await store.note(p.id, { image_lookup_at: at, image_lookup_note: reason });
        missed.push({ product_id: p.id, name: p.name, reason });
      })
    );
  }

  return {
    night,
    checked: products.length - deferred,
    saved,
    missed,
    deferred,
    message: `Picture finder: ${saved.length} found, ${missed.length} not found${deferred ? `, ${deferred} left for the next run` : ""}${night ? " (nightly retry included)" : ""}.`,
  };
}
