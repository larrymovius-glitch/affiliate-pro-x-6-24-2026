import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function moneyToCents(value) {
  return Math.round((Number(value) || 0) * 100);
}

function centsToMoney(cents) {
  return Number(((Number(cents) || 0) / 100).toFixed(2));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Works both per-user (authenticated) and on a cron schedule (no user context)
    const CRON_TOKEN = Deno.env.get("CRON_SECRET");
    if (!CRON_TOKEN) {
      console.error("CRON_SECRET not configured");
      return Response.json({ error: 'Server misconfiguration' }, { status: 500 });
    }
    let payload = {};
    try { payload = await req.json(); } catch (_) { payload = {}; }
    const cronOk = payload.cron_secret === CRON_TOKEN || req.headers.get('x-cron-secret') === CRON_TOKEN;
    let user = null;
    try { user = await base44.auth.me(); } catch (_) { user = null; }
    if (!user && !cronOk) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch all affiliate performance records
    const links = await base44.asServiceRole.entities.AffiliateLink.list('-created_date', 200);
    const clickEvents = await base44.asServiceRole.entities.ClickEvent.list('-created_date', 1000);
    const conversionEvents = await base44.asServiceRole.entities.ConversionEvent.list('-created_date', 1000);

    if (!links || links.length === 0) {
      return Response.json({ message: 'No links found, skipping email.' });
    }

    // Aggregate totals using cents for money math and event records when they exceed cached link counters
    const linkClicks = links.reduce((sum, l) => sum + (Number(l.clicks) || 0), 0);
    const linkConversions = links.reduce((sum, l) => sum + (Number(l.conversions) || 0), 0);
    const linkEarningsCents = links.reduce((sum, l) => sum + moneyToCents(l.earnings), 0);
    const eventEarningsCents = conversionEvents.reduce((sum, event) => sum + moneyToCents(event.amount), 0);
    const totalClicks = Math.max(linkClicks, clickEvents.length);
    const totalConversions = Math.max(linkConversions, conversionEvents.length);
    const totalEarnings = centsToMoney(Math.max(linkEarningsCents, eventEarningsCents));
    const conversionRate = totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(1) : '0.0';

    // Top 5 links by clicks
    const topLinks = [...links]
      .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
      .slice(0, 5);

    const topLinksRows = topLinks.map(l =>
      `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #2a2a4a;">${l.product_name || l.short_code || '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #2a2a4a;text-align:center;">${l.clicks || 0}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #2a2a4a;text-align:center;">${l.conversions || 0}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #2a2a4a;text-align:center;color:#10b981;">$${(l.earnings || 0).toFixed(2)}</td>
      </tr>`
    ).join('');

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const emailBody = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f0c29;font-family:'Inter',Arial,sans-serif;color:#e2e8f0;">
  <div style="max-width:580px;margin:0 auto;padding:32px 16px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#7c3aed,#f59e0b);border-radius:16px;padding:28px 24px;margin-bottom:24px;text-align:center;">
      <h1 style="margin:0;font-size:22px;color:#fff;font-weight:700;">📊 Daily Performance Summary</h1>
      <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">${today}</p>
    </div>

    <!-- Stats -->
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:24px;">
      <div style="background:#1a1740;border-radius:12px;padding:20px;text-align:center;border:1px solid #2a2560;">
        <p style="margin:0;font-size:28px;font-weight:700;color:#a78bfa;">${totalClicks.toLocaleString()}</p>
        <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Total Clicks</p>
      </div>
      <div style="background:#1a1740;border-radius:12px;padding:20px;text-align:center;border:1px solid #2a2560;">
        <p style="margin:0;font-size:28px;font-weight:700;color:#34d399;">${totalConversions.toLocaleString()}</p>
        <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Total Conversions</p>
      </div>
      <div style="background:#1a1740;border-radius:12px;padding:20px;text-align:center;border:1px solid #2a2560;">
        <p style="margin:0;font-size:28px;font-weight:700;color:#fbbf24;">$${totalEarnings.toFixed(2)}</p>
        <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Total Earnings</p>
      </div>
      <div style="background:#1a1740;border-radius:12px;padding:20px;text-align:center;border:1px solid #2a2560;">
        <p style="margin:0;font-size:28px;font-weight:700;color:#60a5fa;">${conversionRate}%</p>
        <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Conversion Rate</p>
      </div>
    </div>

    <!-- Top Links Table -->
    <div style="background:#1a1740;border-radius:12px;overflow:hidden;border:1px solid #2a2560;margin-bottom:24px;">
      <div style="padding:16px 16px 12px;border-bottom:1px solid #2a2560;">
        <h2 style="margin:0;font-size:15px;font-weight:600;color:#e2e8f0;">🔥 Top Links by Clicks</h2>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#12103a;">
            <th style="padding:10px 12px;text-align:left;color:#94a3b8;font-weight:500;">Product</th>
            <th style="padding:10px 12px;text-align:center;color:#94a3b8;font-weight:500;">Clicks</th>
            <th style="padding:10px 12px;text-align:center;color:#94a3b8;font-weight:500;">Conv.</th>
            <th style="padding:10px 12px;text-align:center;color:#94a3b8;font-weight:500;">Earnings</th>
          </tr>
        </thead>
        <tbody>
          ${topLinksRows || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#64748b;">No link data yet</td></tr>'}
        </tbody>
      </table>
    </div>

    <!-- Footer -->
    <p style="text-align:center;font-size:12px;color:#475569;margin:0;">
      Affiliate Pro X &bull; Keep pushing forward 💪
    </p>
  </div>
</body>
</html>`;

    // Authenticated call: send to that user. Scheduled call: send to all admins.
    let recipients = user?.email ? [user.email] : [];
    if (recipients.length === 0) {
      const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
      recipients = admins.map(a => a.email).filter(Boolean);
    }

    for (const to of recipients) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to,
        subject: `📊 Your Daily Affiliate Summary — ${today}`,
        body: emailBody,
      });
    }

    return Response.json({ success: true, totalClicks, totalConversions, totalEarnings, sentTo: recipients });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});