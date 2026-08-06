import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Copy, Linkedin, Loader2, Share2 } from "lucide-react";

export default function SharePostBox({ post, trackingUrl, onCopy, copied, isBusy }) {
  const [isPosting, setIsPosting] = useState(false);
  const [linkedInStatus, setLinkedInStatus] = useState("");

  const postToLinkedIn = async () => {
    setIsPosting(true);
    setLinkedInStatus("");
    try {
      await base44.functions.invoke("postToLinkedIn", { postContent: post, affiliateLink: trackingUrl });
      setLinkedInStatus("Posted to LinkedIn.");
    } catch (error) {
      const message = error.response?.data?.error || "Connect LinkedIn on the Social page first.";
      setLinkedInStatus(message.includes("No active connection") ? "Connect LinkedIn on the Social page first." : message);
    } finally {
      setIsPosting(false);
    }
  };

  if (!post) return <p className="text-sm text-muted-foreground">Your ready-to-share message will appear here.</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-background p-4">
        <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{post}</p>
      </div>
      <div className="rounded-xl bg-primary/5 p-3 text-xs text-muted-foreground break-all">
        Tracking link: {trackingUrl}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={onCopy} disabled={isBusy} className="h-12 w-full sm:w-auto">
          {copied ? <Share2 className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
          {copied ? "Copied — ready to share" : "Copy Post and Link"}
        </Button>
        <Button onClick={postToLinkedIn} disabled={isBusy || isPosting} variant="outline" className="h-12 w-full sm:w-auto">
          {isPosting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Linkedin className="mr-2 h-4 w-4" />}
          Post to LinkedIn
        </Button>
      </div>
      {linkedInStatus && <p className="text-sm text-muted-foreground">{linkedInStatus}</p>}
    </div>
  );
}