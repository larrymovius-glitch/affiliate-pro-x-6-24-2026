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
 * the real destination (see base44/functions/trackClick).
 */
export function getTrackableUrl(link) {
  if (!link?.short_code) return link?.destination_url || "#";
  return `${window.location.origin}/functions/trackClick?code=${encodeURIComponent(link.short_code)}`;
}
