import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { withTimeout } from "@/lib/withTimeout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCheck, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { TRAFFIC_SOURCES, NETWORKS_USED, CLICKBANK_STATUS_OPTIONS } from "@/lib/applicationProfileOptions";

// A vendor's own affiliate-approval form (ClickBank vendors like ProDentim
// or Femicore gate promotion behind one) asks nearly the same questions
// every time: name, company, Telegram, ClickBank ID, traffic sources,
// networks used, ClickBank tier. Fill it in here once; Maya/Atlas can then
// hand back ready-to-paste answers instead of retyping them per vendor.
// This never submits anything on its own -- every vendor's form is
// different, and the answers are the user's own claims to a human reviewer.
function toggleInList(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function ApplicationProfile() {
  const { user, checkUserAuth } = useAuth();
  const saved = user?.affiliate_application_profile || {};
  const [form, setForm] = useState({
    full_name: saved.full_name || "",
    company_name: saved.company_name || "",
    telegram_username: saved.telegram_username || "",
    whatsapp_number: saved.whatsapp_number || "",
    website_url: saved.website_url || "",
    traffic_sources: saved.traffic_sources || [],
    networks_used: saved.networks_used || [],
    clickbank_status: saved.clickbank_status || "",
  });
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  // The form only seeds from `user` on first mount, so a save that actually
  // reached the database needs to be reflected back here explicitly --
  // otherwise the screen looks identical whether the save worked or silently
  // failed, which is exactly what was reported.
  useEffect(() => {
    setForm({
      full_name: saved.full_name || "",
      company_name: saved.company_name || "",
      telegram_username: saved.telegram_username || "",
      whatsapp_number: saved.whatsapp_number || "",
      website_url: saved.website_url || "",
      traffic_sources: saved.traffic_sources || [],
      networks_used: saved.networks_used || [],
      clickbank_status: saved.clickbank_status || "",
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });
  }, [JSON.stringify(saved)]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await withTimeout(base44.auth.updateMe({ affiliate_application_profile: form }), 15000, "Saving");
      if (!updated?.affiliate_application_profile) {
        throw new Error("The save didn't come back with your data -- please try again.");
      }
      await checkUserAuth();
      setLastSavedAt(new Date());
      toast.success("Saved. Maya and Atlas can use this to draft form answers now.");
    } catch (e) {
      toast.error(e?.message || "Couldn't save, try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #6366F1, #22D3EE)" }}
        >
          <ClipboardList className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground font-display">Affiliate Application Profile</h1>
          <p className="text-sm text-muted-foreground">
            Fill this in once. Ask Maya or Atlas for form answers next time a vendor asks you to apply, and paste
            them in instead of retyping everything.
          </p>
        </div>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground text-base">Your Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="First Last" />
            </div>
            <div className="space-y-1.5">
              <Label>Company name (optional)</Label>
              <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Telegram username</Label>
              <Input value={form.telegram_username} onChange={(e) => setForm({ ...form, telegram_username: e.target.value })} placeholder="@yourhandle" />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp number (optional)</Label>
              <Input value={form.whatsapp_number} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} placeholder="+1 555 555 5555" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Website / landing page (optional)</Label>
              <Input value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} placeholder="https://..." />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Your ClickBank ID is already saved on <a href="/networks" className="underline">/networks</a> -- no need to repeat it here.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground text-base">Traffic Sources</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          {TRAFFIC_SOURCES.map((source) => (
            <label key={source} className="flex items-center gap-2 text-sm text-foreground/80">
              <Checkbox
                checked={form.traffic_sources.includes(source)}
                onCheckedChange={() => setForm({ ...form, traffic_sources: toggleInList(form.traffic_sources, source) })}
              />
              {source}
            </label>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground text-base">Other Networks You're On</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          {NETWORKS_USED.map((network) => (
            <label key={network} className="flex items-center gap-2 text-sm text-foreground/80">
              <Checkbox
                checked={form.networks_used.includes(network)}
                onCheckedChange={() => setForm({ ...form, networks_used: toggleInList(form.networks_used, network) })}
              />
              {network}
            </label>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground text-base">ClickBank Status</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          {CLICKBANK_STATUS_OPTIONS.map((tier) => (
            <label key={tier} className="flex items-center gap-2 text-sm text-foreground/80">
              <input
                type="radio"
                name="clickbank_status"
                checked={form.clickbank_status === tier}
                onChange={() => setForm({ ...form, clickbank_status: tier })}
                className="accent-primary"
              />
              {tier}
            </label>
          ))}
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving} className="w-full gap-1.5">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />} Save Profile
      </Button>
      {lastSavedAt && (
        <p className="text-center text-xs text-emerald-400 flex items-center justify-center gap-1.5">
          <CheckCheck className="w-3.5 h-3.5" /> Saved at {lastSavedAt.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
