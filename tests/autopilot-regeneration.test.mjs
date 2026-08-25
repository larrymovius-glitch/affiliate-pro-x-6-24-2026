import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("a regeneration creates isolated links and carries its round number", async () => {
  const calls = { links: [], posts: [] };
  const D = {
    Product: { filter: async () => [{ id: "product-1", name: "Product", category: "home", url: "https://example.com", commission_rate: 1 }] },
    AffiliateLink: {
      filter: async () => [],
      create: async (record) => {
        const link = { id: `link-${calls.links.length + 1}`, ...record };
        calls.links.push(link);
        return link;
      },
    },
    GeneratedPost: { filter: async () => [], update: async () => {}, bulkCreate: async (records) => { calls.posts.push(...records); return records; } },
  };
  const context = vm.createContext({ URL, console, process, setTimeout });
  const source = await fs.readFile(new URL("../api/createAutopilotPack.js", import.meta.url), "utf8");
  const module = new vm.SourceTextModule(source, { context, identifier: "createAutopilotPack.js" });
  const synthetic = (names, values) => new vm.SyntheticModule(names, function initialize() {
    for (const name of names) this.setExport(name, values[name]);
  }, { context });

  await module.link((specifier) => {
    if (specifier === "./_lib/db.js") return synthetic(["db"], { db: () => D });
    if (specifier === "./_lib/supabase.js") return synthetic(["getAuthedUser"], { getAuthedUser: async () => ({ user: null }) });
    if (specifier === "./_lib/llm.js") return synthetic(["invokeLLM"], { invokeLLM: async () => ({ ads: [1, 2, 3].map((variant_number) => ({ product_index: 0, variant_number, content: `ad ${variant_number}` })) }) });
    throw new Error(`Unexpected import ${specifier}`);
  });
  await module.evaluate();

  await module.namespace.createAutopilotPack({
    user: { id: "user-1" }, origin: "https://app.test",
    payload: { product_ids: ["product-1"], regeneration: 1, archive_existing: false },
  });

  assert.deepEqual(calls.links.map((link) => link.campaign_id), ["autopilot:product-1:r1:v1", "autopilot:product-1:r1:v2", "autopilot:product-1:r1:v3"]);
  assert.equal(calls.posts.length, 3);
  assert.ok(calls.posts.every((post) => post.regenerations === 1));
});
