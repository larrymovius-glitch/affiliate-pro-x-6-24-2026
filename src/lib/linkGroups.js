import { networkById } from "./affiliateNetworks.js";

// The network's own number for a product, read out of the link itself -- the
// app never stored it separately. Returns null rather than a guess when the
// link doesn't carry one (e.g. a Digistore24 vendor-page link on the vendor's
// own domain).
export function productNumberFor(link) {
  const url = String(link?.destination_url || "");
  const network = link?.network;

  if (network === "ebay") {
    return url.match(/ebay\.[a-z.]+\/itm\/(?:[^/?#]+\/)?(\d{6,})/i)?.[1] || null;
  }
  if (network === "digistore24") {
    // The /redir/<id>/ promolink shape, or the ds_<id> short code the app
    // gives a link created from a product number.
    return (
      url.match(/\/redir\/(\d+)\//)?.[1] ||
      String(link?.short_code || "").match(/^ds_(\d+)(?:_\d+)?$/)?.[1] ||
      null
    );
  }
  if (network === "clickbank") {
    // https://<affiliate>.<vendor>.hop.clickbank.net -- the vendor nickname is
    // ClickBank's product identifier.
    try {
      const labels = new URL(url).hostname.split(".");
      return labels.length >= 5 && labels.slice(-3).join(".") === "hop.clickbank.net" ? labels[1] : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function networkLabel(id) {
  return networkById(id)?.name || (id ? id.charAt(0).toUpperCase() + id.slice(1) : "Other");
}

// Links grouped first by the network they came from, then by product, so
// AutoPilot's per-post copies of one product show as one row instead of three.
// Copies are kept, not merged: published posts point at each one's short code.
export function groupLinks(links = []) {
  const byNetwork = new Map();
  for (const link of links) {
    const networkId = link.network || "other";
    if (!byNetwork.has(networkId)) byNetwork.set(networkId, new Map());
    const products = byNetwork.get(networkId);
    const key = `${link.product_name || ""}\u0000${link.destination_url || ""}`;
    if (!products.has(key)) {
      products.set(key, {
        key,
        productName: link.product_name || "—",
        destinationUrl: link.destination_url || "",
        productNumber: productNumberFor(link),
        copies: [],
      });
    }
    products.get(key).copies.push(link);
  }

  return [...byNetwork.entries()]
    .map(([networkId, products]) => {
      const items = [...products.values()].map((p) => ({
        ...p,
        clicks: p.copies.reduce((sum, l) => sum + (l.clicks || 0), 0),
        earnings: p.copies.reduce((sum, l) => sum + (Number(l.earnings) || 0), 0),
      }));
      return {
        networkId,
        label: networkLabel(networkId === "other" ? null : networkId),
        linkCount: items.reduce((sum, p) => sum + p.copies.length, 0),
        products: items,
      };
    })
    .sort((a, b) => b.linkCount - a.linkCount);
}

export const PRODUCT_LIMIT_OPTIONS = [25, 50, 75, 100];

export function countProducts(groups = []) {
  return groups.reduce((sum, g) => sum + g.products.length, 0);
}

// The first `limit` product rows across the grouped list, in display order.
// A network's header keeps its full link count, so a cut-off group still says
// how many links it really has.
export function limitProducts(groups = [], limit) {
  let remaining = limit;
  const result = [];
  for (const group of groups) {
    if (remaining <= 0) break;
    const products = group.products.slice(0, remaining);
    remaining -= products.length;
    result.push({ ...group, products });
  }
  return result;
}
