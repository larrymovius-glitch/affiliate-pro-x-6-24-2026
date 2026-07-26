import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  buildPerformanceChartData,
  buildPerformanceMetrics,
  calculatePayoutBalance,
} from "@/lib/performance-calculations";
import { RefreshCw, MousePointerClick, Repeat, Wallet } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import EarningsHero from "@/components/dashboard/EarningsHero";
import EarningsLineChart from "@/components/dashboard/EarningsLineChart";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

export default function Dashboard() {
  const queryClient = useQueryClient();

  const { data: links = [] } = useQuery({
    queryKey: ["links"],
    queryFn: () => base44.entities.AffiliateLink.list("-created_date", 100),
  });

  const { data: clickEvents = [] } = useQuery({
    queryKey: ["click-events"],
    queryFn: () => base44.entities.ClickEvent.list("-created_date", 500),
  });

  const { data: conversionEvents = [] } = useQuery({
    queryKey: ["conversion-events"],
    queryFn: () => base44.entities.ConversionEvent.list("-created_date", 500),
  });

  const { data: payouts = [] } = useQuery({
    queryKey: ["payouts"],
    queryFn: () => base44.entities.Payout.list("-created_date", 100),
  });

  const { onTouchStart, onTouchMove, onTouchEnd, pullDistance, pulling } = usePullToRefresh(() =>
    queryClient.invalidateQueries()
  );

  const metrics = buildPerformanceMetrics({ links, clickEvents, conversionEvents });
  const sixtyDayData = buildPerformanceChartData(clickEvents, conversionEvents, 60);
  const chartData = sixtyDayData.slice(30);
  const previousEarnings = sixtyDayData.slice(0, 30).reduce((sum, row) => sum + row.earnings, 0);
  const currentEarnings = chartData.reduce((sum, row) => sum + row.earnings, 0);
  const percentChange =
    previousEarnings > 0
      ? ((currentEarnings - previousEarnings) / previousEarnings) * 100
      : currentEarnings > 0
      ? 100
      : 0;

  const payoutBalance = calculatePayoutBalance(links, payouts);

  return (
    <div className="space-y-6" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="ptr-indicator" style={{ height: pullDistance }}>
        <RefreshCw
          className={`w-5 h-5 text-violet-400 transition-transform ${pulling ? "animate-spin" : ""}`}
          style={{ transform: `rotate(${pullDistance * 2}deg)` }}
        />
      </div>

      <EarningsHero totalEarnings={metrics.totalEarnings} percentChange={percentChange} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Clicks" value={metrics.totalClicks.toLocaleString()} icon={MousePointerClick} />
        <StatCard label="Conversions" value={metrics.totalConversions.toLocaleString()} icon={Repeat} />
        <StatCard label="Pending Payout" value={`$${payoutBalance.totalPending.toFixed(2)}`} icon={Wallet} />
      </div>

      <EarningsLineChart data={chartData} />
    </div>
  );
}