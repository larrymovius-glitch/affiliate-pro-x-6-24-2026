import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { MousePointerClick, DollarSign, TrendingUp, Link2 } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import PerformanceChart from "@/components/dashboard/PerformanceChart";
import SmartSuggestions from "@/components/dashboard/SmartSuggestions";
import VoicePhil from "@/components/dashboard/VoicePhil";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: links = [], isLoading } = useQuery({
    queryKey: ["links"],
    queryFn: () => base44.entities.AffiliateLink.list("-created_date", 100),
  });

  const { data: posts = [] } = useQuery({
    queryKey: ["generated-posts"],
    queryFn: () => base44.entities.GeneratedPost.list("-created_date", 50),
  });

  const totalClicks = links.reduce((sum, l) => sum + (l.clicks || 0), 0);
  const totalEarnings = links.reduce((sum, l) => sum + (l.earnings || 0), 0);
  const totalConversions = links.reduce((sum, l) => sum + (l.conversions || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-3xl font-display font-extrabold tracking-tight"
          style={{ background: "linear-gradient(90deg, #e9d5ff, #a78bfa, #f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
        >
          Dashboard
        </h1>
        <p className="text-slate-400 text-sm mt-1">Your affiliate income overview.</p>
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

      <PerformanceChart data={[]} isLoading={false} />

      <SmartSuggestions links={links} posts={posts} />

      <VoicePhil />
    </div>
  );
}