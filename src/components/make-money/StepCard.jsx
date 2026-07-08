import React from "react";
import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function StepCard({ number, title, description, complete, children }) {
  return (
    <Card className="p-5 border-primary/15 bg-card/95">
      <div className="flex gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
          {complete ? <CheckCircle2 className="h-5 w-5" /> : number}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-bold text-foreground">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </Card>
  );
}