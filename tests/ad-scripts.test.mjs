import assert from "node:assert/strict";
import test from "node:test";
import { checkOpeningLine, checkSuppliedScript, composeAdScript, splitSentences, usableSentences, MAX_SCRIPT_WORDS } from "../api/_lib/adScripts.js";
import { executeTool } from "../api/_lib/assistantTools.js";

// Video ad scripts come only from the vendor's approved copy, word for word,
// after the owner's own opening line. The model never writes a word of it --
// these pin down that nothing outside the copy gets in, and that anything
// only the owner can supply comes back to them instead of being guessed.

const SOURCE = "https://vendor.test/affiliates";
const COPY = `Subject: You need to see this
Made in small batches in the USA. Every order ships in plain packaging.
Get yours here: [YOUR LINK]
Only $49 a bottle today!
Tap the link to see it for yourself.`;
const product = (extra = {}) => ({ id: "p1", name: "Mine", approved_copy: COPY, approved_copy_source: SOURCE, ...extra });
const user = { id: "me", ad_opening_line: "Here's one I actually use." };

test("copy is split at sentence ends and line breaks", () => {
  assert.deepEqual(splitSentences("One two three. Four five six! Seven\nEight nine ten?"), ["One two three.", "Four five six!", "Seven", "Eight nine ten?"]);
});

test("links, placeholders, email lines and prices are set aside", () => {
  const { usable, excluded } = usableSentences(COPY);
  assert.deepEqual(usable, ["Made in small batches in the USA.", "Every order ships in plain packaging.", "Tap the link to see it for yourself."]);
  const reasons = excluded.map((e) => e.reason).join(" | ");
  assert.match(reasons, /link, placeholder or email/);
  assert.match(reasons, /price/);
});

test("a supplement's health, weight and results claims are set aside even in the vendor's own copy", () => {
  const copy = "Supports healthy blood sugar levels. Thousands have lost weight with it. Take two capsules each morning with water.";
  assert.deepEqual(usableSentences(copy, { supplement: true }).usable, ["Take two capsules each morning with water."]);
  assert.equal(usableSentences(copy).usable.length, 3, "not a supplement: the vendor's copy stands");
});

test("the script is the opening line, then approved sentences verbatim, within 30 seconds", async () => {
  const out = await composeAdScript({ product: product(), user, pick: async () => [2, 0] });
  assert.equal(out.outcome, "ok");
  assert.equal(out.script, "Here's one I actually use. Tap the link to see it for yourself. Made in small batches in the USA.");
  assert.ok(out.script.split(/\s+/).length <= MAX_SCRIPT_WORDS);
});

test("a failed or nonsense pick falls back to the copy's own order, never to new words", async () => {
  const failed = await composeAdScript({ product: product(), user, pick: async () => { throw new Error("model down"); } });
  assert.equal(failed.script, "Here's one I actually use. Made in small batches in the USA. Every order ships in plain packaging. Tap the link to see it for yourself.");
  const nonsense = await composeAdScript({ product: product(), user, pick: async () => ["x", -1, 42] });
  assert.equal(nonsense.script, failed.script);
});

test("missing copy, its source, the opening line, or anything usable: escalate, never guess", async () => {
  assert.equal((await composeAdScript({ product: product({ approved_copy: "" }), user })).outcome, "escalate");
  assert.equal((await composeAdScript({ product: product({ approved_copy_source: "" }), user })).outcome, "escalate");
  assert.equal((await composeAdScript({ product: product(), user: { id: "me" } })).outcome, "escalate");
  const claimsOnly = await composeAdScript({ product: product({ approved_copy: "Clinically proven to melt belly fat. Doctors are stunned by the results." }), user, supplement: true });
  assert.equal(claimsOnly.outcome, "escalate");
  assert.equal(claimsOnly.excluded.length, 2);
});

test("a product's own opening line beats the default", async () => {
  const out = await composeAdScript({ product: product({ ad_opening_line: "Quick one for my dog people." }), user });
  assert.ok(out.script.startsWith("Quick one for my dog people."));
});

test("an opening line can't carry a link, run long, or open a supplement ad on a claim", () => {
  assert.equal(checkOpeningLine("Check https://x.test now").ok, false);
  assert.equal(checkOpeningLine(Array(30).fill("word").join(" ")).ok, false);
  assert.equal(checkOpeningLine("This finally fixed my sleep.", { supplement: true }).ok, false);
  assert.equal(checkOpeningLine("This finally fixed my sleep.").ok, true);
});

test("a supplied script is checked sentence by sentence against the copy", () => {
  const ok = checkSuppliedScript("Here's one I actually use. Tap the link to see it for yourself.", { product: product(), user });
  assert.equal(ok.outcome, "ok");
  const invented = checkSuppliedScript("Here's one I actually use. It's the best on the market.", { product: product(), user });
  assert.equal(invented.outcome, "prohibited");
  const pricey = checkSuppliedScript("Here's one I actually use. Only $49 a bottle today!", { product: product(), user });
  assert.equal(pricey.outcome, "prohibited", "a set-aside sentence can't be slipped back in");
  const reworded = checkSuppliedScript("Here's one I actually use. Made in small batches in America.", { product: product(), user });
  assert.equal(reworded.outcome, "prohibited", "a paraphrase is a new claim");
});

function fakeDb(products) {
  const updates = [];
  return {
    updates,
    Product: {
      filter: async (f) => products.filter((p) => Object.entries(f).every(([k, v]) => p[k] === v)),
      update: async (id, patch) => { updates.push({ table: "products", id, ...patch }); return { id, ...patch }; },
    },
    User: { update: async (id, patch) => { updates.push({ table: "profiles", id, ...patch }); return { id, ...patch }; } },
  };
}

test("save_approved_copy needs a source, and saves the copy exactly as given", async () => {
  const D = fakeDb([{ id: "p1", created_by_id: "me", name: "Mine", url: "https://vendor.test/" }]);
  const noSource = await executeTool("save_approved_copy", { product_id: "p1", copy: COPY, source: "" }, { user, D });
  assert.equal(noSource.needs_owner, true);
  assert.equal(D.updates.length, 0);

  const out = await executeTool("save_approved_copy", { product_id: "p1", copy: COPY, source: SOURCE }, { user, D });
  assert.equal(out.saved, true);
  assert.equal(D.updates[0].approved_copy, COPY);
  assert.equal(D.updates[0].approved_copy_source, SOURCE);
  assert.equal(out.usable_sentences, 3);
});

test("save_approved_copy is refused for eBay listings and other people's products", async () => {
  const D = fakeDb([
    { id: "e1", created_by_id: "me", name: "Camera", url: "https://www.ebay.com/itm/1", category: "ebay" },
    { id: "x1", created_by_id: "someone", name: "Theirs", url: "https://vendor.test/" },
  ]);
  assert.match((await executeTool("save_approved_copy", { product_id: "e1", copy: COPY, source: SOURCE }, { user, D })).error, /eBay/);
  assert.match((await executeTool("save_approved_copy", { product_id: "x1", copy: COPY, source: SOURCE }, { user, D })).error, /No product of yours/);
  assert.equal(D.updates.length, 0);
});

test("set_opening_line saves the default on the owner, or one product's own", async () => {
  const D = fakeDb([{ id: "p1", created_by_id: "me", name: "Mine", url: "https://vendor.test/" }]);
  await executeTool("set_opening_line", { text: "  Here's   one I use.  " }, { user, D });
  assert.deepEqual(D.updates[0], { table: "profiles", id: "me", ad_opening_line: "Here's one I use." });
  await executeTool("set_opening_line", { text: "Dog people, look.", product_id: "p1" }, { user, D });
  assert.deepEqual(D.updates[1], { table: "products", id: "p1", ad_opening_line: "Dog people, look." });
  const bad = await executeTool("set_opening_line", { text: "Go to https://x.test" }, { user, D });
  assert.match(bad.error, /link/);
});
