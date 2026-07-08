import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Link2, Sparkles, Zap } from "lucide-react";

export default function DashboardHero({ totalEarnings = 0 }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-slate-950 via-violet-950 to-slate-900 p-6 text-white shadow-xl shadow-primary/10">
      <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-amber-400/20 blur-3xl" />
      <div className="absolute -bottom-20 left-8 h-48 w-48 rounded-full bg-violet-500/25 blur-3xl" />
      <div className="relative z-10 grid gap-6 lg:grid-cols-[1.3fr_0.7fr] lg:items-center">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
            <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Veteran Income Mission Control
          </div>
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-5xl">Make today simple: create, share, earn.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 md:text-base">Affiliate Pro X now focuses on the next money-making action, real tracking, and beginner-friendly steps.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild className="h-12 bg-amber-400 text-slate-950 hover:bg-amber-300">
              <Link to="/make-money"><Link2 className="mr-2 h-4 w-4" /> Start Make Money Flow</Link>
            </Button>
            <Button asChild variant="outline" className="h-12 border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white">
              <Link to="/autopilot"><Zap className="mr-2 h-4 w-4" /> Generate Posts</Link>
            </Button>
          </div>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-xl">
          <p className="text-sm text-white/60">Current tracked earnings</p>
          <p className="mt-2 font-display text-4xl font-black">${totalEarnings.toFixed(2)}</p>
          <p className="mt-2 text-xs leading-5 text-white/65">Every shared link should now use your tracker so clicks and sales can feed the dashboard.</p>
        </div>
      </div>
    </section>
  );
}