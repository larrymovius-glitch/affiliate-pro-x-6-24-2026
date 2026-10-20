import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Plus, Trash2, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { INCOME_SOURCES, buildTaxYearReport, taxReportCsv, yearsAvailable } from "@/lib/taxReport";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
// Local date, not toISOString(): in the evening in the US the UTC date is
// already tomorrow, which would pre-fill the wrong day.
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** @param {{ payouts?: any[] }} props */
export default function TaxYearReport({ payouts = [] }) {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ received_on: today(), source: "ClickBank", amount: "", note: "" });

  const { data: entries = [] } = useQuery({
    queryKey: ["income-entries"],
    queryFn: () => base44.entities.IncomeEntry.list("-received_on", 1000),
  });
  const { data: conversions = [] } = useQuery({
    queryKey: ["conversions-for-tax"],
    queryFn: () => base44.entities.ConversionEvent.list("-converted_at", 1000),
  });

  const years = useMemo(() => yearsAvailable({ entries, payouts, conversions }), [entries, payouts, conversions]);
  const report = useMemo(() => buildTaxYearReport({ entries, payouts, conversions, year }), [entries, payouts, conversions, year]);
  const maxMonth = Math.max(...report.byMonth, 0);

  const addMutation = useMutation({
    mutationFn: (/** @type {any} */ row) => base44.entities.IncomeEntry.create(row),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["income-entries"] });
      setForm((f) => ({ ...f, amount: "", note: "" }));
      setAdding(false);
      toast.success("Payment recorded");
    },
    onError: (/** @type {any} */ err) => toast.error(err?.message || "Couldn't save, please try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: (/** @type {string} */ id) => base44.entities.IncomeEntry.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["income-entries"] });
      toast.success("Removed");
    },
    onError: (/** @type {any} */ err) => toast.error(err?.message || "Couldn't remove, please try again."),
  });

  const handleAdd = () => {
    const amount = parseFloat(form.amount);
    if (!form.received_on) return toast.error("Pick the date you were paid");
    if (!amount || amount <= 0) return toast.error("Enter the amount you received");
    addMutation.mutate({
      received_on: form.received_on,
      source: form.source,
      amount: Math.round(amount * 100) / 100,
      note: form.note.trim() || null,
    });
  };

  const handleDownload = () => {
    const blob = new Blob([taxReportCsv(report)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // No hyphens: some browsers on this app's audience strip them from downloads.
    a.download = `APX_Income_${year}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="w-5 h-5 text-primary" />
            Tax Year Income Report
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[100px]" aria-label="Tax year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleDownload}>
              <Download className="w-4 h-4" /> Download
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl bg-muted/50 p-3">
          <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            Your networks pay you directly, so record each payment here when it arrives (from the network's payment
            statement). At tax time, download the report for your tax preparer. Each network sends its own tax forms,
            such as a 1099, if you qualify. This is a record-keeping tool, not tax advice.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border p-3 text-center">
            <p className="text-xs text-muted-foreground">Total received in {year}</p>
            <p className="font-display text-2xl font-bold text-primary">{money(report.totalReceived)}</p>
          </div>
          <div className="rounded-xl border p-3 text-center">
            <p className="text-xs text-muted-foreground">Payments recorded</p>
            <p className="font-display text-2xl font-bold">{report.received.length}</p>
          </div>
        </div>

        {report.totalReceived > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">By month</p>
            <div className="grid grid-cols-12 items-end gap-1 h-20" aria-label="Income by month">
              {report.byMonth.map((v, i) => (
                <div key={MONTHS[i]} className="flex flex-col items-center gap-1 h-full justify-end">
                  <div
                    className="w-full rounded-t bg-primary/80"
                    style={{ height: maxMonth ? `${Math.max((v / maxMonth) * 100, v ? 6 : 0)}%` : 0 }}
                    title={`${MONTHS[i]}: ${money(v)}`}
                  />
                  <span className="text-[10px] text-muted-foreground">{MONTHS[i][0]}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {report.bySource.map((s) => (
                <span key={s.source} className="rounded-full bg-muted px-3 py-1 text-xs">
                  {s.source}: <b>{money(s.total)}</b>
                </span>
              ))}
            </div>
          </div>
        )}

        {adding ? (
          <div className="space-y-3 rounded-xl border p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="income-date">Date paid</Label>
                <Input id="income-date" type="date" value={form.received_on} onChange={(e) => setForm({ ...form, received_on: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="income-amount">Amount ($)</Label>
                <Input id="income-amount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Paid by</Label>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                <SelectTrigger aria-label="Paid by"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INCOME_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="income-note">Note (optional)</Label>
              <Input id="income-note" maxLength={300} placeholder="e.g. weekly payment, check #1234" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={addMutation.isPending} className="gap-2">
                {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save payment"}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" className="w-full gap-2" onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4" /> Record a payment I received
          </Button>
        )}

        {report.received.length > 0 && (
          <ul className="divide-y rounded-xl border">
            {report.received.map((r) => (
              <li key={`${r.type}-${r.id}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-14 shrink-0 whitespace-nowrap text-muted-foreground">
                  {MONTHS[Number(r.date.slice(5, 7)) - 1]} {Number(r.date.slice(8, 10))}
                </span>
                <span className="flex-1 min-w-0 truncate">
                  {r.source}
                  {r.note ? <span className="text-muted-foreground"> · {r.note}</span> : null}
                </span>
                <span className="font-medium">{money(r.amount)}</span>
                {r.editable ? (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${r.source} payment from ${r.date}`}
                    onClick={() => deleteMutation.mutate(r.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : (
                  <span className="w-4" aria-hidden="true" />
                )}
              </li>
            ))}
          </ul>
        )}

        {report.reportedByNetwork.length > 0 && (
          <p className="text-xs text-muted-foreground">
            For comparison, networks reported {money(report.reportedTotal)} in sales commissions to APX in {year}. That
            number is not added to your total, since it is paid out to you later.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
