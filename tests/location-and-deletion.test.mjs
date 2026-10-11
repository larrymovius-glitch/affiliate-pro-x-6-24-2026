import assert from "node:assert/strict";
import test from "node:test";
import { locationFromHeaders, locationPatch } from "../api/_lib/location.js";
import { deleteAccountCompletely } from "../api/_lib/accountDeletion.js";

test("location comes from Vercel's headers, with the city decoded", () => {
  const loc = locationFromHeaders({ "x-vercel-ip-country": "us", "x-vercel-ip-country-region": "NY", "x-vercel-ip-city": "New%20York" });
  assert.deepEqual(loc, { country: "US", region: "NY", city: "New York" });
  assert.equal(locationFromHeaders({}), null, "off Vercel there is nothing to record");
  assert.equal(locationFromHeaders({ "x-vercel-ip-country": "xx1" }), null);
});

test("the first location is kept forever; every visit updates last seen", () => {
  const loc = { country: "US", region: "OH", city: "Akron" };
  const T = "2026-10-11T23:00:00.000Z";
  assert.deepEqual(locationPatch({}, loc, T), {
    signup_country: "US", signup_region: "OH", signup_city: "Akron",
    last_seen_country: "US", last_seen_region: "OH", last_seen_city: "Akron", last_seen_at: T,
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
  for (const n of ["AffiliateLink", "Product", "Campaign", "Payout", "GeneratedPost", "AdReview", "AdAsset", "PayoutSchedule", "CreativeImport"]) D[n] = table(n);
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
  assert.deepEqual(row, { email: "katie@example.com", outcome: "already_registered", ip: "102.90.100.124", country: "NG", region: "LA", city: "Lagos", user_agent: "Phone" });
  assert.equal(signupAttemptRow({ email: "a@b.com", outcome: "<script>" }, {}).outcome, "error", "only known outcomes reach the admin page");
  assert.equal(signupAttemptRow({}, {}), null);
});
