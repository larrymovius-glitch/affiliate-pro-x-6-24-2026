import React from "react";
import { Link } from "react-router-dom";
import { Link2, BarChart3, Wallet, Sparkles } from "lucide-react";
import { COLORS } from "./dash-theme";

function ActionBtn({ icon: Icon, title, subtitle, primary, to, onClick }) {
  const inner = (
    <>
      <span className="flex items-center justify-center shrink-0" style={{ width: 34, height: 34, borderRadius: 10, background: primary ? "rgba(7,19,30,.18)" : "rgba(56,196,176,.12)" }}>
        <Icon style={{ width: 17, height: 17, color: primary ? COLORS.ocean900 : COLORS.tide }} />
      </span>
      <span className="flex flex-col">
        <b className="font-medium" style={{ color: primary ? COLORS.ocean900 : COLORS.foam, fontSize: "13.5px" }}>{title}</b>
        <small style={{ color: primary ? "rgba(7,19,30,.65)" : COLORS.faint, fontSize: "11.5px" }}>{subtitle}</small>
      </span>
    </>
  );
  const style = primary
    ? { background: `linear-gradient(135deg, ${COLORS.tideDeep}, ${COLORS.tide})`, border: "none", color: COLORS.ocean900 }
    : { background: COLORS.ocean700, border: "1px solid rgba(157,180,196,.12)", color: COLORS.foam };
  const cls = "flex items-center gap-3 w-full text-left rounded-xl mb-2.5 transition-colors";
  const hover = primary ? "" : "hover:!border-[#38C4B0] hover:!bg-[#16324B]";
  if (to) {
    return (
      <Link to={to} className={`${cls} ${hover}`} style={{ ...style, padding: "13px 16px" }} onMouseEnter={(e) => { if (!primary) { e.currentTarget.style.borderColor = COLORS.tide; e.currentTarget.style.background = COLORS.ocean600; } }} onMouseLeave={(e) => { if (!primary) { e.currentTarget.style.borderColor = "rgba(157,180,196,.12)"; e.currentTarget.style.background = COLORS.ocean700; } }}>
        {inner}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={`${cls} ${hover}`} style={{ ...style, padding: "13px 16px", cursor: "pointer" }} onMouseEnter={(e) => { if (!primary) { e.currentTarget.style.borderColor = COLORS.tide; e.currentTarget.style.background = COLORS.ocean600; } }} onMouseLeave={(e) => { if (!primary) { e.currentTarget.style.borderColor = "rgba(157,180,196,.12)"; e.currentTarget.style.background = COLORS.ocean700; } }}>
      {inner}
    </button>
  );
}

export default function QuickActions({ onAskMaya, pendingAmount = 0 }) {
  return (
    <div className="card" style={{ background: COLORS.ocean800, border: `1px solid ${COLORS.cardBorder}`, borderRadius: COLORS.radius, padding: "20px 22px" }}>
      <h3 className="mb-3.5" style={{ fontFamily: COLORS.fontDisplay, fontSize: 14, fontWeight: 600, color: COLORS.foam }}>Quick actions</h3>
      <ActionBtn icon={Link2} title="Create tracking link" subtitle="Turn any product into money" primary to="/make-money" />
      <ActionBtn icon={BarChart3} title="View full analytics" subtitle="Clicks, sources, devices" to="/analytics" />
      <ActionBtn icon={Wallet} title="Request payout" subtitle={`$${pendingAmount.toFixed(2)} available soon`} to="/payouts" />
      <ActionBtn icon={Sparkles} title="Ask Maya" subtitle="Your AI assistant is listening" onClick={onAskMaya} />
    </div>
  );
}