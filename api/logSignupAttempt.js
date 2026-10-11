import { db } from "./_lib/db.js";
import { signupAttemptRow } from "./_lib/location.js";

// Called by the Register page after every signup try, signed in or not --
// that is the point: it records people who never get as far as an account
// (a mistyped email, an address that's already taken). Each row keeps the
// email typed, what happened, and where the request came from, for the
// owner's Admin page (api/adminSignupAttempts.js).
//
// Open to anyone, so it is capped: an address that has already logged 20
// tries in the last hour is ignored, which keeps a script from filling the
// table.
const PER_IP_PER_HOUR = 20;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
    const row = signupAttemptRow(req.body || {}, req.headers);
    if (!row) return res.status(400).json({ error: "email is required" });

    const D = db();
    if (row.ip) {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const recent = (await D.SignupAttempt.filter({ ip: row.ip }, "-created_at", PER_IP_PER_HOUR)).filter((r) => r.created_at >= since);
      if (recent.length >= PER_IP_PER_HOUR) return res.status(200).json({ recorded: false });
    }
    await D.SignupAttempt.create(row);
    res.status(200).json({ recorded: true });
  } catch (error) {
    console.error("logSignupAttempt error:", error);
    res.status(500).json({ error: "Couldn't record that." });
  }
}
