import { getAuthedUser } from "./_lib/supabase.js";
import { db } from "./_lib/db.js";
import { submitVendorApplication } from "./_lib/vendorApplicationBot.js";

// The one endpoint that actually submits a vendor application. Requires
// `approvedMappings` in the request body -- the exact {selector, value}
// pairs the user reviewed and approved from draftVendorApplication.js's
// output. This route never decides what to submit; it only executes what
// the caller (a human, having seen the draft) already approved.
//
// Every attempt is logged to vendor_applications, success or failure --
// nothing this does is invisible.
export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user?.id) return res.status(401).json({ error: "You must be signed in" });

    const { url, approvedMappings } = req.body || {};
    if (!url) return res.status(400).json({ error: "Missing url" });
    if (!Array.isArray(approvedMappings) || approvedMappings.length === 0) {
      return res.status(400).json({ error: "Missing approvedMappings -- submit only accepts a previously reviewed and approved draft, not raw fields." });
    }

    const D = db();

    try {
      const { submitted, skipped, confirmationText } = await submitVendorApplication(url, approvedMappings);

      await D.VendorApplication.create({
        user_id: user.id,
        vendor_url: url,
        submitted_fields: { submitted, skipped },
        status: "submitted",
        confirmation_text: confirmationText,
      });

      res.status(200).json({ submitted, skipped, confirmationText });
    } catch (submitError) {
      await D.VendorApplication.create({
        user_id: user.id,
        vendor_url: url,
        submitted_fields: { attempted: approvedMappings },
        status: "failed",
        confirmation_text: submitError.message,
      });
      throw submitError;
    }
  } catch (error) {
    console.error("submitVendorApplication error:", error);
    res.status(500).json({ error: error.message });
  }
}
