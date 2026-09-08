import { getAuthedUser } from "./_lib/supabase.js";
import { readApplicationForm, draftFillPlan } from "./_lib/vendorApplicationBot.js";

// First real endpoint for the vendor-application bot: given a vendor's
// application-form URL, reads its actual fields and drafts answers from the
// user's saved application-profile. Returns the draft for review -- it does
// NOT fill or submit anything. That's the next, separately-gated step, once
// this half is proven against real vendor forms.
export default async function handler(req, res) {
  try {
    const { user } = await getAuthedUser(req);
    if (!user?.id) return res.status(401).json({ error: "You must be signed in" });

    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: "Missing url" });

    const profile = user.affiliate_application_profile || {};
    if (Object.keys(profile).length === 0) {
      return res.status(400).json({
        error: "No saved application profile yet. Fill in /application-profile first so there's something to draft from.",
      });
    }

    const { fields } = await readApplicationForm(url);
    if (fields.length === 0) {
      return res.status(200).json({ url, fields: [], readyToFill: [], needsReview: [], message: "No form fields found on that page." });
    }

    const { readyToFill, needsReview } = await draftFillPlan(fields, profile);

    res.status(200).json({ url, fields, readyToFill, needsReview });
  } catch (error) {
    console.error("draftVendorApplication error:", error);
    res.status(500).json({ error: error.message });
  }
}
