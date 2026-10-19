import assert from "node:assert/strict";
import test from "node:test";
import { executeTool, availableBalance } from "../api/_lib/assistantTools.js";

// Records every filter object the tools hand to the database, so a test can
// assert on what was actually asked for rather than on the result.
function fakeDb({ links = [], products = [], payouts = [] } = {}) {
  const seen = [];
  const table = (rows) => ({
    filter: async (f, sort, limit) => {
      seen.push(f);
      let out = rows.filter((r) => Object.entries(f).every(([k, v]) => (typeof v === "object" ? true : r[k] === v)));
      return limit ? out.slice(0, limit) : out;
    },
    get: async (id) => rows.find((r) => r.id === id) || null,
    create: async (payload) => { seen.push(payload); const row = { id: `new-${rows.length + 1}`, ...payload }; rows.push(row); return row; },
  });
  return { seen, AffiliateLink: table(links), Product: table(products), Payout: table(payouts) };
}

const me = { id: "me", clickbank_nickname: "mynick" };
const ctxFor = (D) => ({ user: me, origin: "https://app.test", D });

test("no user means nothing runs", async () => {
  const r = await executeTool("list_my_links", {}, { user: null, D: fakeDb() });
  assert.match(r.error, /Not signed in/);
});

test("every read is scoped to the caller", async () => {
  const D = fakeDb({
    links: [{ id: "l1", created_by_id: "me", clicks: 2, earnings: 5 }, { id: "l2", created_by_id: "someone-else", clicks: 99 }],
    products: [{ id: "p1", created_by_id: "me", name: "Mine" }, { id: "p2", created_by_id: "other", name: "Theirs" }],
  });

  const links = await executeTool("list_my_links", {}, ctxFor(D));
  assert.deepEqual(links.links.map((l) => l.id), ["l1"], "must not see another user's link");

  const products = await executeTool("list_my_products", {}, ctxFor(D));
  assert.deepEqual(products.products.map((p) => p.id), ["p1"]);

  for (const f of D.seen.filter((x) => x && "created_by_id" in x)) {
    assert.equal(f.created_by_id, "me", "every scoped query must pin created_by_id to the caller");
  }
});

test("a model-supplied owner is ignored, not honoured", async () => {
  const D = fakeDb({ links: [{ id: "l1", created_by_id: "me" }, { id: "l2", created_by_id: "victim" }] });
  const r = await executeTool("list_my_links", { created_by_id: "victim", user_id: "victim", limit: 50 }, ctxFor(D));
  assert.deepEqual(r.links.map((l) => l.id), ["l1"]);
});

test("limit is clamped", async () => {
  const many = Array.from({ length: 150 }, (_, i) => ({ id: `l${i}`, created_by_id: "me" }));
  const D = fakeDb({ links: many });
  assert.equal((await executeTool("list_my_links", { limit: 999 }, ctxFor(D))).links.length, 100);
  assert.equal((await executeTool("list_my_links", {}, ctxFor(D))).links.length, 50, "default");
  assert.equal((await executeTool("list_my_links", { limit: -5 }, ctxFor(D))).links.length, 1);
});

test("create_product rejects a bad URL rather than saving it", async () => {
  const D = fakeDb();
  assert.match((await executeTool("create_product", { name: "X", url: "not a url" }, ctxFor(D))).error, /not a valid URL/);
  assert.match((await executeTool("create_product", { name: "", url: "https://x.com" }, ctxFor(D))).error, /name is required/);

  const ok = await executeTool("create_product", { name: "Good", url: "https://x.com/p" }, ctxFor(D));
  assert.equal(ok.product.name, "Good");
  const insert = D.seen.find((s) => s && s.name === "Good");
  assert.equal(insert.created_by_id, "me", "insert must be owned by the caller");
});

test("create_affiliate_link refuses another user's product", async () => {
  const D = fakeDb({ products: [{ id: "p-theirs", created_by_id: "other", name: "Theirs", url: "https://x.com" }] });
  const r = await executeTool("create_affiliate_link", { product_id: "p-theirs" }, ctxFor(D));
  assert.match(r.error, /No product of yours/);
});

test("create_affiliate_link builds a share URL and applies the user's affiliate id", async () => {
  const D = fakeDb({ products: [{ id: "p1", created_by_id: "me", name: "Mine", url: "https://vendor.hop.clickbank.net/" }] });
  const r = await executeTool("create_affiliate_link", { product_id: "p1" }, ctxFor(D));
  assert.match(r.share_url, /^https:\/\/app\.test\/r\/[A-Z0-9]{6}$/);
  const insert = D.seen.find((s) => s && s.short_code);
  assert.equal(insert.created_by_id, "me");
  assert.match(insert.destination_url, /mynick\.hop\.clickbank\.net/, "must use the caller's nickname");
});

test("balance subtracts what has already been claimed", async () => {
  const D = fakeDb({
    links: [{ id: "l1", created_by_id: "me", earnings: 100 }],
    payouts: [
      { id: "po1", created_by_id: "me", amount: 30, status: "pending" },
      { id: "po2", created_by_id: "me", amount: 10, status: "rejected" },
    ],
  });
  const b = await availableBalance(D, "me");
  assert.equal(b.earned, 100);
  assert.equal(b.reserved, 30, "rejected claims must not reserve funds");
  assert.equal(b.available, 70);
});

test("request_payout will not overdraw", async () => {
  const D = fakeDb({ links: [{ id: "l1", created_by_id: "me", earnings: 20 }] });
  const over = await executeTool("request_payout", { amount: 50 }, ctxFor(D));
  assert.match(over.error, /Only \$20\.00 is available/);
  assert.match((await executeTool("request_payout", { amount: 0 }, ctxFor(D))).error, /greater than zero/);
  assert.match((await executeTool("request_payout", { amount: -5 }, ctxFor(D))).error, /greater than zero/);

  const ok = await executeTool("request_payout", { amount: 20 }, ctxFor(D));
  assert.equal(ok.payout.status, "pending");
  const insert = D.seen.find((s) => s && s.status === "pending" && s.amount === 20);
  assert.equal(insert.user_id, "me");
  assert.equal(insert.created_by_id, "me");
});

test("create_product refuses this app's own share link as a destination", async () => {
  const D = fakeDb();
  const r = await executeTool("create_product", { name: "Amino", url: "https://app.test/r/amino" }, ctxFor(D));
  assert.match(r.error, /own share links/);
  assert.equal(D.seen.filter((x) => x && "url" in x).length, 0, "nothing saved");
});

test("create_product refuses a duplicate name and points at the existing one", async () => {
  const D = fakeDb({ products: [{ id: "p1", created_by_id: "me", name: "Advanced Amino Formula" }] });
  const r = await executeTool("create_product", { name: "advanced amino formula ", url: "https://vendor.test/x" }, ctxFor(D));
  assert.match(r.error, /already a product/);
  assert.equal(r.existing.id, "p1");
});

test("links come back with the address to post and where it leads", async () => {
  const D = fakeDb({
    links: [{ id: "l1", created_by_id: "me", short_code: "amino", destination_url: "https://vendor.test/page#aff=me", network: "digistore24" }],
  });
  const [link] = (await executeTool("list_my_links", {}, ctxFor(D))).links;
  assert.equal(link.share_url, "https://app.test/r/amino");
  assert.equal(link.destination_url, "https://vendor.test/page#aff=me");
  assert.equal(link.network, "digistore24");
});

test("an unknown tool is reported, not thrown", async () => {
  assert.match((await executeTool("drop_everything", {}, ctxFor(fakeDb()))).error, /Unknown tool/);
});

test("a database failure becomes an error result, not an exception", async () => {
  const D = { AffiliateLink: { filter: async () => { throw new Error("connection reset"); } } };
  const r = await executeTool("list_my_links", {}, ctxFor(D));
  assert.match(r.error, /connection reset/);
});

test("Maya sees only the caller's own posts, and records a hand-made post against their product", async () => {
  const posts = [
    { id: "g1", created_by_id: "me", platform: "facebook", status: "posted", product_name: "Nervovive", published_at: "2026-10-18T14:00:00Z", content: "#ad ..." },
    { id: "g2", created_by_id: "me", platform: "general", status: "draft", content: "draft" },
    { id: "g3", created_by_id: "other", platform: "tiktok", status: "posted", content: "theirs" },
  ];
  const D = { ...fakeDb({ products: [{ id: "p1", created_by_id: "me", name: "Advanced Amino Formula" }, { id: "p2", created_by_id: "other", name: "Theirs" }] }) };
  const rows = posts;
  D.GeneratedPost = {
    filter: async (f) => rows.filter((r) => Object.entries(f).every(([k, v]) => r[k] === v)),
    create: async (payload) => { const row = { id: `g${rows.length + 1}`, ...payload }; rows.push(row); return row; },
  };

  const listed = await executeTool("list_my_posts", {}, ctxFor(D));
  assert.deepEqual(listed.posts.map((p) => p.platform), ["facebook"], "drafts and other users' posts stay out");

  const bad = await executeTool("record_post", { platform: "tiktok", product_id: "p2" }, ctxFor(D));
  assert.match(bad.error, /No product of yours/);

  const ok = await executeTool("record_post", { platform: "TikTok", product_id: "p1", kind: "video" }, ctxFor(D));
  assert.equal(ok.recorded, true);
  const saved = rows[rows.length - 1];
  assert.equal(saved.created_by_id, "me");
  assert.equal(saved.platform, "tiktok");
  assert.equal(saved.status, "posted");
  assert.equal(saved.product_name, "Advanced Amino Formula");

  const unknown = await executeTool("record_post", { platform: "myspace" }, ctxFor(D));
  assert.match(unknown.error, /Which app/);
});
