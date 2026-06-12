import React from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp } from "lucide-react";

export default function PerformanceChart({ data, isLoading }) {
  const chartData = data?.length ? data : [
    { date: "Mon", clicks: 0, earnings: 0 },
    { date: "Tue", clicks: 0, earnings: 0 },
    { date: "Wed", clicks: 0, earnings: 0 },
    { date: "Thu", clicks: 0, earnings: 0 },
    { date: "Fri", clicks: 0, earnings: 0 },
    { date: "Sat", clicks: 0, earnings: 0 },
    { date: "Sun", clicks: 0, earnings: 0 },
  ];

  return (
    <div
      className="rounded-2xl p-6"
      style={{
        background: "linear-gradient(135deg, rgba(30,20,80,0.9) 0%, rgba(15,12,41,0.95) 100%)",
        border: "1px solid rgba(167,139,250,0.2)",
        boxShadow: "0 4px 32px rgba(124,58,237,0.1)",
      }}
    >
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.4), rgba(245,158,11,0.25))", border: "1px solid rgba(245,158,11,0.3)" }}
        >
          <TrendingUp className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h3 className="font-display font-bold text-white text-base">Performance Overview</h3>
          <p className="text-xs text-slate-400">Clicks & earnings trend</p>
        </div>
        <div className="ml-auto flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />Clicks</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Earnings</span>
        </div>
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <defs>
                <linearGradient id="clickGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="earningsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(167,139,250,0.1)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} stroke="rgba(167,139,250,0.15)" />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} stroke="rgba(167,139,250,0.15)" />
              <Tooltip
                contentStyle={{
                  background: "rgba(15,12,41,0.98)",
                  border: "1px solid rgba(167,139,250,0.3)",
                  borderRadius: "12px",
                  color: "#fff",
                  fontSize: "13px",
                  boxShadow: "0 8px 32px rgba(124,58,237,0.3)",
                }}
              />
              <Area type="monotone" dataKey="clicks" stroke="#a78bfa" fill="url(#clickGrad)" strokeWidth={2.5} />
              <Area type="monotone" dataKey="earnings" stroke="#f59e0b" fill="url(#earningsGrad)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}