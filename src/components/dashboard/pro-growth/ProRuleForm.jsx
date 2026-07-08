import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actionOptions, metricOptions } from "@/components/dashboard/pro-growth/rule-options";

export default function ProRuleForm({ onCreate, isSaving }) {
  const [form, setForm] = useState({ name: "Scale winning ad", trigger_metric: "epc", trigger_value: 1, action: "promote_winner" });
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = (event) => {
    event.preventDefault();
    onCreate({ ...form, trigger_operator: "gte", trigger_value: Number(form.trigger_value), connected_surface: "autopilot", is_active: true });
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border bg-background p-4">
      <h3 className="font-semibold">New autopilot rule</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="rule-name">Rule name</Label>
          <Input id="rule-name" value={form.name} onChange={(e) => update("name", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rule-metric">When</Label>
          <select id="rule-metric" value={form.trigger_metric} onChange={(e) => update("trigger_metric", e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
            {metricOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rule-value">Reaches</Label>
          <Input id="rule-value" type="number" min="0" step="0.1" value={form.trigger_value} onChange={(e) => update("trigger_value", e.target.value)} />
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end">
        <div className="space-y-2 md:flex-1">
          <Label htmlFor="rule-action">Then</Label>
          <select id="rule-action" value={form.action} onChange={(e) => update("action", e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
            {actionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <Button type="submit" disabled={isSaving || !form.name} className="h-10">Save rule</Button>
      </div>
    </form>
  );
}