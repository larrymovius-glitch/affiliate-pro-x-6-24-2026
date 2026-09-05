import { db } from "./_lib/db.js";
import { adminClient, getAuthedUser } from "./_lib/supabase.js";

// Everything the Admin > Tracking tab needs to wire a network's postback into
// api/trackConversion.js, plus whether any sale has ever actually arrived.
//
// ADMIN ONLY, and that is a hard requirement rather than tidiness: the URL this
// returns embeds CONVERSION_SECRET, and there is exactly one such secret for
// the whole app (api/trackConversion.js reads process.env.CONVERSION_SECRET and
// compares it directly). Anyone holding it can POST an arbitrary amount for any
// short_code, which trackConversion adds straight onto AffiliateLink.earnings --
// the same figure api/requestPayout.js treats as a withdrawable balance and an
// admin then pays out over Stripe Connect. Handing this to a regular user is
// handing them a mint. If per-user postbacks are ever wanted, they need a
// per-user secret checked against the link owner, not this one.
//
// The postback contract below is read straight out of trackConversion.js --
// it is not a guess about what that handler accepts.
const PARAM_CONTRACT = [
  {
    param: "secret",
    required: true,
    accepts: ["secret"],
    describes: "Must equal CONVERSION_SECRET. Anything else is rejected 401.",
  },
  {
    param: "code",
    required: true,
    accepts: ["code"],
    describes:
      "The AffiliateLink short_code, carried out on the click and handed back by the network. " +
      "Matched exactly first, then punctuation-insensitively, so 'cb_acme' still matches 'cbacme'.",
  },
  {
    param: "amount",
    required: false,
    accepts: ["amount"],
    describes:
      "Commission for this sale, added to the link's earnings. Missing, negative or non-numeric is " +
      "treated as 0 -- the sale still records, worth nothing.",
  },
  {
    param: "order_id",
    required: false,
    accepts: ["order_id", "orderid", "transaction_id", "txn_id", "receipt"],
    describes:
      "Any one of these identifies the sale. Strongly recommended: it is the only thing stopping a " +
      "network's retry from crediting the same sale twice.",
  },
  {
    param: "network",
    required: false,
    accepts: ["network"],
    describes: "Recorded on the conversion for reporting. Falls back to the link's own network.",
  },
];

// Networks whose postback is a URL template we can fill in exactly.
//
// Digistore24 placeholders confirmed against Digistore24's S2S postback /
// generic IPN documentation: {campaignkey}, {sid1}..{sid5}, {transaction_id},
// {amount_affiliate}, {amount_brutto}, {amount_netto}, {currency}, {order_type}.
//
// {campaignkey} is the right one to send back as `code`: api/_lib/tracking.js
// writes our short_code into the Digistore24 promolink's campaign-key path
// segment, and mirrors it into sid1, so either returns it. {amount_affiliate}
// is deliberate -- it is this affiliate's commission. {amount_brutto} is the
// gross order value and would credit far more than was actually earned.
function buildTemplates(base, secret) {
  const s = encodeURIComponent(secret);
  return [
    {
      id: "digistore24",
      name: "Digistore24",
      supported: true,
      where: "Digistore24 > Account > S2S Postback (as an affiliate), or Settings > IPN (as a vendor).",
      url:
        `${base}?secret=${s}&code={campaignkey}&amount={amount_affiliate}` +
        `&transaction_id={transaction_id}&network=digistore24`,
      notes:
        "{amount_affiliate} is your commission. Do not swap in {amount_brutto} -- that is the gross " +
        "order value and would credit far more than was earned. If a sale comes back with an empty " +
        "campaign key, use {sid1} instead: tracking.js writes the short code into both.",
    },
    {
      id: "generic",
      name: "Generic network (CPA and most others)",
      supported: true,
      where: "Wherever the network calls it: Postback URL, S2S Postback, Server Postback, or Pixel (server-side).",
      url: `${base}?secret=${s}&code={SUBID}&amount={PAYOUT}&order_id={TRANSACTION_ID}&network={NETWORK}`,
      notes:
        "Replace each {BRACKETED} token with that network's own macro -- the spellings differ per network " +
        "and are not interchangeable. `code` must receive whatever the click carried out as subid; " +
        "api/_lib/tracking.js sends the short_code as ?subid= for any network it has no specific rule for.",
    },
    {
      id: "clickbank",
      name: "ClickBank",
      supported: false,
      where: "ClickBank > Settings > My Site > Advanced Tools > Instant Notification URL.",
      url: null,
      notes:
        "Not wired up, and a URL template will not work here. ClickBank's Instant Notification Service " +
        "does not call a templated URL with query-string macros -- it POSTs a JSON body of " +
        "{ notification, iv }, where `notification` is the sale payload AES-256-CBC encrypted with your " +
        "INS secret key and base64-encoded. trackConversion.js reads `secret` and `code` off the query " +
        "string or a plain body, so an INS POST arrives with neither and is rejected 401. Receiving " +
        "ClickBank sales needs its own handler that decrypts the payload first. Until then ClickBank " +
        "clicks are tracked but its sales are not.",
    },
  ];
}

export default async function handler(req, res) {
  try {
    const { user: admin } = await getAuthedUser(req);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const secret = process.env.CONVERSION_SECRET || "";
    const origin = req.headers.origin || `https://${req.headers.host}`;
    const base = `${origin}/api/trackConversion`;

    // Has a real sale ever landed? This is the question the whole tab exists to
    // answer -- clicks can be climbing while earnings sit at zero, and nothing
    // else in the app surfaces that.
    const D = db();
    const recent = await D.ConversionEvent.list("-converted_at", 5);

    const { count: totalConversions } = await adminClient()
      .from("conversion_events")
      .select("*", { count: "exact", head: true });

    const { count: totalClicks } = await adminClient()
      .from("click_events")
      .select("*", { count: "exact", head: true });

    return res.status(200).json({
      configured: Boolean(secret),
      base_url: base,
      // Only ever reaches an admin -- see the header note.
      templates: secret ? buildTemplates(base, secret) : [],
      param_contract: PARAM_CONTRACT,
      status: {
        total_clicks: totalClicks ?? 0,
        total_conversions: totalConversions ?? 0,
        last_conversion_at: recent[0]?.converted_at || null,
        recent: recent.map((c) => ({
          short_code: c.short_code,
          product_name: c.product_name,
          amount: c.amount,
          network: c.network,
          converted_at: c.converted_at,
        })),
      },
    });
  } catch (error) {
    console.error("getPostbackSetup failed:", error);
    return res.status(500).json({ error: "Unable to load postback setup" });
  }
}
