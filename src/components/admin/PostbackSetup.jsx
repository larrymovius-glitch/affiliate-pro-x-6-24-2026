import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Radio, Copy, CheckCheck, AlertCircle, CheckCircle, Loader2, MousePointerClick, DollarSign,
} from "lucide-react";

// Admin > Tracking. The missing half of the money path: clicks were always
// counted, but nothing in the app ever told anyone what URL to paste into a
// network's postback field, so no sale could be recorded and earnings sat at
// zero no matter how well a link performed.
//
// Admin-only by design, not by accident -- the URLs here carry
// CONVERSION_SECRET, and there is one for the whole app. See the header of
// api/getPostbackSetup.js for why that must not reach a regular user.

function CopyRow({ value }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="flex items-stretch gap-2">
      <code className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap rounded-lg bg-black/40 border border-white/10 px-3 py-2.5 text-xs text-violet-200">
        {value}
      </code>
      <Button variant="outline" onClick={copy} className="flex-shrink-0 gap-1.5 px-3" aria-label="Copy postback URL">
        {copied ? <CheckCheck className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
        <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
      </Button>
    </div>
  );
}

export default function PostbackSetup() {
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["postback-setup"],
    queryFn: async () => (await base44.functions.invoke("getPostbackSetup", {})).data,
  });

  // Hits the real live endpoint exactly as a network would, with a bracketed
  // code. trackConversion.js checks the secret *first*, then short-circuits a
  // bracketed code with 200 before touching the database -- that is the path
  // networks use to validate a URL on save. So this proves reachability and
  // the secret without writing a row or crediting a cent.
  const runTest = async () => {
    if (!data?.templates?.length) return;
    setTesting(true);
    setTestResult(null);
    try {
      const url = `${data.base_url}?secret=${encodeURIComponent(secretFrom(data))}&code=[postback-test]`;
      const res = await fetch(url);
      setTestResult(
        res.ok
          ? { ok: true, message: `Endpoint answered ${res.status}. The URL and secret are accepted — a network configured with this will be able to report sales.` }
          : { ok: false, message: `Endpoint answered ${res.status}. A network posting here would be rejected. Check that CONVERSION_SECRET in Vercel matches the URL above.` }
      );
    } catch (err) {
      setTestResult({ ok: false, message: `Could not reach the endpoint: ${err?.message || "network error"}` });
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm py-8 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading tracking setup…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-xl p-4 bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{error?.message || "Could not load tracking setup."}</span>
      </div>
    );
  }

  const status = data?.status || {};
  const noSales = (status.total_conversions || 0) === 0;

  return (
    <div className="space-y-4">
      {/* Is money actually being recorded? */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Radio className="w-5 h-5 text-violet-400" /> Conversion Tracking
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/5 border border-white/10 p-3">
              <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                <MousePointerClick className="w-3.5 h-3.5" /> Clicks recorded
              </div>
              <p className="text-2xl font-bold text-white mt-1">{status.total_clicks ?? 0}</p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-3">
              <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                <DollarSign className="w-3.5 h-3.5" /> Sales recorded
              </div>
              <p className={`text-2xl font-bold mt-1 ${noSales ? "text-orange-400" : "text-green-400"}`}>
                {status.total_conversions ?? 0}
              </p>
            </div>
          </div>

          {!data?.configured && (
            <div className="flex items-start gap-2 rounded-xl p-4 bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-300">CONVERSION_SECRET is not set</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Add it to the Vercel project&apos;s environment variables and redeploy. Until then the endpoint
                  rejects every postback, so no sale can be recorded.
                </p>
              </div>
            </div>
          )}

          {data?.configured && noSales && (
            <div className="flex items-start gap-2 rounded-xl p-4 bg-orange-500/10 border border-orange-500/20">
              <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-orange-300">No sale has ever been recorded</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Expected until a network is pointed at the URL below. Clicks count on their own; sales only
                  arrive if a network is told where to report them. Until one is, earnings stay at $0 and no
                  payout can be requested.
                </p>
              </div>
            </div>
          )}

          {!noSales && status.last_conversion_at && (
            <div className="flex items-center gap-2 rounded-xl p-3 bg-green-500/10 border border-green-500/20">
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              <p className="text-sm text-green-300">
                Last sale recorded {new Date(status.last_conversion_at).toLocaleString()}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* The URLs. Rendered whenever there is anything to show, not only when
          CONVERSION_SECRET exists: ClickBank's route does not use that secret,
          so its entry is still actionable when the others are missing. */}
      {(data?.templates || []).length > 0 && (
        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle className="text-white text-base">Postback URLs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-xs text-slate-400">
              Paste the matching URL into the network&apos;s postback field. Any URL below carrying a
              <code className="text-violet-300"> secret=</code> holds the app&apos;s conversion secret — treat
              those like a password and never share one with an affiliate.
            </p>

            {data.templates.map((t) => (
              <div key={t.id} className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white">{t.name}</span>
                  {t.supported
                    ? <Badge className="bg-green-500/20 text-green-300 border-green-500/30">Ready</Badge>
                    : <Badge className="bg-red-500/20 text-red-300 border-red-500/30">Not supported yet</Badge>}
                </div>
                <p className="text-xs text-slate-500">{t.where}</p>
                {t.url && <CopyRow value={t.url} />}
                <p className="text-xs text-slate-400 leading-relaxed">{t.notes}</p>
              </div>
            ))}

            {/* Only meaningful for the secret-carrying URLs. ClickBank's route
                takes an encrypted POST, so there is nothing to ping here. */}
            {data?.configured && (
            <div className="pt-2 border-t border-white/10">
              <Button
                variant="outline"
                className="w-full gap-2"
                disabled={testing}
                onClick={runTest}
              >
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                {testing ? "Testing…" : "Test the endpoint"}
              </Button>
              <p className="text-xs text-slate-500 mt-2">
                Sends the same validation ping a network sends when you save a postback URL. Records nothing
                and credits nothing — it only proves the URL is reachable and the secret is accepted.
              </p>
              {testResult && (
                <div className={`flex items-start gap-2 rounded-xl p-3 mt-3 text-sm ${
                  testResult.ok
                    ? "bg-green-500/10 text-green-300 border border-green-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}>
                  {testResult.ok
                    ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* What the endpoint accepts */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-white text-base">What the endpoint accepts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-400">
            For a network not listed above, build the URL yourself from these. Anything else is ignored.
          </p>
          {(data?.param_contract || []).map((p) => (
            <div key={p.param} className="rounded-xl bg-white/5 border border-white/10 p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-sm font-semibold text-violet-300">{p.param}</code>
                {p.required
                  ? <Badge className="bg-red-500/20 text-red-300 border-red-500/30">Required</Badge>
                  : <Badge className="bg-white/10 text-slate-300 border-white/20">Optional</Badge>}
              </div>
              {p.accepts.length > 1 && (
                <p className="text-xs text-slate-500 mt-1">
                  Also accepted as: {p.accepts.slice(1).map((a) => <code key={a} className="text-slate-400">{a} </code>)}
                </p>
              )}
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{p.describes}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// The secret is only ever present inside the returned template URLs (the
// endpoint never sends it as a bare field), so pull it back out of one rather
// than widening the response. Has to look for a URL that actually carries a
// `secret` param rather than just the first URL: ClickBank's entry has a URL
// but no secret in it, since its route authenticates by decrypting the body.
function secretFrom(data) {
  for (const t of data.templates || []) {
    if (!t.url) continue;
    try {
      const found = new URL(t.url).searchParams.get("secret");
      if (found) return found;
    } catch {
      // not a parseable URL; keep looking
    }
  }
  return "";
}
