import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { withTimeout } from "@/lib/withTimeout";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PiggyBank, Info, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * A simple set-aside calculator, not tax advice. The percentage is entirely
 * user-chosen — the platform never suggests or defaults to a number, since
 * actual tax obligations depend on someone's whole financial picture.
 */
export default function TaxSetAsideCard({ totalPaid }) {
  const { user, checkUserAuth } = useAuth();
  const [editing, setEditing] = useState(!user?.tax_set_aside_pct);
  const [pctInput, setPctInput] = useState(user?.tax_set_aside_pct?.toString() || "");
  const [savedInput, setSavedInput] = useState(user?.tax_saved_amount?.toString() || "0");
  const [saving, setSaving] = useState(false);

  const pct = user?.tax_set_aside_pct;
  const saved = user?.tax_saved_amount || 0;
  const suggested = pct ? (totalPaid * pct) / 100 : 0;
  const remaining = suggested - saved;

  const handleSave = async () => {
    const parsedPct = parseFloat(pctInput);
    const parsedSaved = parseFloat(savedInput) || 0;
    if (!parsedPct || parsedPct <= 0 || parsedPct > 100) {
      toast.error("Enter a percentage between 1 and 100");
      return;
    }
    setSaving(true);
    try {
      await withTimeout(
        base44.entities.User.update(user.id, {
          tax_set_aside_pct: parsedPct,
          tax_saved_amount: parsedSaved,
        }),
        15000,
        "Saving"
      );
      await checkUserAuth();
      setEditing(false);
      toast.success("Saved");
    } catch (err) {
      toast.error(err?.message || "Couldn't save, please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <PiggyBank className="w-5 h-5 text-primary" />
          Tax Set-Aside Tracker
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl bg-muted/50 p-3">
          <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            This is a simple calculator based on a percentage you choose — it's not tax advice.
            What you actually owe depends on your full financial situation. A tax professional
            (or a free resource like an IRS VITA site) can help you pick the right number.
          </p>
        </div>

        {editing ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Percentage to set aside</Label>
              <Input
                type="number"
                min="1"
                max="100"
                step="0.5"
                value={pctInput}
                onChange={(e) => setPctInput(e.target.value)}
                placeholder="e.g. 25"
              />
            </div>
            <div className="space-y-2">
              <Label>Already saved so far</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={savedInput}
                onChange={(e) => setSavedInput(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Paid out</p>
                <p className="font-display font-bold">${totalPaid.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Suggested ({pct}%)</p>
                <p className="font-display font-bold text-primary">${suggested.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Already saved</p>
                <p className="font-display font-bold text-emerald-500">${saved.toFixed(2)}</p>
              </div>
            </div>
            <div className={`text-center text-sm rounded-lg py-2 ${remaining > 0 ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"}`}>
              {remaining > 0
                ? `About $${remaining.toFixed(2)} more to set aside based on your own ${pct}%`
                : "You're caught up based on your own numbers"}
            </div>
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mx-auto"
            >
              <Pencil className="w-3 h-3" /> Update percentage or amount saved
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
