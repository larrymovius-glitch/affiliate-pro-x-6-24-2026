// Product CSV, both directions: the Products page's Download button writes it
// and BulkImporter reads it, so an export can be imported back as-is.

const NETWORKS = ["clickbank", "digistore24", "ebay", "amazon", "other"];
const IMAGE_SOURCES = ["official", "own", "sales_page"];
const CREATIVE_RULES = ["any", "own_or_official", "official_only", "unaltered"];

// The first four stay name, url, category, commission_rate: that is the order
// a headerless paste is read in.
const COLUMNS = [
  { h: "name", get: (p) => p.name },
  { h: "url", get: (p) => p.url },
  { h: "category", get: (p) => p.category },
  { h: "commission_rate", get: (p) => p.commission_rate },
  { h: "network", get: (p) => p.network },
  { h: "description", get: (p) => p.description },
  { h: "image_url", get: (p) => p.image_url },
  { h: "image_source", get: (p) => p.image_source },
  { h: "creative_rule", get: (p) => p.creative_rule },
  { h: "creative_rule_note", get: (p) => p.creative_rule_note },
  { h: "creative_rule_source", get: (p) => p.creative_rule_source },
  { h: "active", get: (p) => (p.is_active === false ? "no" : "yes") },
  { h: "added", get: (p) => String(p.created_at || "").split("T")[0] },
];

// A leading = + - @ is defused because eBay listing titles come from strangers
// and Excel would run them as formulas.
function cell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * @param {any[]} products
 * @returns {string} CSV text starting with a UTF-8 BOM, so Excel shows dashes
 *   and curly quotes instead of junk
 */
export function productsToCsv(products) {
  const rows = [COLUMNS.map((c) => c.h).join(","), ...products.map((p) => COLUMNS.map((c) => cell(c.get(p))).join(","))];
  return "﻿" + rows.join("\r\n");
}

/**
 * RFC 4180 rows: quoted fields may hold commas, doubled quotes and line breaks.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const s = String(text || "").replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

// Undo cell()'s formula guard.
const unguard = (s) => s.trim().replace(/^'(?=[=+\-@])/, "");

/**
 * Products from pasted CSV. With a header row (first cell "name"), columns are
 * matched by name, so a full export comes back with its descriptions, pictures
 * and vendor rules; without one, columns are name, url, category,
 * commission_rate. Values the database would reject are dropped, not guessed.
 *
 * @param {string} text
 * @returns {any[]}
 */
export function productsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const first = rows[0].map((h) => h.trim().toLowerCase());
  const hasHeader = first[0] === "name";
  const headers = hasHeader ? first : ["name", "url", "category", "commission_rate"];
  const body = hasHeader ? rows.slice(1) : rows;

  return body
    .map((r) => {
      /** @type {Record<string, string>} */
      const v = {};
      headers.forEach((h, i) => { v[h] = unguard(r[i] ?? ""); });
      const rate = parseFloat(v.commission_rate);
      /** @type {any} */
      const p = {
        name: v.name,
        url: v.url,
        category: v.category || "",
        commission_rate: Number.isFinite(rate) ? rate : undefined,
        description: v.description || "",
        image_url: v.image_url || "",
      };
      if (NETWORKS.includes(v.network)) p.network = v.network;
      if (IMAGE_SOURCES.includes(v.image_source) && p.image_url) p.image_source = v.image_source;
      if (CREATIVE_RULES.includes(v.creative_rule)) p.creative_rule = v.creative_rule;
      if (v.creative_rule_note) p.creative_rule_note = v.creative_rule_note;
      if (v.creative_rule_source) p.creative_rule_source = v.creative_rule_source;
      if (v.active === "no") p.is_active = false;
      return p;
    })
    .filter((p) => p.name && p.url);
}
