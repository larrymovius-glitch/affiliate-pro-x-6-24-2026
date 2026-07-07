import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Star, Shield, Heart } from "lucide-react";
import { toast } from "sonner";

const plans = [
  {
    id: "monthly",
    name: "Monthly",
    price: "$29",
    period: "/month",
    description: "Perfect for getting started",
    features: [
      "Unlimited affiliate links",
      "AI post generation (40/day)",
      "eBay trending sync",
      "Content moderation",
      "Daily performance reports",
      "Voice assistant access"
    ],
    popular: false
  },
  {
    id: "yearly",
    name: "Yearly",
    price: "$290",
    period: "/year",
    description: "Save 2 months with annual billing",
    features: [
      "Everything in Monthly",
      "2 months free",
      "Priority support",
      "Advanced analytics",
      "Custom branding"
    ],
    popular: true
  },
  {
    id: "lifetime",
    name: "Lifetime",
    price: "$997",
    period: "one-time",
    description: "Pay once, own it forever",
    features: [
      "Everything in Yearly",
      "Lifetime access",
      "All future updates",
      "White-label option",
      "Direct founder support"
    ],
    popular: false
  }
];

const veteranPlan = {
  name: "Veteran Access",
  price: "FREE",
  period: "forever",
  description: "For certified disabled & homeless veterans",
  features: [
    "All premium features included",
    "No credit card required",
    "Priority onboarding",
    "Dedicated support channel",
    "Mission: Your success"
  ]
};

export default function Pricing() {
  const [veteranRequestStatus, setVeteranRequestStatus] = useState("");

  const veteranMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('requestVeteranVerification', {});
      return response.data;
    },
    onSuccess: (data) => {
      setVeteranRequestStatus(data.status);
      toast.success(data.message);
    },
    onError: (err) => toast.error(err.message || "Failed to submit verification request")
  });

  const checkoutMutation = useMutation({
    mutationFn: async (data) => {
      // Iframe check BEFORE creating the checkout session
      if (window.self !== window.top) {
        throw new Error("Checkout works only from the published app. Please open the app in a new tab.");
      }
      const response = await base44.functions.invoke('createStripeCheckout', data);
      return response.data;
    },
    onSuccess: (data) => {
      if (data.veteranAccess) {
        toast.success("Veteran discount applied! Free access granted.");
      } else if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (err) => toast.error(err.message || "Failed to start checkout")
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-12 px-4">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight">
            Simple Pricing, Real Impact
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Every feature you need to succeed. Veterans always free.
          </p>
          <Badge variant="outline" className="text-sm px-4 py-2 bg-primary/10 text-primary border-primary/20">
            <Heart className="w-4 h-4 mr-2" />
            Disabled & Homeless Veterans: Free Forever
          </Badge>
        </div>

        {/* Veteran Plan */}
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-xl font-display">{veteranPlan.name}</CardTitle>
                <CardDescription>{veteranPlan.description}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-3xl font-bold font-display text-emerald-600">
              {veteranPlan.price}<span className="text-lg text-muted-foreground">{veteranPlan.period}</span>
            </div>
            <ul className="space-y-2">
              {veteranPlan.features.map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Button 
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              onClick={() => veteranMutation.mutate()}
              disabled={veteranMutation.isPending || veteranRequestStatus !== ""}
            >
              {veteranRequestStatus === "verified"
                ? "Veteran Access Active"
                : veteranRequestStatus === "pending"
                ? "Verification Pending Review"
                : veteranMutation.isPending
                ? "Submitting..."
                : "Request Veteran Verification"}
            </Button>
          </CardContent>
        </Card>

        {/* Paid Plans */}
        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <Card key={plan.id} className={`relative ${plan.popular ? 'border-primary shadow-lg scale-105' : ''}`}>
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                  <Star className="w-3 h-3 mr-1" /> Most Popular
                </Badge>
              )}
              <CardHeader>
                <CardTitle className="font-display">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-4xl font-bold font-display">
                  {plan.price}<span className="text-lg text-muted-foreground">{plan.period}</span>
                </div>
                <ul className="space-y-3">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button 
                  className="w-full"
                  onClick={() => checkoutMutation.mutate({ planType: plan.id })}
                  disabled={checkoutMutation.isPending || veteranRequestStatus === "verified"}
                >
                  {checkoutMutation.isPending ? "Processing..." : "Get Started"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Trust Badges */}
        <div className="text-center pt-8 border-t">
          <p className="text-sm text-muted-foreground mb-4">Secure payments powered by Stripe</p>
          <div className="flex justify-center gap-6 opacity-60">
            <Shield className="w-8 h-8" />
            <Star className="w-8 h-8" />
            <Heart className="w-8 h-8" />
          </div>
        </div>
      </div>
    </div>
  );
}