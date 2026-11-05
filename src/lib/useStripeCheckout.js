import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { withTimeout } from "@/lib/withTimeout";

// How long a checkout button waits for the server before giving up. Without
// a limit, an API call that never answers left the button on
// "Processing..." forever with no error.
export const CHECKOUT_TIMEOUT_MS = 20000;

/**
 * @param {string} functionName  the /api route that creates the checkout
 * @param {string} label         shown in the timeout message
 * @param {string} fallbackError shown when the server gives no reason
 */
function useCheckout(functionName, label, fallbackError) {
  return useMutation({
    mutationFn: async (/** @type {any} */ data) => {
      // Iframe check BEFORE creating the checkout session.
      if (window.self !== window.top) {
        throw new Error("Checkout works only from the published app. Please open the app in a new tab.");
      }
      const response = await withTimeout(base44.functions.invoke(functionName, data), CHECKOUT_TIMEOUT_MS, label);
      const result = response.data || {};
      // A reply with neither a payment link nor free veteran access used to
      // do nothing at all: the button reset and the user was left guessing.
      if (!result.veteranAccess && !result.url) {
        throw new Error(fallbackError);
      }
      return result;
    },
    onSuccess: (data) => {
      if (data.veteranAccess) {
        toast.success("Veteran discount applied! Free access granted.");
      } else {
        window.location.href = data.url;
      }
    },
    onError: (/** @type {any} */ err) => toast.error(err.response?.data?.error || err.message || fallbackError),
  });
}

// Shared by src/pages/Pricing.jsx and PaywallModal.jsx.
export function useStripeCheckout() {
  return useCheckout("createStripeCheckout", "Checkout", "Failed to start checkout");
}

export function usePaypalCheckout() {
  return useCheckout("createPaypalOrder", "PayPal checkout", "Failed to start PayPal checkout");
}

/**
 * True when `mutation` is busy with this particular plan, so only the button
 * that was clicked shows "Processing..." instead of every plan at once.
 * @param {{ isPending: boolean, variables?: any }} mutation
 * @param {string} planType
 */
export function isPendingFor(mutation, planType) {
  return mutation.isPending && mutation.variables?.planType === planType;
}
