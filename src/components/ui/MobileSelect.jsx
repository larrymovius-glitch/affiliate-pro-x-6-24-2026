/**
 * MobileSelect — renders a native bottom-sheet Drawer on mobile,
 * and the standard shadcn Select on desktop.
 *
 * Props mirror shadcn Select:
 *   value, onValueChange, placeholder, options: [{value, label}]
 *   + any className for the trigger
 */
import React, { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

function useIsMobile() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
}

export default function MobileSelect({ value, onValueChange, placeholder, options = [], className, label }) {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const selectedLabel = options.find(o => o.value === value)?.label;

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          style={{ userSelect: "none" }}
        >
          <span className={selectedLabel ? "text-foreground" : "text-muted-foreground"}>
            {selectedLabel || placeholder || "Select..."}
          </span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="opacity-50 shrink-0">
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerContent>
            {label && (
              <DrawerHeader className="pb-2">
                <DrawerTitle className="text-base font-display">{label}</DrawerTitle>
              </DrawerHeader>
            )}
            <div className="px-4 pb-6 space-y-1" style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}>
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onValueChange(opt.value); setDrawerOpen(false); }}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                    value === opt.value
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted text-foreground"
                  )}
                  style={{ minHeight: 48, userSelect: "none" }}
                >
                  {opt.label}
                  {value === opt.value && <Check className="w-4 h-4 shrink-0" />}
                </button>
              ))}
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}