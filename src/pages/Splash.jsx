import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Zap } from "lucide-react";

export default function Splash() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
    setTimeout(() => navigate("/login"), 3500);
  }, [navigate]);

  return (
    <div className="fixed inset-0 bg-[hsl(222,47%,6%)] flex flex-col items-center justify-center">
      {/* Glow background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-accent/10 rounded-full blur-[80px]" />
      </div>

      {/* Logo + brand */}
      <div
        className="relative flex flex-col items-center gap-6 transition-all duration-1000"
        style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(24px)" }}
      >
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-2xl shadow-primary/40">
          <Zap className="w-12 h-12 text-white" />
        </div>

        <div className="text-center">
          <h1 className="font-display text-5xl font-bold text-white tracking-tight">
            Affiliate Pro<span className="text-primary">X</span>
          </h1>
          <p className="mt-2 text-lg text-white/50 font-body">Your income. On autopilot.</p>
        </div>

        {/* Gold cursive credit */}
        <div
          className="mt-8 text-center transition-all duration-1000 delay-700"
          style={{ opacity: visible ? 1 : 0 }}
        >
          <p
            className="text-base tracking-wide"
            style={{
              fontFamily: "'Dancing Script', 'Brush Script MT', cursive",
              color: "#D4AF37",
              textShadow: "0 0 20px rgba(212,175,55,0.5)",
            }}
          >
            Another development by Movius
          </p>
        </div>
      </div>

      {/* Loading bar */}
      <div
        className="absolute bottom-16 w-48 h-0.5 bg-white/10 rounded-full overflow-hidden transition-all duration-700 delay-300"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <div
          className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
          style={{
            animation: "loadBar 3s ease-in-out forwards",
          }}
        />
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600;700&display=swap');
        @keyframes loadBar {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}