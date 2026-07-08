import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function StandardLinksTable({ links = [] }) {
  const rows = links.slice(0, 5);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Your links</h2>
        <Button asChild variant="outline" size="sm"><Link to="/links">View all</Link></Button>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr><th className="p-3 text-left">Name</th><th className="p-3 text-left">Short Link</th><th className="p-3 text-right">Earnings</th></tr>
          </thead>
          <tbody>
            {rows.map((link) => (
              <tr key={link.id} className="border-t">
                <td className="p-3 font-medium">{link.product_name || "Affiliate link"}</td>
                <td className="p-3 text-muted-foreground">{link.short_code}</td>
                <td className="p-3 text-right font-semibold">${(link.earnings || 0).toFixed(2)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="3" className="p-5 text-center text-muted-foreground">No links yet. Start with the Make Money flow.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}