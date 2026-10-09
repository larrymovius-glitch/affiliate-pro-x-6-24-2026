import assert from "node:assert/strict";
import test from "node:test";
import { checkDriveImport, importDriveCreatives, parseDriveLink } from "../api/_lib/driveCreatives.js";
import { executeTool } from "../api/_lib/assistantTools.js";

// Vendors like HepatoBurn allow only the creatives in their own Google Drive
// folder. This copies that folder in, marked official -- and these pin down
// the refusals: a private folder copies nothing, and nothing is marked
// official without the owner saying where the link came from.

const FOLDER = "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing";
const SOURCE = "https://vendor.test/affiliates";
const USER = { id: "user-1" };
const PRODUCT = { id: "prod-1", name: "HepatoBurn", url: "https://hepatoburn.test", image_url: "https://hepatoburn.test/og.png", image_source: "sales_page" };

function fakeD({ assets = [] } = {}) {
  const rows = { AdAsset: [...assets], CreativeImport: [], ProductUpdates: [] };
  const matches = (row, f) => Object.entries(f).every(([k, v]) => row[k] === v);
  return {
    rows,
    AdAsset: {
      filter: async (f) => rows.AdAsset.filter((r) => matches(r, f)),
      create: async (r) => {
        const row = { id: `asset-${rows.AdAsset.length + 1}`, ...r };
        rows.AdAsset.push(row);
        return row;
      },
    },
    CreativeImport: { create: async (r) => rows.CreativeImport.push(r), filter: async () => rows.CreativeImport },
    Product: {
      filter: async (f) => [PRODUCT, { id: "ebay-1", name: "Old camera", url: "https://www.ebay.com/itm/123", category: "ebay" }].filter((p) => matches(p, f)),
      update: async (id, patch) => rows.ProductUpdates.push({ id, ...patch }),
    },
  };
}

function fakeStorage() {
  const uploaded = [];
  return {
    uploaded,
    storage: {
      from: () => ({
        upload: async (path, buffer, opts) => (uploaded.push({ path, bytes: buffer.length, ...opts }), { error: null }),
        getPublicUrl: (path) => ({ data: { publicUrl: `https://store.test/${path}` } }),
      }),
    },
  };
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A fake Drive: a public kit with a subfolder, answered by URL prefix. */
function fakeDrive({ privateFolder = false } = {}) {
  const requested = [];
  const fetch = async (url) => {
    const u = String(url);
    requested.push(u);
    if (privateFolder) return json({ error: { code: 404, message: "File not found: 1AbCdEfGhIjKlMnOp." } }, 404);
    if (u.includes("/files/1AbCdEfGhIjKlMnOp?fields=")) return json({ id: "1AbCdEfGhIjKlMnOp", name: "HepatoBurn Creatives", mimeType: "application/vnd.google-apps.folder" });
    if (u.includes(encodeURIComponent("'1AbCdEfGhIjKlMnOp' in parents"))) {
      return json({
        files: [
          { id: "img-small", name: "banner small.png", mimeType: "image/png", size: "1000" },
          { id: "img-big", name: "banner big.jpg", mimeType: "image/jpeg", size: "5000" },
          { id: "doc", name: "Swipe emails", mimeType: "application/vnd.google-apps.document" },
          { id: "terms", name: "Affiliate Terms", mimeType: "application/vnd.google-apps.document" },
          { id: "sub", name: "Videos", mimeType: "application/vnd.google-apps.folder" },
        ],
      });
    }
    if (u.includes(encodeURIComponent("'sub' in parents"))) {
      return json({ files: [{ id: "vid", name: "ad 1.mp4", mimeType: "video/mp4", size: "3000" }] });
    }
    if (u.includes("/files/doc/export?mimeType=text%2Fplain")) {
      return new Response("Made in small batches in the USA. Tap the link to see it for yourself.", { status: 200 });
    }
    const media = u.match(/\/files\/([^?]+)\?alt=media/);
    if (media) {
      const size = { "img-small": 1000, "img-big": 5000, vid: 3000 }[media[1]];
      return new Response(new Uint8Array(size), { status: 200 });
    }
    return json({ error: { code: 404, message: "not found" } }, 404);
  };
  return { fetch, requested };
}

test("folder links are recognised in their common shapes, and nothing else is", () => {
  assert.equal(parseDriveLink(FOLDER)?.id, "1AbCdEfGhIjKlMnOp");
  assert.equal(parseDriveLink("https://drive.google.com/drive/u/0/folders/1AbCdEfGhIjKlMnOp")?.id, "1AbCdEfGhIjKlMnOp");
  assert.equal(parseDriveLink("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp")?.id, "1AbCdEfGhIjKlMnOp");
  assert.equal(parseDriveLink("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?resourcekey=0-xyz")?.resourceKey, "0-xyz");
  assert.equal(parseDriveLink("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view")?.isFile, true);
  assert.equal(parseDriveLink("https://drive.evil.test/drive/folders/1AbCdEfGhIjKlMnOp"), null);
  assert.equal(parseDriveLink("http://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp"), null);
});

test("the check has three outcomes: permitted, prohibited, and escalate to the owner", () => {
  assert.equal(checkDriveImport({ folderUrl: FOLDER, folderSource: SOURCE, product: PRODUCT }).outcome, "permitted");
  assert.equal(checkDriveImport({ folderUrl: "https://vendor.test/creatives", folderSource: SOURCE, product: PRODUCT }).outcome, "prohibited");
  assert.equal(checkDriveImport({ folderUrl: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view", folderSource: SOURCE, product: PRODUCT }).outcome, "prohibited");
  assert.equal(checkDriveImport({ folderUrl: FOLDER, folderSource: SOURCE, product: PRODUCT, isEbay: true }).outcome, "prohibited");
  // Unplaceable link: never guessed to be official.
  assert.equal(checkDriveImport({ folderUrl: FOLDER, folderSource: "", product: PRODUCT }).outcome, "escalate");
  assert.equal(checkDriveImport({ folderUrl: FOLDER, folderSource: FOLDER, product: PRODUCT }).outcome, "escalate");
});

test("with no stated source, nothing is fetched or copied, and the attempt is recorded", async () => {
  const D = fakeD();
  const drive = fakeDrive();
  const store = fakeStorage();
  const out = await importDriveCreatives({ user: USER, product: PRODUCT, folderUrl: FOLDER, folderSource: "" }, { D, storage: store, apiKey: "k", fetch: drive.fetch });
  assert.equal(out.status, "needs_owner");
  assert.equal(drive.requested.length, 0);
  assert.equal(store.uploaded.length, 0);
  assert.equal(D.rows.CreativeImport[0].status, "escalated");
});

test("a private folder stops the import: nothing copied, the owner told, the attempt recorded", async () => {
  const D = fakeD();
  const store = fakeStorage();
  const out = await importDriveCreatives(
    { user: USER, product: PRODUCT, folderUrl: FOLDER, folderSource: SOURCE },
    { D, storage: store, apiKey: "k", fetch: fakeDrive({ privateFolder: true }).fetch }
  );
  assert.equal(out.status, "private");
  assert.match(out.message, /private/i);
  assert.match(out.message, /nothing was copied/i);
  assert.equal(store.uploaded.length, 0);
  assert.equal(D.rows.AdAsset.length, 0);
  assert.equal(D.rows.ProductUpdates.length, 0);
  assert.equal(D.rows.CreativeImport[0].status, "private");
});

test("a bad API key is reported as a key problem, not as a private folder", async () => {
  const D = fakeD();
  const fetch = async () => json({ error: { code: 400, message: "API key not valid. Please pass a valid API key.", errors: [{ reason: "badRequest" }], details: [{ reason: "API_KEY_INVALID" }] } }, 400);
  const out = await importDriveCreatives({ user: USER, product: PRODUCT, folderUrl: FOLDER, folderSource: SOURCE }, { D, storage: fakeStorage(), apiKey: "bad", fetch });
  assert.equal(out.status, "failed");
  assert.match(out.message, /API key/);
});

test("without GOOGLE_API_KEY it says so and fetches nothing", async () => {
  const drive = fakeDrive();
  const out = await importDriveCreatives({ user: USER, product: PRODUCT, folderUrl: FOLDER, folderSource: SOURCE }, { D: fakeD(), storage: fakeStorage(), apiKey: "", fetch: drive.fetch });
  assert.equal(out.status, "not_set_up");
  assert.equal(drive.requested.length, 0);
});

test("a public kit is copied with subfolders, marked official, with where the link came from", async () => {
  const D = fakeD();
  const store = fakeStorage();
  const out = await importDriveCreatives(
    { user: USER, product: PRODUCT, folderUrl: FOLDER, folderSource: SOURCE },
    { D, storage: store, apiKey: "k", fetch: fakeDrive().fetch }
  );
  assert.equal(out.status, "imported");
  assert.equal(out.imported.length, 3);
  // Terms are never read as ad copy; the swipe file is.
  assert.deepEqual(out.skipped.map((s) => s.name), ["Affiliate Terms"]);
  assert.deepEqual(out.approved_copy_from, ["Swipe emails"]);
  assert.ok(store.uploaded.every((u) => u.path.startsWith("official-creatives/user-1/prod-1/")));
  for (const a of D.rows.AdAsset) {
    assert.equal(a.is_official, true);
    assert.equal(a.source, "google_drive");
    assert.equal(a.product_id, "prod-1");
    assert.equal(a.folder_url, FOLDER);
    assert.equal(a.folder_source, SOURCE);
  }
  assert.ok(D.rows.AdAsset.some((a) => a.file_type === "video" && a.title.includes("Videos/ad 1.mp4")));
  // The sales-page picture is replaced by the largest official one.
  const patch = D.rows.ProductUpdates[0];
  assert.equal(patch.image_source, "official");
  assert.match(patch.image_url, /img-big/);
  assert.equal(patch.creatives_folder_source, SOURCE);
  assert.match(patch.approved_copy, /Made in small batches/);
  assert.match(patch.approved_copy_source, /Swipe emails.*HepatoBurn Creatives.*vendor\.test\/affiliates/);
  assert.equal(D.rows.CreativeImport[0].status, "imported");
  assert.equal(D.rows.CreativeImport[0].imported, 3);
});

test("approved copy the owner already saved is never replaced by the folder's", async () => {
  const D = fakeD();
  const out = await importDriveCreatives(
    { user: USER, product: { ...PRODUCT, approved_copy: "Owner's copy.", approved_copy_source: "email" }, folderUrl: FOLDER, folderSource: SOURCE },
    { D, storage: fakeStorage(), apiKey: "k", fetch: fakeDrive().fetch }
  );
  assert.equal(D.rows.ProductUpdates[0].approved_copy, undefined);
  assert.deepEqual(out.approved_copy_from, []);
});

test("the owner's own picture is never replaced", async () => {
  const D = fakeD();
  await importDriveCreatives(
    { user: USER, product: { ...PRODUCT, image_source: "own" }, folderUrl: FOLDER, folderSource: SOURCE },
    { D, storage: fakeStorage(), apiKey: "k", fetch: fakeDrive().fetch }
  );
  assert.equal(D.rows.ProductUpdates[0].image_url, undefined);
});

test("running it again copies nothing twice, and a run out of time resumes", async () => {
  const D = fakeD();
  let t = 0;
  // Each clock read advances a second; a 1.5s budget lets one file through.
  const first = await importDriveCreatives(
    { user: USER, product: PRODUCT, folderUrl: FOLDER, folderSource: SOURCE },
    { D, storage: fakeStorage(), apiKey: "k", fetch: fakeDrive().fetch, now: () => (t += 1000), budgetMs: 1500 }
  );
  assert.equal(first.status, "partial");
  assert.equal(first.imported.length, 1);
  assert.equal(first.remaining.length, 2);

  const store = fakeStorage();
  const second = await importDriveCreatives(
    { user: USER, product: PRODUCT, folderUrl: FOLDER, folderSource: SOURCE },
    { D, storage: store, apiKey: "k", fetch: fakeDrive().fetch }
  );
  assert.equal(second.status, "imported");
  assert.equal(second.imported.length, 2);
  assert.equal(store.uploaded.length, 2);
  assert.equal(D.rows.AdAsset.length, 3);
});

test("the assistant tool only imports into the caller's own products", async () => {
  const out = await executeTool(
    "import_official_creatives",
    { product_id: "someone-elses", folder_url: FOLDER, folder_source: SOURCE },
    { user: USER, D: fakeD(), storageClient: fakeStorage(), fetch: fakeDrive().fetch, googleApiKey: "k" }
  );
  assert.match(out.error, /No product of yours/);
});

test("an imported official clip satisfies an official-only vendor without the owner re-vouching", async () => {
  const D = fakeD({
    assets: [{ id: "a1", created_by_id: "user-1", product_id: "prod-1", file_url: "https://store.test/clip.mp4", is_official: true }],
  });
  const product = { ...PRODUCT, creative_rule: "official_only" };
  D.Product.filter = async (f) => (f.id === "prod-1" ? [product] : []);
  const videoAds = { adFormat: () => ({ platform: "facebook" }), videoAdsConfigured: () => false };
  const official = await executeTool("create_video_ad", { product_id: "prod-1", video_url: "https://store.test/clip.mp4" }, { user: USER, D, videoAds });
  // Past the vendor check: it stops only because rendering isn't configured here.
  assert.equal(official.configured, false);
  const other = await executeTool("create_video_ad", { product_id: "prod-1", video_url: "https://elsewhere.test/clip.mp4" }, { user: USER, D, videoAds });
  assert.match(other.error, /official creatives/);
});
