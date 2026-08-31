// Shared plan copy for src/pages/Pricing.jsx and PaywallModal.jsx, so the
// two don't drift -- both need the same planType values ("monthly",
// "yearly", "lifetime") since they're passed straight to
// api/createStripeCheckout.js's validPlans check.
export const plans = [
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
