import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet, RefreshCw } from "lucide-react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import TaxSetAsideCard from "@/components/payouts/TaxSetAsideCard";
import TaxYearReport from "@/components/payouts/TaxYearReport";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { calculatePayoutBalance } from "@/lib/performance-calculations";

const statusStyles = {
  pending: "bg-amber-500/10 text-amber-600 border-amber-200",
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  paid: "bg-primary/10 text-primary border-primary/20",
  rejected: "bg-red-500/10 text-red-600 border-red-200",
};

export default function Payouts() {

  const { data: payouts = [], isLoading, refetch } = useQuery({
    queryKey: ["payouts"],
    queryFn: () => base44.entities.Payout.list("-created_at", 100),
  });
  const { onTouchStart, onTouchMove, onTouchEnd, pullDistance, pulling } = usePullToRefresh(() => refetch());

  const { totalPaid } = calculatePayoutBalance([], payouts);

  return (
    <div className="space-y-6" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="ptr-indicator" style={{ height: pullDistance }}>
        <RefreshCw className={`w-5 h-5 text-violet-700 dark:text-violet-300 transition-transform ${pulling ? "animate-spin" : ""}`} style={{ transform: `rotate(${pullDistance * 2}deg)` }} />
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Payouts</h1>
          <p className="text-muted-foreground text-sm mt-1">Your networks pay you directly, to your own account with them. APX doesn't hold or send your commissions. Keep your records here for tax time.</p>
        </div>
      </div>

      <TaxSetAsideCard totalPaid={totalPaid} />

      <TaxYearReport payouts={payouts} />

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : payouts.length === 0 ? (
        <Card className="p-12 text-center">
          <Wallet className="w-12 h-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground mt-4">No older payout records</p>
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
                    <TableCell className="text-sm text-muted-foreground">{payout.created_at ? format(new Date(payout.created_at), "MMM d, yyyy") : "—"}</TableCell>
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