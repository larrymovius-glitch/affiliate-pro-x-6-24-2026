import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { analyticsAPI } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = ["hsl(217, 91%, 60%)", "hsl(262, 83%, 58%)", "hsl(160, 84%, 39%)", "hsl(38, 92%, 50%)", "hsl(0, 84%, 60%)"];

export default function Analytics() {
  const [period, setPeriod] = useState("30d");

  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ["analytics-overview", period],
    queryFn: async () => {
      const res = await analyticsAPI.overview({ period });
      return res.data?.data || res.data || {};
    },
  });

  const { data: chartData, isLoading: loadingChart } = useQuery({
    queryKey: ["analytics-chart", period],
    queryFn: async () => {
      const res = await analyticsAPI.chartData({ period });
      return res.data?.data || res.data || [];
    },
  });

  const timeSeriesData = Array.isArray(chartData) ? chartData : chartData?.time_series || [];
  const topProducts = overview?.top_products || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">Deep dive into your performance data</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
            <SelectItem value="90d">Last 90 Days</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Clicks Over Time */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Clicks Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingChart ? (
            <Skeleton className="h-64" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeriesData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="clicksGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(220, 9%, 46%)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(220, 9%, 46%)" />
                  <Tooltip contentStyle={{ background: "hsl(222, 47%, 11%)", border: "none", borderRadius: "12px", color: "#fff", fontSize: "13px" }} />
                  <Area type="monotone" dataKey="clicks" stroke={COLORS[0]} fill="url(#clicksGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Earnings Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Earnings</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingChart ? (
              <Skeleton className="h-56" />
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeSeriesData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(220, 9%, 46%)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(220, 9%, 46%)" />
                    <Tooltip contentStyle={{ background: "hsl(222, 47%, 11%)", border: "none", borderRadius: "12px", color: "#fff", fontSize: "13px" }} />
                    <Bar dataKey="earnings" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Top Products</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingOverview ? (
              <Skeleton className="h-56" />
            ) : topProducts.length > 0 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={topProducts}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      dataKey="clicks"
                      nameKey="name"
                      paddingAngle={4}
                    >
                      {topProducts.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(222, 47%, 11%)", border: "none", borderRadius: "12px", color: "#fff", fontSize: "13px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                No product data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}