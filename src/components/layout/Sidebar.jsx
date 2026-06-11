import React from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, Link2, Package, Megaphone, 
  BarChart3, Wallet, X, Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Products", icon: Package, path: "/products" },
  { label: "Links", icon: Link2, path: "/links" },
  { label: "Campaigns", icon: Megaphone, path: "/campaigns" },
  { label: "Analytics", icon: BarChart3, path: "/analytics" },
  { label: "Payouts", icon: Wallet, path: "/payouts" },
];

export default function Sidebar({ open, onClose }) {
  const location = useLocation();

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" 
          onClick={onClose} 
        />
      )}

      <aside className={cn(
        "fixed top-0 left-0 h-full w-64 bg-sidebar z-50 flex flex-col transition-transform duration-300 ease-out",
        "lg:translate-x-0 lg:static lg:z-auto",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo */}
        <div className="flex items-center justify-between p-6 border-b border-sidebar-border">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-display text-lg font-bold text-sidebar-foreground tracking-tight">
                Affiliate Pro
              </span>
              <span className="text-primary font-display font-bold text-lg ml-0.5">X</span>
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
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-primary/20"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                )}
              >
                <item.icon className="w-4.5 h-4.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 p-4">
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