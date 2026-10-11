import { shareUrlFor } from "../../api/_lib/tracking.js";

/**
 * Generates a short, random code to identify a link for click tracking.
 */
export function generateShortCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Builds the real, trackable URL for an affiliate link — this is what
 * should actually be shared in posts, not the raw destination_url.
 * Clicks on this URL get counted before redirecting the visitor on to
 * the real destination, with the short code attached as the network's
 * tracking id so the sale can be attributed back (see api/trackClick.js).
 *
 * Served by the /r/:code rewrite in vercel.json. The older
 * /functions/trackClick?code= form still resolves, but it reads as an open
 * redirect and social platforms treat it accordingly.
 */
export function getTrackableUrl(link) {
  // A program whose terms forbid the short link (Shopify) gets its own link.
  return shareUrlFor(link, window.location.origin) || "#";
}
