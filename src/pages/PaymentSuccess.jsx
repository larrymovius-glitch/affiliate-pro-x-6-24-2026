import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const paypalToken = searchParams.get("token");
  const [status, setStatus] = useState(paypalToken ? "capturing" : "done");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!paypalToken) return;
    let cancelled = false;

    (async () => {
      try {
        await base44.functions.invoke("capturePaypalOrder", { orderId: paypalToken });
        if (!cancelled) setStatus("done");
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage(err.message || "We couldn't confirm your PayPal payment.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paypalToken]);

  if (status === "capturing") {
    return (
      <div className="min-h-screen bg-background px-4 py-16">
        <Card className="mx-auto max-w-xl p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Loader2 className="h-9 w-9 animate-spin" />
          </div>
          <h1 className="mt-6 font-display text-3xl font-bold text-foreground">Finalizing Your Payment</h1>
          <p className="mt-3 text-muted-foreground">Hang tight while we confirm your PayPal payment.</p>
        </Card>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-background px-4 py-16">
        <Card className="mx-auto max-w-xl p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-9 w-9" />
          </div>
          <h1 className="mt-6 font-display text-3xl font-bold text-foreground">We Couldn't Confirm That Payment</h1>
          <p className="mt-3 text-muted-foreground">
            {errorMessage} If PayPal took your payment, contact support and we'll sort it out - you won't lose your money.
          </p>
          <Button asChild className="mt-6">
            <Link to="/pricing">Back to Pricing</Link>
          </Button>
        </Card>
      </div>
    );
  }

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
