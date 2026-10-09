import { adminClient, getAuthedUser, isCronRequest } from "./_lib/supabase.js";
import { supabaseImageStore, sweepProductImages } from "./_lib/autoProductImages.js";

// Scheduled every 5 minutes: finds a picture for every product added since
// the last run, and -- in the overnight window -- retries the ones still
// without one. See api/_lib/autoProductImages.js. An admin can also call it
// by hand; `{ "retry": true }` forces the nightly retry.

// The custom domain, whatever host this request arrived on: a product saved
// with one of its /r/ share links must never be opened.
const CANONICAL_DOMAIN = "amhere4utoday.com";

export default async function handler(req, res) {
  try {
    const body = req.body || {};
    const cronOk = isCronRequest(req, body);
    const { user } = await getAuthedUser(req);
    if (user?.role !== "admin" && !cronOk) {
      return res.status(403).json({ error: "Forbidden: Admin access or scheduled run required" });
    }

    const ownHosts = [CANONICAL_DOMAIN, req.headers?.host].filter(Boolean);
    const result = await sweepProductImages({
      store: supabaseImageStore(adminClient()),
      ownHosts,
      ...(user?.role === "admin" && body.retry === true ? { retry: true } : {}),
    });
    if (result.saved.length || result.missed.length) console.log(result.message);
    res.status(200).json(result);
  } catch (error) {
    console.error("autoFindProductImages failed:", error);
    res.status(500).json({ error: error.message });
  }
}
