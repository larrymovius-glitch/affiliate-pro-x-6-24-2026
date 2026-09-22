import assert from "node:assert/strict";
import test from "node:test";
import { executeTool, TOOL_DEFINITIONS } from "../api/_lib/assistantTools.js";

// Maya could create a product but not change one, so the only way to give a
// product the picture its video ad is built from was to send the user off to
// the Products page and have them paste an address by hand. She can now do it.
// What she still cannot do is move where a sale is credited.

function fakeDb(products = []) {
  const updates = [];
  return {
    updates,
    Product: {
      filter: async (f) => products.filter((p) => Object.entries(f).every(([k, v]) => p[k] === v)),
      update: async (id, patch) => {
        updates.push({ id, patch });
        const row = products.find((p) => p.id === id);
        Object.assign(row, patch);
        return row;
      },
    },
  };
}

const mine = () => [{
  id: "p1",
  created_by_id: "me",
  name: "Sony PlayStation 5 PS5 Console",
  url: "https://www.ebay.com/itm/123?campid=5339155721",
  image_url: "",
}];

const ctx = (D) => ({ user: { id: "me" }, D, origin: "https://apx.test" });

test("update_product sets the picture a video ad is built from", async () => {
  const D = fakeDb(mine());
  const r = await executeTool(
    "update_product",
    { product_id: "p1", image_url: "https://i.ebayimg.com/images/g/bVMAAeSwfEZqsdKL/s-l500.webp" },
    ctx(D)
  );
  assert.equal(r.error, undefined);
  // The address someone copies out of a listing is the 500px one; the ad needs
  // the same photo at full size.
  assert.equal(D.updates[0].patch.image_url, "https://i.ebayimg.com/images/g/bVMAAeSwfEZqsdKL/s-l1600.webp");
  assert.deepEqual(r.changed, ["image_url"]);
});

test("update_product refuses a product that isn't the caller's", async () => {
  const D = fakeDb([{ id: "p1", created_by_id: "someone-else", name: "Theirs" }]);
  const r = await executeTool("update_product", { product_id: "p1", name: "Mine now" }, ctx(D));
  assert.match(r.error, /No product of yours/);
  assert.equal(D.updates.length, 0);
});

test("update_product will not take a file path or a plain http address", async () => {
  const D = fakeDb(mine());
  for (const image_url of ["C:\\Users\\larry\\Pictures\\ps5.png", "http://insecure.test/p.jpg", "javascript:alert(1)"]) {
    const r = await executeTool("update_product", { product_id: "p1", image_url }, ctx(D));
    assert.match(r.error, /https/);
  }
  assert.equal(D.updates.length, 0);
});

test("update_product cannot change where a sale is credited", async () => {
  // The affiliate URL carries the id that gets paid. An assistant rewriting it
  // on its own initiative is how commission quietly goes to nobody.
  const D = fakeDb(mine());
  const r = await executeTool(
    "update_product",
    { product_id: "p1", url: "https://www.ebay.com/itm/123?campid=SOMEONE_ELSE", name: "PS5" },
    ctx(D)
  );
  assert.equal(r.error, undefined);
  assert.deepEqual(Object.keys(D.updates[0].patch), ["name"]);
  assert.match(D.updates[0].id, /p1/);
});

test("update_product says plainly when there is nothing to change", async () => {
  const D = fakeDb(mine());
  const r = await executeTool("update_product", { product_id: "p1" }, ctx(D));
  assert.match(r.error, /Nothing to change/);
});

test("the assistants are told not to invent a better product name", () => {
  const tool = TOOL_DEFINITIONS.find((t) => t.name === "update_product");
  assert.ok(tool, "update_product is offered to the assistants");
  assert.match(tool.input_schema.properties.name.description, /never invent/i);
  assert.match(tool.description, /cannot change a product's affiliate URL/i);
});
