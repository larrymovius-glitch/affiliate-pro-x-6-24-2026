import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, Target } from "lucide-react";

export default function TodayAction({ links = [], posts = [], conversions = 0, earnings = 0 }) {
  let action = { title: "Create your first money link", detail: "Use the guided flow to pick a product, create a link, and copy a post.", path: "/make-money", cta: "Start Guided Flow" };

  if (links.length > 0 && posts.length === 0) {
    action = { title: "Turn your best link into a post", detail: "Use the guided flow to create a simple post you can share today.", path: "/make-money", cta: "Create Share Pack" };
  } else if (links.some(l => (l.clicks || 0) > 0) && conversions === 0) {
    action = { title: "Improve a link that is getting attention", detail: "Clicks are coming in. Create a fresh share pack for your best product.", path: "/make-money", cta: "Create Share Pack" };
  } else if (earnings > 0) {
    action = { title: "Check your payout readiness", detail: "You have earnings. Make sure your payout setup is ready.", path: "/payouts", cta: "View Payouts" };
  }

  return (
    <Card className="p-5 border-primary/20 bg-primary/5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Target className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Best Next Step</p>
          <h2 className="mt-1 font-display text-xl font-bold text-foreground">{action.title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{action.detail}</p>
          <Button asChild className="mt-4">
            <Link to={action.path}>{action.cta}<ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}