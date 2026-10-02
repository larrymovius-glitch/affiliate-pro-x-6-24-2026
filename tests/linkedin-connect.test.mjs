import assert from "node:assert/strict";
import test from "node:test";
import { SCOPES, AUTHORIZE_URL, TOKEN_URL, redirectUri, authorizeUrl } from "../api/linkedinConnect.js";
import { signState, verifyState } from "../api/instagramConnect.js";
import { buildSharePayload } from "../api/postToLinkedIn.js";

// LinkedIn's two self-serve products, as documented: Sign In with LinkedIn
// using OpenID Connect (openid, profile -> /v2/userinfo's `sub`, the post
// author) and Share on LinkedIn (w_member_social -> /v2/ugcPosts).

test("requests exactly the scopes posting needs", () => {
  assert.equal(SCOPES, "openid profile w_member_social");
});

test("uses LinkedIn's OAuth endpoints and this app's callback path", () => {
  assert.equal(AUTHORIZE_URL, "https://www.linkedin.com/oauth/v2/authorization");
  assert.equal(TOKEN_URL, "https://www.linkedin.com/oauth/v2/accessToken");
  assert.equal(redirectUri("https://example.test"), "https://example.test/api/linkedinCallback");
});

test("the authorize URL percent-encodes the space-delimited scopes", () => {
  const url = new URL(authorizeUrl("client-1", "https://example.test/api/linkedinCallback", "signed-state"));
  assert.equal(`${url.origin}${url.pathname}`, AUTHORIZE_URL);
  assert.match(url.search, /scope=openid%20profile%20w_member_social/);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "client-1");
  assert.equal(url.searchParams.get("redirect_uri"), "https://example.test/api/linkedinCallback");
  assert.equal(url.searchParams.get("state"), "signed-state");
});

test("a state signed with the LinkedIn secret verifies only with that secret", () => {
  const state = signState("user-1", "linkedin-secret");
  assert.equal(verifyState(state, "linkedin-secret")?.uid, "user-1");
  assert.equal(verifyState(state, "instagram-secret"), null);
});

test("builds a public text share authored by the member", () => {
  const payload = buildSharePayload("urn:li:person:abc123", "Hello\n\nhttps://apx.example/r/xyz");
  assert.equal(payload.author, "urn:li:person:abc123");
  assert.equal(payload.lifecycleState, "PUBLISHED");
  assert.deepEqual(payload.specificContent["com.linkedin.ugc.ShareContent"], {
    shareCommentary: { text: "Hello\n\nhttps://apx.example/r/xyz" },
    shareMediaCategory: "NONE",
  });
  assert.deepEqual(payload.visibility, { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" });
});
