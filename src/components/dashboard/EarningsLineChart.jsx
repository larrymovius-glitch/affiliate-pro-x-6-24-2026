import React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function EarningsLineChart({ data = [] }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-8 text-card-foreground shadow-sm">
      <h3 className="font-display text-lg font-bold">Earnings — Last 30 Days</h3>
      <p className="text-sm text-muted-foreground">Daily earnings trend</p>
      <div className="mt-6 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "12px",
                color: "hsl(var(--popover-foreground))",
                fontSize: "13px",
              }}
              formatter={(value) => [`$${Number(value).toFixed(2)}`, "Earnings"]}
            />
            <Line type="monotone" dataKey="earnings" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}