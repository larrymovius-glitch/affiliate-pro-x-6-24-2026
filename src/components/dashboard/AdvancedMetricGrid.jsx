import React from "react";
import { Card } from "@/components/ui/card";

export default function AdvancedMetricGrid({ metrics }) {
  const cards = [
    { label: "EPC", value: `$${metrics.epc.toFixed(2)}`, note: "earnings per click" },
    { label: "ROI / Net Margin", value: "Needs cost", note: "ready for ad spend data" },
    { label: "Unique vs Raw", value: `${metrics.uniqueClicks}/${metrics.totalClicks}`, note: "estimated unique signals vs clicks" },
    { label: "Average Order Value", value: `$${metrics.avgConversion.toFixed(2)}`, note: "earnings per conversion" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{card.label}</p>
          <p className="mt-2 font-display text-2xl font-black text-foreground">{card.value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{card.note}</p>
        </Card>
      ))}
    </div>
  );
}