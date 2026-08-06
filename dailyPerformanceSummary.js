import { db } from "./_lib/db.js";
import { getAuthedUser, isCronRequest } from "./_lib/supabase.js";
import { sendEmail } from "./_lib/email.js";

function moneyToCents(v) { return Math.round((Number(v) || 0) * 100); }
function centsToMoney(c) { return Number(((Number(c) || 0) / 100).toFixed(2)); }
function escapeHtml(v) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(v ?? "").replace(/[&<>"']/g, (c) => map[c]);
}

export default async function handler(req, res) {
  try {
    const body = req.body || {};
    const cronOk = isCronRequest(req, body);
    const { user } = await getAuthedUser(req);
    if (!user && !cronOk) return res.status(401).json({ error: "Unauthorized" });

    const D = db();
    const links = await D.AffiliateLink.list("-created_date", 200);
    const clickEvents = await D.ClickEvent.list("-created_date", 1000);
    const conversionEvents = await D.ConversionEvent.list("-created_date", 1000);

    if (!links.length) return res.status(200).json({ message: "No links found, skipping email." });

    const linkClicks = links.reduce((s, l) => s + (Number(l.clicks) || 0), 0);
    const linkConversions = links.reduce((s, l) => s + (Number(l.conversions) || 0), 0);
    const linkEarningsCents = links.reduce((s, l) => s + moneyToCents(l.earnings), 0);
    const eventEarningsCents = conversionEvents.reduce((s, e) => s + moneyToCents(e.amount), 0);
    const totalClicks = Math.max(linkClicks, clickEvents.length);
    const totalConversions = Math.max(linkConversions, conversionEvents.length);
    const totalEarnings = centsToMoney(Math.max(linkEarningsCents, eventEarningsCents));
    const conversionRate = totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(1) : "0.0";

    const topLinks = [...links].sort((a, b) => (b.clicks || 0) - (a.clicks || 0)).slice(0, 5);
    const topLinksRows = topLinks
      .map((link) => {
        const label = escapeHtml(link.product_name || link.short_code || "—");
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #2a2a4a;">${label}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #2a2a4a;text-align:center;">${Number(link.clicks) || 0}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #2a2a4a;text-align:center;">${Number(link.conversions) || 0}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #2a2a4a;text-align:center;color:#10b981;">$${(Number(link.earnings) || 0).toFixed(2)}</td>
        </tr>`;
      })
      .join("");

    const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const emailBody = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0f0c29;font-family:'Inter',Arial,sans-serif;color:#e2e8f0;">
<div style="max-width:580px;margin:0 auto;padding:32px 16px;">
  <div style="background:linear-gradient(135deg,#7c3aed,#f59e0b);border-radius:16px;padding:28px 24px;margin-bottom:24px;text-align:center;">
    <h1 style="margin:0;font-size:22px;color:#fff;font-weight:700;">Daily Performance Summary</h1>
    <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">${today}</p>
  </div>
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:24px;">
    <div style="background:#1a1740;border-radius:12px;padding:20px;text-align:center;border:1px solid #2a2560;">
      <p style="margin:0;font-size:28px;font-weight:700;color:#a78bfa;">${totalClicks.toLocaleString()}</p>
      <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Total Clicks</p></div>
    <div style="background:#1a1740;border-radius:12px;padding:20px;text-align:center;border:1px solid #2a2560;">
      <p style="margin:0;font-size:28px;font-weight:700;color:#34d399;">${totalConversions.toLocaleString()}</p>
      <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Total Conversions</p></div>
    <div style="background:#1a1740;border-radius:12px;padding:20px;text-align:center;border:1px solid #2a2560;">
      <p style="margin:0;font-size:28px;font-weight:700;color:#fbbf24;">$${totalEarnings.toFixed(2)}</p>
      <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Total Earnings</p></div>
    <div style="background:#1a1740;border-radius:12px;padding:20px;text-align:center;border:1px solid #2a2560;">
      <p style="margin:0;font-size:28px;font-weight:700;color:#60a5fa;">${conversionRate}%</p>
      <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Conversion Rate</p></div>
  </div>
  <div style="background:#1a1740;border-radius:12px;overflow:hidden;border:1px solid #2a2560;margin-bottom:24px;">
    <div style="padding:16px 16px 12px;border-bottom:1px solid #2a2560;">
      <h2 style="margin:0;font-size:15px;font-weight:600;color:#e2e8f0;">Top Links by Clicks</h2></div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#12103a;">
        <th style="padding:10px 12px;text-align:left;color:#94a3b8;font-weight:500;">Product</th>
        <th style="padding:10px 12px;text-align:center;color:#94a3b8;font-weight:500;">Clicks</th>
        <th style="padding:10px 12px;text-align:center;color:#94a3b8;font-weight:500;">Conv.</th>
        <th style="padding:10px 12px;text-align:center;color:#94a3b8;font-weight:500;">Earnings</th></tr></thead>
      <tbody>${topLinksRows || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#64748b;">No link data yet</td></tr>'}</tbody>
    </table>
  </div>
  <p style="text-align:center;font-size:12px;color:#475569;margin:0;">Affiliate Pro X &bull; Keep pushing forward</p>
</div></body></html>`;

    let recipients = user?.email ? [user.email] : [];
    if (recipients.length === 0) {
      const admins = await D.User.filter({ role: "admin" });
      recipients = admins.map((a) => a.email).filter(Boolean);
    }

    for (const to of recipients) {
      await sendEmail({ to, subject: `Your Daily Affiliate Summary — ${today}`, body: emailBody });
    }

    res.status(200).json({ success: true, totalClicks, totalConversions, totalEarnings, sentTo: recipients });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
