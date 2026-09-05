import assert from "node:assert/strict";
import test from "node:test";
import { signState, verifyState, SCOPES, AUTHORIZE_URL, redirectUri } from "../api/instagramConnect.js";

// The OAuth callback is a plain browser redirect with no Authorization header,
// so `state` is the only thing proving who started the flow. If it can be
// forged, a stranger can attach their own Instagram account to this app, or
// aim the connection at another user's id. These cover that boundary.
const SECRET = "test-app-secret";

test("a state we signed verifies and carries the user id back", () => {
  const claims = verifyState(signState("user-123", SECRET), SECRET);
  assert.equal(claims?.uid, "user-123");
});

test("a state signed with a different secret is rejected", () => {
  assert.equal(verifyState(signState("user-123", "someone-elses-secret"), SECRET), null);
});

test("editing the payload to point at another user invalidates the signature", () => {
  const [payload, sig] = signState("user-123", SECRET).split(".");
  const tampered = Buffer.from(JSON.stringify({ uid: "victim-456", ts: Date.now() })).toString("base64url");
  assert.notEqual(tampered, payload);
  assert.equal(verifyState(`${tampered}.${sig}`, SECRET), null);
});

test("a tampered signature is rejected", () => {
  const [payload, sig] = signState("user-123", SECRET).split(".");
  const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
  assert.equal(verifyState(`${payload}.${flipped}`, SECRET), null);
});

test("a state older than ten minutes is rejected, so a leaked one does not stay usable", () => {
  const elevenMinutesAgo = Date.now() - 11 * 60 * 1000;
  assert.equal(verifyState(signState("user-123", SECRET, elevenMinutesAgo), SECRET), null);

  // ...and one still inside the window is accepted, so the check is a window
  // rather than a blanket rejection.
  const nineMinutesAgo = Date.now() - 9 * 60 * 1000;
  assert.equal(verifyState(signState("user-123", SECRET, nineMinutesAgo), SECRET)?.uid, "user-123");
});

test("malformed states are rejected without throwing", () => {
  // A shorter signature would make timingSafeEqual throw rather than return
  // false, which would surface as a 500 instead of a clean rejection.
  for (const bad of ["", null, undefined, "no-dot", "a.b", ".", "a.", ".b", "x".repeat(200)]) {
    assert.equal(verifyState(bad, SECRET), null, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test("requests exactly the two scopes Instagram publishing needs", () => {
  // instagram_basic / instagram_content_publish were deprecated in Jan 2025;
  // asking for those instead would fail at the authorize step.
  assert.equal(SCOPES, "instagram_business_basic,instagram_business_content_publish");
});

test("uses Instagram's own authorize host, not the Facebook Login one", () => {
  // postToInstagram.js publishes against graph.instagram.com, so the whole flow
  // has to stay on the Instagram Login path.
  assert.equal(AUTHORIZE_URL, "https://api.instagram.com/oauth/authorize");
  assert.equal(redirectUri("https://example.test"), "https://example.test/api/instagramCallback");
});
