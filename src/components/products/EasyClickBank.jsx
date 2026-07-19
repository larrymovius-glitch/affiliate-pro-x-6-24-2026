import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { withTimeout } from "@/lib/withTimeout";
import { generateShortCode } from "@/lib/links";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Zap, ExternalLink, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getClickBankAffiliateId } from "@/lib/affiliate-id";

// One-tap ClickBank: user never sees the word "hoplink". Pick a product,
// the app builds their affiliate link from their nickname automatically.
const STARTER_PRODUCTS = [
  { vendor: "advamino", name: "Advanced Amino", blurb: "Muscle-health supplement" },
  { vendor: "okinawa8", name: "Okinawa Flat Belly Tonic", blurb: "Wellness drink" },
  { vendor: "tedsplans", name: "Ted's Woodworking", blurb: "16,000 woodworking plans" },
  { vendor: "hisecret", name: "His Secret Obsession", blurb: "Relationship guide" },
  { vendor: "numerolog", name: "Royal Numerology", blurb: "Personalized readings" },
];

export default function EasyClickBank() {
  const { user, checkUserAuth } = useAuth();
  const queryClient = useQueryClient();
  const [nickname, setNickname] = useState(user?.clickbank_nickname || "");
  const [savingNick, setSavingNick] = useState(false);
  const [busyVendor, setBusyVendor] = useState(null);
  const affiliateId = getClickBankAffiliateId(user);

  const saveNickname = async () => {
    const nick = nickname.trim().toLowerCase();
    if (!nick) return toast.error("Enter your ClickBank nickname first");
    setSavingNick(true);
    try {
      await withTimeout(base44.auth.updateMe({ clickbank_nickname: nick }), 15000, "Saving");
      await checkUserAuth();
      toast.success("Saved — you never have to do that again.");
    } catch (e) { toast.error(e?.message || "Couldn't save, try again."); }
    finally { setSavingNick(false); }
  };

  const addProduct = async (p) => {
    setBusyVendor(p.vendor);
    try {
      const hoplink = `https://hop.clickbank.net/?affiliate=${encodeURIComponent(affiliateId)}&vendor=${encodeURIComponent(p.vendor)}`;
      await withTimeout(base44.entities.AffiliateLink.create({
        product_name: p.name,
        destination_url: hoplink,
        short_code: `cb_${p.vendor}_${generateShortCode()}`,
        network: "clickbank",
      }), 20000, "Creating link");
      queryClient.invalidateQueries({ queryKey: ["links"] });
      toast.success(`${p.name} added — ready to promote.`);
    } catch (e) { toast.error(e?.message || "Couldn't add that one, try again."); }
    finally { setBusyVendor(null); }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Zap className="w-5 h-5 text-primary" /> Easy Start — ClickBank
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Links are ready with the default affiliate ID. To use your own ClickBank account instead, save your nickname here anytime.
          </p>
          <Label>Your ClickBank nickname <span className="text-muted-foreground">(optional)</span></Label>
          <div className="flex gap-2">
            <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g. yournickname" />
            <Button onClick={saveNickname} disabled={savingNick || !nickname.trim()} className="gap-1.5">
              {savingNick ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />} Save
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Tap a product — your link is built and tracked automatically.</p>
          {STARTER_PRODUCTS.map((p) => (
            <div key={p.vendor} className="flex items-center justify-between rounded-xl border p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.blurb}</p>
              </div>
              <Button size="sm" onClick={() => addProduct(p)} disabled={busyVendor === p.vendor} className="gap-1.5 flex-shrink-0">
                {busyVendor === p.vendor ? <Loader2 className="w-4 h-4 animate-spin" /> : "Promote this"}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}