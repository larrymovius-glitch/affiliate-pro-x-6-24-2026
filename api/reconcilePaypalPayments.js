import { db } from "./_lib/db.js";
import { getAuthedUser, isCronRequest } from "./_lib/supabase.js";
import { paypalFetch } from "./_lib/paypal.js";
import { PAID_TIER } from "./stripeWebhook.js";

// The safety net PayPal checkout never had. Stripe has stripeWebhook.js
// telling us server-side when money moved; PayPal's Orders API only tells the
// buyer's browser, and capture is an explicit second call made from the
// /payment-success page. So two things can go wrong once the buyer approves:
//
//   1. The buyer never lands back on /payment-success (closed tab, dead
//      signal, redirect blocked). The order sits APPROVED and uncaptured, and
//      expires in a few hours -- a sale silently lost, with the buyer having
//      clicked through PayPal and reasonably believing they paid.
//   2. The capture succeeds at PayPal but our own follow-up work fails (DB
//      write throws, function times out). PayPal HAS taken the money and the
//      account never leaves the free tier. This is the one that costs a
//      customer real money for nothing.
//
// This pass finds pending PayPal rows (written by createPaypalOrder), asks
// PayPal what actually happened to each, and finishes the job either way.
const STALE_MINUTES = 15;   // let the normal redirect+capture path finish first
const ABANDON_HOURS = 12;   // approvals expire in ~3h; well past that, stop asking

function hoursSince(timestamp) {
  const then = new Date(timestamp).getTime();
  if (!then) return 0;
  return (Date.now() - then) / (1000 * 60 * 60);
}

export default async function handler(req, res) {
  try {
    const body = req.body || {};
    const cronOk = isCronRequest(req, body);
    const { user } = await getAuthedUser(req);
    if (user?.role !== "admin" && !cronOk) {
      return res.status(403).json({ error: "Forbidden: Admin access or scheduled run required" });
    }

    const result = await reconcile();
    res.status(200).json(result);
  } catch (error) {
    console.error("reconcilePaypalPayments failed:", error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * The reconciliation pass itself. `D` and the two PayPal calls are injectable
 * so this can be exercised without a database or a live PayPal account -- the
 * same seam api/_lib/assistantTools.js uses. Production callers pass nothing.
 *
 * @param {{ D?: any, fetchOrder?: Function, captureOrder?: Function }} [deps]
 */
export async function reconcile(deps = {}) {
  const D = deps.D || db();
  const fetchOrder = deps.fetchOrder || ((id) => paypalFetch(`/v2/checkout/orders/${id}`));
  const captureOrder =
    deps.captureOrder || ((id) => paypalFetch(`/v2/checkout/orders/${id}/capture`, { method: "POST" }));

  const pendingRows = await D.Payment.filter(
    { payment_method: "paypal", status: "pending" },
    "-created_at",
    200
  );

  const recovered = [];
  const captured = [];
  const abandoned = [];
  const stillWaiting = [];

  for (const row of pendingRows) {
    if (!row.transaction_id) continue;
    const ageHours = hoursSince(row.created_at);
    if (ageHours * 60 < STALE_MINUTES) continue; // too fresh; the buyer may still be on PayPal

    let order;
    try {
      order = await fetchOrder(row.transaction_id);
    } catch (lookupError) {
      // Could be a transient PayPal error or an order they've since purged.
      // Leave it pending so the next run retries rather than guessing from the
      // error text; only give up once it's far past any chance of completing.
      if (ageHours >= ABANDON_HOURS) {
        await D.Payment.update(row.id, {
          status: "failed",
          description: `PayPal order unavailable after ${Math.round(ageHours)}h: ${lookupError.message}`,
        });
        abandoned.push(row.transaction_id);
      } else {
        stillWaiting.push(row.transaction_id);
      }
      continue;
    }

    // Money already moved -- the capture landed but our follow-up didn't.
    if (order.status === "COMPLETED") {
      await finalize(D, row, order, "Recovered by reconciliation: PayPal had already captured this payment");
      recovered.push(row.transaction_id);
      continue;
    }

    // Buyer approved but nobody ever captured. Do it now, before it expires.
    if (order.status === "APPROVED") {
      try {
        const capture = await captureOrder(row.transaction_id);
        if (capture.status !== "COMPLETED") {
          stillWaiting.push(row.transaction_id);
          continue;
        }
        await finalize(D, row, capture, "Captured by reconciliation: buyer approved but never returned to the app");
        captured.push(row.transaction_id);
      } catch (captureError) {
        console.error("Reconciliation capture failed:", row.transaction_id, captureError.message);
        stillWaiting.push(row.transaction_id);
      }
      continue;
    }

    // CREATED (never approved), VOIDED, or anything else: a buyer who never
    // finished. Stop tracking it once it's clearly dead.
    if (ageHours >= ABANDON_HOURS) {
      await D.Payment.update(row.id, {
        status: "failed",
        description: `Abandoned PayPal checkout (order ${order.status} after ${Math.round(ageHours)}h)`,
      });
      abandoned.push(row.transaction_id);
    } else {
      stillWaiting.push(row.transaction_id);
    }
  }

  return {
    success: true,
    checked: pendingRows.length,
    recovered,
    captured,
    abandoned,
    still_pending: stillWaiting.length,
    message: `PayPal reconciliation complete. Recovered: ${recovered.length}, captured: ${captured.length}, abandoned: ${abandoned.length}.`,
  };
}

/** Mark the payment completed and grant the tier, same as a normal capture. */
async function finalize(D, row, paypalOrder, description) {
  const captureUnit = paypalOrder.purchase_units?.[0]?.payments?.captures?.[0];
  const amount = captureUnit?.amount?.value ? Number(captureUnit.amount.value) : Number(row.amount) || 997;
  const currency = (captureUnit?.amount?.currency_code || row.currency || "USD").toLowerCase();

  await D.Payment.update(row.id, { amount, currency, status: "completed", description });

  if (row.user_id) {
    await D.User.update(row.user_id, { subscription_tier: PAID_TIER });
  } else {
    console.error("Reconciled PayPal payment has no user_id, tier not granted:", row.transaction_id);
  }
}
