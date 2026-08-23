import { db } from "./_lib/db.js";
import { normalizeTrackingCode } from "./_lib/tracking.js";

// Secure conversion postback: /api/trackConversion?secret=...&code=...&amount=...
// Networks (ClickBank, Digistore24, etc.) call this when a sale happens.

// Some networks strip punctuation from the tracking id before echoing it back,
// so a link stored as "cb_acme" can return as "cbacme". Only reached when the
// exact short_code lookup misses.
//
// Pages explicitly instead of one bare list(): Supabase caps a select at ~1000
// rows, so a single call would silently miss links past the cap and drop a real
// sale -- the exact failure this whole handler exists to prevent. Above the
// ceiling we log loudly rather than return a wrong answer quietly.
const PAGE_SIZE = 1000;
const MAX_PAGES = 25;

export async function findByNormalizedCode(D, code) {
  const wanted = normalizeTrackingCode(code);
  if (!wanted) return null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await D.AffiliateLink.list("created_at", PAGE_SIZE, page * PAGE_SIZE);
    if (!rows.length) return null;
    const hit = rows.find((l) => normalizeTrackingCode(l.short_code) === wanted);
    if (hit) return hit;
    if (rows.length < PAGE_SIZE) return null;
  }

  console.error(
    `Normalized code lookup gave up after ${MAX_PAGES * PAGE_SIZE} links (code: ${code}). ` +
      "Add an indexed normalized column before the table grows further."
  );
  return null;
}
export default async function handler(req, res) {
  try {
    const body = req.body || {};
    const secret = req.query?.secret || body.secret;
    const expected = process.env.CONVERSION_SECRET;
    if (!secret || !expected || secret !== expected) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const code = req.query?.code || body.code;
    // Networks send a test ping with unsubstituted placeholders (e.g. "[tid]")
    // when the URL is first saved. Respond 200 so the URL validates.
    if (!code || code.includes("[") || code.includes("{")) {
      console.log("Test ping or missing code — responding OK. code:", code);
      return res.status(200).send("OK");
    }

    // Networks name the sale differently; any of these identifies it uniquely.
    const orderId =
      req.query?.order_id || body.order_id ||
      req.query?.orderid || body.orderid ||
      req.query?.transaction_id || body.transaction_id ||
      req.query?.txn_id || body.txn_id ||
      req.query?.receipt || body.receipt || "";
    const network = req.query?.network || body.network || "";

    const rawAmount = req.query?.amount || body.amount || 0;
    const amount = Number(rawAmount);
    const safeAmount = Number.isNaN(amount) || amount < 0 ? 0 : amount;

    const D = db();
    let links = await D.AffiliateLink.filter({ short_code: code });
    if (!links.length) {
      const match = await findByNormalizedCode(D, code);
      links = match ? [match] : [];
    }
    if (!links.length) {
      console.warn("Conversion received for unknown code:", code);
      return res.status(200).send("OK");
    }

    const link = links[0];

    // Networks retry postbacks, and a retry must not pay twice: this figure
    // feeds AffiliateLink.earnings, which is what requestPayout treats as a
    // withdrawable balance.
    if (orderId) {
      const seen = await D.ConversionEvent.filter({ order_id: String(orderId) });
      if (seen.length) {
        console.log("Duplicate conversion ignored for order:", orderId);
        return res.status(200).send("OK");
      }
    }
    const now = new Date().toISOString();
    await D.AffiliateLink.update(link.id, {
      conversions: (link.conversions || 0) + 1,
      earnings: (link.earnings || 0) + safeAmount,
    });

    await D.ConversionEvent.create({
      created_by_id: link.created_by_id,
      owner_user_id: link.created_by_id,
      link_id: link.id,
      short_code: link.short_code,
      product_name: link.product_name || "",
      amount: safeAmount,
      converted_at: now,
      order_id: orderId ? String(orderId) : null,
      network: network || link.network || null,
    });

    res.status(200).send("OK");
  } catch (error) {
    console.error("trackConversion error:", error);
    res.status(500).json({ error: error.message });
  }
}
