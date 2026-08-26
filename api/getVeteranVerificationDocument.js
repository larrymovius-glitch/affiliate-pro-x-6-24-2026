import { adminClient, getAuthedUser } from "./_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { user: reviewer } = await getAuthedUser(req);
    if (!reviewer || reviewer.role !== "admin") return res.status(403).json({ error: "Reviewer access required" });
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "A user is required" });

    const admin = adminClient();
    const { data: document, error } = await admin
      .from("veteran_verification_documents")
      .select("storage_path")
      .eq("user_id", userId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!document) return res.status(404).json({ error: "No verification document was submitted" });

    const { data, error: urlError } = await admin.storage
      .from("veteran-verification")
      .createSignedUrl(document.storage_path, 300);
    if (urlError) throw urlError;
    return res.status(200).json({ url: data.signedUrl });
  } catch (error) {
    console.error("getVeteranVerificationDocument failed:", error);
    return res.status(500).json({ error: "Unable to retrieve verification document" });
  }
}
