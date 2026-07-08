import React from "react";
import { Card } from "@/components/ui/card";

export default function ProSignalStrip({ metrics, topLink, activeRules }) {
  const signals = [
    { label: "Scale signal", value: `$${metrics.epc.toFixed(2)} EPC`, note: "shows payout per click" },
    { label: "Conversion power", value: `${metrics.conversionRate}%`, note: "traffic turning into earnings" },
    { label: "Top money lane", value: topLink?.product_name || topLink?.short_code || "Needs data", note: "best current product" },
    { label: "Active rules", value: activeRules.toString(), note: "autopilot guardrails" },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-4">
      {signals.map((signal) => (
        <Card key={signal.label} className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{signal.label}</p>
          <p className="mt-2 truncate font-display text-xl font-black text-foreground">{signal.value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{signal.note}</p>
        </Card>
      ))}
    </div>
  );
}