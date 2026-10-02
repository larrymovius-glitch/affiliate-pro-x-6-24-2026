import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, ExternalLink, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { normalizeHandle } from "../../../api/_lib/bio.js";

// Claims the address of the public share page and shows it back, ready to
// paste. TikTok, Instagram and YouTube each allow one clickable link on a
// profile and none inside posts, so this one address is how a follower there
// reaches anything at all. The page itself is api/bioPage.js.
export default function SharePageCard({ links = [] }) {
  const { user, checkUserAuth } = useAuth();
  const savedHandle = user?.bio_handle || "";
  const [draft, setDraft] = useState(savedHandle);
  const cleaned = normalizeHandle(draft);
  const featured = links.filter((link) => link.bio_featured_at).length;
  const pageUrl = savedHandle ? `${window.location.origin}/go/${savedHandle}` : "";

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!cleaned) throw new Error("Use at least 2 letters or numbers — no spaces or symbols.");
      await base44.auth.updateMe({ bio_handle: cleaned });
      await checkUserAuth();
    },
    onSuccess: () => toast.success("Your share page is live"),
    // 23505 is Postgres' unique violation: someone already has this handle.
    onError: (/** @type {any} */ error) =>
      toast.error(
        error?.code === "23505"
          ? "That name is taken — try another."
          : error?.message || "Couldn't save that name"
      ),
  });

  const copy = () => {
    navigator.clipboard.writeText(pageUrl);
    toast.success("Share page link copied");
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Share2 className="w-5 h-5 mt-0.5 text-violet-700 dark:text-violet-300 shrink-0" />
        <div>
          <h2 className="font-display font-semibold">Your share page</h2>
          <p className="text-sm text-muted-foreground mt-1">
            One page holding the links you choose. Put its address in your TikTok, Instagram or YouTube
            profile — those only allow one link, and none inside posts. Star a link below to put it on the page.
          </p>
        </div>
      </div>

      {savedHandle ? (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <code className="flex-1 text-sm bg-muted rounded-lg px-3 py-2 font-mono break-all">{pageUrl}</code>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2 h-10" onClick={copy}>
                <Copy className="w-4 h-4" /> Copy
              </Button>
              <Button variant="outline" className="gap-2 h-10" asChild>
                <a href={pageUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" /> View
                </a>
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {featured === 0
              ? "No links on it yet — star one below and it appears straight away."
              : `${featured} link${featured === 1 ? "" : "s"} on the page. The most recently starred shows first.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="bio-handle">Choose your page name</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              id="bio-handle"
              placeholder="e.g. larry"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && cleaned && saveMutation.mutate()}
            />
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !cleaned} className="h-10">
              {saveMutation.isPending ? "Saving..." : "Create page"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {cleaned
              ? `Your page will be ${window.location.origin}/go/${cleaned}`
              : "Letters and numbers, at least 2. This becomes part of the address, so keep it short."}
          </p>
        </div>
      )}
    </Card>
  );
}
