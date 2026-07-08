import React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import ProRuleForm from "@/components/dashboard/pro-growth/ProRuleForm";
import ProRuleList from "@/components/dashboard/pro-growth/ProRuleList";
import ProSignalStrip from "@/components/dashboard/pro-growth/ProSignalStrip";

export default function ProGrowthCommandCenter({ metrics, links, rules }) {
  const queryClient = useQueryClient();
  const topLink = [...links].sort((a, b) => (b.earnings || 0) - (a.earnings || 0))[0];
  const activeRules = rules.filter((rule) => rule.is_active).length;

  const createRule = useMutation({
    mutationFn: (rule) => base44.entities.ProAutomationRule.create(rule),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pro-automation-rules"] }),
  });
  const toggleRule = useMutation({
    mutationFn: (rule) => base44.entities.ProAutomationRule.update(rule.id, { is_active: !rule.is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pro-automation-rules"] }),
  });

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-bold text-primary">Shark and whale layer</p>
          <h2 className="font-display text-2xl font-black">Pro growth command center</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Connects analytics, top products, and autopilot controls so advanced users can scale while beginners keep the simple view.</p>
        </div>
        <Button asChild variant="outline"><Link to="/autopilot">Open Autopilot</Link></Button>
      </div>
      <div className="mt-5 space-y-4">
        <ProSignalStrip metrics={metrics} topLink={topLink} activeRules={activeRules} />
        <ProRuleForm onCreate={(rule) => createRule.mutate(rule)} isSaving={createRule.isPending} />
        <ProRuleList rules={rules} onToggle={(rule) => toggleRule.mutate(rule)} isUpdating={toggleRule.isPending} />
      </div>
    </Card>
  );
}