import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Card } from "@/components/ui/card";
import ProRuleForm from "@/components/dashboard/pro-growth/ProRuleForm";
import ProRuleList from "@/components/dashboard/pro-growth/ProRuleList";

// The rule form and list were only used inside ProDashboard, which no page
// renders, so members had no way to create a rule. This puts them on AutoPilot.
export default function AutomationRules() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Filtered by owner rather than relying on RLS alone, so an admin sees only
  // their own rules here, not every member's.
  const { data: rules = [], isLoading, isError } = useQuery({
    queryKey: ["pro-automation-rules", user?.id],
    queryFn: () => base44.entities.ProAutomationRule.filter({ created_by_id: user.id }, "-created_at"),
    enabled: !!user?.id,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["pro-automation-rules"] });
  const createRule = useMutation({
    mutationFn: (/** @type {Record<string, any>} */ rule) => base44.entities.ProAutomationRule.create(rule),
    onSuccess: refresh,
  });
  const toggleRule = useMutation({
    mutationFn: (/** @type {{ id: string, is_active: boolean }} */ rule) => base44.entities.ProAutomationRule.update(rule.id, { is_active: !rule.is_active }),
    onSuccess: refresh,
  });

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold">Automation rules</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a number to watch. APX checks your links once a day and sends you an alert in the bell menu when a link reaches it.
          Rules never change your links on their own.
        </p>
      </div>
      <ProRuleForm onCreate={(rule) => createRule.mutate(rule)} isSaving={createRule.isPending} />
      {createRule.isError && (
        <p role="alert" className="text-sm text-destructive">The rule did not save. Please try again.</p>
      )}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading your rules…</p>
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">Your rules could not load. Please refresh the page.</p>
      ) : (
        <ProRuleList rules={rules} onToggle={(rule) => toggleRule.mutate(rule)} isUpdating={toggleRule.isPending} />
      )}
    </Card>
  );
}
