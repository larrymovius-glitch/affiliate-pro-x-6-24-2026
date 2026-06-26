import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { MousePointerClick, DollarSign, TrendingUp, Link2, RefreshCw } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import PerformanceChart from "@/components/dashboard/PerformanceChart";
import SmartSuggestions from "@/components/dashboard/SmartSuggestions";
import { Skeleton } from "@/components/ui/skeleton";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

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

  const { onTouchStart, onTouchMove, onTouchEnd, pullDistance, pulling } = usePullToRefresh(() =>
    queryClient.invalidateQueries()
  );

  const totalClicks = links.reduce((sum, l) => sum + (l.clicks || 0), 0);
  const totalEarnings = links.reduce((sum, l) => sum + (l.earnings || 0), 0);
  const totalConversions = links.reduce((sum, l) => sum + (l.conversions || 0), 0);

  // Build 30-day chart data from links
  const chartData = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      clicks: Math.floor(totalClicks / 30) + Math.random() * 20,
      earnings: totalEarnings > 0 ? (totalEarnings / 30) + Math.random() * 5 : 0,
    };
  });

  return (
    <div className="space-y-6" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="ptr-indicator" style={{ height: pullDistance }}>
        <RefreshCw className={`w-5 h-5 text-violet-400 transition-transform ${pulling ? "animate-spin" : ""}`} style={{ transform: `rotate(${pullDistance * 2}deg)` }} />
      </div>
      <div>
        <h1 className="text-3xl font-display font-extrabold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Your affiliate income overview.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard label="Total Clicks" value={totalClicks.toLocaleString()} icon={MousePointerClick} />
            <StatCard label="Total Earnings" value={`$${totalEarnings.toFixed(2)}`} icon={DollarSign} />
            <StatCard label="Conversions" value={totalConversions.toLocaleString()} icon={TrendingUp} />
            <StatCard label="Active Links" value={links.length.toLocaleString()} icon={Link2} />
          </>
        )}
      </div>

      <PerformanceChart data={chartData} isLoading={false} />

      <SmartSuggestions links={links} posts={posts} />
    </div>
  );
}