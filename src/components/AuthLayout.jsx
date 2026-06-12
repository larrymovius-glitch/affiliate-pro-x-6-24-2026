import React from "react";
import { Heart } from "lucide-react";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="dark min-h-screen flex flex-col items-center justify-center bg-background px-4 py-10">
      {/* Mission Banner */}
      <div className="w-full max-w-md mb-6">
        <div className="rounded-2xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 px-5 py-3 flex items-center gap-3">
          <Heart className="w-4 h-4 text-primary shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">Built for those who deserve a break.</span>{" "}
            Veterans, disabled individuals, single parents, and anyone facing hard times — this platform earns for you, automatically.
          </p>
        </div>
      </div>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 shadow-2xl shadow-purple-900/60 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 60%, #6d28d9 100%)" }}>
            {/* Shine overlay */}
            <div className="absolute inset-0 opacity-30" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 60%)" }} />
            {/* Wave decoration */}
            <div className="absolute bottom-0 left-0 right-0 h-6 opacity-20" style={{ background: "radial-gradient(ellipse at 50% 100%, #a78bfa 0%, transparent 70%)" }} />
            <span className="relative font-black text-white text-3xl leading-none tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif", textShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
              A<span className="text-lg align-super" style={{ fontSize: "0.55em", lineHeight: 1 }}>+</span>
            </span>
          </div>
          <div className="mb-1">
            <span className="font-display text-2xl font-bold text-foreground tracking-tight">Affiliate Pro</span>
            <span className="text-primary font-display font-bold text-2xl ml-0.5">X</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground mt-2">{title}</h1>
          {subtitle && <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>}
        </div>

        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          {children}
        </div>

        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}