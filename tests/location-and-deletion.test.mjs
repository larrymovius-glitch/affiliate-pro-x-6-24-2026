import assert from "node:assert/strict";
import test from "node:test";
import { locationFromHeaders, locationPatch } from "../api/_lib/location.js";
import { deleteAccountCompletely } from "../api/_lib/accountDeletion.js";

test("location comes from Vercel's headers, with the city decoded", () => {
  const loc = locationFromHeaders({ "x-vercel-ip-country": "us", "x-vercel-ip-country-region": "NY", "x-vercel-ip-city": "New%20York" });
  assert.deepEqual(loc, { country: "US", region: "NY", city: "New York", timezone: "" });
  assert.equal(locationFromHeaders({}), null, "off Vercel there is nothing to record");
  assert.equal(locationFromHeaders({ "x-vercel-ip-country": "xx1" }), null);
});

test("the first location is kept forever; every visit updates last seen", () => {
  const loc = { country: "US", region: "OH", city: "Akron" };
  const T = "2026-10-11T23:00:00.000Z";
  assert.deepEqual(locationPatch({}, loc, T), {
    signup_country: "US", signup_region: "OH", signup_city: "Akron",
    last_seen_country: "US", last_seen_region: "OH", last_seen_city: "Akron", last_seen_at: T,
    last_seen_device_timezone: null, last_seen_ip_timezone: null, last_seen_vpn_suspected: null,
  });
  const later = locationPatch({ signup_country: "CA" }, { country: "NG", region: "LA", city: "Lagos" }, T);
  assert.equal("signup_country" in later, false, "the first location never changes");
  assert.equal(later.last_seen_country, "NG");
  assert.equal(locationPatch({}, null), null);
});

function fakeDb(profile) {
  const deleted = [];
  const table = (name) => ({
    filter: async () => [{ id: `${name}-1` }],
    delete: async (id) => { deleted.push(id); },
  });
  const stamped = [];
  const D = {
    deleted,
    stamped,
    User: { get: async (id) => (profile && profile.id === id ? profile : null) },
    Payment: {
      filter: async () => [{ id: "pay-1" }],
      update: async (id, patch) => { stamped.push({ id, ...patch }); },
      delete: async () => { throw new Error("payments are never deleted"); },
    },
  };
  for (const n of ["AffiliateLink", "Product", "Campaign", "Payout", "GeneratedPost", "AdReview", "AdAsset", "PayoutSchedule", "CreativeImport", "IncomeEntry"]) D[n] = table(n);
  return D;
}

test("deleting an account removes its data and its login, so the email can sign up again", async () => {
  const D = fakeDb({ id: "u1", email: "a@test.com" });
  const removedLogins = [];
  const admin = { auth: { admin: { deleteUser: async (id) => { removedLogins.push(id); return { error: null }; } } } };
  await deleteAccountCompletely({ D, admin, userId: "u1", email: "a@test.com" });
  assert.deepEqual(removedLogins, ["u1"]);
  assert.ok(D.deleted.includes("AffiliateLink-1") && D.deleted.includes("Product-1"));
  assert.deepEqual(D.stamped, [{ id: "pay-1", payer_email: "a@test.com" }], "payments are kept, marked with who paid");
});

test("a mismatched email deletes nothing", async () => {
  const D = fakeDb({ id: "u1", email: "a@test.com" });
  const admin = { auth: { admin: { deleteUser: async () => { throw new Error("must not be called"); } } } };
  await assert.rejects(deleteAccountCompletely({ D, admin, userId: "u1", email: "someone-else@test.com" }), /verification failed/);
  assert.equal(D.deleted.length, 0);
});

test("a signup attempt keeps the email, a known outcome, and where it came from", async () => {
  const { signupAttemptRow } = await import("../api/_lib/location.js");
  const row = signupAttemptRow(
    { email: " Katie@Example.com ", outcome: "already_registered" },
    { "x-vercel-ip-country": "NG", "x-vercel-ip-country-region": "LA", "x-vercel-ip-city": "Lagos", "x-forwarded-for": "102.90.100.124, 10.0.0.1", "user-agent": "Phone" }
  );
  assert.deepEqual(row, { email: "katie@example.com", outcome: "already_registered", ip: "102.90.100.124", country: "NG", region: "LA", city: "Lagos", user_agent: "Phone", device_timezone: null, ip_timezone: null, vpn_suspected: null });
  assert.equal(signupAttemptRow({ email: "a@b.com", outcome: "<script>" }, {}).outcome, "error", "only known outcomes reach the admin page");
  assert.equal(signupAttemptRow({}, {}), null);
});

test("a device clock hours away from the connection's time zone flags a likely VPN", async () => {
  const { vpnCheck, locationPatch } = await import("../api/_lib/location.js");
  const at = new Date("2026-10-11T23:00:00Z");
  assert.equal(vpnCheck("Africa/Lagos", "America/New_York", at).vpn_suspected, true);
  assert.equal(vpnCheck("America/New_York", "America/New_York", at).vpn_suspected, false);
  assert.equal(vpnCheck("America/Chicago", "America/New_York", at).vpn_suspected, false, "one hour apart is a zone line or a traveller, not a VPN");
  assert.equal(vpnCheck("", "America/New_York", at).vpn_suspected, null, "no data is not 'no VPN'");
  assert.equal(vpnCheck("Not/AZone", "America/New_York", at).vpn_suspected, null);

  const patch = locationPatch({}, { country: "US", region: "NJ", city: "Piscataway", timezone: "America/New_York" }, at.toISOString(), "Africa/Lagos");
  assert.equal(patch.last_seen_vpn_suspected, true);
  assert.equal(patch.last_seen_device_timezone, "Africa/Lagos");
});
