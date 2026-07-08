import React from "react";
import { Card } from "@/components/ui/card";
import { Lightbulb } from "lucide-react";

function buildTip(links = []) {
  const stalled = links.find(link => (link.clicks || 0) >= 50 && (link.conversions || 0) === 0);
  const winner = [...links].sort((a, b) => (b.earnings || 0) - (a.earnings || 0))[0];

  if (stalled) return `${stalled.product_name || "One link"} has ${stalled.clicks} clicks but no sales yet. Try a new traffic source, headline, or product angle.`;
  if (winner?.earnings > 0) return `${winner.product_name || "Your top link"} is earning. Share that one again before testing a brand-new offer.`;
  if (links.length > 0) return "You have links ready. Your next best move is to share one today and check clicks tomorrow.";
  return "Start by creating your first tracking link. One good link shared consistently is better than ten unused links.";
}

export default function SmartTipsCard({ links }) {
  return (
    <Card className="p-5 bg-amber-50 border-amber-200 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="flex gap-3">
        <Lightbulb className="mt-1 h-5 w-5 shrink-0" />
        <div>
          <h2 className="font-display text-xl font-bold">Smart tip</h2>
          <p className="mt-2 leading-7">{buildTip(links)}</p>
        </div>
      </div>
    </Card>
  );
}