// A visitor's approximate location, from the headers Vercel adds to every
// request (looked up from the connection's IP address, never GPS): country
// code, region code (a US state, for instance) and city. Approximate by
// nature, and absent entirely when running anywhere but on Vercel.

function header(headers, name) {
  const v = headers?.[name];
  return String(Array.isArray(v) ? v[0] : v || "").trim();
}

/**
 * @returns {{ country: string, region: string, city: string, timezone: string } | null}
 *          null when Vercel didn't say where the request came from.
 *          timezone is the connection's (IANA name, e.g. "Africa/Lagos").
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
  return { country, region, city: city.slice(0, 100), timezone: validTimezone(header(headers, "x-vercel-ip-timezone")) };
}

/** An IANA time zone name the runtime recognises, or "". */
export function validTimezone(tz) {
  const name = String(tz || "").trim().slice(0, 64);
  if (!name) return "";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return name;
  } catch {
    return "";
  }
}

/** Minutes ahead of UTC in a time zone at a moment, e.g. -240 for New York in summer. */
export function utcOffsetMinutes(tz, at = new Date()) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value || "GMT";
  const m = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
}

// A VPN or proxy moves where a connection appears to come from, but not the
// clock on the person's phone. When the device's time zone and the
// connection's are two or more hours apart, the connection is very likely
// going through one. Under two hours is left alone: people near a zone line,
// and travellers who haven't reset their phone, would otherwise be flagged.
const VPN_GAP_MINUTES = 120;

/**
 * @param {string} deviceTz the browser's Intl time zone, as the app sent it
 * @param {string} ipTz     the connection's, from Vercel
 * @returns {{ device_timezone: string|null, ip_timezone: string|null, vpn_suspected: boolean|null }}
 *          vpn_suspected is null when either zone is unknown -- no data is not "no VPN".
 */
export function vpnCheck(deviceTz, ipTz, at = new Date()) {
  const device = validTimezone(deviceTz);
  const ip = validTimezone(ipTz);
  const suspected = device && ip ? Math.abs(utcOffsetMinutes(device, at) - utcOffsetMinutes(ip, at)) >= VPN_GAP_MINUTES : null;
  return { device_timezone: device || null, ip_timezone: ip || null, vpn_suspected: suspected };
}

/** The visitor's IP address as Vercel received it (the first hop of x-forwarded-for). */
export function ipFromHeaders(headers) {
  return header(headers, "x-real-ip") || header(headers, "x-forwarded-for").split(",")[0].trim() || "";
}

const OUTCOMES = new Set(["created", "already_registered", "invalid_email", "weak_password", "error"]);

/**
 * One row for signup_attempts, or null when the request isn't worth keeping.
 * The outcome is what the Register page saw, mapped onto a fixed list so a
 * visitor can't write arbitrary text into the owner's admin page.
 */
export function signupAttemptRow(body, headers) {
  const email = String(body?.email || "").trim().toLowerCase().slice(0, 200);
  if (!email) return null;
  const outcome = OUTCOMES.has(body?.outcome) ? body.outcome : "error";
  const loc = locationFromHeaders(headers);
  return {
    email,
    outcome,
    ip: ipFromHeaders(headers).slice(0, 64) || null,
    country: loc?.country || null,
    region: loc?.region || null,
    city: loc?.city || null,
    user_agent: header(headers, "user-agent").slice(0, 300) || null,
    ...vpnCheck(body?.timezone, loc?.timezone || ""),
  };
}

/**
 * The profile fields to save, or null when there is nothing to do. Two
 * places are kept: signup_* is the first location recorded -- where the
 * person was when they joined (or first came back after this was added) --
 * and never changes; last_seen_* is their latest visit, so the owner can see
 * when someone connects from somewhere other than where they started.
 *
 * @param {any} profile
 * @param {{ country: string, region: string, city: string, timezone?: string } | null} location
 * @param {string} [now] ISO time of this visit
 * @param {string} [deviceTz] the browser's time zone, for the VPN check
 */
export function locationPatch(profile, location, now = new Date().toISOString(), deviceTz = "") {
  if (!location) return null;
  const vpn = vpnCheck(deviceTz, location.timezone || "", new Date(now));
  return {
    ...(profile?.signup_country
      ? {}
      : { signup_country: location.country, signup_region: location.region || null, signup_city: location.city || null }),
    last_seen_country: location.country,
    last_seen_region: location.region || null,
    last_seen_city: location.city || null,
    last_seen_at: now,
    last_seen_device_timezone: vpn.device_timezone,
    last_seen_ip_timezone: vpn.ip_timezone,
    last_seen_vpn_suspected: vpn.vpn_suspected,
  };
}
