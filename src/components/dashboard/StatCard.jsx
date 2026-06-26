import React from "react";
import { cn } from "@/lib/utils";

export default function StatCard({ label, value, icon: Icon, trend, trendUp, className }) {
  return (
    <div
      className={cn("p-5 relative overflow-hidden rounded-2xl group cursor-default bg-card text-card-foreground border border-border shadow-sm transition-shadow hover:shadow-lg", className)}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium tracking-wide uppercase">{label}</p>
          <p className="text-3xl font-extrabold font-display mt-2 tracking-tight text-card-foreground">
            {value}
          </p>
          {trend && (
            <p className={cn("text-xs font-semibold mt-2", trendUp ? "text-emerald-400" : "text-red-400")}>
              {trendUp ? "↑" : "↓"} {trend}
            </p>
          )}
        </div>
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(245,158,11,0.2))", border: "1px solid rgba(245,158,11,0.3)" }}
        >
          <Icon className="w-5 h-5 text-amber-400" />
        </div>
      </div>
      {/* Bottom shimmer on hover */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: "linear-gradient(90deg, #7c3aed, #f59e0b)" }} />
    </div>
  );
}