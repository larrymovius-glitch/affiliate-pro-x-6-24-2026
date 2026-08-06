import React from "react";

function Shimmer({ className = "", style = {} }) {
  return <div className={`dash-shimmer rounded-lg ${className}`} style={style} />;
}

export default function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-7">
        <div className="flex items-center gap-3">
          <Shimmer style={{ width: 40, height: 40, borderRadius: 12 }} />
          <Shimmer style={{ width: 140, height: 18 }} />
        </div>
        <Shimmer style={{ width: 38, height: 38, borderRadius: "50%" }} />
      </div>
      <Shimmer style={{ width: 240, height: 26 }} />
      <Shimmer style={{ width: 180, height: 14 }} />
      <div style={{ height: 220, borderRadius: 20, border: "1px solid rgba(56,196,176,.18)", background: "rgba(16,37,57,0.4)" }} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} style={{ height: 104, borderRadius: 16, background: "rgba(11,27,43,0.6)", border: "1px solid rgba(157,180,196,0.1)" }} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        <div style={{ height: 240, borderRadius: 16, background: "rgba(11,27,43,0.6)", border: "1px solid rgba(157,180,196,0.1)" }} />
        <div style={{ height: 240, borderRadius: 16, background: "rgba(11,27,43,0.6)", border: "1px solid rgba(157,180,196,0.1)" }} />
      </div>
    </div>
  );
}