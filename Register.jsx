import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DollarSign, Link2, MousePointerClick, TrendingUp } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import TodayAction from "@/components/dashboard/TodayAction";
import StandardLinksTable from "@/components/dashboard/StandardLinksTable";
import SmartTipsCard from "@/components/dashboard/SmartTipsCard";
import ReferralCard from "@/components/dashboard/ReferralCard";

export default function StandardDashboard({ metrics, links, posts }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <h2 className="font-display text-2xl font-bold">Simple view</h2>
          <p className="text-muted-foreground">Only the numbers and actions that matter most today.</p>
        </div>
        <Button asChild className="h-14 px-8 text-base">
          <Link to="/make-money"><Link2 className="mr-2 h-5 w-5" /> Create Tracking Link</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Total Clicks" value={metrics.totalClicks.toLocaleString()} icon={MousePointerClick} />
        <StatCard label="Total Earnings" value={`$${metrics.totalEarnings.toFixed(2)}`} icon={DollarSign} />
        <StatCard label="Conversion Rate" value={`${metrics.conversionRate}%`} icon={TrendingUp} />
      </div>

      <TodayAction links={links} posts={posts} conversions={metrics.totalConversions} earnings={metrics.totalEarnings} />
      <StandardLinksTable links={links} />
      <SmartTipsCard links={links} />
      <ReferralCard />
    </div>
  );
}