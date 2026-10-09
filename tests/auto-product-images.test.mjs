import assert from "node:assert/strict";
import test from "node:test";
import { isNightPass, sweepProductImages } from "../api/_lib/autoProductImages.js";

// The picture finder now runs on its own: every new product within minutes,
// and nightly for the ones still without a picture. These pin down that it
// fills only empty pictures, records every attempt, never opens one of the
// app's own share links, and still never makes an affiliate click.

const PAGE = `<!doctype html><html><head><meta property="og:image" content="https://cdn.vendor.test/bottle.png"></head><body></body></html>`;
const html = (body) => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
const picture = () => new Response("x", { status: 206, headers: { "content-type": "image/png", "content-range": "bytes 0-0/250000" } });

function fakeWeb(routes) {
  const requested = [];
  const fetch = async (url) => {
    requested.push(String(url));
    const r = routes[String(url)];
    return r ? r() : new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
  };
  return { fetch, requested };
}

/** In-memory stand-in for supabaseImageStore. */
function memoryStore(products, profiles = [{ id: "owner", clickbank_nickname: "myaffid" }]) {
  const rows = products.map((p) => ({ created_by_id: "owner", image_lookup_at: null, ...p }));
  const missing = (p) => !p.image_url;
  return {
    rows,
    async listNeverTried(limit) {
      return rows.filter((p) => missing(p) && !p.image_lookup_at).slice(0, limit);
    },
    async listTriedBefore(iso, limit) {
      return rows.filter((p) => missing(p) && p.image_lookup_at && p.image_lookup_at < iso).slice(0, limit);
    },
    async owners(ids) {
      return profiles.filter((u) => ids.includes(u.id));
    },
    async saveImage(id, fields) {
      const row = rows.find((p) => p.id === id);
      if (!missing(row)) return false;
      Object.assign(row, fields);
      return true;
    },
    async note(id, fields) {
      Object.assign(rows.find((p) => p.id === id), fields);
    },
  };
}

const DAY = new Date("2026-10-08T15:00:00Z"); // 11am Eastern: no nightly retry
const NIGHT = new Date("2026-10-09T07:00:00Z"); // 3am Eastern

test("the nightly window is 06:00-10:00 UTC", () => {
  assert.equal(isNightPass(DAY), false);
  assert.equal(isNightPass(NIGHT), true);
  assert.equal(isNightPass(new Date("2026-10-09T10:00:00Z")), false);
});

test("a new product gets its picture, marked as from the sales page, with the lookup recorded", async () => {
  const store = memoryStore([{ id: "p1", name: "Amino", url: "https://amino.test/" }]);
  const web = fakeWeb({ "https://amino.test/": () => html(PAGE), "https://cdn.vendor.test/bottle.png": picture });
  const out = await sweepProductImages({ store, fetch: web.fetch, now: () => DAY });
  assert.equal(out.saved.length, 1);
  const row = store.rows[0];
  assert.equal(row.image_url, "https://cdn.vendor.test/bottle.png");
  // So vendors that allow only official creatives still refuse it in an ad.
  assert.equal(row.image_source, "sales_page");
  assert.ok(row.image_lookup_at);
  assert.match(row.image_lookup_note, /Found on/);
});

test("a product with a picture is never touched", async () => {
  const store = memoryStore([{ id: "p1", name: "Amino", url: "https://amino.test/", image_url: "https://mine.test/own.png", image_source: "own" }]);
  const web = fakeWeb({});
  const out = await sweepProductImages({ store, fetch: web.fetch, now: () => DAY });
  assert.equal(out.checked, 0);
  assert.equal(web.requested.length, 0);
  assert.equal(store.rows[0].image_url, "https://mine.test/own.png");
});

test("a miss is recorded with its reason, and not retried until the night after", async () => {
  const store = memoryStore([{ id: "p1", name: "Gone", url: "https://gone.test/" }]);
  const web = fakeWeb({});
  const first = await sweepProductImages({ store, fetch: web.fetch, now: () => DAY });
  assert.equal(first.missed.length, 1);
  assert.match(store.rows[0].image_lookup_note, /404/);

  const later = await sweepProductImages({ store, fetch: web.fetch, now: () => new Date(DAY.getTime() + 10 * 60 * 1000) });
  assert.equal(later.checked, 0, "already tried: not looked at again during the day");

  const night = await sweepProductImages({ store, fetch: web.fetch, now: () => new Date("2026-10-09T08:00:00Z") });
  assert.equal(night.checked, 0, "tried only 17 hours ago: not yet");

  const nextNight = await sweepProductImages({ store, fetch: web.fetch, now: () => new Date("2026-10-10T07:00:00Z") });
  assert.equal(nextNight.night, true);
  assert.equal(nextNight.checked, 1);
});

test("an affiliate link is never opened as saved -- no click on the owner's account", async () => {
  const store = memoryStore([{ id: "p1", name: "Java", url: "https://myaffid.javaburn.hop.clickbank.net/", category: "clickbank" }]);
  const web = fakeWeb({
    "https://hop.clickbank.net/?vendor=javaburn": () => new Response(null, { status: 302, headers: { location: "https://javaburn.test/?hop=0" } }),
    "https://javaburn.test/": () => html(PAGE),
    "https://cdn.vendor.test/bottle.png": picture,
  });
  await sweepProductImages({ store, fetch: web.fetch, now: () => DAY });
  assert.ok(web.requested.length > 0);
  for (const url of web.requested) assert.ok(!url.includes("myaffid"), `requested ${url}`);
});

test("the app's own share links are refused on every host it answers on", async () => {
  const store = memoryStore([
    { id: "p1", name: "Loop", url: "https://apx.amhere4utoday.com/r/ABC123" },
    { id: "p2", name: "Loop 2", url: "https://apx-preview.vercel.app/r/ABC123" },
  ]);
  const web = fakeWeb({});
  const out = await sweepProductImages({ store, fetch: web.fetch, now: () => DAY, ownHosts: ["amhere4utoday.com", "apx-preview.vercel.app"] });
  assert.equal(web.requested.length, 0);
  assert.equal(out.missed.length, 2);
  assert.ok(store.rows.every((r) => /own share links/.test(r.image_lookup_note)));
});

test("a picture set by someone else mid-lookup is kept, not overwritten", async () => {
  const store = memoryStore([{ id: "p1", name: "Amino", url: "https://amino.test/" }]);
  const web = fakeWeb({
    "https://amino.test/": () => {
      store.rows[0].image_url = "https://owner.test/chosen.png";
      return html(PAGE);
    },
    "https://cdn.vendor.test/bottle.png": picture,
  });
  const out = await sweepProductImages({ store, fetch: web.fetch, now: () => DAY });
  assert.equal(out.saved.length, 0);
  assert.equal(store.rows[0].image_url, "https://owner.test/chosen.png");
  assert.match(store.rows[0].image_lookup_note, /added while/);
});

test("a run out of time leaves the rest for the next run, untouched", async () => {
  const store = memoryStore(Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, url: `https://gone${i}.test/` })));
  let t = DAY.getTime();
  const out = await sweepProductImages({ store, fetch: fakeWeb({}).fetch, now: () => new Date((t += 1000)), budgetMs: 2500 });
  assert.ok(out.deferred > 0);
  assert.equal(store.rows.filter((r) => !r.image_lookup_at).length, out.deferred);
});
