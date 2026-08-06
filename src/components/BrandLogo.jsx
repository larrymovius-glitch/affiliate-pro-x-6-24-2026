import React from "react";

export default function BrandLogo({ className = "" }) {
  return (
    <div
      className={`flex shrink-0 flex-col items-center justify-center rounded-2xl text-center ${className}`}
      style={{
        background: "linear-gradient(145deg, rgba(15,12,41,0.92), rgba(49,46,129,0.72))",
        border: "2px solid rgba(167,139,250,0.7)",
        boxShadow: "0 0 20px rgba(124,58,237,0.55)",
      }}
      aria-label="apx.amhere4utoday.com Alaska"
    >
      <span
        className="font-display text-[10px] font-extrabold leading-none tracking-tight"
        style={{ background: "linear-gradient(90deg, #c084fc, #f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
      >
        apx.amhere4utoday.com
      </span>
      <span
        className="font-display text-[10px] font-extrabold leading-none tracking-tight mt-1"
        style={{ background: "linear-gradient(90deg, #c084fc, #f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
      >
        Alaska
      </span>
    </div>
  );
}