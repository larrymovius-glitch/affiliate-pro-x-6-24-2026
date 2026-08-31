import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

// Shared by src/pages/Pricing.jsx and PaywallModal.jsx.
export function useStripeCheckout() {
  return useMutation({
    mutationFn: async (data) => {
      // Iframe check BEFORE creating the checkout session.
      if (window.self !== window.top) {
        throw new Error("Checkout works only from the published app. Please open the app in a new tab.");
      }
      const response = await base44.functions.invoke("createStripeCheckout", data);
      return response.data;
    },
    onSuccess: (data) => {
      if (data.veteranAccess) {
        toast.success("Veteran discount applied! Free access granted.");
      } else if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (err) => toast.error(err.response?.data?.error || err.message || "Failed to start checkout"),
  });
}
