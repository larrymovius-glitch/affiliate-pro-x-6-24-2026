import assert from "node:assert/strict";
import test from "node:test";
import { checkVendorBotAction, ALLOWED_ACTIONS } from "../api/_lib/vendorApplicationBot.js";

// This is the one gate every action the bot ever takes must pass through.
// These tests exist to prove account-level actions are actually blocked,
// not just documented as forbidden in a comment someone could miss later.

test("permits reading, filling, and submitting a vendor application form", () => {
  for (const action of ALLOWED_ACTIONS) {
    const r = checkVendorBotAction({ action, url: "https://vendor-example.com/affiliate-apply", description: "Apply to promote Widget Pro" });
    assert.equal(r.allowed, true, `${action} should be permitted`);
  }
});

test("blocks any action not on the allowlist, even with an innocent-looking target", () => {
  const r = checkVendorBotAction({ action: "click_button", url: "https://vendor-example.com/affiliate-apply" });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /not on the allowlist/);
});

test("blocks account signup even if mislabeled as an allowed action", () => {
  const r = checkVendorBotAction({
    action: "fill_application_form",
    url: "https://vendor-example.com/signup",
    description: "Create a new vendor account",
  });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /account-level/);
});

test("blocks login pages", () => {
  const r = checkVendorBotAction({ action: "submit_application_form", url: "https://network.com/login" });
  assert.equal(r.allowed, false);
});

test("blocks anything touching tax or bank info by description, even on an otherwise normal-looking URL", () => {
  const r = checkVendorBotAction({
    action: "fill_application_form",
    url: "https://vendor-example.com/apply",
    description: "Enter your bank-account and tax-form details for payout setup",
  });
  assert.equal(r.allowed, false);
});

test("blocks password-change targets", () => {
  const r = checkVendorBotAction({ action: "submit_application_form", url: "https://network.com/account/password" });
  assert.equal(r.allowed, false);
});

test("a real, ordinary vendor application is unaffected by the guardrails", () => {
  const r = checkVendorBotAction({
    action: "submit_application_form",
    url: "https://vendor-example.com/affiliates/apply?product=widget-pro",
    description: "Affiliate application for Widget Pro -- traffic sources, promotional methods",
  });
  assert.equal(r.allowed, true);
});
