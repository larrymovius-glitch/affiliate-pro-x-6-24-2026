import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, PartyPopper, Loader2 } from "lucide-react";
import { plans } from "@/lib/pricingPlans";
import { useStripeCheckout } from "@/lib/useStripeCheckout";

// Two ways this opens:
// - variant="success": right when a free user's FIRST ad goes live (see
//   PostGenerator.jsx markAsPosted) -- a proactive "it works, now upgrade"
//   moment, not a block. They can still dismiss and keep using that one ad.
// - variant="limit" (default): when the server actually rejects a SECOND
//   ad going live, enforced by the enforce_free_tier_post_limit trigger --
//   see docs/free-tier-first-ad-limit.sql. Their existing live ad and its
//   analytics stay fully visible either way.
export default function PaywallModal({ open, onOpenChange, variant = "limit" }) {
  const checkout = useStripeCheckout();
  const isSuccess = variant === "success";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {isSuccess ? <PartyPopper className="w-5 h-5 text-primary" /> : <Lock className="w-5 h-5 text-primary" />}
            <DialogTitle>{isSuccess ? "Your first ad is live!" : "You've used your free ad"}</DialogTitle>
          </div>
          <DialogDescription>
            {isSuccess
              ? "Watch it work — check back for its clicks and conversions any time. When you're ready to publish more, upgrade to Pro or Lifetime."
              : "The free plan includes one live ad, so you can see it work. Upgrade to Pro or Lifetime to publish more."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 pt-2 sm:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan.id} className={`space-y-3 rounded-lg border p-4 ${plan.popular ? "border-primary" : ""}`}>
              <div>
                <div className="font-semibold">{plan.name}</div>
                <div className="text-2xl font-bold">
                  {plan.price}
                  <span className="text-sm font-normal text-muted-foreground">{plan.period}</span>
                </div>
              </div>
              <Button
                className="w-full"
                size="sm"
                onClick={() => checkout.mutate({ planType: plan.id })}
                disabled={checkout.isPending}
              >
                {checkout.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : `Choose ${plan.name}`}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
