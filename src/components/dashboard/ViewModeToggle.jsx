import React from "react";
import { cn } from "@/lib/utils";

export default function ViewModeToggle({ mode, onChange }) {
  const options = [
    { value: "standard", label: "Standard", help: "Basics" },
    { value: "pro", label: "Pro", help: "Full control" },
  ];

  return (
    <div className="inline-flex rounded-2xl border bg-card p-1 shadow-sm" aria-label="Dashboard view mode">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={mode === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-xl px-4 py-2 text-left transition-all min-w-24",
            mode === option.value ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted"
          )}
        >
          <span className="block text-sm font-bold">{option.label}</span>
          <span className="block text-[11px] opacity-80">{option.help}</span>
        </button>
      ))}
    </div>
  );
}