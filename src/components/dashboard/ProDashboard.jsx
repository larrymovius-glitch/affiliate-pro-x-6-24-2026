import React from "react";
import SmartSuggestions from "@/components/dashboard/SmartSuggestions";
import DeepAnalyticsPanel from "@/components/dashboard/DeepAnalyticsPanel";
import AdvancedMetricGrid from "@/components/dashboard/AdvancedMetricGrid";
import ProLinkTable from "@/components/dashboard/ProLinkTable";
import SourceBreakdown from "@/components/dashboard/SourceBreakdown";
import AutomationHooks from "@/components/dashboard/AutomationHooks";

export default function ProDashboard({ metrics, links, posts, chartData, clickEvents }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Pro view</h2>
        <p className="text-muted-foreground">Expanded analytics for experienced affiliate operators.</p>
      </div>
      <AdvancedMetricGrid metrics={metrics} />
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <DeepAnalyticsPanel data={chartData} />
        <SmartSuggestions links={links} posts={posts} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <ProLinkTable links={links} />
        <SourceBreakdown clicks={clickEvents} />
      </div>
      <AutomationHooks />
    </div>
  );
}