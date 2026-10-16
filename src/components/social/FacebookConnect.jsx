import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Facebook, CheckCircle, AlertCircle, Loader2, Link2, Unlink, Send, Copy, CheckCheck } from "lucide-react";
import { toast } from "sonner";

// Connect card for the signed-in user's own Facebook Page. Once connected,
// api/facebookAutoPost.js posts one product a day to it, and "Post one now"
// runs that same step on demand.
//
// Reads its outcome from the ?fb=1&status=... query string that
// api/facebookCallback.js redirects back with.
const OUTCOMES = {
  connected: { ok: true, text: "Facebook Page connected. APX will post one product to it every day." },
  cancelled: { ok: false, text: "Connection cancelled — nothing was changed." },
  not_configured: { ok: false, text: "FACEBOOK_APP_ID / FACEBOOK_APP_SECRET are not set in this deployment." },
  no_code: { ok: false, text: "Facebook redirected back without an authorization code." },
  bad_state: { ok: false, text: "The connection request could not be verified. Start again from this page." },
  unknown_user: { ok: false, text: "The account that started this connection no longer exists." },
  code_exchange_failed: { ok: false, text: "Facebook rejected the connection. Check that FACEBOOK_APP_SECRET in Vercel matches the app secret exactly, and that the redirect URL in the app's Facebook Login settings matches." },
  token_exchange_failed: { ok: false, text: "Could not get a lasting connection. Check the app secret." },
  no_pages: { ok: false, text: "No Facebook Page came back that you can post to. Connect again and tick your Page when Facebook asks which Pages to share." },
  unexpected: { ok: false, text: "Something went wrong completing the connection. Check the function logs." },
};

export default function FacebookConnect() {
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["facebook-connection"],
    queryFn: async () => (await base44.functions.invoke("facebookConnect", {})).data,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("fb") !== "1") return;
    setOutcome(OUTCOMES[params.get("reason")] || OUTCOMES[params.get("status")] || OUTCOMES.unexpected);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const disconnect = useMutation({
    mutationFn: () => base44.functions.invoke("facebookDisconnect", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["facebook-connection"] });
      setOutcome(null);
      toast.success("Facebook disconnected — daily posts stopped");
    },
    onError: (err) => toast.error(err?.message || "Could not disconnect"),
  });

  const postNow = useMutation({
    mutationFn: async () => (await base44.functions.invoke("facebookAutoPost", {})).data,
    onSuccess: (res) => {
      const r = res?.results?.[0];
      if (r?.posted) toast.success(`Posted ${r.product} to your Page`);
      else if (r?.reason === "reconnect_needed") toast.error("Facebook needs you to reconnect your Page.");
      else toast.error(r?.reason || "Nothing was posted");
    },
    onError: (err) => toast.error(err?.message || "Could not post"),
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
        <Loader2 className="w-4 h-4 animate-spin" /> Checking Facebook connection…
      </div>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground text-base flex items-center gap-2">
          <Facebook className="w-5 h-5 text-blue-700 dark:text-blue-400" /> Facebook Page Auto-Posting
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {outcome && (
          <div className={`flex items-start gap-2 rounded-xl p-3 text-sm ${
            outcome.ok
              ? "bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/20"
              : "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20"
          }`}>
            {outcome.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
            <span>{outcome.text}</span>
          </div>
        )}

        {!data?.configured && (
          <div className="flex items-start gap-2 rounded-xl p-4 bg-orange-500/10 border border-orange-500/20">
            <AlertCircle className="w-5 h-5 text-orange-700 dark:text-orange-300 flex-shrink-0 mt-0.5" />
            <div className="space-y-2 min-w-0">
              <p className="text-sm font-semibold text-orange-700 dark:text-orange-300">Not set up yet</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                In your Meta app at developers.facebook.com, add the <span className="text-foreground/80">Facebook Login</span> product,
                then set <code className="text-orange-700 dark:text-orange-300">FACEBOOK_APP_ID</code> and{" "}
                <code className="text-orange-700 dark:text-orange-300">FACEBOOK_APP_SECRET</code> (App settings → Basic) in Vercel and redeploy.
              </p>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Add this exact URL under Facebook Login → Settings → Valid OAuth Redirect URIs:</p>
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
              Connect your Facebook Page once. After that APX posts one product to it every day, with the #ad disclosure and
              your tracked link — nothing to copy or paste.
            </p>
            <a href={data.authorize_url}>
              <Button className="w-full h-11 font-semibold gap-2 text-white" style={{ background: "#1877F2" }}>
                <Link2 className="w-4 h-4" /> Connect Facebook Page
              </Button>
            </a>
          </>
        )}

        {data?.connected && (
          <>
            <div className="flex items-center gap-3 rounded-xl p-4 bg-green-500/10 border border-green-500/20">
              <CheckCircle className="w-5 h-5 flex-shrink-0 text-green-700 dark:text-green-400" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                  Connected{data.page_name ? `: ${data.page_name}` : ""}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">One product posts every day at about 10 AM Eastern.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 gap-2" disabled={postNow.isPending} onClick={() => postNow.mutate()}>
                {postNow.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {postNow.isPending ? "Posting…" : "Post one now"}
              </Button>
              <Button variant="outline" className="flex-1 gap-2 text-red-700 dark:text-red-300 hover:text-red-700 dark:hover:text-red-200 hover:bg-red-500/10"
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
