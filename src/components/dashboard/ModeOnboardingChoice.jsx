import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BarChart3, GraduationCap } from "lucide-react";

export default function ModeOnboardingChoice({ onChoose }) {
  return (
    <Card className="p-6 border-primary/20 bg-primary/5">
      <p className="text-sm font-semibold text-primary">Choose your experience level</p>
      <h2 className="mt-2 font-display text-2xl font-bold">How much control do you want?</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <button onClick={() => onChoose("standard")} className="rounded-2xl border bg-background p-5 text-left transition hover:border-primary/50">
          <GraduationCap className="h-7 w-7 text-primary" />
          <h3 className="mt-3 font-display text-xl font-bold">Show me the basics</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Big actions, simple numbers, and clear next steps.</p>
        </button>
        <button onClick={() => onChoose("pro")} className="rounded-2xl border bg-background p-5 text-left transition hover:border-primary/50">
          <BarChart3 className="h-7 w-7 text-primary" />
          <h3 className="mt-3 font-display text-xl font-bold">Give me full control</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Dense analytics, EPC, traffic sources, and campaign breakdowns.</p>
        </button>
      </div>
      <Button variant="ghost" className="mt-4" onClick={() => onChoose("standard")}>I’ll start simple for now</Button>
    </Card>
  );
}