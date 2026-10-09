// Copies a vendor's official creatives -- the Google Drive folder many
// ClickBank and Digistore24 vendors hand affiliates -- into this app's own
// storage, marked official, so an ad can be built from them under vendors
// whose rule is "official creatives only".
//
// Reads Drive with a plain API key (GOOGLE_API_KEY), which the owner creates
// and which can only see what is shared "Anyone with the link". That is the
// least-privilege credential for this job (policies rule 5): no OAuth, nothing
// that can see the owner's own Drive. The flip side is that a private folder
// looks exactly like a missing one -- Drive answers 404 for both -- so either
// way the import stops, copies nothing, and says so.
//
// "Official" is only as true as where the link came from. A folder link the
// owner can't place could be anyone's, so the owner must say where it was
// published (the vendor's affiliate page, an email from the vendor); without
// that the import escalates instead of guessing (policies rule 1). That
// statement is saved on every copied file and on the product.

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

// Matches the "uploads" bucket's own file size limit.
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
// A creatives kit is a few dozen files in a handful of subfolders. These stop
// a link to someone's whole Drive from turning into a thousand-file copy.
const MAX_FOLDERS = 40;
const MAX_ENTRIES = 500;
// Leaves room in the assistant's turn for the reply. What doesn't fit is
// reported as remaining, and calling again picks up where this stopped,
// because files already copied are skipped.
const DEFAULT_BUDGET_MS = 150_000;

const MEDIA_TYPES = {
  "image/jpeg": ["image", "jpg"],
  "image/png": ["image", "png"],
  "image/webp": ["image", "webp"],
  "image/gif": ["image", "gif"],
  "video/mp4": ["video", "mp4"],
  "video/quicktime": ["video", "mov"],
  "video/webm": ["video", "webm"],
  "video/x-m4v": ["video", "m4v"],
};

const KEY_REASONS = new Set(["keyInvalid", "accessNotConfigured", "ipRefererBlocked", "keyExpired", "SERVICE_DISABLED", "API_KEY_INVALID"]);
const RATE_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded", "quotaExceeded", "downloadQuotaExceeded"]);

/**
 * The folder id (and resource key, for links shared before Google's 2021
 * security update) out of any of the shapes a Drive folder link comes in.
 * Anything that isn't a drive.google.com link returns null.
 *
 * @returns {{ id: string, resourceKey: string|null, isFile: boolean } | null}
 */
export function parseDriveLink(link) {
  let u;
  try {
    u = new URL(String(link || "").trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.hostname !== "drive.google.com") return null;
  const resourceKey = u.searchParams.get("resourcekey");
  const folder = u.pathname.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
  if (folder) return { id: folder[1], resourceKey, isFile: false };
  const file = u.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/);
  if (file) return { id: file[1], resourceKey, isFile: true };
  const id = u.searchParams.get("id");
  if (id && /^[A-Za-z0-9_-]{10,}$/.test(id)) return { id, resourceKey, isFile: false };
  return null;
}

/**
 * Whether this import may run. Three outcomes, never two (policies rule 1).
 *
 * @param {{ folderUrl: string, folderSource?: string, product: any, isEbay?: boolean }} args
 * @returns {{ outcome: "permitted", link: { id: string, resourceKey: string|null } , source: string }
 *         | { outcome: "prohibited" | "escalate", reason: string }}
 */
export function checkDriveImport({ folderUrl, folderSource, product, isEbay = false }) {
  if (!product) return { outcome: "prohibited", reason: "No product of yours with that id." };
  if (isEbay) {
    return { outcome: "prohibited", reason: `"${product.name}" is an eBay listing. eBay sends its own photos and has no vendor creatives kit to import.` };
  }
  const link = parseDriveLink(folderUrl);
  if (!link) {
    return { outcome: "prohibited", reason: "That isn't a Google Drive link. Only a drive.google.com folder link can be imported." };
  }
  if (link.isFile) {
    return { outcome: "prohibited", reason: "That's a link to one file, not a folder. Send the link to the folder the vendor shared." };
  }
  const source = String(folderSource || "").trim();
  if (source.length < 4) {
    return {
      outcome: "escalate",
      reason: "Where did this folder link come from? It can only be marked official once you say where the vendor published it -- for example their affiliate page's address, or an email from the vendor.",
    };
  }
  if (parseDriveLink(source)) {
    return {
      outcome: "escalate",
      reason: "That's the folder link itself, not where it came from. Say where the vendor published it -- their affiliate page's address, or an email from them.",
    };
  }
  return { outcome: "permitted", link, source: source.slice(0, 500) };
}

/** Classifies a failed Drive response by what the owner should do about it. */
async function driveError(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    // not JSON; fall through on status alone
  }
  const err = body?.error || {};
  const reasons = [
    ...(Array.isArray(err.errors) ? err.errors.map((e) => e?.reason) : []),
    ...(Array.isArray(err.details) ? err.details.map((d) => d?.reason) : []),
  ].filter(Boolean);
  const message = String(err.message || res.statusText || `HTTP ${res.status}`);

  if (reasons.some((r) => KEY_REASONS.has(r)) || /api key|has not been used in project|is disabled/i.test(message)) {
    return { kind: "key", message };
  }
  if (reasons.some((r) => RATE_REASONS.has(r)) || res.status === 429) return { kind: "rate_limited", message };
  if (res.status === 404 || res.status === 403) return { kind: "private", message };
  return { kind: "error", message };
}

function driveHeaders(resourceKeys) {
  const keys = resourceKeys.filter((k) => k.resourceKey).map((k) => `${k.id}/${k.resourceKey}`);
  return keys.length ? { "X-Goog-Drive-Resource-Keys": keys.join(",") } : {};
}

/**
 * Walks a shared folder and everything under it, without copying anything.
 *
 * @returns {Promise<{ ok: true, name: string, files: any[], skipped: { name: string, reason: string }[] }
 *         | { ok: false, kind: "private"|"not_folder"|"key"|"rate_limited"|"error", message: string }>}
 */
export async function walkDriveFolder(link, { apiKey, fetch = globalThis.fetch }) {
  const key = encodeURIComponent(apiKey);
  const metaRes = await fetch(
    `${DRIVE_API}/files/${link.id}?fields=id,name,mimeType,resourceKey&supportsAllDrives=true&key=${key}`,
    { headers: driveHeaders([link]) }
  );
  if (!metaRes.ok) return { ok: false, ...(await driveError(metaRes)) };
  const meta = await metaRes.json();
  if (meta.mimeType !== FOLDER_MIME) {
    return { ok: false, kind: "not_folder", message: `"${meta.name}" is a single file, not a folder.` };
  }

  const files = [];
  const skipped = [];
  const queue = [{ id: meta.id, resourceKey: link.resourceKey, path: "" }];
  let folders = 0;
  let entries = 0;

  while (queue.length) {
    const folder = queue.shift();
    folders += 1;
    if (folders > MAX_FOLDERS) {
      skipped.push({ name: folder.path || meta.name, reason: `More than ${MAX_FOLDERS} folders -- the rest were not looked at.` });
      break;
    }
    let pageToken = "";
    do {
      const q = encodeURIComponent(`'${folder.id}' in parents and trashed = false`);
      const fields = encodeURIComponent("nextPageToken,files(id,name,mimeType,size,resourceKey)");
      const res = await fetch(
        `${DRIVE_API}/files?q=${q}&fields=${fields}&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true&key=${key}` +
          (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""),
        { headers: driveHeaders([folder]) }
      );
      if (!res.ok) {
        const failure = await driveError(res);
        // A subfolder that can't be listed means part of the kit is private.
        return { ok: false, ...failure, ...(failure.kind === "private" && folder.path ? { message: `The subfolder "${folder.path}" is private. ${failure.message}` } : {}) };
      }
      const page = await res.json();
      for (const f of page.files || []) {
        entries += 1;
        if (entries > MAX_ENTRIES) break;
        const path = folder.path ? `${folder.path}/${f.name}` : f.name;
        if (f.mimeType === FOLDER_MIME) {
          queue.push({ id: f.id, resourceKey: f.resourceKey || null, path });
        } else if (MEDIA_TYPES[f.mimeType]) {
          files.push({ ...f, path, size: Number(f.size) || 0 });
        } else {
          skipped.push({ name: path, reason: f.mimeType?.startsWith("application/vnd.google-apps") ? "A Google Docs/Sheets/Slides file, not a picture or video." : `Not a picture or video (${f.mimeType || "unknown type"}).` });
        }
      }
      pageToken = entries > MAX_ENTRIES ? "" : page.nextPageToken || "";
    } while (pageToken);
    if (entries > MAX_ENTRIES) {
      skipped.push({ name: meta.name, reason: `More than ${MAX_ENTRIES} items -- the rest were not looked at.` });
      break;
    }
  }

  return { ok: true, name: meta.name, files, skipped };
}

function safeName(name) {
  return String(name || "file").replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
}

const FAILURE_STATUS = { private: "private", not_folder: "refused", key: "failed", rate_limited: "failed", error: "failed" };

/**
 * The whole import: check, walk, copy, record.
 *
 * @param {{ user: any, product: any, folderUrl: string, folderSource?: string, isEbay?: boolean }} args
 * @param {{ D: any, storage: any, apiKey?: string, fetch?: typeof fetch, now?: () => number, budgetMs?: number }} deps
 *        `storage` is a Supabase client (only `.storage` is used); all of
 *        these are injectable so this runs in tests without Drive or Supabase.
 */
export async function importDriveCreatives({ user, product, folderUrl, folderSource, isEbay = false }, deps) {
  const { D, storage, apiKey = process.env.GOOGLE_API_KEY, fetch = globalThis.fetch, now = Date.now, budgetMs = DEFAULT_BUDGET_MS } = deps;
  const started = now();

  const record = async (status, fields) => {
    try {
      await D.CreativeImport.create({
        created_by_id: user.id,
        product_id: product?.id || null,
        folder_url: String(folderUrl || "").slice(0, 1000),
        folder_source: String(folderSource || "").trim().slice(0, 500) || null,
        status,
        imported: fields.imported || 0,
        skipped: fields.skipped || [],
        message: fields.message || null,
      });
    } catch (err) {
      // The import itself already happened or was refused; a lost log row
      // must not turn that into an error the owner has to chase.
      console.error("Failed to record creative import:", err?.message || err);
    }
  };

  const check = checkDriveImport({ folderUrl, folderSource, product, isEbay });
  if (check.outcome !== "permitted") {
    await record(check.outcome === "escalate" ? "escalated" : "refused", { message: check.reason });
    return { status: check.outcome === "escalate" ? "needs_owner" : "refused", message: check.reason, imported: [], skipped: [] };
  }

  if (!apiKey) {
    const message = "Google Drive import isn't set up yet -- it needs a GOOGLE_API_KEY added in Vercel. Nothing was copied.";
    await record("failed", { message });
    return { status: "not_set_up", message, imported: [], skipped: [] };
  }

  const walked = await walkDriveFolder(check.link, { apiKey, fetch });
  if (!walked.ok) {
    const message = {
      private: `This folder is private, so nothing was copied. Google only lets the app read folders shared as "Anyone with the link can view". Ask the vendor for a public link, or check you copied the whole address. (Google said: ${walked.message})`,
      not_folder: `${walked.message} Send the link to the vendor's folder instead.`,
      key: `Google refused the API key, so nothing was copied. Check that GOOGLE_API_KEY is correct and the Google Drive API is enabled for its project. (Google said: ${walked.message})`,
      rate_limited: `Google's limit was reached for now, so nothing was copied. Try again later. (Google said: ${walked.message})`,
      error: `Google Drive didn't answer properly, so nothing was copied. (Google said: ${walked.message})`,
    }[walked.kind];
    await record(FAILURE_STATUS[walked.kind], { message });
    return { status: walked.kind === "private" ? "private" : "failed", message, imported: [], skipped: [] };
  }

  const existing = await D.AdAsset.filter({ created_by_id: user.id, source: "google_drive" });
  const have = new Set(existing.map((a) => a.source_file_id).filter(Boolean));

  const imported = [];
  const skipped = [...walked.skipped];
  const remaining = [];
  const key = encodeURIComponent(apiKey);

  for (const f of walked.files) {
    if (have.has(f.id)) {
      skipped.push({ name: f.path, reason: "Already imported." });
      continue;
    }
    if (f.size > MAX_FILE_BYTES) {
      skipped.push({ name: f.path, reason: `Too large to store (${Math.round(f.size / 1024 / 1024)} MB; the limit is ${MAX_FILE_BYTES / 1024 / 1024} MB).` });
      continue;
    }
    if (now() - started > budgetMs) {
      remaining.push(f.path);
      continue;
    }

    const res = await fetch(`${DRIVE_API}/files/${f.id}?alt=media&supportsAllDrives=true&key=${key}`, { headers: driveHeaders([f]) });
    if (!res.ok) {
      const failure = await driveError(res);
      skipped.push({
        name: f.path,
        reason: failure.kind === "private" ? "This file is private inside the shared folder." : failure.kind === "rate_limited" ? "Google's download limit for this file was reached -- try again later." : `Couldn't download it (${failure.message}).`,
      });
      continue;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_FILE_BYTES) {
      skipped.push({ name: f.path, reason: "Too large to store." });
      continue;
    }

    const [fileType, ext] = MEDIA_TYPES[f.mimeType];
    const path = `official-creatives/${user.id}/${product.id}/${f.id}-${safeName(f.name)}.${ext}`;
    const { error: uploadError } = await storage.storage.from("uploads").upload(path, buffer, { contentType: f.mimeType, upsert: true });
    if (uploadError) {
      skipped.push({ name: f.path, reason: `Couldn't save it to storage (${uploadError.message}).` });
      continue;
    }
    const { data } = storage.storage.from("uploads").getPublicUrl(path);

    const asset = await D.AdAsset.create({
      created_by_id: user.id,
      product_id: product.id,
      title: `${product.name} -- ${f.path}`.slice(0, 200),
      file_url: data.publicUrl,
      file_type: fileType,
      platform: "general",
      notes: `Official creative from the vendor's Google Drive folder "${walked.name}".`,
      source: "google_drive",
      is_official: true,
      source_file_id: f.id,
      source_url: `https://drive.google.com/file/d/${f.id}/view`,
      folder_url: String(folderUrl).trim(),
      folder_source: check.source,
    });
    have.add(f.id);
    imported.push({ id: asset?.id, title: f.path, file_type: fileType, url: data.publicUrl, size: buffer.length });
  }

  /** @type {Record<string, any>} */
  const productPatch = { creatives_folder_url: String(folderUrl).trim(), creatives_folder_source: check.source };
  // An official picture replaces one from the sales page or of unknown origin,
  // which restrictive vendors won't allow in an ad anyway. The owner's own
  // picture, or an official one already chosen, is left alone.
  let pictureSet = null;
  const images = imported.filter((a) => a.file_type === "image");
  if (images.length && !["official", "own"].includes(product.image_source)) {
    pictureSet = images.reduce((best, a) => (a.size > best.size ? a : best), images[0]);
    productPatch.image_url = pictureSet.url;
    productPatch.image_source = "official";
  }
  await D.Product.update(product.id, productPatch);

  const status = remaining.length ? "partial" : "imported";
  const message =
    `Copied ${imported.length} official creative${imported.length === 1 ? "" : "s"} from "${walked.name}".` +
    (pictureSet ? ` "${pictureSet.title}" is now the product's picture.` : "") +
    (remaining.length ? ` ${remaining.length} more didn't fit in this run -- import the same folder again to continue.` : "") +
    (!walked.files.length ? " The folder has no pictures or videos the app can see." : "");
  await record(status, { imported: imported.length, skipped, message });

  return {
    status,
    folder_name: walked.name,
    imported: imported.map(({ size, ...a }) => a),
    skipped,
    remaining,
    product_picture: pictureSet ? pictureSet.url : null,
    message,
  };
}
