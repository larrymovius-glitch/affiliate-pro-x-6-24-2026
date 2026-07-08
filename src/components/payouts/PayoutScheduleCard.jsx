import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock, Zap, CheckCircle2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function PayoutScheduleCard() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: schedules, isLoading } = useQuery({
    queryKey: ["payout-schedules"],
    queryFn: () => base44.entities.PayoutSchedule.list(),
  });

  const schedule = schedules?.[0] || null;

  const [form, setForm] = useState({
    is_active: true,
    frequency: "weekly",
    minimum_amount: 25,
    payment_method: "paypal",
    payment_email: "",
  });

  // Sync form when schedule loads
  useEffect(() => {
    if (schedule) {
      setForm({
        is_active: schedule.is_active ?? true,
        frequency: schedule.frequency || "weekly",
        minimum_amount: schedule.minimum_amount || 25,
        payment_method: schedule.payment_method || "paypal",
        payment_email: schedule.payment_email || "",
      });
    }
  }, [schedule?.id]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (schedule?.id) {
        return base44.entities.PayoutSchedule.update(schedule.id, data);
      } else {
        return base44.entities.PayoutSchedule.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payout-schedules"] });
      setEditing(false);
      toast.success("Auto-payout schedule saved");
    },
    onError: () => toast.error("Failed to save schedule"),
  });

  const runNowMutation = useMutation({
    mutationFn: () => base44.functions.invoke("processAutoPayouts", { self_only: true }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["payout-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["payouts"] });
      const processed = res?.data?.processed ?? 0;
      const created = res?.data?.created ?? 0;
      toast.success(`Auto-payout run complete — ${created} payout(s) created, ${processed} schedule(s) checked`);
    },
    onError: () => toast.error("Failed to run auto-payout"),
  });

  const toggleActive = async (value) => {
    if (!schedule?.id) return;
    await base44.entities.PayoutSchedule.update(schedule.id, { is_active: value });
    queryClient.invalidateQueries({ queryKey: ["payout-schedules"] });
    toast.success(value ? "Auto-payouts enabled" : "Auto-payouts paused");
  };

  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <CalendarClock className="w-4 h-4 text-primary" />
            </div>
            <CardTitle className="text-base font-display">Automated Payouts</CardTitle>
            {schedule && (
              <Badge variant="outline" className={schedule.is_active
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-200"
                : "bg-muted text-muted-foreground"}>
                {schedule.is_active ? "Active" : "Paused"}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {schedule && (
              <Switch
                checked={schedule.is_active ?? true}
                onCheckedChange={toggleActive}
              />
            )}
            <Button variant="ghost" size="icon" onClick={() => setEditing(!editing)}>
              <Settings2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!editing && schedule ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Frequency</p>
              <p className="font-medium capitalize">{schedule.frequency}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Min. Amount</p>
              <p className="font-medium">${schedule.minimum_amount}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Method</p>
              <p className="font-medium capitalize">{schedule.payment_method}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Next Run</p>
              <p className="font-medium">
                {schedule.next_payout_date
                  ? format(new Date(schedule.next_payout_date), "MMM d")
                  : "Pending"}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Frequency</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm(f => ({ ...f, frequency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Minimum Amount ($)</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.minimum_amount}
                  onChange={(e) => setForm(f => ({ ...f, minimum_amount: parseFloat(e.target.value) }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Payment Method</Label>
                <Select value={form.payment_method} onValueChange={(v) => setForm(f => ({ ...f, payment_method: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paypal">PayPal</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="check">Check</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Payment Email / Destination</Label>
                <Input
                  type="email"
                  placeholder="paypal@example.com"
                  value={form.payment_email}
                  onChange={(e) => setForm(f => ({ ...f, payment_email: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              {schedule && <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>}
              <Button size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : schedule ? "Save Changes" : "Enable Auto-Payouts"}
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {schedule?.last_processed_at ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                Last run: {format(new Date(schedule.last_processed_at), "MMM d, yyyy h:mm a")}
              </>
            ) : (
              <span>No runs yet</span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => runNowMutation.mutate()}
            disabled={runNowMutation.isPending}
          >
            <Zap className="w-3.5 h-3.5" />
            {runNowMutation.isPending ? "Running..." : "Run Now"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}