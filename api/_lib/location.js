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
 * The profile fields to save, or null when there is nothing to do. The
 * first location recorded is kept: it is where the person was when they
 * joined (or first came back after this was added), not wherever they
 * happen to be today.
 */
export function locationPatch(profile, location) {
  if (!location || profile?.signup_country) return null;
  return {
    signup_country: location.country,
    signup_region: location.region || null,
    signup_city: location.city || null,
  };
}
