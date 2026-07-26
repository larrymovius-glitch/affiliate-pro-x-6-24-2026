import React from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import BrandLogo from "@/components/BrandLogo";
import { COLORS } from "./dash-theme";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardHeader({ user }) {
  const firstName = user?.full_name?.split(" ")[0] || "there";
  const initials = user?.full_name
    ? user.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BrandLogo className="w-10 h-10 rounded-xl" />
          <div className="leading-tight">
            <p className="font-display text-base font-bold" style={{ color: COLORS.text }}>Affiliate Pro X</p>
            <p className="text-xs" style={{ color: COLORS.muted }}>Veteran Income Mission Control</p>
          </div>
        </div>
        <Avatar className="w-10 h-10 border border-white/10">
          <AvatarFallback className="text-sm font-bold" style={{ background: COLORS.teal, color: "#0B1B2B" }}>
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
      <h1 className="mt-5 font-display text-2xl md:text-3xl font-bold" style={{ color: COLORS.text }}>
        {greeting()}, <span style={{ color: COLORS.teal }}>{firstName}</span>
      </h1>
    </div>
  );
}