import crypto from "crypto";
import { db } from "./_lib/db.js";
import { findByNormalizedCode } from "./trackConversion.js";

// ClickBank Instant Notification Service (INS) receiver.
//
// Why this exists as its own route rather than another shape trackConversion.js
// accepts: ClickBank does not call a templated URL with query-string macros the
// way Digistore24 and most CPA networks do. It POSTs a JSON body of
// { notification, iv } where `notification` is the sale payload encrypted with
// CBC-AES-256. trackConversion.js authenticates on a `secret` query parameter
// and reads `code`/`amount` the same way, so an INS POST arrives with none of
// them and is rejected 401. Every ClickBank sale was being dropped on the floor
// while its clicks kept counting -- and ClickBank is this app's default network
// (app_settings.default_affiliate_id) with real link-building support in
// api/_lib/affiliates.js.
//
// Set the INS URL to /api/clickbankNotification in ClickBank under
// Settings > My Account > Advanced Tools, alongside the secret key that goes in
// CLICKBANK_SECRET_KEY. Authentication here is the decryption itself: only a
// body that decrypts to valid JSON under our secret is acted on, so there is no
// shared bearer secret to leak (unlike trackConversion's CONVERSION_SECRET).

// Key derivation is ClickBank's, not a choice: the SHA-1 of the secret key as a
// hex string, truncated to its first 32 characters, used as the 32 raw bytes of
// an AES-256 key. Matches the reference implementations ClickBank and its
// integrators publish (PHP: substr(sha1($secretKey), 0, 32) with AES-256-CBC
// and OPENSSL_RAW_DATA).
function decryptNotification(encrypted, iv, secretKey) {
  const key = crypto.createHash("sha1").update(secretKey).digest("hex").slice(0, 32);
  const ivBuf = Buffer.from(String(iv), "base64");
  const dataBuf = Buffer.from(String(encrypted), "base64");

  const run = (autoPad) => {
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, ivBuf);
    decipher.setAutoPadding(autoPad);
    return Buffer.concat([decipher.update(dataBuf), decipher.final()]).toString("utf8");
  };

  try {
    return run(true);
  } catch {
    // Published PHP receivers trim "\0..\32" off the plaintext, which implies
    // the padding is not always the PKCS#7 Node strips by default. Retry
    // without automatic unpadding and strip the trailing control bytes by hand
    // rather than fail a real sale over a padding variant.
    // eslint-disable-next-line no-control-regex
    return run(false).replace(/[\x00-\x1a]+$/, "");
  }
}

// What each transaction does to a balance. ClickBank sends reversals through
// the same endpoint as sales, so treating everything as a credit would leave a
// refunded sale still counted -- the user would be paid for money the customer
// got back.
const CREDITS = new Set(["SALE", "BILL", "TEST_SALE", "TEST_BILL"]);
const DEBITS = new Set(["RFND", "CGBK", "INSF"]);

// The tracking id we put on the hoplink comes back in `trackingCodes`. Shape is
// documented as an array of values; accept the plain-string and array-of-object
// forms too rather than assume one and silently match nothing.
function extractTrackingCodes(payload) {
  const raw = payload?.trackingCodes;
  const out = [];
  const push = (v) => {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
  };

  if (typeof raw === "string") push(raw);
  else if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry === "string") push(entry);
      else if (entry && typeof entry === "object") {
        push(entry.trackingCode ?? entry.value ?? entry.code ?? entry.tid);
      }
    }
  }

  // Some accounts surface it as a vendor variable instead.
  push(payload?.vendorVariables?.tid);
  return out;
}

// totalAccountAmount is what ClickBank credited *this* account for the
// transaction -- for an affiliate that is the commission. Deliberately not
// totalOrderAmount, which is the gross the customer paid and would credit far
// more than was earned. Falls back to summing the per-item affiliate payout.
function extractAmount(payload) {
  const total = Number(payload?.totalAccountAmount);
  if (Number.isFinite(total) && total !== 0) return Math.abs(total);

  const items = Array.isArray(payload?.lineItems) ? payload.lineItems : [];
  const summed = items.reduce((sum, item) => {
    const v = Number(item?.affiliatePayout ?? item?.accountAmount);
    return sum + (Number.isFinite(v) ? Math.abs(v) : 0);
  }, 0);
  return summed;
}

export default async function handler(req, res) {
  try {
    const secretKey = process.env.CLICKBANK_SECRET_KEY;
    if (!secretKey) {
      console.error("clickbankNotification: CLICKBANK_SECRET_KEY is not configured");
      // 500 so ClickBank retries once this is configured, rather than treating
      // a real sale as delivered and dropping it.
      return res.status(500).json({ error: "Not configured" });
    }

    const body = req.body || {};
    const encrypted = body.notification;
    const iv = body.iv;
    if (!encrypted || !iv) {
      // Not an INS payload at all. 400 rather than 500: retrying will not help.
      return res.status(400).json({ error: "Expected a ClickBank INS body" });
    }

    let payload;
    try {
      payload = JSON.parse(decryptNotification(encrypted, iv, secretKey));
    } catch (err) {
      // Decrypting is the authentication step here. A body we cannot decrypt is
      // either not from ClickBank or is signed with a different secret; either
      // way there is nothing to retry.
      console.error("clickbankNotification: could not decrypt notification:", err?.message);
      return res.status(401).json({ error: "Could not decrypt notification" });
    }

    const type = String(payload?.transactionType || "").toUpperCase();
    const receipt = String(payload?.receipt || "");

    // ClickBank sends a TEST notification when the URL is saved. Acknowledge it
    // so the URL validates, without recording anything.
    if (!type || type === "TEST") {
      console.log("clickbankNotification: test or empty notification acknowledged");
      return res.status(200).json({ received: true, recorded: false, reason: "test" });
    }

    const sign = CREDITS.has(type) ? 1 : DEBITS.has(type) ? -1 : 0;
    if (sign === 0) {
      // CANCEL-REBILL, UNCANCEL-REBILL and friends carry no money movement.
      console.log("clickbankNotification: no money movement for type", type, "receipt", receipt);
      return res.status(200).json({ received: true, recorded: false, reason: `type ${type}` });
    }

    const D = db();
    const codes = extractTrackingCodes(payload);
    let link = null;
    for (const code of codes) {
      const exact = await D.AffiliateLink.filter({ short_code: code });
      if (exact.length) { link = exact[0]; break; }
      const fuzzy = await findByNormalizedCode(D, code);
      if (fuzzy) { link = fuzzy; break; }
    }

    if (!link) {
      // A real sale we cannot attribute -- most often a hop that went out
      // before the link carried a tid. Logged loudly and acknowledged, because
      // retrying will produce the same result.
      console.warn(
        "clickbankNotification: unattributed", type, "receipt", receipt,
        "trackingCodes", JSON.stringify(codes)
      );
      return res.status(200).json({ received: true, recorded: false, reason: "no matching link" });
    }

    const amount = extractAmount(payload);

    // ClickBank retries until it gets a 200, and a rebill reuses the receipt of
    // the original order -- so the receipt alone is not unique. Type and time
    // separate a genuine rebill from a redelivery of the same notification.
    const orderId = [receipt, type, payload?.transactionTime].filter(Boolean).join(":");
    const seen = await D.ConversionEvent.filter({ order_id: orderId });
    if (seen.length) {
      console.log("clickbankNotification: duplicate ignored", orderId);
      return res.status(200).json({ received: true, recorded: false, reason: "duplicate" });
    }

    const delta = sign * amount;
    await D.AffiliateLink.update(link.id, {
      conversions: Math.max(0, (link.conversions || 0) + sign),
      earnings: (link.earnings || 0) + delta,
    });

    await D.ConversionEvent.create({
      created_by_id: link.created_by_id,
      owner_user_id: link.created_by_id,
      link_id: link.id,
      short_code: link.short_code,
      product_name: link.product_name || "",
      amount: delta,
      converted_at: new Date().toISOString(),
      order_id: orderId,
      network: "clickbank",
    });

    console.log("clickbankNotification: recorded", type, orderId, "amount", delta);
    return res.status(200).json({ received: true, recorded: true, amount: delta });
  } catch (error) {
    console.error("clickbankNotification failed:", error);
    // 500 so ClickBank retries: better a duplicate attempt the dedupe above
    // absorbs than a sale silently lost.
    return res.status(500).json({ error: error.message });
  }
}

export const __test = { decryptNotification, extractTrackingCodes, extractAmount, CREDITS, DEBITS };
