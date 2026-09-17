// Replaces base44.integrations.Core.SendEmail. Uses Resend
// (https://resend.com) — set RESEND_API_KEY and RESEND_FROM in Vercel env
// vars. Fails soft (logs + returns false) if not configured, since email is
// usually a nice-to-have, not something that should crash a whole function.
export async function sendEmail({ to, subject, body }) {
  const apiKey = process.env.RESEND_API_KEY;
  // Default to Resend's shared sender, which works on any account with no DNS
  // set up at all. The previous default was notifications@amhere4utoday.com --
  // a good-looking address on a domain that was never verified with Resend, so
  // every send came back 403 and the only trace was a log line nobody reads.
  // Point RESEND_FROM at a branded address once the domain is verified.
  const from = process.env.RESEND_FROM || "Affiliate Pro X <onboarding@resend.dev>";
  if (!apiKey) {
    console.warn("RESEND_API_KEY not configured — skipping email send to", to);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html: body }),
  });
  if (!res.ok) {
    console.error(`Resend email error (${res.status}) sending to ${to}:`, await res.text());
    return false;
  }
  return true;
}
