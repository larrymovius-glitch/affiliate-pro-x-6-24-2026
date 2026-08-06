import React from "react";
import { Info } from "lucide-react";

export default function AffiliateDisclosure() {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 mb-6">
      <div className="flex items-start gap-3">
        <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-amber-400 mb-1">FTC Affiliate Disclosure Required</p>
          <p className="text-amber-200/90 leading-relaxed">
            When promoting affiliate links, you <strong>must</strong> clearly disclose to your audience that you may earn commissions.
            Example: <span className="italic">"This post contains affiliate links. I may earn a commission if you make a purchase through my links."</span>
            <br /><br />
            <strong>eBay Specific:</strong> Must include "eBay" trademark and clarify you're an eBay partner.
            <br />
            <strong>ClickBank:</strong> Disclose earnings potential accurately — no income claims without proof.
          </p>
          <p className="text-amber-200/70 text-xs mt-2">
            This is required by FTC guidelines (16 CFR Part 255) and all major affiliate networks including ClickBank, Digistore24, and eBay.
          </p>
        </div>
      </div>
    </div>
  );
}