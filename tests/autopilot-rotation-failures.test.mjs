import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import vm from "node:vm";

// Exercise the cron loop's failure paths against a stubbed db.
async function load(dbImpl, packImpl) {
  const context = vm.createContext({ URL, console: { warn(){}, error(){}, log(){} }, process, setTimeout, Date });
  const src = await fs.readFile(new URL("../api/optimizeAutopilotPosts.js", import.meta.url), "utf8");
  const mod = new vm.SourceTextModule(src, { context, identifier: "opt.js" });
  const syn = (names, vals) => new vm.SyntheticModule(names, function () {
    for (const n of names) this.setExport(n, vals[n]);
  }, { context });
  await mod.link((s) => {
    if (s === "./_lib/db.js") return syn(["db"], { db: () => dbImpl });
    if (s === "./_lib/supabase.js") return syn(["getAuthedUser","isCronRequest"], { getAuthedUser: async () => ({ user: { role: "admin", id: "u1" } }), isCronRequest: () => true });
    if (s === "./createAutopilotPack.js") return syn(["createAutopilotPack"], { createAutopilotPack: packImpl });
    throw new Error("unexpected " + s);
  });
  await mod.evaluate();
  return mod.namespace.default;
}

const old = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
const post = (over = {}) => ({ id: "p1", created_by_id: "u1", product_id: "prod1", link_id: "l1", status: "posted", cycle_starts_at: old, regenerations: 0, ...over });

function makeDb(posts, { owner = { id: "u1" } } = {}) {
  const updates = [];
  return { updates, D: {
    GeneratedPost: { filter: async () => posts, update: async (id, patch) => updates.push({ id, ...patch }) },
    AffiliateLink: { get: async () => ({ clicks: 0, conversions: 0, earnings: 0 }) },
    User: { get: async () => owner },
  }};
}
const res = () => { const o = { code: 0, body: null }; return { status(c){o.code=c;return this;}, json(b){o.body=b;return o;}, _o:o }; };
const req = { headers: { host: "app.test" }, body: {} };

test("a failed regeneration leaves the group untouched and the run alive", async () => {
  const { D, updates } = makeDb([post(), post({ id: "p2" })]);
  const h = await load(D, async () => { throw new Error("LLM rate limited"); });
  const r = res(); await h(req, r);
  assert.equal(r._o.code, 200, "handler must not 500");
  assert.equal(updates.length, 0, "group must be left untouched on failure");
  assert.equal(r._o.body.regeneration_failed, 1);
  console.log("1. LLM failure          -> run survives, 0 rows touched, counted as regeneration_failed");
});
test("a missing owner is skipped instead of throwing", async () => {
  const { D, updates } = makeDb([post()], { owner: null });
  const h = await load(D, async () => { throw new Error("should not be called"); });
  const r = res(); await h(req, r);
  assert.equal(r._o.code, 200);
  assert.equal(updates.length, 0);
  console.log("2. null owner           -> skipped cleanly, no TypeError");
});
test("a successful regeneration bumps the round and writes the rows", async () => {
  const { D, updates } = makeDb([post()]);
  let called = null;
  const h = await load(D, async (a) => { called = a; return { success: true }; });
  const r = res(); await h(req, r);
  assert.equal(called.payload.regeneration, 1);
  assert.equal(called.origin, "https://app.test");
  assert.ok(updates.every((u) => u.regenerations === 1));
  console.log("3. successful regen     -> bumped to 1, origin passed, rows written");
});
test("a missing host header resolves origin to null", async () => {
  const { D } = makeDb([post()]);
  let got; const h = await load(D, async (a) => { got = a.origin; return {}; });
  const r = res(); await h({ headers: {}, body: {} }, r);
  assert.equal(got, null, "origin must be null, never 'https://undefined'");
  console.log("4. missing host header  -> origin = null (guard fires), not 'https://undefined'");
});
test("one failing group does not block later groups", async () => {
  const posts = [post({ id: "a", product_id: "pA" }), post({ id: "b", product_id: "pB" })];
  const { D, updates } = makeDb(posts);
  let n = 0;
  const h = await load(D, async () => { n += 1; if (n === 1) throw new Error("boom"); return {}; });
  const r = res(); await h(req, r);
  assert.equal(n, 2, "second group must still be attempted");
  assert.ok(updates.length > 0, "second group must be written");
  console.log("5. one group fails      -> later groups still processed");
});
