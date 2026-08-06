import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { actionOptions, labelFor, metricOptions } from "@/components/dashboard/pro-growth/rule-options";

export default function ProRuleList({ rules, onToggle, isUpdating }) {
  if (!rules.length) {
    return <p className="rounded-2xl border bg-background p-4 text-sm text-muted-foreground">No pro rules yet. Save one rule to give autopilot guardrails.</p>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rules.map((rule) => (
        <div key={rule.id} className="rounded-2xl border bg-background p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-foreground">{rule.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                When {labelFor(metricOptions, rule.trigger_metric)} reaches {rule.trigger_value}, {labelFor(actionOptions, rule.action).toLowerCase()}.
              </p>
            </div>
            <Badge variant={rule.is_active ? "default" : "secondary"}>{rule.is_active ? "Active" : "Paused"}</Badge>
          </div>
          <Button variant="outline" size="sm" disabled={isUpdating} onClick={() => onToggle(rule)} className="mt-3">
            {rule.is_active ? "Pause" : "Activate"}
          </Button>
        </div>
      ))}
    </div>
  );
}