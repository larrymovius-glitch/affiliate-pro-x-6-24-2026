import crypto from "crypto";

// eBay's marketplace account-deletion webhook: GET is a challenge handshake,
// POST is the actual notification (acknowledged only — deletion itself is
// handled by /api/deleteAccount).
export default async function handler(req, res) {
  try {
    const verificationToken = process.env.EBAY_VERIFICATION_TOKEN;
    const endpointUrl = `https://${req.headers.host}/functions/ebayAccountDeletion`;

    if (req.method === "GET") {
      const challengeCode = req.query?.challenge_code;
      if (!challengeCode || !/^[A-Za-z0-9_-]{1,64}$/.test(challengeCode)) {
        return res.status(400).json({ error: "Invalid challenge_code" });
      }
      if (!verificationToken) {
        console.error("EBAY_VERIFICATION_TOKEN is not set");
        return res.status(500).json({ error: "Server misconfiguration" });
      }
      const hash = crypto.createHash("sha256");
      hash.update(challengeCode + verificationToken + endpointUrl);
      const challengeResponse = hash.digest("hex");
      return res.status(200).json({ challengeResponse });
    }

    if (req.method === "POST") {
      return res.status(200).end();
    }

    res.status(405).send("Method Not Allowed");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
