import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Check, Copy } from "lucide-react";

export default function StandardLinksTable({ links = [] }) {
  const [copiedId, setCopiedId] = useState("");
  const rows = links.slice(0, 5);

  const copyShortLink = async (link) => {
    const url = `${window.location.origin}/functions/trackClick?code=${encodeURIComponent(link.short_code)}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(link.id);
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Your links</h2>
        <Button asChild variant="outline" size="sm"><Link to="/links">View all</Link></Button>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr><th className="p-3 text-left">Name</th><th className="p-3 text-left">Short Link</th><th className="p-3 text-right">Clicks</th><th className="p-3 text-right">Earnings</th></tr>
          </thead>
          <tbody>
            {rows.map((link) => (
              <tr key={link.id} className="border-t">
                <td className="p-3 font-medium">{link.product_name || "Affiliate link"}</td>
                <td className="p-3">
                  <button onClick={() => copyShortLink(link)} className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 font-mono text-xs text-foreground">
                    {link.short_code} {copiedId === link.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </td>
                <td className="p-3 text-right">{link.clicks || 0}</td>
                <td className="p-3 text-right font-semibold">${(link.earnings || 0).toFixed(2)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="4" className="p-5 text-center text-muted-foreground">No links yet. Start with the Make Money flow.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}