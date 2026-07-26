import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  buildPerformanceChartData,
  buildPerformanceMetrics,
  calculatePayoutBalance,
} from "@/lib/performance-calculations";
import { format } from "date-fns";
import { RefreshCw, MousePointerClick, Target, Wallet, Percent } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import EarningsHero from "@/components/dashboard/EarningsHero";
import StatCardsRow from "@/components/dashboard/StatCardsRow";
import TopEarningLinks from "@/components/dashboard/TopEarningLinks";
import QuickActions from "@/components/dashboard/QuickActions";
import DashboardSkeleton from "@/components/dashboard/DashboardSkeleton";
import { COLORS } from "@/components/dashboard/dash-theme";

function dayKey(d) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const linksQ = useQuery({ queryKey: ["links"], queryFn: () => base44.entities.AffiliateLink.list("-created_date", 100) });
  const clicksQ = useQuery({ queryKey: ["click-events"], queryFn: () => base44.entities.ClickEvent.list("-created_date", 500) });
  const convQ = useQuery({ queryKey: ["conversion-events"], queryFn: () => base44.entities.ConversionEvent.list("-created_date", 500) });
  const payoutsQ = useQuery({ queryKey: ["payouts"], queryFn: () => base44.entities.Payout.list("-created_date", 100) });
  const scheduleQ = useQuery({ queryKey: ["payout-schedule"], queryFn: () => base44.entities.PayoutSchedule.list("-created_date", 5) });

  const { onTouchStart, onTouchMove, onTouchEnd, pullDistance, pulling } = usePullToRefresh(() =>
    queryClient.invalidateQueries()
  );

  const links = linksQ.data || [];
  const clickEvents = clicksQ.data || [];
  const conversionEvents = convQ.data || [];
  const payouts = payoutsQ.data || [];
  const schedule = scheduleQ.data?.[0];

  const loading = linksQ.isLoading || clicksQ.isLoading || convQ.isLoading || payoutsQ.isLoading;

  const metrics = buildPerformanceMetrics({ links, clickEvents, conversionEvents });
  const sixty = buildPerformanceChartData(clickEvents, conversionEvents, 60);
  const chartData = sixty.slice(30);
  const thisWeek = sixty.slice(53);
  const prevWeek = sixty.slice(46, 53);
  const earningsThisWeek = thisWeek.reduce((s, r) => s + r.earnings, 0);
  const earningsLastWeek = prevWeek.reduce((s, r) => s + r.earnings, 0);
  const weekChange = earningsLastWeek > 0
    ? ((earningsThisWeek - earningsLastWeek) / earningsLastWeek) * 100
    : earningsThisWeek > 0 ? 100 : 0;

  const todayKey = dayKey(Date.now());
  const yestKey = dayKey(Date.now() - 86400000);
  const clicksToday = clickEvents.filter((c) => dayKey(c.clicked_at || c.created_date) === todayKey).length;
  const clicksYest = clickEvents.filter((c) => dayKey(c.clicked_at || c.created_date) === yestKey).length;
  const clicksChange = clicksToday - clicksYest;

  const convThisWeek = thisWeek.reduce((s, r) => s + r.conversions, 0);
  const convLastWeek = prevWeek.reduce((s, r) => s + r.conversions, 0);
  const convChange = convThisWeek - convLastWeek;

  const payoutBalance = calculatePayoutBalance(links, payouts);
  const pendingDateRaw = schedule?.next_payout_date || payouts.find((p) => p.status === "pending" || p.status === "approved")?.requested_at;
  const pendingDate = pendingDateRaw ? format(new Date(pendingDateRaw), "MMM d") : "—";

  const lastWeekClicks = prevWeek.reduce((s, r) => s + r.clicks, 0);
  const lastWeekConv = prevWeek.reduce((s, r) => s + r.conversions, 0);
  const lastWeekRate = lastWeekClicks > 0 ? (lastWeekConv / lastWeekClicks) * 100 : 0;
  const rateNow = parseFloat(metrics.conversionRate) || 0;
  const rateChange = rateNow - lastWeekRate;

  const statCards = [
    { icon: MousePointerClick, label: "Clicks today", value: clicksToday.toLocaleString(), sublabel: `${clicksChange >= 0 ? "+" : ""}${clicksChange} vs yesterday`, tone: clicksChange >= 0 ? "teal" : "red" },
    { icon: Target, label: "Conversions", value: metrics.totalConversions.toLocaleString(), sublabel: `${convChange >= 0 ? "+" : ""}${convChange} vs last week`, tone: convChange >= 0 ? "teal" : "red" },
    { icon: Wallet, label: "Pending payout", value: `$${payoutBalance.totalPending.toFixed(2)}`, sublabel: `Pays ${pendingDate}`, tone: "sand" },
    { icon: Percent, label: "Conversion rate", value: `${rateNow.toFixed(1)}%`, sublabel: `${rateChange >= 0 ? "+" : ""}${rateChange.toFixed(1)}% vs last week`, tone: rateChange >= 0 ? "teal" : "red" },
  ];

  const askMaya = () => window.dispatchEvent(new CustomEvent("open-maya-assistant"));

  return (
    <div
      className="-mx-4 lg:-mx-6 -mt-4 lg:-mt-6 px-4 lg:px-6 pt-6 pb-10 min-h-[calc(100vh-56px)]"
      style={{ background: COLORS.pageBg }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
    >
      <div className="ptr-indicator" style={{ height: pullDistance }}>
        <RefreshCw
          className={`w-5 h-5 transition-transform ${pulling ? "animate-spin" : ""}`}
          style={{ color: COLORS.teal, transform: `rotate(${pullDistance * 2}deg)` }}
        />
      </div>

      <div className="space-y-6">
        <DashboardHeader user={user} />

        {loading ? (
          <DashboardSkeleton />
        ) : (
          <>
            <EarningsHero totalEarnings={metrics.totalEarnings} percentChange={weekChange} chartData={chartData} />
            <StatCardsRow cards={statCards} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TopEarningLinks links={links} />
              <QuickActions onAskMaya={askMaya} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}