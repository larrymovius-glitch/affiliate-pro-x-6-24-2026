import assert from "node:assert/strict";
import test from "node:test";
import { submitVendorApplication } from "../api/_lib/vendorApplicationBot.js";

// Fakes just enough of a page/browser to prove submitVendorApplication's own
// logic correct: which fields it fills, which it skips, and when it clicks
// submit. Real Chromium isn't needed to test decision logic.
function fakePage({ currentSelectors, typed = [], clicked = [] }) {
  return {
    goto: async () => {},
    evaluate: async (fn) => {
      const src = fn.toString();
      if (src.includes("querySelectorAll(\"input, textarea, select\")).map")) return currentSelectors;
      if (src.includes("querySelectorAll('button[type=\"submit\"]")) return "#submit-btn";
      return "confirmation text";
    },
    type: async (selector, value) => { typed.push({ selector, value }); },
    click: async (selector) => { clicked.push(selector); },
    waitForNavigation: async () => {},
  };
}

function fakeBrowser(pageOverrides) {
  const closed = { called: false };
  const typed = [];
  const clicked = [];
  const page = fakePage({ ...pageOverrides, typed, clicked });
  const browser = {
    newPage: async () => page,
    close: async () => { closed.called = true; },
  };
  return { browser, closed, typed, clicked };
}

test("refuses an account-level URL before ever launching a browser", async () => {
  let launched = false;
  await assert.rejects(
    () => submitVendorApplication("https://vendor.com/create-account", [{ selector: "#x", value: "y" }], {
      launch: async () => { launched = true; return fakeBrowser({ currentSelectors: [] }).browser; },
    }),
    /account-level/
  );
  assert.equal(launched, false);
});

test("refuses to run with no approved mappings", async () => {
  await assert.rejects(() => submitVendorApplication("https://vendor-example.com/apply", []), /No approved mappings/);
  await assert.rejects(() => submitVendorApplication("https://vendor-example.com/apply", null), /No approved mappings/);
});

test("fills only fields still present on the live page, skips the rest, and reports why", async () => {
  const { browser, typed } = fakeBrowser({ currentSelectors: ["#name"] });
  const result = await submitVendorApplication(
    "https://vendor-example.com/apply",
    [{ selector: "#name", value: "Larry Movius" }, { selector: "#gone", value: "should not be typed" }],
    { launch: async () => browser }
  );

  assert.deepEqual(typed, [{ selector: "#name", value: "Larry Movius" }]);
  assert.equal(result.submitted.length, 1);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].selector, "#gone");
  assert.match(result.skipped[0].reason, /no longer present/);
});

test("never clicks submit if every approved field was skipped", async () => {
  const { browser, clicked } = fakeBrowser({ currentSelectors: [] });
  const result = await submitVendorApplication(
    "https://vendor-example.com/apply",
    [{ selector: "#gone", value: "x" }],
    { launch: async () => browser }
  );
  assert.equal(clicked.length, 0, "must not submit a form with nothing actually filled");
  assert.equal(result.submitted.length, 0);
});

test("clicks submit and returns confirmation text once at least one field was filled", async () => {
  const { browser, clicked } = fakeBrowser({ currentSelectors: ["#name"] });
  const result = await submitVendorApplication(
    "https://vendor-example.com/apply",
    [{ selector: "#name", value: "Larry Movius" }],
    { launch: async () => browser }
  );
  assert.equal(clicked.length, 1);
  assert.equal(result.confirmationText, "confirmation text");
});

test("closes the browser even if typing into a field throws", async () => {
  const closed = { called: false };
  const browser = {
    newPage: async () => ({
      goto: async () => {},
      evaluate: async () => ["#name"],
      type: async () => { throw new Error("page crashed"); },
    }),
    close: async () => { closed.called = true; },
  };
  await assert.rejects(() =>
    submitVendorApplication("https://vendor-example.com/apply", [{ selector: "#name", value: "x" }], { launch: async () => browser })
  );
  assert.equal(closed.called, true);
});
