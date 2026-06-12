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
          <img
            src="https://media.base44.com/images/public/6a2a72a46235784f879b968c/f664aa924_Screenshot_20260612_052424_Photos.jpg"
            alt="AmHere4UToday logo"
            className="w-24 h-24 rounded-full object-cover mb-4 shadow-2xl"
            style={{ border: "3px solid rgba(124,58,237,0.6)", boxShadow: "0 0 30px rgba(124,58,237,0.4)" }}
          />
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