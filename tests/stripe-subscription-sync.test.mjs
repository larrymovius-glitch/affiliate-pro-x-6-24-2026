import assert from "node:assert/strict";
import test from "node:test";
import { syncSubscription } from "../api/stripeWebhook.js";

// Stripe sends customer.subscription.created and .updated within the same
// second, in no guaranteed order. syncSubscription reads the live state from
// Stripe (so an older snapshot can't land last and win) and turns a lost
// insert race -- the unique constraint on stripe_subscription_id, which
// returned a 500 on the first real purchase -- into an update.
function fakeDb({ rows = [], raceOnCreate = false } = {}) {
  const table = [...rows];
  const writes = [];
  return {
    table,
    writes,
    Subscription: {
      filter: async ({ stripe_subscription_id }) => table.filter((r) => r.stripe_subscription_id === stripe_subscription_id),
      create: async (record) => {
        if (raceOnCreate) {
          // The other webhook run inserted this subscription a moment earlier.
          table.push({ id: "row-from-other-run", ...record, status: "incomplete" });
          const err = new Error('duplicate key value violates unique constraint "subscriptions_stripe_subscription_id_key"');
          err.code = "23505";
          throw err;
        }
        const row = { id: `row-${table.length + 1}`, ...record };
        table.push(row);
        writes.push({ op: "create", record });
        return row;
      },
      update: async (id, record) => {
        const row = table.find((r) => r.id === id);
        Object.assign(row, record);
        writes.push({ op: "update", id, record });
        return row;
      },
    },
  };
}

function fakeStripe(live) {
  return {
    subscriptions: {
      retrieve: async (id) => {
        if (live instanceof Error) throw live;
        return { id, ...live };
      },
    },
  };
}

const eventCopy = {
  id: "sub_1",
  status: "incomplete",
  customer: "cus_1",
  metadata: { app_id: "affiliate-pro-x", user_id: "u1", plan_type: "monthly" },
};

test("writes the live status from Stripe, not the event's older snapshot", async () => {
  const D = fakeDb();
  const subscription = await syncSubscription(D, fakeStripe({ ...eventCopy, status: "active" }), eventCopy);
  assert.equal(subscription.status, "active");
  assert.equal(D.table[0].status, "active");
});

test("updates the row instead of failing when another event inserted it first", async () => {
  const D = fakeDb({ raceOnCreate: true });
  await syncSubscription(D, fakeStripe({ ...eventCopy, status: "active" }), eventCopy);
  assert.equal(D.table.length, 1);
  assert.equal(D.table[0].status, "active");
  assert.deepEqual(D.writes.map((w) => w.op), ["update"]);
});

test("updates an existing row, including when it's canceled", async () => {
  const D = fakeDb({ rows: [{ id: "row-1", stripe_subscription_id: "sub_1", status: "active" }] });
  await syncSubscription(D, fakeStripe({ ...eventCopy, status: "canceled", canceled_at: 1789330000 }), { ...eventCopy, status: "canceled" });
  assert.equal(D.table.length, 1);
  assert.equal(D.table[0].status, "canceled");
  assert.equal(D.table[0].canceled_at, new Date(1789330000 * 1000).toISOString());
});

test("falls back to the event's copy when Stripe can't be reached", async () => {
  const D = fakeDb();
  const subscription = await syncSubscription(D, fakeStripe(new Error("Stripe is down")), eventCopy);
  assert.equal(subscription.status, "incomplete");
  assert.equal(D.table[0].status, "incomplete");
});

test("still throws database errors other than the insert race", async () => {
  const D = fakeDb();
  D.Subscription.create = async () => {
    const err = new Error("connection reset");
    err.code = "08006";
    throw err;
  };
  await assert.rejects(syncSubscription(D, fakeStripe({ ...eventCopy, status: "active" }), eventCopy), /connection reset/);
});
