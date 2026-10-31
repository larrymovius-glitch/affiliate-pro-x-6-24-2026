import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Instagram, CheckCircle, Loader2, Settings } from "lucide-react";
import SocialPlatformCard from "@/components/social/SocialPlatformCard";
import InstagramConnect from "@/components/social/InstagramConnect";
import LinkedInConnect from "@/components/social/LinkedInConnect";
import FacebookConnect from "@/components/social/FacebookConnect";
import { SOCIAL_PLATFORMS } from "@/lib/socialPlatforms";

export default function SocialConnect() {
  const { user } = useAuth();
  const [savingPayment, setSavingPayment] = useState(false);
  const [stripeAccount, setStripeAccount] = useState("");
  const [paymentEmail, setPaymentEmail] = useState("");

  useEffect(() => {
    if (user) setPaymentEmail(user.email || "");
  }, [user]);

  const handleSavePayment = async () => {
    if (!stripeAccount || !paymentEmail) return;

    setSavingPayment(true);
    try {
      await base44.functions.invoke("savePaymentInfo", {
        stripeAccountId: stripeAccount,
        email: paymentEmail
      });
      alert("Payment info saved! Commissions will be sent automatically.");
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setSavingPayment(false);
    }
  };

  const handleGeneratePosts = () => {
    window.location.href = "/autopilot";
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #E4405F, #FCAF45)" }}>
          <Instagram className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground font-display">Social Media & Payments</h1>
          <p className="text-sm text-muted-foreground">
            Connect your own Facebook Page, Instagram or LinkedIn below and posts publish straight to it from the app.
            The rest have no self-serve connect flow for an app like this one, so each card links
            straight to the platform plus a copy-paste posting guide.
          </p>
        </div>
      </div>

      {/* Real connect flows, where they exist */}
      <FacebookConnect />
      <InstagramConnect />
      <LinkedInConnect />

      {/* Platforms */}
      <div className="grid gap-4 sm:grid-cols-2">
        {SOCIAL_PLATFORMS.map((platform) => (
          <SocialPlatformCard key={platform.id} platform={platform} onGeneratePosts={handleGeneratePosts} />
        ))}
      </div>

      {/* Payment Setup */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground text-base flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-700 dark:text-blue-300" />
            Payment Setup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl p-4 bg-blue-500/10 border border-blue-500/20">
            <p className="text-sm text-blue-700 dark:text-blue-300 font-semibold mb-1">💰 How payments work</p>
            <p className="text-xs text-muted-foreground">
              Networks like ClickBank and Digistore24 pay commissions to your own account with them, on their schedule.
              APX doesn't hold or send your commissions.
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-foreground/80 text-sm">Payment Email</Label>
              <Input
                type="email"
                placeholder="your@email.com"
                value={paymentEmail}
                onChange={(e) => setPaymentEmail(e.target.value)}
                className="bg-card border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-foreground/80 text-sm">
                Stripe Account ID
                <span className="text-xs text-muted-foreground ml-2">(starts with "acct_")</span>
              </Label>
              <Input
                placeholder="acct_1234567890"
                value={stripeAccount}
                onChange={(e) => setStripeAccount(e.target.value)}
                className="bg-card border-border text-foreground placeholder:text-muted-foreground font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Don't have Stripe? Tell Atlas "I need to set up payments" and we'll help you!
              </p>
            </div>

            <Button
              onClick={handleSavePayment}
              disabled={savingPayment || !stripeAccount || !paymentEmail}
              className="w-full h-11 font-semibold"
              style={{ background: "linear-gradient(90deg, #10b981, #059669)" }}
            >
              {savingPayment ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving...</> : "Save Payment Info"}
            </Button>
          </div>

          {user?.payoutReady && (
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
              <CheckCircle className="w-4 h-4" />
              <span>Payment info verified - ready to receive commissions!</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
