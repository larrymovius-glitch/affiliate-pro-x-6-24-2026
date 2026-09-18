import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Linkedin, CheckCircle, AlertCircle, Loader2, Link2, Unlink, RefreshCw, Copy, CheckCheck } from "lucide-react";
import { toast } from "sonner";

// Connect card for the signed-in user's own LinkedIn. Once connected, "Post to
// LinkedIn" on Make Money (api/postToLinkedIn.js) publishes as that member.
//
// LinkedIn only issues refresh tokens to approved Marketing Developer Platform
// partners, so a connection simply lasts 60 days: the card counts down and
// offers Reconnect instead of the automatic renewal Instagram gets.
//
// Reads its outcome from the ?li=1&status=... query string that
// api/linkedinCallback.js redirects back with.
const OUTCOMES = {
  connected: { ok: true, text: "LinkedIn connected. \"Post to LinkedIn\" on Make Money now publishes to your profile." },
  cancelled: { ok: false, text: "Connection cancelled — nothing was changed." },
  not_configured: { ok: false, text: "LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET are not set in this deployment." },
  no_code: { ok: false, text: "LinkedIn redirected back without an authorization code." },
  bad_state: { ok: false, text: "The connection request could not be verified. Start again from this page." },
  unknown_user: { ok: false, text: "The account that started this connection no longer exists." },
  code_exchange_failed: { ok: false, text: "LinkedIn rejected the authorization code. Check that the redirect URL on the app's Auth tab matches exactly." },
  profile_failed: { ok: false, text: "LinkedIn didn't share your profile. Add \"Sign In with LinkedIn using OpenID Connect\" on the app's Products tab, then connect again." },
  linkedin_error: { ok: false, text: "LinkedIn returned an error. Check the app's Products and Auth tabs, then try again." },
  unexpected: { ok: false, text: "Something went wrong completing the connection. Check the function logs." },
};

export default function LinkedInConnect() {
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["linkedin-connection"],
    queryFn: async () => (await base44.functions.invoke("linkedinConnect", {})).data,
  });

  // Surface the callback's result once, then strip it from the URL so a
  // refresh does not keep re-announcing it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("li") !== "1") return;
    const status = params.get("status");
    setOutcome(OUTCOMES[params.get("reason")] || OUTCOMES[status] || OUTCOMES.unexpected);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const disconnect = useMutation({
    mutationFn: () => base44.functions.invoke("linkedinDisconnect", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["linkedin-connection"] });
      setOutcome(null);
      toast.success("LinkedIn disconnected");
    },
    onError: (err) => toast.error(err?.message || "Could not disconnect"),
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
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Checking LinkedIn connection…
      </div>
    );
  }

  const daysLeft = data?.days_left;
  const hasDays = typeof daysLeft === "number";
  const expired = data?.connected && hasDays && daysLeft < 0;
  const expiringSoon = data?.connected && hasDays && !expired && daysLeft <= 10;

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground text-base flex items-center gap-2">
          <Linkedin className="w-5 h-5 text-sky-700 dark:text-sky-400" /> LinkedIn Posting
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {outcome && (
          <div className={`flex items-start gap-2 rounded-xl p-3 text-sm ${
            outcome.ok
              ? "bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/20"
              : "bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20"
          }`}>
            {outcome.ok
              ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
            <span>{outcome.text}</span>
          </div>
        )}

        {!data?.configured && (
          <div className="flex items-start gap-2 rounded-xl p-4 bg-orange-500/10 border border-orange-500/20">
            <AlertCircle className="w-5 h-5 text-orange-700 dark:text-orange-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-2 min-w-0">
              <p className="text-sm font-semibold text-orange-700 dark:text-orange-300">Not set up yet</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Create an app at linkedin.com/developers (LinkedIn requires linking it to a LinkedIn Page), add
                the <span className="text-foreground/80">Share on LinkedIn</span> and{" "}
                <span className="text-foreground/80">Sign In with LinkedIn using OpenID Connect</span> products, then
                set <code className="text-orange-700 dark:text-orange-300">LINKEDIN_CLIENT_ID</code> and{" "}
                <code className="text-orange-700 dark:text-orange-300">LINKEDIN_CLIENT_SECRET</code> in Vercel and redeploy.
              </p>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Add this exact redirect URL on the app’s Auth tab:</p>
                <div className="flex items-stretch gap-2">
                  <code className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap rounded-lg bg-black/40 border border-border px-3 py-2 text-xs text-orange-700 dark:text-orange-200">
                    {data?.redirect_uri}
                  </code>
                  <Button variant="outline" onClick={copyRedirect} className="flex-shrink-0 px-3" aria-label="Copy redirect URL">
                    {copied ? <CheckCheck className="w-4 h-4 text-green-700 dark:text-green-400" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {data?.configured && !data?.connected && (
          <>
            <p className="text-sm text-muted-foreground">
              Connect your LinkedIn once, then “Post to LinkedIn” on Make Money publishes straight to your
              profile — no copy-paste.
            </p>
            <a href={data.authorize_url}>
              <Button className="w-full h-11 font-semibold gap-2"
                style={{ background: "linear-gradient(135deg, #0A66C2, #0077B5)" }}>
                <Link2 className="w-4 h-4" /> Connect LinkedIn
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
                ? <AlertCircle className="w-5 h-5 text-red-700 dark:text-red-400 flex-shrink-0" />
                : <CheckCircle className={`w-5 h-5 flex-shrink-0 ${expiringSoon ? "text-orange-700 dark:text-orange-400" : "text-green-700 dark:text-green-400"}`} />}
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${
                  expired ? "text-red-700 dark:text-red-300" : expiringSoon ? "text-orange-700 dark:text-orange-300" : "text-green-700 dark:text-green-300"
                }`}>
                  {expired ? "Connection expired" : "Connected"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {expired
                    ? "LinkedIn connections last 60 days. Reconnect to keep posting."
                    : hasDays
                      ? `${daysLeft} days left. LinkedIn doesn't let apps renew this automatically, so reconnect before it runs out.`
                      : "Posts publish as your LinkedIn profile."}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              {data?.authorize_url && (
                <a href={data.authorize_url} className="flex-1">
                  <Button variant="outline" className="w-full gap-2">
                    <RefreshCw className="w-4 h-4" /> Reconnect
                  </Button>
                </a>
              )}
              <Button variant="outline" className="flex-1 gap-2 text-red-700 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-500/10"
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
