import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, ShieldCheck } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";

export default function Splash() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
    setTimeout(() => navigate("/login"), 3500);
  }, [navigate]);

  return (
    <div className="fixed inset-0 bg-background text-foreground flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -right-24 w-96 h-96 bg-primary/15 rounded-full blur-[110px]" />
        <div className="absolute -bottom-36 -left-24 w-[520px] h-[520px] bg-accent/12 rounded-full blur-[130px]" />
        <div className="absolute inset-x-8 top-10 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      </div>

      <div
        className="relative w-[min(92vw,680px)] rounded-[2rem] bg-card/85 backdrop-blur-2xl shadow-2xl shadow-primary/10 ring-1 ring-border px-7 py-10 sm:px-12 sm:py-12 transition-all duration-1000"
        style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(24px)" }}
      >
        <BrandLogo className="mx-auto mb-7 w-28 h-20" />

        <div className="text-center">
          <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.35em] text-primary">Affiliate command center</p>
          <h1 className="font-display text-5xl sm:text-6xl font-bold tracking-tight text-foreground">
            Affiliate Pro<span className="text-primary">X</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground font-body leading-relaxed">
            A polished workspace for finding products, creating compliant content, and growing affiliate income with AI guidance.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-2xl bg-secondary/70 px-4 py-4 ring-1 ring-border flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-primary" />
            <span className="text-sm font-bold text-foreground">Campaign growth tools</span>
          </div>
          <div className="rounded-2xl bg-secondary/70 px-4 py-4 ring-1 ring-border flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <span className="text-sm font-bold text-foreground">Built-in compliance support</span>
          </div>
        </div>

        <div
          className="mt-8 text-center transition-all duration-1000 delay-700"
          style={{ opacity: visible ? 1 : 0 }}
        >
          <p className="text-sm font-semibold tracking-wide text-muted-foreground">
            Another development by <span className="text-primary font-extrabold">Movius</span>
          </p>
        </div>
      </div>

      <div
        className="absolute bottom-16 w-56 h-1 bg-secondary rounded-full overflow-hidden transition-all duration-700 delay-300 shadow-inner"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <div
          className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
          style={{ animation: "loadBar 3s ease-in-out forwards" }}
        />
      </div>

      <style>{`
        @keyframes loadBar { from { width: 0%; } to { width: 100%; } }
      `}</style>
    </div>
  );
}