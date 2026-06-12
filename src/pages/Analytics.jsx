import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { format, subDays } from "date-fns";

const COLORS = ["hsl(258, 80%, 65%)", "hsl(210, 90%, 60%)", "hsl(160, 84%, 39%)", "hsl(38, 92%, 50%)", "hsl(0, 84%, 60%)"];

export default function Analytics() {
  const { data: links = [], isLoading: loadingLinks } = useQuery({
    queryKey: ["links"],
    queryFn: () => base44.entities.AffiliateLink.list("-created_date", 100),
  });

  const { data: payouts = [], isLoading: loadingPayouts } = useQuery({
    queryKey: ["payouts"],
    queryFn: () => base44.entities.Payout.list("-created_date", 100),
  });

  const isLoading = loadingLinks || loadingPayouts;
  const queryClient = useQueryClient();
  const { onTouchStart, onTouchMove, onTouchEnd, pullDistance, pulling } = usePullToRefresh(() =>
    queryClient.invalidateQueries()
  );

  const totalClicks = links.reduce((sum, l) => sum + (l.clicks || 0), 0);
  const totalEarnings = links.reduce((sum, l) => sum + (l.earnings || 0), 0);
  const totalConversions = links.reduce((sum, l) => sum + (l.conversions || 0), 0);
  const totalPaid = payouts.filter(p => p.status === "paid").reduce((sum, p) => sum + (p.amount || 0), 0);

  // Build empty 30-day chart scaffold
  const chartData = Array.from({ length: 30 }, (_, i) => ({
    date: format(subDays(new Date(), 29 - i), "MMM d"),
    clicks: 0,
    earnings: 0,
  }));

  const topLinks = links
    .filter(l => (l.clicks || 0) > 0)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 5)
    .map(l => ({ name: l.product_name || "Unknown", clicks: l.clicks, earnings: l.earnings || 0 }));

  const earningsLinks = links.filter(l => (l.earnings || 0) > 0)
    .map(l => ({ name: l.product_name || "Unknown", earnings: l.earnings }));

  return (
    <div className="space-y-6" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="ptr-indicator" style={{ height: pullDistance }}>
        <RefreshCw className={`w-5 h-5 text-violet-400 transition-transform ${pulling ? "animate-spin" : ""}`} style={{ transform: `rotate(${pullDistance * 2}deg)` }} />
      </div>
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">Your performance at a glance</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Clicks", value: totalClicks.toLocaleString() },
          { label: "Total Earnings", value: `$${totalEarnings.toFixed(2)}` },
          { label: "Conversions", value: totalConversions.toLocaleString() },
          { label: "Total Paid Out", value: `$${totalPaid.toFixed(2)}` },
        ].map(({ label, value }) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold font-display mt-1">{isLoading ? "..." : value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Clicks Over Time (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64" /> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="clicksGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(245, 35%, 24%)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(245, 20%, 65%)" interval={6} />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(245, 20%, 65%)" />
                  <Tooltip contentStyle={{ background: "hsl(245, 42%, 17%)", border: "none", borderRadius: "12px", color: "#fff", fontSize: "13px" }} />
                  <Area type="monotone" dataKey="clicks" stroke={COLORS[0]} fill="url(#clicksGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="font-display text-lg">Top Links by Clicks</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-56" /> : topLinks.length > 0 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topLinks} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(245, 35%, 24%)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(245, 20%, 65%)" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(245, 20%, 65%)" />
                    <Tooltip contentStyle={{ background: "hsl(245, 42%, 17%)", border: "none", borderRadius: "12px", color: "#fff", fontSize: "13px" }} />
                    <Bar dataKey="clicks" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                No click data yet — share your links to start tracking!
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-display text-lg">Earnings by Product</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-56" /> : earningsLinks.length > 0 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={earningsLinks} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="earnings" nameKey="name" paddingAngle={4}>
                      {earningsLinks.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(245, 42%, 17%)", border: "none", borderRadius: "12px", color: "#fff", fontSize: "13px" }} formatter={(v) => `$${Number(v).toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                No earnings recorded yet — your first dollar is coming!
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {links.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="font-display text-lg">All Links Performance</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {links.map(link => (
                <div key={link.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 text-sm">
                  <span className="font-medium truncate max-w-[40%]">{link.product_name || link.short_code}</span>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{link.clicks || 0} clicks</span>
                    <span>{link.conversions || 0} conv.</span>
                    <span className="text-emerald-500 font-medium">${(link.earnings || 0).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}