import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet, DollarSign, ArrowUpRight, RefreshCw } from "lucide-react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import PayoutScheduleCard from "@/components/payouts/PayoutScheduleCard";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";

const statusStyles = {
  pending: "bg-amber-500/10 text-amber-600 border-amber-200",
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  paid: "bg-primary/10 text-primary border-primary/20",
  rejected: "bg-red-500/10 text-red-600 border-red-200",
};

export default function Payouts() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const queryClient = useQueryClient();

  const { data: payouts = [], isLoading, refetch } = useQuery({
    queryKey: ["payouts"],
    queryFn: () => base44.entities.Payout.list("-created_date", 100),
  });
  const { onTouchStart, onTouchMove, onTouchEnd, pullDistance, pulling } = usePullToRefresh(() => refetch());

  const requestMutation = useMutation({
    mutationFn: (data) => base44.entities.Payout.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["payouts"] }); setDialogOpen(false); setAmount(""); toast.success("Payout requested!"); },
  });

  const totalPaid = payouts.filter(p => p.status === "paid").reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalPending = payouts.filter(p => p.status === "pending" || p.status === "approved").reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div className="space-y-6" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="ptr-indicator" style={{ height: pullDistance }}>
        <RefreshCw className={`w-5 h-5 text-violet-400 transition-transform ${pulling ? "animate-spin" : ""}`} style={{ transform: `rotate(${pullDistance * 2}deg)` }} />
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Payouts</h1>
          <p className="text-muted-foreground text-sm mt-1">Track and request your earnings payouts</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><ArrowUpRight className="w-4 h-4" /> Request Payout</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Request Payout</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Amount ($)</Label>
                <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50.00" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => requestMutation.mutate({ amount: parseFloat(amount), status: "pending" })} disabled={requestMutation.isPending || !amount}>
                  {requestMutation.isPending ? "Requesting..." : "Request"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <PayoutScheduleCard />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Paid</p>
              <p className="text-xl font-bold font-display">${totalPaid.toFixed(2)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-xl font-bold font-display">${totalPending.toFixed(2)}</p>
            </div>
          </div>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : payouts.length === 0 ? (
        <Card className="p-12 text-center">
          <Wallet className="w-12 h-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground mt-4">No payout requests yet</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Paid Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell className="font-semibold font-display">${(payout.amount || 0).toFixed(2)}</TableCell>
                    <TableCell><Badge variant="outline" className={statusStyles[payout.status] || ""}>{payout.status}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{payout.created_date ? format(new Date(payout.created_date), "MMM d, yyyy") : "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{payout.paid_at ? format(new Date(payout.paid_at), "MMM d, yyyy") : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}