import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Instagram, CheckCircle, AlertCircle, Loader2, Link2, Unlink, RefreshCw, Copy, CheckCheck } from "lucide-react";
import { toast } from "sonner";

// Connect card for the shared house Instagram account. Admin-only, because
// api/postToInstagram.js has always published to one shared account rather
// than each user's own — per-user Instagram needs Meta App Review plus
// business verification, while a single account the app owner controls needs
// no review at all.
//
// Reads its outcome from the ?ig=1&status=... query string that
// api/instagramCallback.js redirects back with, since the OAuth round trip
// leaves and re-enters the app rather than staying in one page's state.
const OUTCOMES = {
  connected: { ok: true, text: "Instagram connected. Posts can now publish automatically." },
  cancelled: { ok: false, text: "Connection cancelled — nothing was changed." },
  not_configured: { ok: false, text: "INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET are not set in this deployment." },
  no_code: { ok: false, text: "Instagram redirected back without an authorization code." },
  bad_state: { ok: false, text: "The connection request could not be verified. Start again from this page." },
  not_admin: { ok: false, text: "That connection was started by an account that is no longer an admin." },
  code_exchange_failed: { ok: false, text: "Instagram rejected the authorization code. Check the redirect URI matches exactly." },
  token_exchange_failed: { ok: false, text: "Could not upgrade to a long-lived token. Check the app secret." },
  unexpected: { ok: false, text: "Something went wrong completing the connection. Check the function logs." },
};

export default function InstagramConnect() {
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["instagram-connection"],
    queryFn: async () => (await base44.functions.invoke("instagramConnect", {})).data,
  });

  // Surface the callback's result once, then strip it from the URL so a
  // refresh does not keep re-announcing a connection that happened minutes ago.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ig") !== "1") return;
    const status = params.get("status");
    setOutcome(OUTCOMES[params.get("reason")] || OUTCOMES[status] || OUTCOMES.unexpected);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const disconnect = useMutation({
    mutationFn: () => base44.functions.invoke("instagramDisconnect", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-connection"] });
      setOutcome(null);
      toast.success("Instagram disconnected");
    },
    onError: (err) => toast.error(err?.message || "Could not disconnect"),
  });

  const refresh = useMutation({
    mutationFn: () => base44.functions.invoke("refreshInstagramToken", { force: true }),
    onSuccess: ({ data: result }) => {
      queryClient.invalidateQueries({ queryKey: ["instagram-connection"] });
      toast.success(result?.refreshed ? "Token refreshed — 60 more days" : "No refresh was needed");
    },
    onError: (err) => toast.error(err?.message || "Could not refresh the token"),
  });

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(data.redirect_uri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm py-6 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Checking Instagram connection…
      </div>
    );
  }

  const daysLeft = data?.days_left;
  const expiringSoon = data?.connected && typeof daysLeft === "number" && daysLeft <= 15;
  const expired = data?.connected && typeof daysLeft === "number" && daysLeft < 0;

  return (
    <Card className="border-white/10 bg-white/5">
      <CardHeader>
        <CardTitle className="text-white text-base flex items-center gap-2">
          <Instagram className="w-5 h-5 text-pink-400" /> Instagram Auto-Posting
          <span className="ml-auto text-xs font-normal text-slate-500">Admin only</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {outcome && (
          <div className={`flex items-start gap-2 rounded-xl p-3 text-sm ${
            outcome.ok
              ? "bg-green-500/10 text-green-300 border border-green-500/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}>
            {outcome.ok
              ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
            <span>{outcome.text}</span>
          </div>
        )}

        {!data?.configured && (
          <div className="flex items-start gap-2 rounded-xl p-4 bg-orange-500/10 border border-orange-500/20">
            <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-2 min-w-0">
              <p className="text-sm font-semibold text-orange-300">Not set up yet</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Create a Meta app with the <span className="text-slate-300">Instagram</span> product, then set{" "}
                <code className="text-orange-300">INSTAGRAM_APP_ID</code> and{" "}
                <code className="text-orange-300">INSTAGRAM_APP_SECRET</code> in Vercel and redeploy. The account
                you post from must be an Instagram <span className="text-slate-300">Professional</span> account,
                added as an Instagram Tester on the app — that is what lets this work without Meta App Review.
              </p>
              <div className="space-y-1">
                <p className="text-xs text-slate-500">Add this exact redirect URI to the app:</p>
                <div className="flex items-stretch gap-2">
                  <code className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-orange-200">
                    {data?.redirect_uri}
                  </code>
                  <Button variant="outline" onClick={copyRedirect} className="flex-shrink-0 px-3" aria-label="Copy redirect URI">
                    {copied ? <CheckCheck className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {data?.configured && !data?.connected && (
          <>
            <p className="text-sm text-slate-400">
              Connect the account once and generated posts can publish straight to it — no copy-paste.
            </p>
            <a href={data.authorize_url}>
              <Button className="w-full h-11 font-semibold gap-2"
                style={{ background: "linear-gradient(135deg, #E4405F, #FCAF45)" }}>
                <Link2 className="w-4 h-4" /> Connect Instagram
              </Button>
            </a>
          </>
        )}

        {data?.connected && (
          <>
            <div className={`flex items-center gap-3 rounded-xl p-4 ${
              expired
                ? "bg-red-500/10 border border-red-500/20"
                : expiringSoon
                  ? "bg-orange-500/10 border border-orange-500/20"
                  : "bg-green-500/10 border border-green-500/20"
            }`}>
              {expired
                ? <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                : <CheckCircle className={`w-5 h-5 flex-shrink-0 ${expiringSoon ? "text-orange-400" : "text-green-400"}`} />}
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${
                  expired ? "text-red-300" : expiringSoon ? "text-orange-300" : "text-green-300"
                }`}>
                  {expired ? "Connection expired" : "Connected"}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {expired
                    ? "An expired token cannot be refreshed — disconnect and connect again."
                    : `Access renews automatically. ${daysLeft} days left on the current token.`}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              {!expired && (
                <Button variant="outline" className="flex-1 gap-2" disabled={refresh.isPending}
                  onClick={() => refresh.mutate()}>
                  <RefreshCw className={`w-4 h-4 ${refresh.isPending ? "animate-spin" : ""}`} />
                  {refresh.isPending ? "Refreshing…" : "Refresh now"}
                </Button>
              )}
              <Button variant="outline" className="flex-1 gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
                <Unlink className="w-4 h-4" />
                {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
