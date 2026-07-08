import React from "react";
import { Card } from "@/components/ui/card";

export default function ProLinkTable({ links = [] }) {
  const rows = [...links].sort((a, b) => (b.earnings || 0) - (a.earnings || 0)).slice(0, 8);

  return (
    <Card className="p-5">
      <h2 className="font-display text-xl font-bold">Sub-ID / campaign breakdown</h2>
      <div className="mt-4 overflow-auto rounded-xl border">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr><th className="p-3 text-left">Token</th><th className="p-3 text-left">Product</th><th className="p-3 text-right">Clicks</th><th className="p-3 text-right">Conv.</th><th className="p-3 text-right">EPC</th><th className="p-3 text-right">Earnings</th></tr>
          </thead>
          <tbody>
            {rows.map((link) => {
              const epc = link.clicks > 0 ? (link.earnings || 0) / link.clicks : 0;
              return (
                <tr key={link.id} className="border-t">
                  <td className="p-3 font-mono text-xs">{link.campaign_id || link.short_code}</td>
                  <td className="p-3 font-medium">{link.product_name || "Affiliate link"}</td>
                  <td className="p-3 text-right">{link.clicks || 0}</td>
                  <td className="p-3 text-right">{link.conversions || 0}</td>
                  <td className="p-3 text-right">${epc.toFixed(2)}</td>
                  <td className="p-3 text-right font-semibold">${(link.earnings || 0).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}