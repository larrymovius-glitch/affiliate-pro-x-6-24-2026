import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { MousePointerClick, DollarSign, TrendingUp, Link2, RefreshCw } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import PerformanceChart from "@/components/dashboard/PerformanceChart";
import SmartSuggestions from "@/components/dashboard/SmartSuggestions";
import DashboardHero from "@/components/dashboard/DashboardHero";
import TodayAction from "@/components/dashboard/TodayAction";
import { Skeleton } from "@/components/ui/skeleton";
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

export default function Dashboard() {
  const queryClient = useQueryClient();

  const { data: links = [], isLoading } = useQuery({
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

  return (
    <div className="space-y-6" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="ptr-indicator" style={{ height: pullDistance }}>
        <RefreshCw className={`w-5 h-5 text-violet-400 transition-transform ${pulling ? "animate-spin" : ""}`} style={{ transform: `rotate(${pullDistance * 2}deg)` }} />
      </div>

      <DashboardHero totalEarnings={totalEarnings} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard label="Tracked Clicks" value={totalClicks.toLocaleString()} icon={MousePointerClick} />
            <StatCard label="Total Earnings" value={`$${totalEarnings.toFixed(2)}`} icon={DollarSign} />
            <StatCard label="Conversions" value={totalConversions.toLocaleString()} icon={TrendingUp} />
            <StatCard label="Conversion Rate" value={`${conversionRate}%`} icon={Link2} />
          </>
        )}
      </div>

      <TodayAction links={links} posts={posts} conversions={totalConversions} earnings={totalEarnings} />

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <PerformanceChart data={chartData} isLoading={false} />
        <SmartSuggestions links={links} posts={posts} />
      </div>
    </div>
  );
}