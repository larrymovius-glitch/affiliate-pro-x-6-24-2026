import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, Loader2 } from "lucide-react";
import { plans } from "@/lib/pricingPlans";
import { useStripeCheckout } from "@/lib/useStripeCheckout";

// Shown when the free-tier one-live-ad limit blocks an action (enforced
// server-side by the enforce_free_tier_post_limit trigger -- see
// docs/free-tier-first-ad-limit.sql). Their existing live ad and its
// analytics stay fully visible; this only appears when they try to publish
// a second one.
export default function PaywallModal({ open, onOpenChange }) {
  const checkout = useStripeCheckout();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            <DialogTitle>You've used your free ad</DialogTitle>
          </div>
          <DialogDescription>
            The free plan includes one live ad, so you can see it work. Upgrade to Pro or Lifetime to publish more.
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
