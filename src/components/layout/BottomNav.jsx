import React from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Package, Link2, BarChart3, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Products", icon: Package, path: "/products" },
  { label: "Links", icon: Link2, path: "/links" },
  { label: "Analytics", icon: BarChart3, path: "/analytics" },
  { label: "AutoPilot", icon: Zap, path: "/autopilot" },
];

export default function BottomNav() {
  const location = useLocation();

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around"
      style={{
        background: "rgba(10,8,30,0.97)",
        borderTop: "1px solid rgba(167,139,250,0.2)",
        paddingBottom: "env(safe-area-inset-bottom)",
        backdropFilter: "blur(20px)",
      }}
    >
      {navItems.map(({ label, icon: Icon, path }) => {
        const isActive = location.pathname === path;
        return (
          <Link
            key={path}
            to={path}
            className="flex flex-col items-center justify-center flex-1 py-2 gap-1 transition-all"
            style={{ minHeight: 56, userSelect: "none", WebkitUserSelect: "none" }}
          >
            <Icon
              className={cn("w-5 h-5 transition-colors", isActive ? "text-violet-400" : "text-slate-500")}
            />
            <span
              className={cn("text-[10px] font-medium transition-colors", isActive ? "text-violet-400" : "text-slate-500")}
            >
              {label}
            </span>
            {isActive && (
              <span
                className="absolute bottom-0 w-6 h-0.5 rounded-full"
                style={{ background: "linear-gradient(90deg, #7c3aed, #f59e0b)" }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}