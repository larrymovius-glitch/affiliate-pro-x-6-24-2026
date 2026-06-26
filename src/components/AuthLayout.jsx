import React from "react";
import { Heart } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div
      className="dark min-h-screen flex flex-col items-center justify-center px-4 py-10"
      style={{
        background: "linear-gradient(160deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
      }}
    >
      {/* Brand Title */}
      <div className="text-center mb-2">
        <div className="mb-1">
          <span
            className="font-display text-3xl font-extrabold tracking-tight"
            style={{ background: "linear-gradient(90deg, #c084fc, #f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
          >
            Affiliate Pro
          </span>
          <span
            className="font-display text-3xl font-extrabold ml-0.5"
            style={{ background: "linear-gradient(90deg, #f59e0b, #fbbf24)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
          >
            X
          </span>
        </div>
      </div>

      {/* Welcome heading */}
      <div className="text-center mb-6">
        <h1
          className="text-5xl font-extrabold font-display leading-tight"
          style={{ background: "linear-gradient(90deg, #c084fc 0%, #f59e0b 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
        >
          {title}
        </h1>
        {subtitle && <p className="text-slate-300 text-base mt-2">{subtitle}</p>}
      </div>

      {/* Mission Banner */}
      <div className="w-full max-w-md mb-5">
        <div
          className="rounded-2xl p-4 flex items-center gap-4"
          style={{
            background: "linear-gradient(135deg, rgba(124,58,237,0.25) 0%, rgba(30,27,75,0.7) 100%)",
            border: "1px solid rgba(167,139,250,0.35)",
            boxShadow: "0 0 24px rgba(124,58,237,0.2)",
          }}
        >
          <BrandLogo className="w-20 h-20" />
          <div
            className="rounded-xl px-4 py-3 flex items-start gap-2"
            style={{ background: "rgba(15,12,41,0.7)", border: "1px solid rgba(167,139,250,0.25)" }}
          >
            <Heart className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-300 leading-relaxed">
              <span className="font-bold text-white">Built for those who deserve a break.</span>{" "}
              Veterans, disabled individuals, single parents, and anyone facing hard times — this platform earns for you, automatically.
            </p>
          </div>
        </div>
      </div>

      {/* Form Card */}
      <div className="w-full max-w-md">
        <div
          className="rounded-2xl p-7"
          style={{
            background: "linear-gradient(145deg, rgba(30,27,75,0.95) 0%, rgba(15,12,41,0.98) 100%)",
            border: "1px solid rgba(167,139,250,0.3)",
            boxShadow: "0 0 40px rgba(124,58,237,0.15), 0 8px 40px rgba(0,0,0,0.5)",
          }}
        >
          {children}
        </div>

        {footer && (
          <p className="text-center text-sm text-slate-400 mt-6 font-medium">{footer}</p>
        )}
      </div>
    </div>
  );
}