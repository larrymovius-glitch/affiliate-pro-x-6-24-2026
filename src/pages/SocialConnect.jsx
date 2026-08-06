import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Instagram, Linkedin, Facebook, Link2, CheckCircle, AlertCircle, Loader2, Settings } from "lucide-react";
import FacebookPinterestConnector from "@/components/social/FacebookPinterestConnector";

export default function SocialConnect() {
  const { user } = useAuth();
  const [instagramConnected, setInstagramConnected] = useState(false);
  const [linkedinConnected, setLinkedinConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingPayment, setSavingPayment] = useState(false);
  const [stripeAccount, setStripeAccount] = useState("");
  const [paymentEmail, setPaymentEmail] = useState("");

  useEffect(() => {
    checkConnection();
    if (user) {
      setPaymentEmail(user.email || "");
    }
  }, [user]);

  const checkInstagram = async () => {
    try {
      await base44.functions.invoke("postToInstagram", { test: true });
      setInstagramConnected(true);
    } catch {
      setInstagramConnected(false);
    }
  };

  const checkLinkedin = async () => {
    try {
      await base44.functions.invoke("postToLinkedIn", { test: true });
      setLinkedinConnected(true);
    } catch {
      setLinkedinConnected(false);
    }
  };

  const checkConnection = async () => {
    await Promise.all([checkInstagram(), checkLinkedin()]);
    setLoading(false);
  };

  const handleConnectInstagram = async () => {
    try {
      const url = await base44.connectors.connectAppUser("instagram");
      const popup = window.open(url, "_blank");
      const timer = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(timer);
          checkInstagram();
        }
      }, 500);
    } catch (error) {
      console.error("Instagram connection error:", error);
    }
  };

  const handleConnectLinkedin = async () => {
    try {
      const url = await base44.connectors.connectAppUser("6a3a1c4e98737984ce1e0230");
      const popup = window.open(url, "_blank");
      const timer = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(timer);
          checkLinkedin();
        }
      }, 500);
    } catch (error) {
      console.error("LinkedIn connection error:", error);
    }
  };

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

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #E4405F, #FCAF45)" }}>
          <Instagram className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white font-display">Social Media & Payments</h1>
          <p className="text-sm text-slate-400">Connect accounts & get paid automatically</p>
        </div>
      </div>

      {/* Instagram Connection */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Instagram className="w-5 h-5" style={{ color: "#E4405F" }} />
            Instagram Business
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={`flex items-center gap-3 rounded-xl p-4 ${
            instagramConnected ? "bg-green-500/10 border border-green-500/20" : "bg-orange-500/10 border border-orange-500/20"
          }`}>
            {instagramConnected
              ? <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
              : <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0" />}
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${instagramConnected ? "text-green-300" : "text-orange-300"}`}>
                {instagramConnected ? "Instagram Connected" : "Not Connected"}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {instagramConnected 
                  ? "Auto-posting enabled for affiliate content"
                  : "Connect to auto-post AI-generated content"}
              </p>
            </div>
          </div>

          {!instagramConnected && (
            <Button 
              onClick={handleConnectInstagram}
              disabled={loading}
              className="w-full h-11 font-semibold gap-2"
              style={{ background: "linear-gradient(135deg, #E4405F, #FCAF45)" }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              {loading ? "Connecting..." : "Connect Instagram Business"}
            </Button>
          )}

          {instagramConnected && (
            <p className="text-xs text-green-400 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Ready to auto-post to Instagram
            </p>
          )}
        </CardContent>
      </Card>

      {/* LinkedIn Connection */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Linkedin className="w-5 h-5" style={{ color: "#0A66C2" }} />
            LinkedIn Professional
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={`flex items-center gap-3 rounded-xl p-4 ${
            linkedinConnected ? "bg-green-500/10 border border-green-500/20" : "bg-orange-500/10 border border-orange-500/20"
          }`}>
            {linkedinConnected
              ? <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
              : <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0" />}
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${linkedinConnected ? "text-green-300" : "text-orange-300"}`}>
                {linkedinConnected ? "LinkedIn Connected" : "Not Connected"}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {linkedinConnected 
                  ? "Auto-posting enabled for professional content"
                  : "Connect to share affiliate content with your network"}
              </p>
            </div>
          </div>

          {!linkedinConnected && (
            <Button 
              onClick={handleConnectLinkedin}
              disabled={loading}
              className="w-full h-11 font-semibold gap-2"
              style={{ background: "linear-gradient(135deg, #0A66C2, #0077B5)" }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              {loading ? "Connecting..." : "Connect LinkedIn Account"}
            </Button>
          )}

          {linkedinConnected && (
            <p className="text-xs text-green-400 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Ready to auto-post to LinkedIn
            </p>
          )}
        </CardContent>
      </Card>

      {/* Payment Setup */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-400" />
            Payment Setup (Get Paid Automatically)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl p-4 bg-blue-500/10 border border-blue-500/20">
            <p className="text-sm text-blue-300 font-semibold mb-1">💰 Automatic Commissions</p>
            <p className="text-xs text-slate-400">
              When a sale happens, commissions automatically route to your Stripe account.
              Veterans get FREE access with instant payouts!
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-sm">Payment Email</Label>
              <Input
                type="email"
                placeholder="your@email.com"
                value={paymentEmail}
                onChange={(e) => setPaymentEmail(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300 text-sm">
                Stripe Account ID 
                <span className="text-xs text-slate-500 ml-2">(starts with "acct_")</span>
              </Label>
              <Input
                placeholder="acct_1234567890"
                value={stripeAccount}
                onChange={(e) => setStripeAccount(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 font-mono"
              />
              <p className="text-xs text-slate-500">
                Don't have Stripe? Tell Phil "I need to set up payments" and we'll help you!
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
            <div className="flex items-center gap-2 text-sm text-green-400">
              <CheckCircle className="w-4 h-4" />
              <span>Payment info verified - ready to receive commissions!</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Facebook & Pinterest */}
      <FacebookPinterestConnector onGeneratePosts={(platform) => {
        window.location.href = "/autopilot";
      }} />

      {/* Quick Actions */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button variant="outline" className="w-full justify-start gap-2 text-slate-300" onClick={() => window.location.href = "/autopilot"}>
            <Instagram className="w-4 h-4" />
            Generate Instagram Posts (AutoPilot)
          </Button>
          <Button variant="outline" className="w-full justify-start gap-2 text-slate-300" onClick={() => window.location.href = "/autopilot"}>
            <Linkedin className="w-4 h-4" />
            Generate LinkedIn Posts (AutoPilot)
          </Button>
          <Button variant="outline" className="w-full justify-start gap-2 text-slate-300" onClick={() => window.location.href = "/autopilot"}>
            <Facebook className="w-4 h-4" />
            Generate Facebook Posts (AutoPilot)
          </Button>
          <Button variant="outline" className="w-full justify-start gap-2 text-slate-300">
            <Settings className="w-4 h-4" />
            Tell Atlas: "Set up my payments"
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}