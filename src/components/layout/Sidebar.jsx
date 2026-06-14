import React from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, Link2, Package, Megaphone, 
  BarChart3, Wallet, X, Zap, Crown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Products", icon: Package, path: "/products" },
  { label: "Links", icon: Link2, path: "/links" },
  { label: "Campaigns", icon: Megaphone, path: "/campaigns" },
  { label: "Analytics", icon: BarChart3, path: "/analytics" },
  { label: "Payouts", icon: Wallet, path: "/payouts" },
  { label: "AutoPilot Studio", icon: Zap, path: "/autopilot" },
];

export default function Sidebar({ open, onClose }) {
  const location = useLocation();
  const { user } = useAuth();

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" 
          onClick={onClose} 
        />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-64 z-50 flex flex-col transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        style={{
          background: "linear-gradient(180deg, #1a0f45 0%, #0f0c29 100%)",
          borderRight: "1px solid rgba(167,139,250,0.2)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between p-6 border-b border-sidebar-border">
          <Link to="/" className="flex items-center gap-2.5">
            <img 
              src="https://media.base44.com/images/public/6a2a72a46235784f879b968c/f664aa924_Screenshot_20260612_052424_Photos.jpg"
              alt="AmHere4UToday logo"
              className="w-10 h-10 rounded-full object-cover flex-shrink-0 shadow-lg"
              style={{ border: "2px solid rgba(124,58,237,0.5)" }}
            />
            <div className="flex flex-col leading-none">
              <span className="font-display text-base font-bold text-sidebar-foreground tracking-tight">
                Affiliate Pro<span className="text-primary ml-0.5">X</span>
              </span>
              <span className="text-[10px] text-sidebar-foreground/40 tracking-wide mt-0.5">amhere4utoday.com</span>
            </div>
          </Link>
          <button onClick={onClose} className="lg:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "text-white shadow-lg"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                )}
                style={isActive ? { background: "linear-gradient(90deg, rgba(124,58,237,0.6), rgba(245,158,11,0.3))", borderLeft: "3px solid #f59e0b" } : {}}
              >
                <item.icon className="w-4.5 h-4.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Admin link */}
        {user?.role === "admin" && (
          <div className="px-3 pb-2">
            <Link
              to="/admin"
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                location.pathname === "/admin"
                  ? "text-white shadow-lg"
                  : "text-yellow-400/70 hover:text-yellow-300 hover:bg-yellow-400/10"
              )}
              style={location.pathname === "/admin" ? { background: "linear-gradient(90deg, rgba(245,158,11,0.4), rgba(124,58,237,0.3))", borderLeft: "3px solid #f59e0b" } : {}}
            >
              <Crown className="w-4 h-4" />
              Admin Panel
            </Link>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.25), rgba(245,158,11,0.1))", border: "1px solid rgba(245,158,11,0.2)" }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-sidebar-foreground">💙 Our Mission</span>
            </div>
            <p className="text-xs text-sidebar-foreground/60 leading-relaxed">
              Built for veterans, disabled individuals, single parents, and anyone facing hardship — real income, fully automated, no experience needed.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}