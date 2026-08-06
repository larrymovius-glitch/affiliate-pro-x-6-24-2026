import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function AutomationHooks() {
  const hooks = [
    { title: "Webhooks Setup", detail: "Manage tracking destinations and short-code routing.", path: "/links" },
    { title: "Postback API Logs", detail: "Review conversion performance and source patterns.", path: "/analytics" },
    { title: "Custom Domains", detail: "Prepare branded routing by campaign.", path: "/campaigns" },
  ];

  return (
    <Card className="p-5">
      <h2 className="font-display text-xl font-bold">Automation hooks</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {hooks.map((hook) => (
          <div key={hook.title} className="rounded-2xl border bg-background p-4">
            <h3 className="font-semibold">{hook.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{hook.detail}</p>
            <Button asChild variant="outline" size="sm" className="mt-3"><Link to={hook.path}>Open</Link></Button>
          </div>
        ))}
      </div>
    </Card>
  );
}