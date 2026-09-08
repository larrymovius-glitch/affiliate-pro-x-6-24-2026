import assert from "node:assert/strict";
import test from "node:test";
import { readApplicationForm, draftFillPlan } from "../api/_lib/vendorApplicationBot.js";

// Fakes a headless-browser session just enough to exercise
// readApplicationForm's own logic (the safety gate, and that it hands back
// whatever page.evaluate returns) without needing real Chromium in a test.
function fakeBrowser(evaluateResult) {
  const closed = { called: false };
  const browser = {
    newPage: async () => ({
      goto: async () => {},
      evaluate: async () => evaluateResult,
    }),
    close: async () => {
      closed.called = true;
    },
  };
  return { browser, closed };
}

test("readApplicationForm refuses an account-level URL before ever launching a browser", async () => {
  let launched = false;
  await assert.rejects(
    () => readApplicationForm("https://vendor.com/signup", { launch: async () => { launched = true; return fakeBrowser([]).browser; } }),
    /account-level/
  );
  assert.equal(launched, false, "must not launch a browser for a blocked URL");
});

test("readApplicationForm returns the fields the page reports and always closes the browser", async () => {
  const fields = [{ selector: "#name", label: "Full Name", type: "text", required: true }];
  const { browser, closed } = fakeBrowser(fields);
  const result = await readApplicationForm("https://vendor-example.com/apply", { launch: async () => browser });
  assert.deepEqual(result.fields, fields);
  assert.equal(closed.called, true, "browser must be closed even on the success path");
});

test("readApplicationForm closes the browser even if the page throws", async () => {
  const closed = { called: false };
  const browser = {
    newPage: async () => ({
      goto: async () => { throw new Error("navigation failed"); },
      evaluate: async () => [],
    }),
    close: async () => { closed.called = true; },
  };
  await assert.rejects(() => readApplicationForm("https://vendor-example.com/apply", { launch: async () => browser }));
  assert.equal(closed.called, true, "a mid-navigation failure must not leak the browser process");
});

test("draftFillPlan separates high-confidence matches from everything else", async () => {
  const fields = [
    { selector: "#name", label: "Full Name", type: "text", required: true },
    { selector: "#unrelated", label: "Preferred Shoe Size", type: "text", required: false },
  ];
  const profile = { full_name: "Larry Movius" };

  const plan = await draftFillPlan(fields, profile, {
    invokeLLM: async () => ({
      mappings: [
        { selector: "#name", value: "Larry Movius", confidence: "high", reason: "matches full_name" },
        { selector: "#unrelated", value: null, confidence: "low", reason: "no matching profile field" },
      ],
    }),
  });

  assert.equal(plan.readyToFill.length, 1);
  assert.equal(plan.readyToFill[0].selector, "#name");
  assert.equal(plan.needsReview.length, 1);
  assert.equal(plan.needsReview[0].selector, "#unrelated");
});

test("draftFillPlan treats a high-confidence match with a null value as needing review, not auto-fill", async () => {
  const plan = await draftFillPlan([{ selector: "#x", label: "X" }], {}, {
    invokeLLM: async () => ({ mappings: [{ selector: "#x", value: null, confidence: "high" }] }),
  });
  assert.equal(plan.readyToFill.length, 0, "a null value must never be auto-filled regardless of stated confidence");
  assert.equal(plan.needsReview.length, 1);
});

test("draftFillPlan handles the LLM returning no mappings at all without throwing", async () => {
  const plan = await draftFillPlan([{ selector: "#x", label: "X" }], {}, {
    invokeLLM: async () => ({}),
  });
  assert.deepEqual(plan.readyToFill, []);
  assert.deepEqual(plan.needsReview, []);
});
