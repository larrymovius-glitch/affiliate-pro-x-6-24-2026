import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { withTimeout } from "@/lib/withTimeout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, AlertCircle, ExternalLink, Loader2, CheckCheck } from "lucide-react";
import { toast } from "sonner";

// One card per network on /networks. No OAuth -- most affiliate networks
// don't offer a public self-serve OAuth flow for third-party apps, so a
// signup link plus "paste your id here" is the reliable option, not a
// simplified one. Mirrors the manual-guide pattern in
// components/social/SocialPlatformCard.jsx.
export default function NetworkCard({ network, savedId }) {
  const { user, checkUserAuth } = useAuth();
  const [value, setValue] = useState(savedId || "");
  const [saving, setSaving] = useState(false);
  const connected = !!savedId;

  const save = async () => {
    const id = value.trim();
    if (!id) return toast.error(`Enter your ${network.idLabel} first`);
    setSaving(true);
    try {
      const payload =
        network.id === "clickbank"
          ? { clickbank_nickname: id }
          : { affiliate_network_ids: { ...(user?.affiliate_network_ids || {}), [network.id]: id } };
      await withTimeout(base44.auth.updateMe(payload), 15000, "Saving");
      await checkUserAuth();
      toast.success(`${network.name} saved.`);
    } catch (e) {
      toast.error(e?.message || "Couldn't save, try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground text-base flex items-center justify-between gap-2">
          <span>{network.name}</span>
          {!network.instant && (
            <span className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">approval required</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className={`flex items-center gap-3 rounded-xl p-3 ${
            connected ? "bg-green-500/10 border border-green-500/20" : "bg-orange-500/10 border border-orange-500/20"
          }`}
        >
          {connected ? (
            <CheckCircle className="w-4 h-4 text-green-700 dark:text-green-400 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-orange-700 dark:text-orange-300 flex-shrink-0" />
          )}
          <p className={`text-sm ${connected ? "text-green-700 dark:text-green-300" : "text-orange-700 dark:text-orange-300"}`}>
            {connected ? `Connected as ${savedId}` : "Not connected"}
          </p>
        </div>

        <a href={network.signupUrl} target="_blank" rel="noreferrer">
          <Button variant="outline" size="sm" className="w-full gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" /> {connected ? "Open account" : "Log in or create account"}
          </Button>
        </a>

        <div className="space-y-1.5">
          <Label className="text-xs">{network.idLabel}</Label>
          <div className="flex gap-2">
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={`Your ${network.idLabel}`} />
            <Button onClick={save} disabled={saving || !value.trim()} size="sm" className="gap-1.5 flex-shrink-0">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />} Save
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
