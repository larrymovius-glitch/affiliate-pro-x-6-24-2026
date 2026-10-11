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

test("the first location is kept; a later visit never overwrites it", () => {
  const loc = { country: "US", region: "OH", city: "Akron" };
  assert.deepEqual(locationPatch({}, loc), { signup_country: "US", signup_region: "OH", signup_city: "Akron" });
  assert.equal(locationPatch({ signup_country: "CA" }, loc), null);
  assert.equal(locationPatch({}, null), null);
});

function fakeDb(profile) {
  const deleted = [];
  const table = (name) => ({
    filter: async () => [{ id: `${name}-1` }],
    delete: async (id) => { deleted.push(id); },
  });
  const D = { deleted, User: { get: async (id) => (profile && profile.id === id ? profile : null) } };
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
});

test("a mismatched email deletes nothing", async () => {
  const D = fakeDb({ id: "u1", email: "a@test.com" });
  const admin = { auth: { admin: { deleteUser: async () => { throw new Error("must not be called"); } } } };
  await assert.rejects(deleteAccountCompletely({ D, admin, userId: "u1", email: "someone-else@test.com" }), /verification failed/);
  assert.equal(D.deleted.length, 0);
});
