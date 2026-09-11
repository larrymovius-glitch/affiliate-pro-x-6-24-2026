import assert from "node:assert/strict";
import test from "node:test";
import { executeTool } from "../api/_lib/assistantTools.js";

const D = {};

test("get_application_profile reports not filled in when nothing is saved", async () => {
  const r = await executeTool("get_application_profile", {}, { user: { id: "me" }, D });
  assert.equal(r.filled_in, false);
});

test("get_application_profile reports not filled in when the profile is all empty values", async () => {
  const r = await executeTool(
    "get_application_profile",
    {},
    { user: { id: "me", affiliate_application_profile: { full_name: "", traffic_sources: [] } }, D }
  );
  assert.equal(r.filled_in, false);
});

test("get_application_profile returns saved fields plus clickbank_nickname and email", async () => {
  const r = await executeTool(
    "get_application_profile",
    {},
    {
      user: {
        id: "me",
        email: "me@example.com",
        clickbank_nickname: "apxalaska",
        affiliate_application_profile: {
          full_name: "Lawrence Movius",
          traffic_sources: ["YouTube", "Emailing"],
          clickbank_status: "Bronze",
        },
      },
      D,
    }
  );
  assert.equal(r.filled_in, true);
  assert.equal(r.full_name, "Lawrence Movius");
  assert.deepEqual(r.traffic_sources, ["YouTube", "Emailing"]);
  assert.equal(r.clickbank_status, "Bronze");
  assert.equal(r.clickbank_nickname, "apxalaska");
  assert.equal(r.email, "me@example.com");
  assert.equal(r.company_name, null, "unset fields come back null, not undefined");
  assert.equal(r.whatsapp_number, null);
});
