import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import PerformanceChart from "@/components/dashboard/PerformanceChart";
import { cn } from "@/lib/utils";

export default function DeepAnalyticsPanel({ data }) {
  const [segment, setSegment] = useState("traffic");
  const options = [
    { value: "traffic", label: "Traffic Source" },
    { value: "device", label: "Device Type" },
    { value: "country", label: "Country" },
  ];

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold">Deep analytics</h2>
          <p className="text-sm text-muted-foreground">Trend view segmented by {options.find(o => o.value === segment)?.label.toLowerCase()}.</p>
        </div>
        <div className="flex rounded-xl bg-muted p-1">
          {options.map((option) => (
            <button key={option.value} onClick={() => setSegment(option.value)} className={cn("rounded-lg px-3 py-2 text-xs font-bold", segment === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <PerformanceChart data={data} isLoading={false} />
      </div>
    </Card>
  );
}