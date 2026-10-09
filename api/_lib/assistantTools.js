import { db } from "./db.js";
import { getClickBankAffiliateId, applyClickBankAffiliateId } from "./affiliates.js";
import { detectNetwork, networkForDestination } from "./tracking.js";
import { largestEbayImage } from "./images.js";
import { findVendorImage } from "./productImages.js";
import { importDriveCreatives } from "./driveCreatives.js";
import { affiliateIdsFor } from "./autoProductImages.js";
import { checkOpeningLine, checkSuppliedScript, composeAdScript, openingLineFor, usableSentences, MAX_COPY_CHARS, MAX_OPENING_WORDS } from "./adScripts.js";

function hostOf(url) {
  try {
    return new URL(String(url || "")).hostname;
  } catch {
    return "";
  }
}
import { invokeLLM } from "./llm.js";
import { AFFILIATE_NETWORKS, connectedNetworkIds } from "./affiliateNetworks.js";
import { adminClient } from "./supabase.js";
import * as videoAdsLib from "./videoAds.js";
import { FDA_DISCLAIMER, TIKTOK_POLICY_URL, tiktokPostingChecklist, tiktokRule, vendorCreativeCheck } from "./platformRules.js";

// Tools Maya and Atlas can actually call.
//
// SECURITY MODEL, in one line: the model never supplies an owner. Every query
// and every insert here has `created_by_id: user.id` stamped on it by this
// file, from the session that `getAuthedUser` verified -- not from anything the
// model said. db() runs as the service role and bypasses Postgres RLS, so this
// is the only thing standing between one user's assistant and another user's
// rows. Never add a tool that takes a user id, an owner, or a raw filter object
// as a parameter.
//
// Read tools are cheap and safe. Write tools are deliberately few: creating a
// link or a product is recoverable, and request_payout only files a claim that
// an admin still reviews before any money moves (processStripePayout).
//
// Deliberately NOT exposed:
//   savePaymentInfo   -- writes payout routing; an LLM should not be able to
//                        redirect where commissions land from a chat message.
//   syncEbayTrending  -- admin/cron only, and writes rows for every user.
//   postToInstagram   -- admin-only, posts publicly under a shared account.
//   deleteAccount     -- irreversible.
// For those the assistant should link the user to the page instead.

const MAX_ROWS = 25;

// Trim a row down to what is useful in a conversation, and keep tokens sane.
//
// Carries both addresses. Without them the assistant could count a user's
// links but not give them one, and told the owner, correctly, that she didn't
// have his URLs -- so he was left pasting his own list into the chat, where
// it is forgotten once the history is trimmed.
function linkSummary(l, origin) {
  return {
    id: l.id,
    product_name: l.product_name,
    network: l.network || null,
    is_active: l.is_active !== false,
    share_url: l.short_code ? (origin ? `${origin}/r/${l.short_code}` : `/r/${l.short_code}`) : null,
    destination_url: l.destination_url || null,
    clicks: l.clicks || 0,
    conversions: l.conversions || 0,
    earnings: Number(l.earnings) || 0,
  };
}

// A user's whole list of links or products has to fit in one call: the owner
// has 36 links and 35 products, and a cap of 25 meant any question about "all
// of them" came back short -- so the assistant answered about the ones it saw.
const MAX_LIST_ROWS = 100;

function listLimit(v) {
  return Math.max(1, Math.min(Math.trunc(Number(v) || 50), MAX_LIST_ROWS));
}

// image_url is included because create_video_ad needs one. Without it the
// assistant couldn't see that a product already had its picture and kept
// asking the owner to send one -- which her text-only chat can't take.
function productSummary(p) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    commission_rate: p.commission_rate,
    url: p.url,
    image_url: p.image_url || null,
    // So the assistant can say which products may go on TikTok at all,
    // before anyone spends a render on one TikTok would take down.
    tiktok: tiktokRule(p, { isEbay: isEbayProduct(p) }).status,
    // The vendor's rule on which pictures and videos may appear in an ad,
    // and where the saved picture came from. See vendorCreativeCheck.
    creative_rule: isEbayProduct(p) ? "ebay" : p.creative_rule || "not_checked",
    image_source: p.image_source || null,
    // Why the automatic picture finder couldn't find one, so the assistant
    // can say what's needed instead of searching again blind.
    ...(!p.image_url && p.image_lookup_note ? { picture_lookup: p.image_lookup_note } : {}),
    // Ad scripts come only from this (see adScripts.js); eBay needs none.
    approved_copy: isEbayProduct(p) ? "not_needed" : p.approved_copy ? "saved" : "missing",
    ...(p.approved_copy_source ? { approved_copy_source: p.approved_copy_source } : {}),
    ...(p.ad_opening_line ? { opening_line: p.ad_opening_line } : {}),
  };
}

function isEbayProduct(p) {
  return detectNetwork(hostOf(p.url), String(p.category || "").split("_")[0]) === "ebay";
}

export const TOOL_DEFINITIONS = [
  {
    name: "get_my_stats",
    description:
      "Totals for the current user: number of links, total clicks, conversions, earnings, and the withdrawable balance after money already requested. Call this before answering anything about how the user is doing, what they have earned, or whether they can request a payout. Do not guess these numbers.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_my_links",
    description:
      "The user's affiliate links, newest first, with full addresses and per-link clicks, conversions and earnings. Use whenever the user asks for their links or URLs, or which ones are performing -- you do have them, through this. share_url is the one to give the user to post: it counts the click and adds tracking. destination_url is where it leads, with the affiliate ID in it; give that only if they ask for it specifically. When they ask for all of their links, set limit to the maximum.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: `How many to return, 1-${MAX_LIST_ROWS}. Default 50.` },
      },
      required: [],
    },
  },
  {
    name: "list_my_products",
    description:
      "Products the user has added, newest first, which are what links and ads get built from. image_url shows whether a product already has its picture: one that does is ready for create_video_ad. tiktok says what TikTok allows for it: 'banned' (weight-loss products and get-rich offers -- never suggest a TikTok ad for these), 'restricted' (supplements: adults only, mild wording) or 'allowed'. creative_rule is the vendor's rule on which pictures and videos an ad may use: 'own_or_official' (the user's own footage, or the vendor's affiliate-kit creatives -- never anything from the sales page or sales video), 'official_only' (the vendor's official creatives only), 'unaltered' (the vendor's ads posted as supplied, no AI ads), 'any', 'ebay', or 'not_checked' (no ad until the vendor's affiliate page has been checked). image_source says where the saved picture came from: 'official', 'own', 'sales_page' or null (unknown). When asked which products are ready, or about all of them, set limit to the maximum.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number", description: `1-${MAX_LIST_ROWS}. Default 50.` } },
      required: [],
    },
  },
  {
    name: "create_product",
    description:
      "Add a product the user wants to promote. Ask for the destination URL first if you do not have one -- never invent it. For ClickBank, the vendor nickname must be one the user has confirmed exists.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short product name shown in the UI." },
        url: { type: "string", description: "Destination URL, including scheme." },
        category: { type: "string", description: "Optional niche, e.g. clickbank, health, home." },
        description: { type: "string" },
      },
      required: ["name", "url"],
    },
  },
  {
    name: "create_affiliate_link",
    description:
      "Create a trackable link for one of the user's existing products. Returns the /r/<code> share URL, which is the URL the user should post -- never the raw destination. Call list_my_products first to get a product_id.",
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "string", description: "id from list_my_products." },
      },
      required: ["product_id"],
    },
  },
  {
    name: "request_payout",
    description:
      "File a payout request for the user. This creates a pending claim an admin reviews; it does not move money by itself. Always call get_my_stats first and tell the user their available balance before filing. Never file one the user did not explicitly ask for.",
    input_schema: {
      type: "object",
      properties: {
        amount: { type: "number", description: "US dollars. Must be greater than zero and within the available balance." },
      },
      required: ["amount"],
    },
  },
  {
    name: "find_trending_products",
    description:
      "Search the web right now for trending or viral products, optionally scoped to one affiliate network (e.g. 'clickbank', 'amazon'). Returns real, current results with a best-guess network match against the networks this app knows about -- use this instead of naming trending products from memory, which goes stale immediately. If the result says the user is not connected to the matching network, tell them that and offer the signup link instead of pretending a link can be built.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional focus, e.g. 'home gadgets' or 'weight loss'. Omit for general trending/viral products." },
        network: { type: "string", description: `Optional: scope results to one network id -- ${AFFILIATE_NETWORKS.map((n) => n.id).join(", ")}.` },
      },
      required: [],
    },
  },
  {
    name: "list_ad_creatives",
    description:
      "The user's saved ad creatives -- videos and images they uploaded (from Firefly, Premiere, their phone), the AI video ads already made, and vendors' official creatives copied in by import_official_creatives (is_official: true, with the product_id they belong to). Call this when they refer to a clip of theirs, e.g. 'use my Firefly video', or want an official clip for a product, so you can pass its url to create_video_ad as footage.",
    input_schema: {
      type: "object",
      properties: {
        file_type: { type: "string", description: "Optional filter: 'video' or 'image'." },
        product_id: { type: "string", description: "Optional: only the official creatives imported for this product." },
      },
      required: [],
    },
  },
  {
    name: "import_official_creatives",
    description:
      "Copy a vendor's official creatives -- the Google Drive folder many ClickBank and Digistore24 vendors give affiliates -- into the app, marked official and attached to one of the user's products. Its pictures and clips then qualify for vendors that allow only official creatives, and if the product's current picture is from the sales page or unconfirmed, the largest official picture replaces it. Swipe-copy documents in the folder (Google Docs named as swipe, ad copy, scripts, captions) become the product's approved ad copy if none is saved yet -- terms and compliance documents never do. Needs the folder link AND where the user got it (folder_source): the vendor's affiliate page address, or e.g. 'email from the vendor'. Never guess folder_source and never fill it with the folder link -- if the user hasn't said, ask. If the result status is 'private', tell the user plainly the folder is private and nothing was copied, and do not retry. If it is 'partial', say how many are left and offer to run it again with the same folder to continue. List what was skipped and why in a short line or two.",
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "string", description: "id from list_my_products." },
        folder_url: { type: "string", description: "The drive.google.com folder link exactly as the user gave it." },
        folder_source: {
          type: "string",
          description: "Where the user says the vendor published this link: the affiliate/JV page address, or a short description like 'email from the vendor'. Only what the user told you.",
        },
      },
      required: ["product_id", "folder_url", "folder_source"],
    },
  },
  {
    name: "save_approved_copy",
    description:
      "Save the vendor's approved ad copy for one of the user's products -- the ad text or swipe copy the vendor gives affiliates. Video ad scripts for vendor products are built ONLY from this, word for word, after the user's own opening line. Pass the copy exactly as the user pasted it; never write, tidy or summarise it yourself. Needs source: where the user got it (the vendor's affiliate page address, a swipe file, an email from the vendor) -- if they haven't said, ask. Never copy text from the vendor's sales page and call it approved copy. Replaces any copy saved before.",
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "string", description: "id from list_my_products." },
        copy: { type: "string", description: "The approved copy exactly as the user gave it." },
        source: { type: "string", description: "Where the user says the copy came from. Only what they told you." },
      },
      required: ["product_id", "copy", "source"],
    },
  },
  {
    name: "set_opening_line",
    description:
      "Save the user's own opening line -- the first thing said in every video ad, in their words exactly as they give them. Without product_id it is their default for every ad; with product_id it is for that one product only. Never write or suggest the line yourself unless they ask you to, and save it only once they have confirmed the exact words. Pass an empty text with a product_id to go back to the default for that product.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: `The opening line, up to ${MAX_OPENING_WORDS} words, exactly as the user wants it said.` },
        product_id: { type: "string", description: "Optional: only for this product." },
      },
      required: ["text"],
    },
  },
  {
    name: "update_product",
    description:
      "Change one of the user's own products: its name, description, category, or the image the video ads are built from. Use this instead of telling the user to go and edit the product themselves. It cannot change a product's affiliate URL -- that decides where a sale is credited, so it stays a deliberate edit the user makes on the Products page.",
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "string", description: "id from list_my_products." },
        name: { type: "string", description: "New product name. Use the vendor's own name for it -- never invent a catchier one." },
        description: { type: "string" },
        category: { type: "string" },
        image_url: { type: "string", description: "Web address of a picture (https). Used as the picture in video ads." },
        image_source: {
          type: "string",
          enum: ["official", "own"],
          description:
            "Where the new image_url came from, only when the user has told you: 'official' if it is from the vendor's own affiliate creatives kit, 'own' if they made it themselves (e.g. in Firefly). Never 'official' for a picture from the vendor's sales page. Leave it out if they haven't said -- the picture is then unconfirmed, and vendors that restrict creatives won't allow it in an ad.",
        },
      },
      required: ["product_id"],
    },
  },
  {
    name: "find_product_images",
    description:
      "Find pictures for the user's products by reading each vendor's own sales page for the picture the vendor set for sharing it. The app already does this on its own within minutes of a product being added, and retries nightly; a product still without a picture shows why in picture_lookup (list_my_products), so read that first and use this tool when the user wants to look again, swap a picture, or give a page_url the automatic finder couldn't work out. With no product_ids it checks every product that has no picture yet. Call it first WITHOUT save: show each picture found in your reply as markdown, ![Product name](image_url), say it is the vendor's own picture from their page, list the ones not found and why, and ask the user which to keep. With the pictures, always remind the user in one line that some vendors only allow their official creatives in ads (HepatoBurn, for one, allows only the images in its Google Drive folder, nothing from the sales page or its video), so they should keep a picture only if that vendor's affiliate page allows it. Only after they say yes, call it again with save: true and product_ids set to just the ones they approved. Never pass save: true on the first call. ClickBank and Digistore24 links are handled safely: they are opened rebuilt with no affiliate id, so no click is ever made on the user's account -- there is no permission to ask for and nothing to override. A result may still need help: an encrypted ClickBank HopLink needs the vendor's sales page address or ClickBank vendor nickname (from the product's Marketplace listing) -- ask for it and pass it as page_url with that one product_id; a result that says a link is broken means the saved link itself is wrong, so tell the user plainly it needs replacing. Never tell the user to search Google for pages, and never guess a page_url.",
    input_schema: {
      type: "object",
      properties: {
        product_ids: {
          type: "array",
          items: { type: "string" },
          description: "ids from list_my_products. Omit to check every product with no picture.",
        },
        page_url: {
          type: "string",
          description: "Only with exactly one product_id: the vendor's sales page address as the user gave it, or a ClickBank vendor nickname written as https://hop.clickbank.net/?vendor=NICKNAME.",
        },
        save: {
          type: "boolean",
          description: "true only after the user has approved the pictures from an earlier call. Saves each found picture as that product's picture.",
        },
      },
      required: [],
    },
  },
  {
    name: "create_video_ad",
    description:
      "Start generating a short AI voiceover video ad (image + TTS voiceover + caption) for one of the user's products. Rendering happens on an external service and takes roughly a minute -- this only submits the job and returns a render_id. Call check_video_ad with that id a little later to see if it's done; do not call it back to back, space it out across the conversation. Uses the product's image_url (shown by list_my_products) or a clip passed as video_url; if the product already has an image_url, don't ask the user for a picture -- just use it. Users can't send you images in this chat; pictures are added on the Products page or found with list_ad_creatives. If this returns a 'not set up' error, tell the user this feature needs an API key configured and do not try again this turn. It refuses a vertical (TikTok) ad for a product TikTok bans; when it does, tell the user why in one line and suggest a product whose tiktok is 'allowed' -- never remake it in another shape to get around the rule. It also refuses an ad that breaks the vendor's creative rules (see creative_rule in list_my_products): say why plainly, and never work around it -- no other picture or clip the user hasn't confirmed, and never a clip cut from a vendor's sales video. Always pass on the posting_checklist and any vendor_rules it returns. For vendor products the voiceover is the user's own opening line followed only by sentences from the vendor's approved copy, word for word -- never a script of your own. If it says needs_owner (no approved copy, no opening line, or nothing usable left), ask the user for exactly what it names: approved copy goes in with save_approved_copy, the opening line with set_opening_line. Tell the user the script it used (script) so they hear nothing unexpected.",
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "string", description: "id from list_my_products." },
        script: {
          type: "string",
          description:
            "Optional. Leave it out: the script is built automatically from the user's opening line and the vendor's approved copy, word for word. Only pass one the user dictated -- and for a vendor product it must be their opening line followed only by sentences from the approved copy, or it is refused.",
        },
        format: {
          type: "string",
          description:
            "Shape of the video: 'vertical' (default -- TikTok, Reels, Shorts), 'square' (Facebook/Instagram feed) or 'landscape' (YouTube). Leave it out unless the user names a platform that needs another shape.",
        },
        video_url: {
          type: "string",
          description:
            "Optional https address of footage to use behind the ad instead of the product photo -- e.g. a clip the user uploaded, from list_ad_creatives. It is silenced and looped to fit the voiceover. Only pass a url the user gave you or that came from list_ad_creatives; never invent one.",
        },
        footage_is_official: {
          type: "boolean",
          description:
            "True only when the user has told you this clip came from the vendor's own official creatives kit (e.g. its Google Drive folder). Needed for vendors whose creative_rule is 'official_only'. Never true for the user's own footage or anything from a sales video.",
        },
        voice: {
          type: "string",
          description:
            "Voiceover voice: alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer or verse. Defaults to nova. Pass one only if the user asks for a different voice.",
        },
        tone: {
          type: "string",
          description:
            "Plain-English direction for how the voice should read it, e.g. 'calm and serious' or 'excited, fast, like a friend who just found a deal'. Defaults to warm and conversational.",
        },
        captions: {
          type: "boolean",
          description:
            "On-screen captions of the voiceover, on by default. Pass false when the user says they'll edit the video themselves in CapCut or TikTok's editor -- those add their own captions, and burned-in text can't be restyled or moved afterwards.",
        },
      },
      required: ["product_id"],
    },
  },
  {
    name: "check_video_ad",
    description:
      "Check on a video ad started with create_video_ad. Once status is 'done' this saves it to the user's ad creatives and returns its url. If still rendering, tell the user it's not ready yet rather than calling this again immediately.",
    input_schema: {
      type: "object",
      properties: {
        render_id: { type: "string", description: "render_id returned by create_video_ad." },
        product_id: { type: "string", description: "The same product_id passed to create_video_ad, so the saved creative gets the right title." },
        format: { type: "string", description: "The same format passed to create_video_ad, so the saved creative records which platform it is shaped for." },
      },
      required: ["render_id"],
    },
  },
  {
    name: "connect_affiliate_network",
    description:
      "Save the user's id for an affiliate network (e.g. eBay Partner Network Campaign ID, ClickBank nickname, an Amazon Associate tag) so their links get properly tracked and credited. Only call this with an id the user actually gave you from their own account on that network -- never invent or guess one. If they don't have an account there yet, point them to the network's signup_url instead (from find_trending_products, or send them to /networks).",
    input_schema: {
      type: "object",
      properties: {
        network: { type: "string", description: `One of: ${AFFILIATE_NETWORKS.map((n) => n.id).join(", ")}.` },
        id: { type: "string", description: "The user's account id, campaign id, or nickname on that network, exactly as they gave it." },
      },
      required: ["network", "id"],
    },
  },
  {
    name: "get_application_profile",
    description:
      "The user's saved answers for vendor affiliate-approval forms (full name, company, Telegram, WhatsApp, traffic sources, other networks, ClickBank tier, ClickBank nickname) -- call this when the user is filling out a new vendor's approval form and wants help, then draft ready-to-paste answers from what it returns. Never invent an answer for a field this doesn't have; tell the user to fill it in on /application-profile instead.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

function clampLimit(v) {
  const n = Number(v) || 10;
  return Math.max(1, Math.min(Math.trunc(n), MAX_ROWS));
}

function money(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

/** Earnings minus everything already claimed. Mirrors api/requestPayout.js. */
export async function availableBalance(D, userId) {
  const links = await D.AffiliateLink.filter({ created_by_id: userId }, "-created_at", 500);
  const earned = links.reduce((sum, l) => sum + (Number(l.earnings) || 0), 0);

  // Payout rows have been written with either column over the app's history.
  const byCreator = await D.Payout.filter({ created_by_id: userId });
  const byUser = await D.Payout.filter({ user_id: userId });
  const unique = [...new Map([...byCreator, ...byUser].map((p) => [p.id, p])).values()];
  const reserved = unique
    .filter((p) => ["pending", "approved", "paid"].includes(p.status))
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  return { links, earned: money(earned), reserved: money(reserved), available: money(Math.max(0, earned - reserved)) };
}

/**
 * Run one tool call on behalf of `user`.
 *
 * Returns a plain object that gets JSON-stringified into a tool_result. Errors
 * are returned as `{ error }` rather than thrown: the model should see that a
 * tool failed and be able to tell the user, instead of the whole turn 500ing.
 *
 * @param {string} name
 * @param {Record<string, any>} input model-supplied, treat as untrusted
 * @param {{ user: any, origin: string|null, D?: any, invokeLLM?: Function, videoAds?: any, storageClient?: any, fetch?: typeof fetch }} ctx
 *        `D`, `invokeLLM`, `videoAds`, `storageClient` and `fetch` are
 *        injectable so tools can be tested without a database, a live web
 *        search, a real render/storage call, or a vendor's page. Production
 *        callers omit all of them.
 */
export async function executeTool(name, input = {}, ctx = {}) {
  const { user, origin } = ctx;
  if (!user?.id) return { error: "Not signed in." };
  const D = ctx.D || db();
  const callLLM = ctx.invokeLLM || invokeLLM;
  const videoAds = ctx.videoAds || videoAdsLib;
  // Lazy: constructing a real client requires SUPABASE_* env vars, which
  // most tools -- and most tests -- have no reason to need.
  const storageClient = () => ctx.storageClient || adminClient();

  try {
    switch (name) {
      case "get_my_stats": {
        const { links, earned, reserved, available } = await availableBalance(D, user.id);
        return {
          links: links.length,
          clicks: links.reduce((s, l) => s + (Number(l.clicks) || 0), 0),
          conversions: links.reduce((s, l) => s + (Number(l.conversions) || 0), 0),
          earnings_total: earned,
          already_requested: reserved,
          available_to_request: available,
        };
      }

      case "list_my_links": {
        const rows = await D.AffiliateLink.filter({ created_by_id: user.id }, "-created_at", listLimit(input.limit));
        return { links: rows.map((l) => linkSummary(l, origin)) };
      }

      case "list_my_products": {
        const rows = await D.Product.filter({ created_by_id: user.id }, "-created_at", listLimit(input.limit));
        return { products: rows.map(productSummary) };
      }

      case "create_product": {
        const name_ = String(input.name || "").trim().slice(0, 120);
        const url = String(input.url || "").trim();
        if (!name_) return { error: "A product name is required." };
        try {
          new URL(url);
        } catch {
          return { error: `"${url}" is not a valid URL. Ask the user for the full destination URL.` };
        }
        // A product's url is where a buyer ends up. This app's own /r/ link
        // is not that: a link built on it would run the click through the
        // tracker twice and bury the network's tracking id inside our own
        // URL. On 2026-09-23 the assistant made exactly that product -- a
        // second "Advanced Amino Formula" pointing at the first one's share
        // link.
        if (origin && hostOf(url) && hostOf(url) === hostOf(origin)) {
          return { error: "That address is one of this app's own share links, not the vendor's page. Use the product's real destination URL -- or, if the product already exists, use it instead of creating another." };
        }
        const mine = await D.Product.filter({ created_by_id: user.id });
        const same = mine.find((p) => String(p.name || "").trim().toLowerCase() === name_.toLowerCase());
        if (same) {
          return {
            error: `There is already a product called "${same.name}". Use that one (update_product can change its picture or description) instead of creating a duplicate.`,
            existing: productSummary(same),
          };
        }
        const category = String(input.category || "other").trim().slice(0, 60);
        const created = await D.Product.create({
          created_by_id: user.id,
          name: name_,
          url,
          category,
          // Left unset, products.network's 'clickbank' default mislabels
          // every eBay and Digistore24 product.
          network: networkForDestination(url, category),
          description: String(input.description || "").slice(0, 500),
        });
        return { product: productSummary(created) };
      }

      case "create_affiliate_link": {
        // Scoped fetch, not a bare .get(): this proves the product belongs to
        // the caller before anything is created against it.
        const owned = await D.Product.filter({ created_by_id: user.id, id: String(input.product_id || "") });
        const product = owned[0];
        if (!product) return { error: "No product of yours with that id. Call list_my_products first." };

        const existing = await D.AffiliateLink.filter({ created_by_id: user.id }, "-created_at", 500);
        const taken = new Set(existing.map((l) => l.short_code).filter(Boolean));
        let code;
        do {
          code = Math.random().toString(36).slice(2, 8).toUpperCase();
        } while (taken.has(code));

        const destination = applyClickBankAffiliateId(product.url, getClickBankAffiliateId(user));
        const link = await D.AffiliateLink.create({
          created_by_id: user.id,
          product_id: product.id,
          product_name: product.name,
          destination_url: destination,
          network: networkForDestination(destination, product.category),
          short_code: code,
          clicks: 0,
          conversions: 0,
          earnings: 0,
        });
        return {
          link: linkSummary(link, origin),
          share_url: origin ? `${origin}/r/${link.short_code}` : `/r/${link.short_code}`,
        };
      }

      case "request_payout": {
        const amount = money(input.amount);
        if (!(amount > 0)) return { error: "Amount must be greater than zero." };
        const { available } = await availableBalance(D, user.id);
        if (amount > available) {
          return { error: `Only $${available.toFixed(2)} is available to request right now.`, available };
        }
        const payout = await D.Payout.create({
          created_by_id: user.id,
          user_id: user.id,
          amount,
          status: "pending",
          source: "assistant",
          requested_at: new Date().toISOString(),
          notes: `Requested through the assistant. Available at request: $${available.toFixed(2)}.`,
        });
        return {
          payout: { id: payout.id, amount, status: "pending" },
          message: "Filed as pending. An admin reviews it before any money moves.",
        };
      }

      case "find_trending_products": {
        const query = String(input.query || "").trim().slice(0, 200);
        const networkId = String(input.network || "").trim().toLowerCase();
        const scoped = AFFILIATE_NETWORKS.find((n) => n.id === networkId);
        if (networkId && !scoped) {
          return { error: `Unknown network "${networkId}". Known networks: ${AFFILIATE_NETWORKS.map((n) => n.id).join(", ")}.` };
        }

        const catalogList = AFFILIATE_NETWORKS.map((n) => `${n.id} (${n.name})`).join(", ");
        const prompt = scoped
          ? `Search the web right now for real, currently trending or best-selling products on ${scoped.name}${query ? ` in the "${query}" niche` : ""}. Return only real, verified products actually listed on ${scoped.name} today -- do not invent products.`
          : `Search the web right now for real products that are trending or going viral${query ? ` in the "${query}" niche` : ""} across the internet generally (social media, news, shopping trends). For each one, your best guess at which of these affiliate networks it is likely sold through, if any: ${catalogList}. If none of them plausibly carry it, say so rather than guessing.`;

        const result = await callLLM({
          prompt,
          add_context_from_internet: true,
          response_json_schema: {
            type: "object",
            properties: {
              products: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    network_guess: { type: ["string", "null"], description: `One of: ${AFFILIATE_NETWORKS.map((n) => n.id).join(", ")}, or null if none fit.` },
                    why: { type: "string" },
                  },
                },
              },
            },
          },
        });

        const connected = connectedNetworkIds(user);
        const products = (result.products || []).map((p) => {
          const network = scoped ? scoped.id : AFFILIATE_NETWORKS.find((n) => n.id === p.network_guess)?.id || null;
          const net = network ? AFFILIATE_NETWORKS.find((n) => n.id === network) : null;
          return {
            name: p.name,
            network: net?.name || null,
            why: p.why || null,
            user_is_connected: net ? connected.has(net.id) : false,
            signup_url: net && !connected.has(net.id) ? net.signupUrl : null,
          };
        });
        return { products };
      }

      case "list_ad_creatives": {
        const productId = String(input.product_id || "").trim();
        const rows = await D.AdAsset.filter(
          productId ? { created_by_id: user.id, product_id: productId } : { created_by_id: user.id },
          "-created_at",
          productId ? MAX_LIST_ROWS : 50
        );
        const wanted = String(input.file_type || "").trim().toLowerCase();
        return {
          creatives: rows
            .filter((a) => !wanted || a.file_type === wanted)
            .map((a) => ({
              id: a.id,
              title: a.title,
              file_type: a.file_type,
              url: a.file_url,
              notes: a.notes || null,
              ...(a.is_official ? { is_official: true, product_id: a.product_id, folder_source: a.folder_source || null } : {}),
            })),
        };
      }

      case "save_approved_copy": {
        const owned = await D.Product.filter({ created_by_id: user.id, id: String(input.product_id || "") });
        const product = owned[0];
        if (!product) return { error: "No product of yours with that id. Call list_my_products first." };
        if (isEbayProduct(product)) return { error: `"${product.name}" is an eBay listing; its ads are written from the listing itself, so it needs no approved copy.` };
        const copy = String(input.copy || "").trim();
        const source = String(input.source || "").trim();
        if (!copy) return { error: "There's no copy to save." };
        if (copy.length > MAX_COPY_CHARS) return { error: `That's longer than ${MAX_COPY_CHARS} characters. Save the ad copy section, not the whole swipe file.` };
        if (source.length < 4) {
          return { error: "Where did this copy come from? It can only be saved as approved once you say -- e.g. the vendor's affiliate page address, or an email from the vendor.", needs_owner: true };
        }
        await D.Product.update(product.id, { approved_copy: copy, approved_copy_source: source.slice(0, 500), approved_copy_at: new Date().toISOString() });
        const supplement = tiktokRule(product, { isEbay: false }).status === "restricted";
        const { usable, excluded } = usableSentences(copy, { supplement });
        return {
          saved: true,
          product_name: product.name,
          usable_sentences: usable.length,
          ...(excluded.length ? { set_aside: excluded.slice(0, 10) } : {}),
          message: usable.length
            ? `Saved. ${usable.length} sentence${usable.length === 1 ? "" : "s"} can go into ads${excluded.length ? `; ${excluded.length} set aside (see set_aside)` : ""}.`
            : "Saved, but none of it can go into a short video ad (see set_aside). Ask the user for other approved copy.",
        };
      }

      case "set_opening_line": {
        const text = String(input.text || "").replace(/\s+/g, " ").trim();
        const productId = String(input.product_id || "").trim();
        if (productId) {
          const owned = await D.Product.filter({ created_by_id: user.id, id: productId });
          const product = owned[0];
          if (!product) return { error: "No product of yours with that id. Call list_my_products first." };
          if (!text) {
            await D.Product.update(product.id, { ad_opening_line: null });
            return { saved: true, message: `"${product.name}" now uses your default opening line.` };
          }
          const supplement = tiktokRule(product, { isEbay: isEbayProduct(product) }).status === "restricted";
          const ok = checkOpeningLine(text, { supplement });
          if (!ok.ok) return { error: ok.reason };
          await D.Product.update(product.id, { ad_opening_line: ok.line });
          return { saved: true, opening_line: ok.line, product_name: product.name };
        }
        const ok = checkOpeningLine(text);
        if (!ok.ok) return { error: ok.reason };
        await D.User.update(user.id, { ad_opening_line: ok.line });
        return {
          saved: true,
          opening_line: ok.line,
          message: "Saved as the opening line for every ad. A supplement ad still can't open on a health, weight or results claim; if this one does, that product will need its own line.",
        };
      }

      case "import_official_creatives": {
        const owned = await D.Product.filter({ created_by_id: user.id, id: String(input.product_id || "") });
        const product = owned[0];
        if (!product) return { error: "No product of yours with that id. Call list_my_products first." };
        return await importDriveCreatives(
          { user, product, folderUrl: input.folder_url, folderSource: input.folder_source, isEbay: isEbayProduct(product) },
          { D, storage: storageClient(), fetch: ctx.fetch, ...(ctx.googleApiKey !== undefined ? { apiKey: ctx.googleApiKey } : {}) }
        );
      }

      case "update_product": {
        const owned = await D.Product.filter({ created_by_id: user.id, id: String(input.product_id || "") });
        const product = owned[0];
        if (!product) return { error: "No product of yours with that id. Call list_my_products first." };

        /** @type {Record<string, any>} */
        const patch = {};
        if (typeof input.name === "string" && input.name.trim()) patch.name = input.name.trim().slice(0, 200);
        if (typeof input.description === "string") patch.description = input.description.slice(0, 500);
        if (typeof input.category === "string" && input.category.trim()) patch.category = input.category.trim().slice(0, 60);
        if (typeof input.image_url === "string" && input.image_url.trim()) {
          const image = input.image_url.trim();
          if (!/^https:\/\//i.test(image)) {
            return { error: "The image address has to start with https:// -- a file on your computer can't be reached by the renderer." };
          }
          // A picture copied out of an eBay listing is usually the 500px one;
          // the ad needs the full-size version of the same photo.
          patch.image_url = largestEbayImage(image);
          // Set with every new picture, never carried over from the old one.
          patch.image_source = ["official", "own"].includes(input.image_source) ? input.image_source : null;
        }
        if (!Object.keys(patch).length) {
          return { error: "Nothing to change. Pass a name, description, category or image_url." };
        }

        const updated = await D.Product.update(product.id, patch);
        return { product: productSummary(updated || { ...product, ...patch }), changed: Object.keys(patch) };
      }

      case "find_product_images": {
        const mine = await D.Product.filter({ created_by_id: user.id }, "-created_at", MAX_LIST_ROWS);
        const wanted = Array.isArray(input.product_ids) ? input.product_ids.map(String) : [];
        // Only ids that are the caller's own: a foreign or invented id is
        // reported, never looked up.
        const products = wanted.length
          ? mine.filter((p) => wanted.includes(String(p.id)))
          : mine.filter((p) => !p.image_url);
        const unknown = wanted.filter((id) => !mine.some((p) => String(p.id) === id));
        if (!products.length) {
          return wanted.length
            ? { error: "None of those ids are products of yours. Call list_my_products first.", unknown_ids: unknown }
            : { results: [], message: "Every product already has a picture." };
        }

        const pageUrl = String(input.page_url || "").trim();
        if (pageUrl && products.length !== 1) {
          return { error: "page_url goes with exactly one product_id -- it's that one product's sales page." };
        }

        const ownHost = hostOf(origin);
        const opts = { fetch: ctx.fetch, ownHost, affiliateIds: affiliateIdsFor(user) };
        const results = [];
        // A few at a time: fast enough for a whole catalogue in one call,
        // without firing thirty requests at once.
        for (let i = 0; i < products.length; i += 4) {
          const batch = products.slice(i, i + 4);
          results.push(
            ...(await Promise.all(
              batch.map(async (p) => {
                const found = await findVendorImage(pageUrl || p.url, { ...opts, productName: p.name, networkHint: p.category });
                return { product_id: p.id, product_name: p.name, had_picture: !!p.image_url, ...found };
              })
            ))
          );
        }

        let saved = 0;
        if (input.save === true) {
          for (const r of results) {
            if (!r.image_url) continue;
            // Recorded so the ad check knows this picture is sales-page
            // material, which most vendors don't allow in ads.
            const p = products.find((x) => String(x.id) === String(r.product_id));
            await D.Product.update(r.product_id, { image_url: r.image_url, image_source: p && isEbayProduct(p) ? null : "sales_page" });
            r.saved = true;
            saved += 1;
          }
        }

        const found = results.filter((r) => r.image_url).length;
        return {
          results,
          found,
          not_found: results.length - found,
          saved,
          ...(unknown.length ? { unknown_ids: unknown } : {}),
          message:
            input.save === true
              ? `Saved ${saved} picture${saved === 1 ? "" : "s"}. Those products are ready for create_video_ad.`
              : "Nothing saved yet. Show the user each picture found as markdown ![name](image_url), explain any not found, and ask which to keep before calling again with save: true.",
        };
      }

      case "create_video_ad": {
        const owned = await D.Product.filter({ created_by_id: user.id, id: String(input.product_id || "") });
        const product = owned[0];
        if (!product) return { error: "No product of yours with that id. Call list_my_products first." };

        // Footage stands in for the product photo, so an ad can be made for a
        // product that has no picture as long as there is a clip to use.
        const footage = String(input.video_url || "").trim();
        if (footage && !/^https:\/\//i.test(footage)) {
          return { error: "The footage address has to start with https:// -- upload the clip on the AutoPilot page first, then use the address it gets." };
        }
        if (!footage && !product.image_url) {
          return { error: `"${product.name}" has no image yet -- add one with update_product, or pass video_url to use a clip instead.` };
        }

        // Vertical is the TikTok shape. TikTok's Branded Content Policy covers
        // every affiliate-link post, and a product it bans gets the video
        // pulled and the account marked -- so no render is spent on one.
        const format = videoAds.adFormat(input.format);
        const forTikTok = format.platform === "tiktok";
        const rule = tiktokRule(product, { isEbay: isEbayProduct(product) });
        if (forTikTok && rule.status === "banned") {
          return { error: `Not made: ${rule.reason} "${product.name}" can't be promoted there.`, tiktok: rule.status, policy: TIKTOK_POLICY_URL };
        }
        const supplement = rule.status === "restricted";

        // The vendor's own rules, on every platform: many allow only their own
        // creatives and forbid anything from the sales page or sales video.
        // A clip copied in by import_official_creatives for this same product
        // carries its own proof of where it came from.
        const importedOfficial =
          !!footage &&
          (await D.AdAsset.filter({ created_by_id: user.id, file_url: footage, is_official: true })).some(
            (a) => String(a.product_id) === String(product.id)
          );
        const creative = vendorCreativeCheck(product, {
          isEbay: isEbayProduct(product),
          footage: !!footage,
          footageIsOfficial: input.footage_is_official === true || importedOfficial,
        });
        if (!creative.ok) {
          return {
            error: `Not made: ${creative.reason}`,
            ...(creative.note ? { vendor_rules: creative.note } : {}),
            ...(creative.source ? { vendor_rules_source: creative.source } : {}),
          };
        }

        if (!videoAds.videoAdsConfigured()) {
          return { error: "Video ad generation isn't set up yet -- it needs an OpenAI and a JSON2Video API key configured on the server. Nothing you can fix from chat.", configured: false };
        }

        // Vendor products: only the vendor's approved copy, led by the owner's
        // own opening line, word for word (see adScripts.js). eBay listings
        // have no vendor copy; their script comes from the listing's own facts.
        const ebay = isEbayProduct(product);
        let script = String(input.script || "").trim();
        let scriptFrom = null;
        if (!ebay) {
          const built = script
            ? checkSuppliedScript(script, { product, user, supplement })
            : await composeAdScript({
                product,
                user,
                supplement,
                pick: async (sentences) => {
                  const picked = await callLLM({
                    prompt: `Pick the sentences for a 15-20 second video ad voiceover for "${product.name}", from the vendor's approved ad copy below. Pick 2 to 4 that read well spoken aloud one after another, in the order they should be said, ending on a call to action if one is there. Don't rewrite anything -- answer only with the numbers.

${sentences.map((t, i) => `${i}. ${t}`).join("\n")}`,
                    response_json_schema: { type: "object", properties: { indices: { type: "array", items: { type: "integer" } } }, required: ["indices"] },
                  });
                  return picked?.indices;
                },
              });
          if (built.outcome !== "ok") {
            return {
              error: `Not made: ${built.reason}`,
              ...(built.outcome === "escalate" ? { needs_owner: true } : {}),
              ...("excluded" in built && Array.isArray(built.excluded) && built.excluded.length ? { excluded_from_copy: built.excluded.slice(0, 10) } : {}),
            };
          }
          script = built.script;
          scriptFrom = { opening_line: openingLineFor(product, user), approved_copy_source: product.approved_copy_source };
        } else if (!script) {
          const written = await callLLM({
            prompt: `Write a short 15-20 second video ad voiceover script for this affiliate product. 2-4 short sentences, spoken out loud, no stage directions, no emoji, no hashtags. End with a clear call to action.

Say the things a buyer decides on -- condition, where it ships from, shipping cost or speed, what's included -- but ONLY where they appear in the details below. Never state a price: this video outlives the listing's price.

Invent nothing. No "fast free shipping", no "brand new sealed", no "limited time", no guarantees, no health or income claims, unless the words are in the details below. A claim that isn't in the listing is the kind of thing that gets an affiliate account closed.
${supplement ? `
This is a dietary supplement. Say only what it is and how it is taken, in plain label-level words. No health, disease, symptom, weight or body-change claims, no before/after, no testimonials -- not even if the details below make them.
` : ""}
Product: ${product.name}
Details: ${product.description || "none recorded"}
Category: ${product.category || "N/A"}`,
          });
          script = String(written.text || "").trim();
          if (!script) return { error: "Couldn't write a script for this product. Try passing your own." };
          const opening = checkOpeningLine(openingLineFor(product, user));
          if (opening.ok) script = `${opening.line} ${script}`;
        }

        const audioBuffer = await videoAds.synthesizeSpeechBuffer(
          script,
          String(input.voice || "").trim() || undefined,
          String(input.tone || "").trim() || undefined
        );
        const audioUrl = await videoAds.uploadPublicAsset(storageClient(), audioBuffer, `${product.id}.mp3`, "audio/mpeg");
        const duration = videoAds.estimateDurationSeconds(script);
        // eBay is the one network here that hands affiliates a logo and asks
        // for it to be used exactly as supplied; the file is served from this
        // app's own /brand, unmodified from their Creative Gallery download.
        const goesToEbay = detectNetwork(hostOf(product.url), product.category?.split("_")[0]) === "ebay";
        const renderId = await videoAds.submitAdVideoRender({
          imageUrl: largestEbayImage(product.image_url),
          videoUrl: footage || undefined,
          audioUrl,
          caption: product.name,
          duration,
          format: input.format,
          captions: input.captions !== false,
          badgeUrl: goesToEbay && origin ? `${origin}/brand/ebay-logo.png` : undefined,
        });

        return {
          render_id: renderId,
          product_id: product.id,
          product_name: product.name,
          script,
          ...(scriptFrom ? { script_from: scriptFrom } : {}),
          format: `${format.width}x${format.height} (${format.where})`,
          // Handed over with the video rather than left to the user to write:
          // the on-screen line covers the muted scroller, this covers the
          // platform's own check for #ad and the AI-content wording
          // Digistore24's terms require.
          // A supplement ad carries the FDA line: Advanced Bionutritionals'
          // terms require it, and it is standard for any supplement claim.
          suggested_caption: videoAds.suggestedAdCaption(product.name) + (supplement ? `\n\n${FDA_DISCLAIMER}` : ""),
          ...(forTikTok ? { tiktok: rule.status, posting_checklist: tiktokPostingChecklist(rule) } : {}),
          ...(creative.note ? { vendor_rules: creative.note } : {}),
          estimated_wait_seconds: 60,
          message:
            "Rendering started -- call check_video_ad with this render_id in about a minute. Give the user the suggested_caption to post with it and the posting_checklist steps; the video already carries the disclosure on screen.",
        };
      }

      case "check_video_ad": {
        const renderId = String(input.render_id || "").trim();
        if (!renderId) return { error: "render_id is required." };
        if (!videoAds.videoAdsConfigured()) {
          return { error: "Video ad generation isn't set up yet.", configured: false };
        }

        const status = await videoAds.getRenderStatus(renderId);
        if (status.status === "failed") return { status: "failed", error: status.error || "Render failed." };
        if (status.status !== "done") return { status: status.status, message: "Still rendering -- check again in a bit, not immediately." };

        let title = "AI-generated video ad";
        if (input.product_id) {
          const owned = await D.Product.filter({ created_by_id: user.id, id: String(input.product_id) });
          if (owned[0]) title = `${owned[0].name} -- AI video ad`;
        }

        // Only columns ad_assets actually has. A `source` field was being sent
        // too, and Postgres rejects an insert naming a column that isn't
        // there -- so every finished render failed at the last step and no ad
        // creative was ever saved.
        const shape = videoAds.adFormat(input.format);
        const asset = await D.AdAsset.create({
          created_by_id: user.id,
          title,
          file_url: status.url,
          file_type: "video",
          platform: shape.platform,
          notes: `AI-generated video ad, ${shape.width}x${shape.height} for ${shape.where}. Rendered via JSON2Video (render ${renderId}).`,
        });

        // An ad only exists if the product passed TikTok's rules and the
        // vendor's, and a "link in bio" ad has to lead to the product -- so
        // its link goes onto the share page without a separate step.
        let onSharePage = null;
        if (input.product_id) {
          // The ad is already saved; a failure here must not report it lost.
          try {
            const links = await D.AffiliateLink.filter({ created_by_id: user.id, product_id: String(input.product_id) }, "-created_at", 20);
            const live = links.filter((l) => l.is_active !== false);
            if (live.some((l) => l.bio_featured_at)) onSharePage = "already";
            else if (live[0]) {
              await D.AffiliateLink.update(live[0].id, { bio_featured_at: new Date().toISOString() });
              onSharePage = "added";
            } else onSharePage = "no_link";
          } catch (e) {
            console.error("check_video_ad: share page update failed:", e.message);
            onSharePage = "failed";
          }
        }

        return {
          status: "done",
          url: status.url,
          ad_asset_id: asset.id,
          ...(onSharePage ? { share_page: onSharePage } : {}),
          message:
            onSharePage === "no_link"
              ? "Saved to your ad creatives. This product has no affiliate link yet, so it isn't on the share page -- create one before posting."
              : onSharePage === "failed"
                ? "Saved to your ad creatives, but adding it to the share page failed -- add it with the star on the Links page."
                : onSharePage
                  ? "Saved to your ad creatives, and the product is on the share page."
                  : "Saved to your ad creatives.",
        };
      }

      case "connect_affiliate_network": {
        const networkId = String(input.network || "").trim().toLowerCase();
        const value = String(input.id || "").trim();
        const network = AFFILIATE_NETWORKS.find((n) => n.id === networkId);
        if (!network) return { error: `Unknown network "${networkId}". Known networks: ${AFFILIATE_NETWORKS.map((n) => n.id).join(", ")}.` };
        if (!value) return { error: "An id/nickname is required. Ask the user for it -- never invent one." };

        if (networkId === "clickbank") {
          await D.User.update(user.id, { clickbank_nickname: value });
        } else {
          await D.User.update(user.id, {
            affiliate_network_ids: { ...(user.affiliate_network_ids || {}), [networkId]: value },
          });
        }
        return { connected: true, network: network.name, id: value, message: `Saved -- ${network.name} links will now use this id.` };
      }

      case "get_application_profile": {
        const profile = user.affiliate_application_profile || {};
        const filledIn = Object.keys(profile).some((k) => {
          const v = profile[k];
          return Array.isArray(v) ? v.length > 0 : !!v;
        });
        if (!filledIn) {
          return { filled_in: false, message: "Nothing saved yet -- send the user to /application-profile to fill it in first." };
        }
        return {
          filled_in: true,
          full_name: profile.full_name || null,
          company_name: profile.company_name || null,
          telegram_username: profile.telegram_username || null,
          whatsapp_number: profile.whatsapp_number || null,
          website_url: profile.website_url || null,
          traffic_sources: profile.traffic_sources || [],
          networks_used: profile.networks_used || [],
          clickbank_status: profile.clickbank_status || null,
          clickbank_nickname: user.clickbank_nickname || null,
          email: user.email || null,
        };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (error) {
    console.error(`Tool ${name} failed:`, error.message);
    return { error: `That didn't work: ${error.message}` };
  }
}
