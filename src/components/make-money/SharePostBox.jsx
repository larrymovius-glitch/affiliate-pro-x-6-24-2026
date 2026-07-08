import React from "react";
import { Button } from "@/components/ui/button";
import { Copy, Share2 } from "lucide-react";

export default function SharePostBox({ post, trackingUrl, onCopy, copied, isBusy }) {
  if (!post) return <p className="text-sm text-muted-foreground">Your ready-to-share message will appear here.</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-background p-4">
        <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{post}</p>
      </div>
      <div className="rounded-xl bg-primary/5 p-3 text-xs text-muted-foreground break-all">
        Tracking link: {trackingUrl}
      </div>
      <Button onClick={onCopy} disabled={isBusy} className="h-12 w-full sm:w-auto">
        {copied ? <Share2 className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
        {copied ? "Copied — ready to share" : "Copy Post and Link"}
      </Button>
    </div>
  );
}