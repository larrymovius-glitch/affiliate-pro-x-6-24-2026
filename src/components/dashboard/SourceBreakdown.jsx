import React from "react";
import { Card } from "@/components/ui/card";

function sourceName(click) {
  if (click.source) return click.source;
  try { return click.referrer ? new URL(click.referrer).hostname : "Direct / unknown"; } catch (_) { return "Direct / unknown"; }
}

export default function SourceBreakdown({ clicks = [] }) {
  const rows = Object.values(clicks.reduce((acc, click) => {
    const source = sourceName(click);
    acc[source] = acc[source] || { source, clicks: 0 };
    acc[source].clicks += 1;
    return acc;
  }, {})).sort((a, b) => b.clicks - a.clicks).slice(0, 6);

  return (
    <Card className="p-5">
      <h2 className="font-display text-xl font-bold">Traffic sources</h2>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.source} className="flex items-center justify-between rounded-xl bg-muted/60 p-3">
            <span className="truncate text-sm font-medium">{row.source}</span>
            <span className="text-sm font-bold text-primary">{row.clicks}</span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No click source data yet.</p>}
      </div>
    </Card>
  );
}