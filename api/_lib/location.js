// A visitor's approximate location, from the headers Vercel adds to every
// request (looked up from the connection's IP address, never GPS): country
// code, region code (a US state, for instance) and city. Approximate by
// nature, and absent entirely when running anywhere but on Vercel.

function header(headers, name) {
  const v = headers?.[name];
  return String(Array.isArray(v) ? v[0] : v || "").trim();
}

/**
 * @returns {{ country: string, region: string, city: string } | null}
 *          null when Vercel didn't say where the request came from.
 */
export function locationFromHeaders(headers) {
  const country = header(headers, "x-vercel-ip-country").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return null;
  const region = header(headers, "x-vercel-ip-country-region").toUpperCase().slice(0, 10);
  let city = header(headers, "x-vercel-ip-city");
  // Vercel URL-encodes the city ("S%C3%A3o%20Paulo").
  try {
    city = decodeURIComponent(city);
  } catch {
    // leave it as sent
  }
  return { country, region, city: city.slice(0, 100) };
}

/**
 * The profile fields to save, or null when there is nothing to do. Two
 * places are kept: signup_* is the first location recorded -- where the
 * person was when they joined (or first came back after this was added) --
 * and never changes; last_seen_* is their latest visit, so the owner can see
 * when someone connects from somewhere other than where they started.
 *
 * @param {any} profile
 * @param {{ country: string, region: string, city: string } | null} location
 * @param {string} [now] ISO time of this visit
 */
export function locationPatch(profile, location, now = new Date().toISOString()) {
  if (!location) return null;
  return {
    ...(profile?.signup_country
      ? {}
      : { signup_country: location.country, signup_region: location.region || null, signup_city: location.city || null }),
    last_seen_country: location.country,
    last_seen_region: location.region || null,
    last_seen_city: location.city || null,
    last_seen_at: now,
  };
}
