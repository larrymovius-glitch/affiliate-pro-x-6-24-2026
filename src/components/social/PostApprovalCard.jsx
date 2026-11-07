import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { withTimeout } from "@/lib/withTimeout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Facebook, ChevronLeft, ChevronRight, Send, Pencil, SkipForward, RefreshCw, Volume2, Square, Loader2, CheckCircle, AlertCircle, Undo2 } from "lucide-react";

// The member's Facebook posts waiting for their OK (see api/_lib/postApprovals.js).
//
// Built to work every way a member might use it -- mouse, touch, keyboard,
// switch device or screen reader -- with the same steps for everyone:
//   - flick through today's options (buttons, or the arrow keys);
//   - hear it read aloud;
//   - change the wording by typing;
//   - post it (with a short undo window), skip today, or ask for different ones.
// Every result is announced through a live region, so nothing depends on
// seeing a colour change.

const UNDO_SECONDS = 30;

/** Keyboard and switch devices fire click with detail 0; a pointer gives 1+. */
function methodFrom(event) {
  return event && event.detail === 0 ? "keyboard" : "tap";
}

function speakable(message) {
  return String(message || "")
    .replace(/#ad/gi, "hashtag ad")
    .replace(/https?:\/\/\S+/g, "your tracked link");
}

export default function PostApprovalCard({ hideWhenEmpty = false }) {
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [status, setStatus] = useState(null); // { ok, text }
  const [countdown, setCountdown] = useState(null); // { seconds, approvalId, method, body }
  const [speaking, setSpeaking] = useState(false);

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ["post-approvals"],
    queryFn: () => base44.entities.PostApproval.filter({ status: "pending" }, "option_number"),
    refetchInterval: 60000,
  });

  const current = pending[Math.min(index, Math.max(pending.length - 1, 0))];
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (index > 0 && index >= pending.length) setIndex(Math.max(pending.length - 1, 0));
  }, [pending.length, index]);

  useEffect(() => () => canSpeak && window.speechSynthesis.cancel(), [canSpeak]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["post-approvals"] });
    queryClient.invalidateQueries({ queryKey: ["facebook-connection"] });
  };

  const publish = useMutation({
    mutationFn: async (/** @type {any} */ { approvalId, method, body }) =>
      (await withTimeout(base44.functions.invoke("publishApproved", { approvalId, method, body }), 45000, "Posting")).data,
    onSuccess: (res) => {
      setStatus({ ok: true, text: `Posted ${res.product} to ${res.page || "your Page"}.` });
      setEditing(false);
      refresh();
    },
    onError: (err) => {
      setStatus({ ok: false, text: err?.message || "It didn't post. Nothing went out." });
      refresh();
    },
  });

  const skip = useMutation({
    mutationFn: async (/** @type {string} */ method) => (await base44.functions.invoke("skipApprovals", { method })).data,
    onSuccess: () => {
      setStatus({ ok: true, text: "Skipped for today. New posts will be ready tomorrow." });
      refresh();
    },
    onError: (err) => setStatus({ ok: false, text: err?.message || "Couldn't skip. Try again." }),
  });

  const more = useMutation({
    mutationFn: async (/** @type {string} */ method) => (await withTimeout(base44.functions.invoke("facebookAutoPost", { fresh: true, method }), 90000, "Getting new posts")).data,
    onSuccess: (res) => {
      const r = res?.results?.[0];
      setIndex(0);
      setStatus(r?.drafted ? { ok: true, text: `Here ${r.drafted === 1 ? "is 1 new post" : `are ${r.drafted} new posts`} to choose from.` } : { ok: false, text: r?.reason || "No other posts are ready right now." });
      refresh();
    },
    onError: (err) => setStatus({ ok: false, text: err?.message || "Couldn't get new posts." }),
  });

  // The undo window: nothing is sent until it runs out or "Post now" is chosen.
  useEffect(() => {
    if (!countdown) return undefined;
    if (countdown.seconds <= 0) {
      publish.mutate({ approvalId: countdown.approvalId, method: countdown.method, body: countdown.body });
      setCountdown(null);
      return undefined;
    }
    const t = setTimeout(() => setCountdown((c) => (c ? { ...c, seconds: c.seconds - 1 } : c)), 1000);
    return () => clearTimeout(t);
  }, [countdown, publish]);

  const busy = publish.isPending || skip.isPending || more.isPending || Boolean(countdown);

  const go = (step) => {
    if (!pending.length) return;
    stopSpeaking();
    setEditing(false);
    const next = (index + step + pending.length) % pending.length;
    setIndex(next);
    setStatus({ ok: true, text: `Option ${next + 1} of ${pending.length}: ${pending[next].product_name}.` });
  };

  const onKeyDown = (e) => {
    if (editing || busy) return;
    if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
  };

  function stopSpeaking() {
    if (canSpeak) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  const readAloud = () => {
    if (!canSpeak || !current) return;
    if (speaking) return stopSpeaking();
    const parts = [`Option ${index + 1} of ${pending.length}, for your Page ${current.page_name || ""}.`, speakable(current.message)];
    if (current.video_url) parts.push("It includes a video.");
    else if (current.image_url) parts.push(`It includes a picture of ${current.product_name}.`);
    const u = new SpeechSynthesisUtterance(parts.join(" "));
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  };

  const startPost = (event) => {
    if (!current) return;
    stopSpeaking();
    const body = editing ? draftText : undefined;
    setCountdown({ seconds: UNDO_SECONDS, approvalId: current.id, method: methodFrom(event), body, product: current.product_name });
    setStatus({ ok: true, text: `Posting ${current.product_name} in ${UNDO_SECONDS} seconds. Choose Undo to stop it.` });
  };

  const undo = () => {
    setCountdown(null);
    setStatus({ ok: true, text: "Stopped. Nothing was posted." });
  };

  const postNow = () => {
    if (!countdown) return;
    setCountdown((c) => ({ ...c, seconds: 0 }));
  };

  const preview = useMemo(() => {
    if (!current) return "";
    if (!editing) return current.message;
    // The disclosure, link and any FDA line stay as they are; only the middle changes.
    return current.message.replace(current.body, draftText || current.body);
  }, [current, editing, draftText]);

  if (isLoading) return null;
  if (!pending.length && hideWhenEmpty && !status) return null;

  return (
    <Card className="border-border bg-card" role="region" aria-labelledby="post-approval-title" onKeyDown={onKeyDown}>
      <CardHeader className="pb-2">
        <CardTitle id="post-approval-title" className="text-foreground text-base flex items-center gap-2">
          <Facebook className="w-5 h-5 text-blue-700 dark:text-blue-400" aria-hidden="true" />
          {pending.length ? "Your Facebook post for today" : "Facebook posts"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p aria-live="polite" role="status" className={status ? `flex items-start gap-2 rounded-xl p-3 text-sm ${status.ok ? "bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/20" : "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20"}` : "sr-only"}>
          {status && (status.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />)}
          <span>{status?.text || ""}</span>
        </p>

        {!pending.length && (
          <p className="text-sm text-muted-foreground">Nothing is waiting for you right now. New posts are offered each day.</p>
        )}

        {current && (
          <>
            <div className="flex items-center justify-between gap-2">
              <Button variant="outline" size="lg" onClick={() => go(-1)} disabled={busy || pending.length < 2} aria-label="Previous option">
                <ChevronLeft className="w-5 h-5" aria-hidden="true" /> <span className="hidden sm:inline">Previous</span>
              </Button>
              <span className="text-sm font-medium text-foreground whitespace-nowrap" aria-live="off">
                {index + 1} of {pending.length}
              </span>
              <Button variant="outline" size="lg" onClick={() => go(1)} disabled={busy || pending.length < 2} aria-label="Next option">
                <span className="hidden sm:inline">Next</span> <ChevronRight className="w-5 h-5" aria-hidden="true" />
              </Button>
            </div>

            {/* What it will look like on Facebook. */}
            <article className="rounded-xl border border-border bg-background overflow-hidden" aria-label={`Preview of the post for ${current.product_name}`}>
              <div className="flex items-center gap-2 px-4 pt-3">
                <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold" aria-hidden="true">
                  {(current.page_name || "P").slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{current.page_name || "Your Page"}</p>
                  <p className="text-xs text-muted-foreground">Ready to post</p>
                </div>
              </div>
              <p className="px-4 py-3 text-base leading-relaxed text-foreground whitespace-pre-line break-words">{preview}</p>
              {current.video_url ? (
                <video src={current.video_url} controls preload="metadata" className="w-full max-h-96 bg-black" aria-label={`Video for ${current.product_name}`} />
              ) : current.image_url ? (
                <img src={current.image_url} alt={`Picture of ${current.product_name}`} className="w-full max-h-96 object-contain bg-black/5" />
              ) : null}
            </article>

            {editing && (
              <div className="space-y-2">
                <label htmlFor="post-approval-edit" className="text-sm font-medium text-foreground">
                  Change the wording (the #ad line and your link stay as they are)
                </label>
                <textarea
                  id="post-approval-edit"
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-border bg-background p-3 text-base text-foreground"
                  disabled={busy}
                />
              </div>
            )}

            {countdown ? (
              <div className="flex flex-col sm:flex-row gap-2" aria-live="polite">
                <p className="flex-1 text-base font-medium text-foreground self-center">Posting in {countdown.seconds} seconds…</p>
                <Button size="lg" variant="outline" onClick={undo} className="gap-2">
                  <Undo2 className="w-5 h-5" aria-hidden="true" /> Undo
                </Button>
                <Button size="lg" onClick={postNow} className="gap-2 bg-indigo-700 hover:bg-indigo-800 text-white">
                  <Send className="w-5 h-5" aria-hidden="true" /> Post now
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button size="lg" onClick={startPost} disabled={busy} className="gap-2 h-12 text-base bg-indigo-700 hover:bg-indigo-800 text-white">
                  {publish.isPending ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <Send className="w-5 h-5" aria-hidden="true" />}
                  {publish.isPending ? "Posting…" : editing ? "Post my version" : "Post it"}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  disabled={busy}
                  className="gap-2 h-12 text-base"
                  onClick={() => {
                    if (editing) { setEditing(false); return; }
                    setDraftText(current.body);
                    setEditing(true);
                  }}
                >
                  <Pencil className="w-5 h-5" aria-hidden="true" /> {editing ? "Cancel changes" : "Change it"}
                </Button>
                {canSpeak && (
                  <Button size="lg" variant="outline" disabled={busy} onClick={readAloud} className="gap-2 h-12 text-base" aria-pressed={speaking}>
                    {speaking ? <Square className="w-5 h-5" aria-hidden="true" /> : <Volume2 className="w-5 h-5" aria-hidden="true" />}
                    {speaking ? "Stop reading" : "Read it to me"}
                  </Button>
                )}
                <Button size="lg" variant="outline" disabled={busy} onClick={(e) => more.mutate(methodFrom(e))} className="gap-2 h-12 text-base">
                  {more.isPending ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-5 h-5" aria-hidden="true" />}
                  {more.isPending ? "Getting new ones…" : "Show me different ones"}
                </Button>
                <Button size="lg" variant="ghost" disabled={busy} onClick={(e) => skip.mutate(methodFrom(e))} className="gap-2 h-12 text-base sm:col-span-2">
                  <SkipForward className="w-5 h-5" aria-hidden="true" /> Skip today
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Nothing posts until you choose Post it. Use the left and right arrow keys to flick between options.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
