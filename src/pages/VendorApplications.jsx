import React, { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, CheckCircle2, AlertTriangle, ShieldCheck, History } from "lucide-react";
import { toast } from "sonner";

// The one screen where the vendor-application bot's work becomes visible
// and a human decides what actually goes out. Nothing here submits itself:
// draftVendorApplication.js only ever reads a form and proposes answers;
// submitVendorApplication.js only ever runs on the exact mappings this page
// sends it, and every field starts unconfirmed -- "needs review" items are
// never pre-checked, on purpose. Full history stays visible below so
// nothing the bot has ever done is hidden after the fact.
export default function VendorApplications() {
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState(null);
  // Which fields are actually approved to submit -- starts as just the
  // high-confidence ones drafts already flagged ready; a needsReview field
  // only joins this set once the user has looked at it and typed/confirmed
  // a value themselves.
  const [approved, setApproved] = useState({});
  const [reviewValues, setReviewValues] = useState({});

  const draftMutation = useMutation({
    mutationFn: async (/** @type {any} */ targetUrl) => {
      const response = await base44.functions.invoke("draftVendorApplication", { url: targetUrl });
      return response.data;
    },
    onSuccess: (data) => {
      setDraft(data);
      const initialApproved = {};
      for (const m of data.readyToFill || []) initialApproved[m.selector] = true;
      setApproved(initialApproved);
      setReviewValues({});
      if ((data.needsReview || []).length > 0) {
        toast.warning(`${data.needsReview.length} field(s) need your review before this can be submitted.`);
      } else {
        toast.success("Draft ready. Review the fields below before submitting.");
      }
    },
    onError: (/** @type {any} */ err) => toast.error(err.response?.data?.error || err.message || "Couldn't read that form"),
  });

  const submitMutation = useMutation({
    mutationFn: async (/** @type {any} */ approvedMappings) => {
      const response = await base44.functions.invoke("submitVendorApplication", { url, approvedMappings });
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`Submitted ${data.submitted.length} field(s).${data.skipped.length ? ` ${data.skipped.length} were skipped -- the form may have changed.` : ""}`);
      setDraft(null);
      setUrl("");
      historyQuery.refetch();
    },
    onError: (/** @type {any} */ err) => toast.error(err.response?.data?.error || err.message || "Submission failed"),
  });

  const historyQuery = useQuery({
    queryKey: ["vendor-applications-history"],
    queryFn: async () => {
      const rows = await base44.entities.VendorApplication.list("-created_at", 20);
      return rows;
    },
  });

  const reviewFieldValue = (selector) => reviewValues[selector] ?? "";

  const confirmReviewField = (mapping) => {
    const value = reviewFieldValue(mapping.selector);
    if (!value.trim()) {
      toast.error("Enter a value before confirming this field.");
      return;
    }
    setApproved((prev) => ({ ...prev, [mapping.selector]: true }));
  };

  const buildApprovedMappings = () => {
    const fromReady = (draft?.readyToFill || []).filter((m) => approved[m.selector]).map((m) => ({ selector: m.selector, value: m.value }));
    const fromReview = (draft?.needsReview || [])
      .filter((m) => approved[m.selector])
      .map((m) => ({ selector: m.selector, value: reviewValues[m.selector] }));
    return [...fromReady, ...fromReview];
  };

  const approvedCount = buildApprovedMappings().length;
  const totalFields = (draft?.readyToFill?.length || 0) + (draft?.needsReview?.length || 0);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, #22C55E, #0EA5E9)" }}>
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground font-display">Vendor Applications</h1>
          <p className="text-sm text-muted-foreground">
            Paste a vendor's affiliate-application URL. It reads the real form and drafts answers from your{" "}
            <a href="/application-profile" className="underline">Application Profile</a> -- nothing is submitted until you review and approve it below.
          </p>
        </div>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground text-base">Read a vendor's application form</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://vendor-example.com/affiliates/apply"
            disabled={draftMutation.isPending}
          />
          <Button onClick={() => draftMutation.mutate(url)} disabled={!url.trim() || draftMutation.isPending}>
            {draftMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span className="ml-2">Read Form</span>
          </Button>
        </CardContent>
      </Card>

      {draft && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground text-base flex items-center gap-2">
              Review before submitting
              <Badge variant="outline">{approvedCount} of {totalFields} approved</Badge>
            </CardTitle>
            <CardDescription>Nothing is sent to the vendor until you click Submit below.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {(draft.readyToFill || []).length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" /> Ready to fill (drafted with high confidence)
                </div>
                {draft.readyToFill.map((m) => (
                  <div key={m.selector} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <input
                      type="checkbox"
                      checked={!!approved[m.selector]}
                      onChange={(e) => setApproved((prev) => ({ ...prev, [m.selector]: e.target.checked }))}
                    />
                    <div className="flex-1">
                      <div className="text-xs text-muted-foreground">{m.selector}</div>
                      <div className="text-foreground text-sm">{m.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(draft.needsReview || []).length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm font-medium">
                  <AlertTriangle className="w-4 h-4" /> Needs your review -- nothing here is filled in automatically
                </div>
                {draft.needsReview.map((m) => (
                  <div key={m.selector} className="space-y-1.5 rounded-lg border border-amber-500/30 p-3">
                    <Label className="text-xs text-muted-foreground">{m.label || m.selector}{m.reason ? ` -- ${m.reason}` : ""}</Label>
                    <div className="flex gap-2">
                      <Input
                        value={reviewFieldValue(m.selector)}
                        onChange={(e) => {
                          setReviewValues((prev) => ({ ...prev, [m.selector]: e.target.value }));
                          setApproved((prev) => ({ ...prev, [m.selector]: false }));
                        }}
                        placeholder="Type the answer for this field"
                      />
                      <Button variant="outline" onClick={() => confirmReviewField(m)} disabled={!!approved[m.selector]}>
                        {approved[m.selector] ? "Confirmed" : "Confirm"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button
              className="w-full"
              disabled={approvedCount === 0 || submitMutation.isPending}
              onClick={() => submitMutation.mutate(buildApprovedMappings())}
            >
              {submitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Submit {approvedCount} Approved Field{approvedCount === 1 ? "" : "s"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground text-base flex items-center gap-2">
            <History className="w-4 h-4" /> Submission history
          </CardTitle>
          <CardDescription>Every submission this bot has ever made, success or failure.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {historyQuery.isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          {!historyQuery.isLoading && (historyQuery.data || []).length === 0 && (
            <p className="text-sm text-muted-foreground">No submissions yet.</p>
          )}
          {(historyQuery.data || []).map((row) => (
            <div key={row.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <div className="text-foreground text-sm break-all">{row.vendor_url}</div>
                <div className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</div>
              </div>
              <Badge variant={row.status === "submitted" ? "outline" : "destructive"}>{row.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
