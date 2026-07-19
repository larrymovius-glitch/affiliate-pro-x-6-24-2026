import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { buildPerformanceChartData, buildPerformanceMetrics } from "@/lib/performance-calculations";
import { RefreshCw } from "lucide-react";
import DashboardHero from "@/components/dashboard/DashboardHero";
import ViewModeToggle from "@/components/dashboard/ViewModeToggle";
import StandardDashboard from "@/components/dashboard/StandardDashboard";
import ProDashboard from "@/components/dashboard/ProDashboard";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("affiliateProViewMode") || "standard");

  const chooseMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem("affiliateProViewMode", mode);
  };

  const { data: links = [] } = useQuery({
    queryKey: ["links"],
    queryFn: () => base44.entities.AffiliateLink.list("-created_date", 100),
  });

  const { data: posts = [] } = useQuery({
    queryKey: ["generated-posts"],
    queryFn: () => base44.entities.GeneratedPost.list("-created_date", 50),
  });

  const { data: clickEvents = [] } = useQuery({
    queryKey: ["click-events"],
    queryFn: () => base44.entities.ClickEvent.list("-created_date", 500),
  });

  const { data: conversionEvents = [] } = useQuery({
    queryKey: ["conversion-events"],
    queryFn: () => base44.entities.ConversionEvent.list("-created_date", 500),
  });

  const { data: rules = [] } = useQuery({
    queryKey: ["pro-automation-rules"],
    queryFn: () => base44.entities.ProAutomationRule.list("-created_date", 50),
  });

  const { onTouchStart, onTouchMove, onTouchEnd, pullDistance, pulling } = usePullToRefresh(() =>
    queryClient.invalidateQueries()
  );

  const metrics = buildPerformanceMetrics({ links, clickEvents, conversionEvents });
  const chartData = buildPerformanceChartData(clickEvents, conversionEvents);

  return (
    <div className="space-y-6" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="ptr-indicator" style={{ height: pullDistance }}>
        <RefreshCw className={`w-5 h-5 text-violet-400 transition-transform ${pulling ? "animate-spin" : ""}`} style={{ transform: `rotate(${pullDistance * 2}deg)` }} />
      </div>

      <DashboardHero totalEarnings={metrics.totalEarnings} />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Adaptive experience</p>
          <h1 className="font-display text-2xl font-bold text-foreground">Choose the dashboard that fits how you work.</h1>
        </div>
        <ViewModeToggle mode={viewMode} onChange={chooseMode} />
      </div>

      {viewMode === "standard" ? (
        <StandardDashboard metrics={metrics} links={links} posts={posts} />
      ) : (
        <ProDashboard metrics={metrics} links={links} posts={posts} chartData={chartData} clickEvents={clickEvents} rules={rules} />
      )}
    </div>
  );
}