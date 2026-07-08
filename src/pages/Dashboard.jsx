import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { RefreshCw } from "lucide-react";
import DashboardHero from "@/components/dashboard/DashboardHero";
import ViewModeToggle from "@/components/dashboard/ViewModeToggle";
import ModeOnboardingChoice from "@/components/dashboard/ModeOnboardingChoice";
import StandardDashboard from "@/components/dashboard/StandardDashboard";
import ProDashboard from "@/components/dashboard/ProDashboard";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

function buildChartData(clicks = [], conversions = []) {
  return Array.from({ length: 30 }, (_, i) => {
    const day = new Date();
    day.setDate(day.getDate() - (29 - i));
    const key = day.toISOString().slice(0, 10);
    return {
      date: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      clicks: clicks.filter(c => (c.clicked_at || c.created_date || "").slice(0, 10) === key).length,
      earnings: conversions
        .filter(c => (c.converted_at || c.created_date || "").slice(0, 10) === key)
        .reduce((sum, c) => sum + (c.amount || 0), 0),
    };
  });
}

function uniqueClickSignals(clicks = []) {
  return new Set(clicks.map(click => `${click.short_code}-${click.source || click.referrer || "direct"}-${(click.clicked_at || click.created_date || "").slice(0, 10)}`)).size;
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("affiliateProViewMode") || "standard");
  const [hasChosenMode, setHasChosenMode] = useState(() => Boolean(localStorage.getItem("affiliateProViewMode")));

  const chooseMode = (mode) => {
    setViewMode(mode);
    setHasChosenMode(true);
  };

  useEffect(() => {
    if (hasChosenMode) localStorage.setItem("affiliateProViewMode", viewMode);
  }, [viewMode, hasChosenMode]);

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

  const { onTouchStart, onTouchMove, onTouchEnd, pullDistance, pulling } = usePullToRefresh(() =>
    queryClient.invalidateQueries()
  );

  const totalClicks = links.reduce((sum, l) => sum + (l.clicks || 0), 0);
  const totalEarnings = links.reduce((sum, l) => sum + (l.earnings || 0), 0);
  const totalConversions = links.reduce((sum, l) => sum + (l.conversions || 0), 0);
  const conversionRate = totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(1) : "0.0";
  const chartData = buildChartData(clickEvents, conversionEvents);

  const metrics = {
    totalClicks,
    totalEarnings,
    totalConversions,
    conversionRate,
    epc: totalClicks > 0 ? totalEarnings / totalClicks : 0,
    uniqueClicks: uniqueClickSignals(clickEvents),
    avgConversion: totalConversions > 0 ? totalEarnings / totalConversions : 0,
  };

  return (
    <div className="space-y-6" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="ptr-indicator" style={{ height: pullDistance }}>
        <RefreshCw className={`w-5 h-5 text-violet-400 transition-transform ${pulling ? "animate-spin" : ""}`} style={{ transform: `rotate(${pullDistance * 2}deg)` }} />
      </div>

      <DashboardHero totalEarnings={totalEarnings} />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Adaptive experience</p>
          <h1 className="font-display text-2xl font-bold text-foreground">Choose the dashboard that fits how you work.</h1>
        </div>
        <ViewModeToggle mode={viewMode} onChange={chooseMode} />
      </div>

      {!hasChosenMode && <ModeOnboardingChoice onChoose={chooseMode} />}

      {viewMode === "standard" ? (
        <StandardDashboard metrics={metrics} links={links} posts={posts} />
      ) : (
        <ProDashboard metrics={metrics} links={links} posts={posts} chartData={chartData} clickEvents={clickEvents} />
      )}
    </div>
  );
}