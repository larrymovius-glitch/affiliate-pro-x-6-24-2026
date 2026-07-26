import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

export default function EarningsHero({ totalEarnings = 0, percentChange = 0 }) {
  const isPositive = percentChange >= 0;
  const badge = `${isPositive ? "+" : ""}${percentChange.toFixed(1)}%`;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-slate-950 via-violet-950 to-slate-900 p-8 text-white shadow-xl shadow-primary/10">
      <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-amber-400/20 blur-3xl" />
      <div className="absolute -bottom-20 left-8 h-48 w-48 rounded-full bg-violet-500/25 blur-3xl" />
      <div className="relative z-10">
        <p className="text-sm font-medium text-white/70">Total Earnings</p>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <h1 className="font-display text-5xl font-black tracking-tight md:text-6xl">
            ${totalEarnings.toFixed(2)}
          </h1>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold",
              isPositive ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
            )}
          >
            {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {badge}
          </span>
        </div>
        <p className="mt-3 text-xs text-white/60">vs previous 30 days</p>
      </div>
    </section>
  );
}