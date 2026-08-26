import assert from "node:assert/strict";
import test from "node:test";
import { executeTool } from "../api/_lib/assistantTools.js";

const D = { AffiliateLink: { filter: async () => [] } };

test("an unknown network is rejected before any search runs", async () => {
  const r = await executeTool(
    "find_trending_products",
    { network: "not-a-real-network" },
    { user: { id: "me" }, D, invokeLLM: async () => { throw new Error("must not be called"); } }
  );
  assert.match(r.error, /Unknown network/);
});

test("a network-scoped search maps every result to that network", async () => {
  const r = await executeTool(
    "find_trending_products",
    { network: "clickbank" },
    {
      user: { id: "me", clickbank_nickname: "mynick" },
      D,
      invokeLLM: async () => ({ products: [{ name: "Widget Pro" }, { name: "Gadget X" }] }),
    }
  );
  assert.equal(r.products.length, 2);
  for (const p of r.products) {
    assert.equal(p.network, "ClickBank");
    assert.equal(p.user_is_connected, true, "clickbank_nickname counts as connected");
    assert.equal(p.signup_url, null, "no signup link once already connected");
  }
});

test("a general search reports whether the guessed network is one the user has joined", async () => {
  const r = await executeTool(
    "find_trending_products",
    {},
    {
      user: { id: "me", affiliate_network_ids: { amazon: "mytag-20" } },
      D,
      invokeLLM: async () => ({
        products: [
          { name: "Trending Gadget", network_guess: "amazon", why: "viral on social" },
          { name: "Weird Supplement", network_guess: "clickbank", why: "info-product niche" },
          { name: "Random Meme Toy", network_guess: null, why: "no matching network" },
        ],
      }),
    }
  );
  const [gadget, supplement, meme] = r.products;
  assert.equal(gadget.network, "Amazon Associates");
  assert.equal(gadget.user_is_connected, true);
  assert.equal(gadget.signup_url, null);

  assert.equal(supplement.network, "ClickBank");
  assert.equal(supplement.user_is_connected, false);
  assert.match(supplement.signup_url, /clickbank\.com/);

  assert.equal(meme.network, null);
  assert.equal(meme.user_is_connected, false);
  assert.equal(meme.signup_url, null);
});

test("a model-guessed network the app doesn't know about is treated as no match", async () => {
  const r = await executeTool(
    "find_trending_products",
    {},
    {
      user: { id: "me" },
      D,
      invokeLLM: async () => ({ products: [{ name: "Mystery Item", network_guess: "some-network-that-does-not-exist" }] }),
    }
  );
  assert.equal(r.products[0].network, null);
});
