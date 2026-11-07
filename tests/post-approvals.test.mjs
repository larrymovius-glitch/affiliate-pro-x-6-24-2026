import assert from "node:assert/strict";
import test from "node:test";
import {
  bodyProblem,
  DISCLOSURE,
  messageProblem,
  PERSONAL_ATTRIBUTE,
  pickNextPost,
  pickPostOptions,
} from "../api/_lib/facebookPosts.js";
import { approvalProblem, APPROVAL_METHODS, isApprovalMethod } from "../api/_lib/postApprovals.js";
import { publishToPage } from "../api/_lib/facebookPublish.js";
import publishApproved from "../api/publishApproved.js";
import skipApprovals from "../api/skipApprovals.js";
import setFacebookPostMode from "../api/setFacebookPostMode.js";

// The approval queue between the AI and a member's Facebook Page, and Meta's
// personal-attributes rule. These pin the refusals (policies rule 3).

const product = { id: "p1", name: "Desk Lamp", creative_rule: "allowed", image_url: "https://x/lamp.jpg", image_source: "official" };

test("Meta personal-attributes rule: posts never tell readers what they are", () => {
  for (const bad of [
    "You are a veteran? This lamp is for you.",
    "Struggling with your diabetes? Take a look.",
    "Other disabled folks like you love this one.",
    "Vets like you deserve a good night's light.",
    "Are you in debt and tired of it? Take a look.",
  ]) {
    assert.ok(PERSONAL_ATTRIBUTE.test(bad), bad);
    assert.match(bodyProblem(bad, product), /personal traits/, bad);
  }
});

test("speaking about a group, not to the reader, is allowed", () => {
  for (const ok of [
    "Made with veterans and their families in mind. Take a look and decide for yourself.",
    "A single lamp that lights up a whole desk. Take a look and decide for yourself.",
    "Here's a handy lamp you can use every day. Take a look and decide for yourself.",
  ]) {
    assert.equal(PERSONAL_ATTRIBUTE.test(ok), false, ok);
    assert.equal(bodyProblem(ok, product), null, ok);
  }
});

test("a finished post must open with the #ad disclosure and is re-checked before publishing", () => {
  assert.equal(messageProblem(`${DISCLOSURE}\n\nA handy lamp.\n\nhttps://apx.example/r/abc`), null);
  assert.match(messageProblem("A handy lamp.\n\nhttps://apx.example/r/abc"), /disclosure/);
  assert.match(messageProblem(`${DISCLOSURE}\n\nYou are a veteran, so this is for you.`), /personal traits/);
  assert.equal(messageProblem(""), "empty");
});

test("publishing refuses a post that fails the checks without ever calling Facebook", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Facebook was called for a post that should have been refused");
  };
  try {
    const outcome = await publishToPage({ account_id: "page1", access_token: "t" }, { message: "No disclosure here." });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.reason, "blocked");
  } finally {
    globalThis.fetch = realFetch;
  }
});

function catalog(n) {
  const products = [];
  const links = [];
  for (let i = 1; i <= n; i++) {
    products.push({ id: `p${i}`, name: `Product ${i}`, creative_rule: "allowed", image_url: `https://x/${i}.jpg`, image_source: "official", is_active: true });
    links.push({ id: `l${i}`, product_id: `p${i}`, short_code: `c${i}`, is_active: true, clicks: 10 - i });
  }
  return { products, links };
}

test("offers up to three different products to flick through, best first", () => {
  const { options } = pickPostOptions({ ...catalog(5), count: 3 });
  assert.deepEqual(options.map((o) => o.product.id), ["p1", "p2", "p3"]);
});

test("'show me different ones' leaves out the products just offered", () => {
  const { options } = pickPostOptions({ ...catalog(5), count: 3, exclude: ["p1", "p2", "p3"] });
  assert.deepEqual(options.map((o) => o.product.id), ["p4", "p5"]);
});

test("automatic mode still picks the single best product", () => {
  const { next } = pickNextPost(catalog(3));
  assert.equal(next.product.id, "p1");
});

test("tap, voice, keyboard and switch all count the same; the app itself can never approve", () => {
  assert.deepEqual(APPROVAL_METHODS, ["tap", "voice", "keyboard", "switch"]);
  for (const m of APPROVAL_METHODS) assert.equal(isApprovalMethod(m), true, m);
  for (const m of ["system", "ai", "auto", "", undefined, null]) assert.equal(isApprovalMethod(m), false, String(m));
});

test("only the owner can approve, and only while the post is still waiting", () => {
  const row = { id: "a1", user_id: "u1", status: "pending" };
  assert.equal(approvalProblem(row, { id: "u1" }), null);
  assert.equal(approvalProblem(row, { id: "u2" }).status, 404);
  assert.equal(approvalProblem(null, { id: "u1" }).status, 404);
  assert.equal(approvalProblem({ ...row, status: "published" }, { id: "u1" }).status, 409);
  assert.equal(approvalProblem({ ...row, status: "publishing" }, { id: "u1" }).status, 409);
  assert.equal(approvalProblem(row, null).status, 404);
});

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

for (const [name, handler, body] of [
  ["publishApproved", publishApproved, { approvalId: "a1", method: "tap" }],
  ["skipApprovals", skipApprovals, { method: "tap" }],
  ["setFacebookPostMode", setFacebookPostMode, { mode: "auto" }],
]) {
  test(`${name} refuses anyone not logged in, before touching anything`, async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("made an outside call for a logged-out request"); };
    try {
      const res = fakeRes();
      await handler({ method: "POST", headers: {}, body }, res);
      assert.equal(res.statusCode, 401);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
}
