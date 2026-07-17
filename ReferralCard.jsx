import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Your independence ledger. Admin-only. Returns a complete JSON snapshot of
// every business-critical entity so the data is never hostage to any platform.
// Download it regularly (weekly is plenty) and keep copies somewhere you control.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    const db = base44.asServiceRole;

    const entities = ['User', 'AffiliateLink', 'Product', 'GeneratedPost', 'Campaign',
      'Payout', 'PayoutSchedule', 'Payment', 'Subscription', 'Notification',
      'ClickEvent', 'ConversionEvent', 'AdAsset', 'AdReview'];

    const backup: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      exported_by: user.email,
    };
    for (const name of entities) {
      try {
        backup[name] = await db.entities[name].list('-created_date', 10000);
      } catch (e) {
        backup[name] = { error: `Could not export: ${e.message}` };
      }
    }

    return new Response(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="apx-backup-${new Date().toISOString().slice(0,10)}.json"`,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
