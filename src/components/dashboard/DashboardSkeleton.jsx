import React from "react";

function Shimmer({ className = "", style = {} }) {
  return <div className={`animate-pulse rounded-2xl ${className}`} style={{ background: "rgba(255,255,255,0.05)", ...style }} />;
}

export default function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shimmer className="w-10 h-10 rounded-xl" />
          <Shimmer className="w-32 h-6 rounded-md" />
        </div>
        <Shimmer className="w-10 h-10 rounded-full" />
      </div>
      <Shimmer className="w-64 h-8 rounded-md" />
      <Shimmer className="w-full h-44 rounded-2xl" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Shimmer key={i} className="w-full h-28 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Shimmer className="w-full h-64 rounded-2xl" />
        <Shimmer className="w-full h-64 rounded-2xl" />
      </div>
    </div>
  );
}