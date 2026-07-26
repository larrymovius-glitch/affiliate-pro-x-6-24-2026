import React from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { COLORS } from "./dash-theme";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function WaveLogo() {
  return (
    <div className="logo flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: 12, background: `linear-gradient(135deg, ${COLORS.tide} 0%, ${COLORS.tideDeep} 100%)` }} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" style={{ width: 22, height: 22 }}>
        <path d="M2 15c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3" stroke="#07131E" strokeWidth="2" strokeLinecap="round" />
        <path d="M2 20c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3" stroke="#07131E" strokeWidth="2" strokeLinecap="round" opacity=".55" />
      </svg>
    </div>
  );
}

export default function DashboardHeader({ user, weekChange = 0 }) {
  const firstName = user?.full_name?.split(" ")[0] || "there";
  const initials = user?.full_name
    ? user.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";
  const subtitle = weekChange >= 0
    ? "The tide is rising — earnings are up this week."
    : "Earnings dipped this week — cast another line.";

  return (
    <>
      <header className="flex items-center justify-between mb-7">
        <div className="flex items-center gap-3">
          <WaveLogo />
          <div>
            <h1 className="font-semibold tracking-tight" style={{ fontFamily: COLORS.fontDisplay, fontSize: 17, color: COLORS.foam }}>{`Affiliate Pro X`}</h1>
            <p className="text-xs" style={{ color: COLORS.faint }}>amhere4utoday.com</p>
          </div>
        </div>
        <Avatar className="border" style={{ width: 38, height: 38, borderColor: "rgba(56,196,176,.25)" }}>
          <AvatarFallback className="font-semibold" style={{ background: COLORS.ocean600, color: COLORS.tide, fontFamily: COLORS.fontDisplay, fontSize: 13 }}>
            {initials}
          </AvatarFallback>
        </Avatar>
      </header>

      <div className="greet mb-6">
        <h2 className="font-semibold" style={{ fontFamily: COLORS.fontDisplay, fontSize: 24, color: COLORS.foam }}>
          {greeting()}, {firstName}
        </h2>
        <p className="mt-1 text-sm" style={{ color: COLORS.mist }}>{subtitle}</p>
      </div>
    </>
  );
}