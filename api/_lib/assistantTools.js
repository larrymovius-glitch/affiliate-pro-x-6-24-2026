import { db } from "./db.js";
import { getClickBankAffiliateId, applyClickBankAffiliateId } from "./affiliates.js";
import { networkForDestination } from "./tracking.js";
import { invokeLLM } from "./llm.js";
import { AFFILIATE_NETWORKS, connectedNetworkIds } from "./affiliateNetworks.js";
import { adminClient } from "./supabase.js";
import * as videoAdsLib from "./videoAds.js";

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

/** Trim a row down to what is useful in a conversation, and keep tokens sane. */
function linkSummary(l) {
  return {
    id: l.id,
    product_name: l.product_name,
    short_code: l.short_code,
    clicks: l.clicks || 0,
    conversions: l.conversions || 0,
    earnings: Number(l.earnings) || 0,
  };
}

function productSummary(p) {
  return { id: p.id, name: p.name, category: p.category, commission_rate: p.commission_rate, url: p.url };
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
      "The user's affiliate links with per-link clicks, conversions and earnings. Use when asked which links exist or which are performing.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: `How many to return, 1-${MAX_ROWS}. Default 10.` },
      },
      required: [],
    },
  },
  {
    name: "list_my_products",
    description: "Products the user has added, which are what links and autopilot ads get built from.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number", description: `1-${MAX_ROWS}. Default 10.` } },
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
    name: "create_video_ad",
    description:
      "Start generating a short AI voiceover video ad (image + TTS voiceover + caption) for one of the user's products. Rendering happens on an external service and takes roughly a minute -- this only submits the job and returns a render_id. Call check_video_ad with that id a little later to see if it's done; do not call it back to back, space it out across the conversation. Requires the product to have an image_url. If this returns a 'not set up' error, tell the user this feature needs an API key configured and do not try again this turn.",
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "string", description: "id from list_my_products." },
        script: { type: "string", description: "Optional ad script/voiceover text, roughly 2-4 short sentences. Omit to have one written automatically." },
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
 * @param {{ user: any, origin: string|null, D?: any, invokeLLM?: Function, videoAds?: any, storageClient?: any }} ctx
 *        `D`, `invokeLLM`, `videoAds` and `storageClient` are injectable so
 *        tools can be tested without a database, a live web search, or a
 *        real render/storage call. Production callers omit all of them.
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
        const rows = await D.AffiliateLink.filter({ created_by_id: user.id }, "-created_at", clampLimit(input.limit));
        return { links: rows.map(linkSummary) };
      }

      case "list_my_products": {
        const rows = await D.Product.filter({ created_by_id: user.id }, "-created_at", clampLimit(input.limit));
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
        const created = await D.Product.create({
          created_by_id: user.id,
          name: name_,
          url,
          category: String(input.category || "other").trim().slice(0, 60),
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
          link: linkSummary(link),
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

      case "create_video_ad": {
        const owned = await D.Product.filter({ created_by_id: user.id, id: String(input.product_id || "") });
        const product = owned[0];
        if (!product) return { error: "No product of yours with that id. Call list_my_products first." };
        if (!product.image_url) return { error: `"${product.name}" has no image yet -- add one on the product before a video ad can be made.` };

        if (!videoAds.videoAdsConfigured()) {
          return { error: "Video ad generation isn't set up yet -- it needs an OpenAI and a JSON2Video API key configured on the server. Nothing you can fix from chat.", configured: false };
        }

        let script = String(input.script || "").trim();
        if (!script) {
          const written = await callLLM({
            prompt: `Write a short, energetic 15-20 second video ad voiceover script for this affiliate product. 2-4 short sentences, spoken out loud, no stage directions, no emoji, no hashtags. End with a clear call to action.\n\nProduct: ${product.name}\nDescription: ${product.description || "N/A"}\nCategory: ${product.category || "N/A"}`,
          });
          script = String(written.text || "").trim();
          if (!script) return { error: "Couldn't write a script for this product. Try passing your own." };
        }

        const audioBuffer = await videoAds.synthesizeSpeechBuffer(script);
        const audioUrl = await videoAds.uploadPublicAsset(storageClient(), audioBuffer, `${product.id}.mp3`, "audio/mpeg");
        const duration = videoAds.estimateDurationSeconds(script);
        const renderId = await videoAds.submitAdVideoRender({ imageUrl: product.image_url, audioUrl, caption: product.name, duration });

        return {
          render_id: renderId,
          product_id: product.id,
          product_name: product.name,
          script,
          estimated_wait_seconds: 60,
          message: "Rendering started -- call check_video_ad with this render_id in about a minute.",
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

        const asset = await D.AdAsset.create({
          created_by_id: user.id,
          title,
          file_url: status.url,
          file_type: "video",
          platform: "general",
          notes: `Rendered via JSON2Video (render ${renderId}).`,
          source: "ai_generated_video",
        });

        return { status: "done", url: status.url, ad_asset_id: asset.id, message: "Saved to your ad creatives." };
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
