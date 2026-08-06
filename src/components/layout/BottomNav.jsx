import React, { useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Link2, BarChart3, Zap, Target } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, root: "/" },
  { label: "Make Money", icon: Target, root: "/make-money" },
  { label: "Links", icon: Link2, root: "/links" },
  { label: "Analytics", icon: BarChart3, root: "/analytics" },
  { label: "AutoPilot", icon: Zap, root: "/autopilot" },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  // Store the last visited path within each tab's section
  const lastPaths = useRef({});

  // Record the current path for whichever tab section we're in
  const currentTab = navItems.find(item =>
    location.pathname === item.root || location.pathname.startsWith(item.root + "/")
  );
  if (currentTab) {
    lastPaths.current[currentTab.root] = location.pathname;
  }

  const handleTabPress = (item) => {
    const currentRoot = navItems.find(n =>
      location.pathname === n.root || location.pathname.startsWith(n.root + "/")
    );
    // If already on this tab, go to its root (reset)
    if (currentRoot?.root === item.root) {
      navigate(item.root);
    } else {
      // Restore last visited path within this tab, or fall back to root
      const restored = lastPaths.current[item.root] || item.root;
      navigate(restored);
    }
  };

  const isActive = (item) =>
    location.pathname === item.root || location.pathname.startsWith(item.root + "/");

  return (
    <nav
      aria-label="Main mobile navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around"
      style={{
        background: "rgba(10,8,30,0.97)",
        borderTop: "1px solid rgba(167,139,250,0.2)",
        paddingBottom: "env(safe-area-inset-bottom)",
        backdropFilter: "blur(20px)",
      }}
    >
      {navItems.map((item) => {
        const active = isActive(item);
        const Icon = item.icon;
        return (
          <button
            key={item.root}
            onClick={() => handleTabPress(item)}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className="relative flex flex-col items-center justify-center flex-1 py-2 gap-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
            style={{ minHeight: 56, userSelect: "none", WebkitUserSelect: "none" }}
          >
            <Icon className={cn("w-5 h-5 transition-colors", active ? "text-violet-400" : "text-slate-500")} />
            <span className={cn("text-[10px] font-medium transition-colors", active ? "text-violet-400" : "text-slate-500")}>
              {item.label}
            </span>
            {active && (
              <span
                className="absolute bottom-0 w-6 h-0.5 rounded-full"
                style={{ background: "linear-gradient(90deg, #7c3aed, #f59e0b)" }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}