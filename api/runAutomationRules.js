import { adminClient, isCronRequest } from "./_lib/supabase.js";
import { buildNotification, isDue, matchingLinks } from "./_lib/automationRules.js";

// Daily cron: checks every active Pro automation rule against its owner's
// links. Before this existed, rules could be saved but nothing ever read them.
// Decisions live in api/_lib/automationRules.js; this file only does I/O.
export default async function handler(req, res) {
  if (!isCronRequest(req, req.body || {})) return res.status(401).json({ error: "Unauthorized" });

  const admin = adminClient();
  try {
    const { data: rules, error: rulesError } = await admin
      .from("pro_automation_rules").select("*").eq("is_active", true);
    if (rulesError) throw rulesError;

    const due = (rules || []).filter((rule) => isDue(rule));
    const owners = [...new Set(due.map((rule) => rule.created_by_id).filter(Boolean))];
    if (!owners.length) return res.status(200).json({ checked: 0, fired: 0 });

    const { data: links, error: linksError } = await admin
      .from("affiliate_links").select("*").in("created_by_id", owners);
    if (linksError) throw linksError;

    // Every attempt is reported, failures included (policies section 7).
    const results = [];
    for (const rule of due) {
      const matches = matchingLinks(rule, links || []);
      if (!matches.length) { results.push({ rule: rule.id, matched: 0 }); continue; }
      const note = buildNotification(rule, matches);
      const { error: noteError } = await admin.from("notifications").insert(note);
      if (noteError) {
        console.error("runAutomationRules: notification failed", rule.id, noteError.message);
        results.push({ rule: rule.id, matched: matches.length, error: noteError.message });
        continue;
      }
      // Only marked as fired once the member has actually been told, so a
      // failed insert is retried on the next run instead of being skipped.
      const { error: stampError } = await admin.from("pro_automation_rules")
        .update({ last_triggered_at: new Date().toISOString() }).eq("id", rule.id);
      if (stampError) console.error("runAutomationRules: stamp failed", rule.id, stampError.message);
      results.push({ rule: rule.id, matched: matches.length, notified: note.title });
    }

    const fired = results.filter((r) => r.notified).length;
    const failed = results.filter((r) => r.error).length;
    console.log(`runAutomationRules: checked ${due.length}, fired ${fired}, failed ${failed}`);
    return res.status(200).json({ checked: due.length, fired, failed, results });
  } catch (error) {
    console.error("runAutomationRules failed:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
