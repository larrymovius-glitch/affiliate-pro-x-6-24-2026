import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

export default function PaymentSuccess() {
  return (
    <div className="min-h-screen bg-background px-4 py-16">
      <Card className="mx-auto max-w-xl p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold text-foreground">Payment Successful</h1>
        <p className="mt-3 text-muted-foreground">Your Affiliate Pro X access is being activated. You can return to your dashboard now.</p>
        <Button asChild className="mt-6">
          <Link to="/">Go to Dashboard</Link>
        </Button>
      </Card>
    </div>
  );
}