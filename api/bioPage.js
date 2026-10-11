import { adminClient } from "./_lib/supabase.js";
import { normalizeHandle, renderBioPage, renderMissingPage } from "./_lib/bio.js";
import { mustShareAsGiven } from "./_lib/tracking.js";

// Serves the public share page at /go/<handle> (see the rewrite in
// vercel.json). Anyone can open it -- that is the point -- so it reads through
// the service-role client and hands back only what a visitor is meant to see:
// the owner's name, avatar, and the links they chose to feature. Never the
// destination URLs, the click counts or the earnings -- except a program
// whose terms forbid the /r/ short link (Shopify): its own link is the button.
//
// Which links appear is the owner's choice: affiliate_links.bio_featured_at is
// set when they star one on the Links page. Ordering by it, newest first, is
// what makes re-starring a link move it back to the top without needing drag
// handles on a phone.
const MAX_LINKS = 40;

export default async function handler(req, res) {
  const origin = `https://${req.headers.host}`;
  const send = (status, html) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    // A visitor arrives from a social post, so the first byte has to be quick:
    // served from the CDN for a minute, and kept servable while it refreshes.
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    res.status(status).send(html);
  };

  try {
    const handle = normalizeHandle(req.query?.handle);
    if (!handle) return send(404, renderMissingPage(origin));

    const db = adminClient();
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("id, full_name, avatar_url, bio_handle")
      .eq("bio_handle", handle)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return send(404, renderMissingPage(origin));

    const { data: links, error: linksError } = await db
      .from("affiliate_links")
      .select("short_code, product_name, product_id, bio_featured_at, destination_url")
      .eq("created_by_id", profile.id)
      .eq("is_active", true)
      .not("bio_featured_at", "is", null)
      .order("bio_featured_at", { ascending: false })
      .limit(MAX_LINKS);
    if (linksError) throw linksError;

    // Thumbnails are optional and live on the product, so one extra lookup --
    // skipped entirely when no featured link has a product behind it.
    const productIds = [...new Set((links || []).map((l) => l.product_id).filter(Boolean))];
    let imageById = new Map();
    if (productIds.length) {
      const { data: products } = await db.from("products").select("id, image_url").in("id", productIds);
      imageById = new Map((products || []).map((p) => [p.id, p.image_url]));
    }

    send(
      200,
      renderBioPage({
        handle,
        displayName: profile.full_name,
        avatarUrl: profile.avatar_url,
        origin,
        links: (links || []).map((link) => ({
          short_code: link.short_code,
          ...(mustShareAsGiven(link.destination_url) ? { direct_url: link.destination_url } : {}),
          product_name: link.product_name,
          image_url: imageById.get(link.product_id) || "",
        })),
      })
    );
  } catch (error) {
    console.error("bioPage error:", error);
    // Never show a stack trace to a stranger who followed a link from TikTok.
    send(500, renderMissingPage(origin));
  }
}
