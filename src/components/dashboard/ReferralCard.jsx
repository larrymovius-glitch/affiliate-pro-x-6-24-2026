import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { withTimeout } from "@/lib/withTimeout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Copy, CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ReferralCard() {
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["referral-stats"],
    queryFn: () => withTimeout(
      base44.functions.invoke("getReferralStats", {}),
      15000,
      "Loading referral info"
    ),
    staleTime: 1000 * 60 * 5,
  });

  const referralCode = data?.data?.referral_code;
  const referredCount = data?.data?.referred_count ?? 0;
  const shareUrl = referralCode ? `${window.location.origin}/register?ref=${referralCode}` : null;

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="w-5 h-5 text-primary" />
          Invite a fellow veteran
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          You know who else could use this. Share your link — every veteran who joins gets free lifetime access, same as you.
        </p>

        {isLoading ? (
          <div className="py-4 text-center">
            <Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" />
          </div>
        ) : isError || !shareUrl ? (
          <p className="text-sm text-muted-foreground text-center py-2">
            Couldn't load your referral link right now. Try refreshing this page.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg border bg-muted/50 px-3 py-2 text-sm truncate">
                {shareUrl}
              </div>
              <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5 flex-shrink-0">
                {copied ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="text-center">
              <span className="text-2xl font-display font-bold text-primary">{referredCount}</span>
              <span className="text-sm text-muted-foreground ml-2">
                {referredCount === 1 ? "veteran joined" : "veterans joined"} through you
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
