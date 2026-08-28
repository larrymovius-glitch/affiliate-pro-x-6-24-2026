import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Link2, Package, Megaphone,
  BarChart3, Wallet, X, Zap, Crown, Shield, FileText, Instagram, Target, Radar, Globe2, ClipboardList, ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Make Money", icon: Target, path: "/make-money" },
  { label: "Products", icon: Package, path: "/products" },
  { label: "Links", icon: Link2, path: "/links" },
  { label: "Campaigns", icon: Megaphone, path: "/campaigns" },
  { label: "Analytics", icon: BarChart3, path: "/analytics" },
  { label: "Payouts", icon: Wallet, path: "/payouts" },
  { label: "AutoPilot Studio", icon: Zap, path: "/autopilot" },
  { label: "Ad Tracker", icon: Radar, path: "/ad-tracker" },
  { label: "Social Connect", icon: Instagram, path: "/social" },
  { label: "Networks", icon: Globe2, path: "/networks" },
  { label: "Application Profile", icon: ClipboardList, path: "/application-profile" },
  { label: "Pricing", icon: Crown, path: "/pricing" },
];

export default function Sidebar({ open, onClose }) {
  const location = useLocation();
  const { user } = useAuth();
  const navRef = useRef(null);
  // The nav list scrolls independently of the page, with no visual cue that
  // it does -- Admin Panel sits directly below it and reads as the list's
  // natural end, so items further down (Networks among them) went unnoticed
  // entirely. This tracks whether there's more to scroll to and only shows
  // the hint while that's true, same as the fade you'd see at the bottom of
  // a scrollable menu anywhere else.
  const [hasMoreBelow, setHasMoreBelow] = useState(false);

  const updateScrollHint = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    setHasMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  }, []);

  useEffect(() => {
    updateScrollHint();
    window.addEventListener("resize", updateScrollHint);
    return () => window.removeEventListener("resize", updateScrollHint);
  }, [updateScrollHint]);

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
          "fixed top-0 left-0 h-full w-64 z-50 flex flex-col transition-transform duration-300 ease-out bg-sidebar text-sidebar-foreground border-r border-sidebar-border",
          open ? "translate-x-0" : "-translate-x-full"
        )}
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
          <button onClick={onClose} aria-label="Close navigation menu" className="lg:hidden min-h-11 min-w-11 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
            <X className="w-5 h-5 mx-auto" />
          </button>
        </div>

        {/* Navigation */}
        <div className="relative flex-1 min-h-0">
          <nav
            ref={navRef}
            onScroll={updateScrollHint}
            className="h-full py-4 px-3 space-y-1 overflow-y-auto"
          >
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
          {hasMoreBelow && (
            <div
              className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 flex items-end justify-center pb-1"
              style={{ background: "linear-gradient(to bottom, transparent, hsl(var(--sidebar-background)) 75%)" }}
            >
              <ChevronDown className="w-4 h-4 text-sidebar-foreground/50 animate-bounce" />
            </div>
          )}
        </div>

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

        {/* Legal links */}
        <div className="px-3 pb-4 pt-2 border-t border-sidebar-border mt-2">
          <p className="text-xs text-sidebar-foreground/50 mb-2">Legal</p>
          <Link
            to="/privacy-policy"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
          >
            <Shield className="w-4 h-4" />
            Privacy Policy
          </Link>
          <Link
            to="/terms-of-service"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
          >
            <FileText className="w-4 h-4" />
            Terms of Service
          </Link>
        </div>

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