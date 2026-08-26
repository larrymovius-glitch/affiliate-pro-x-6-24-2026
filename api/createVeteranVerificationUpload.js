import { adminClient, getAuthedUser } from "./_lib/supabase.js";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { user } = await getAuthedUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { fileName, contentType, size } = req.body || {};
    if (!fileName || !ALLOWED_TYPES.has(contentType) || !Number.isFinite(size) || size < 1 || size > MAX_BYTES) {
      return res.status(400).json({ error: "Upload a PDF, JPG, or PNG no larger than 10 MB" });
    }

    const extension = contentType === "application/pdf" ? "pdf" : contentType === "image/png" ? "png" : "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const admin = adminClient();
    const { data, error } = await admin.storage.from("veteran-verification").createSignedUploadUrl(path);
    if (error) throw error;

    return res.status(200).json({ path, token: data.token, signedUrl: data.signedUrl });
  } catch (error) {
    console.error("createVeteranVerificationUpload failed:", error);
    return res.status(500).json({ error: "Unable to prepare secure upload" });
  }
}
