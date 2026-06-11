import React from "react";
import { useQuery } from "@tanstack/react-query";
import { analyticsAPI } from "@/lib/api";
import { MousePointerClick, DollarSign, TrendingUp, Link2 } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import PerformanceChart from "@/components/dashboard/PerformanceChart";
import SmartSuggestions from "@/components/dashboard/SmartSuggestions";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ["analytics-overview"],
    queryFn: async () => {
      const res = await analyticsAPI.overview();
      return res.data;
    },
  });

  const { data: chartData, isLoading: loadingChart } = useQuery({
    queryKey: ["analytics-chart"],
    queryFn: async () => {
      const res = await analyticsAPI.chartData();
      const raw = res.data;
      if (Array.isArray(raw)) return raw;
      if (Array.isArray(raw?.data)) return raw.data;
      return [];
    },
  });

  const stats = overview?.data || overview || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Command Center</h1>
        <p className="text-muted-foreground text-sm mt-1">Your income runs on autopilot — sit back and watch it grow.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loadingOverview ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              label="Total Clicks"
              value={stats.total_clicks?.toLocaleString() || "0"}
              icon={MousePointerClick}
              trend={stats.clicks_trend}
              trendUp={stats.clicks_trend_up}
            />
            <StatCard
              label="Total Earnings"
              value={`$${(stats.total_earnings || 0).toFixed(2)}`}
              icon={DollarSign}
              trend={stats.earnings_trend}
              trendUp={stats.earnings_trend_up}
            />
            <StatCard
              label="Conversions"
              value={stats.total_conversions?.toLocaleString() || "0"}
              icon={TrendingUp}
              trend={stats.conversions_trend}
              trendUp={stats.conversions_trend_up}
            />
            <StatCard
              label="Active Links"
              value={stats.active_links?.toLocaleString() || "0"}
              icon={Link2}
            />
          </>
        )}
      </div>

      {/* Chart */}
      <PerformanceChart data={Array.isArray(chartData) ? chartData : []} isLoading={loadingChart} />

      {/* AI Insights */}
      <SmartSuggestions />
    </div>
  );
}