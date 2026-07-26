import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Link2, BarChart3, Wallet, Sparkles } from "lucide-react";
import { COLORS } from "./dash-theme";

const outlined = "border-white/15 bg-transparent text-white hover:bg-white/5 hover:text-white";

export default function QuickActions({ onAskMaya }) {
  return (
    <div
      className="rounded-2xl p-6 transition-transform hover:-translate-y-0.5"
      style={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}` }}
    >
      <h3 className="font-display text-base font-bold" style={{ color: COLORS.text }}>Quick actions</h3>
      <p className="text-xs mt-0.5" style={{ color: COLORS.muted }}>One tap to keep moving</p>
      <div className="mt-5 flex flex-col gap-3">
        <Button asChild className="h-12 text-sm font-semibold border-0" style={{ background: `linear-gradient(90deg, ${COLORS.teal}, #2BA89A)`, color: "#0B1B2B" }}>
          <Link to="/make-money"><Link2 className="h-4 w-4 mr-2" />Create tracking link</Link>
        </Button>
        <Button asChild variant="outline" className={`h-12 text-sm font-medium ${outlined}`}>
          <Link to="/analytics"><BarChart3 className="h-4 w-4 mr-2" />View full analytics</Link>
        </Button>
        <Button asChild variant="outline" className={`h-12 text-sm font-medium ${outlined}`}>
          <Link to="/payouts"><Wallet className="h-4 w-4 mr-2" />Request payout</Link>
        </Button>
        <Button variant="outline" className={`h-12 text-sm font-medium ${outlined}`} onClick={onAskMaya}>
          <Sparkles className="h-4 w-4 mr-2" />Ask Maya
        </Button>
      </div>
    </div>
  );
}