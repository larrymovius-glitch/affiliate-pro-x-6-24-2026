import assert from "node:assert/strict";
import test from "node:test";
import { getAuthedUser, isCronRequest } from "../api/_lib/supabase.js";

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. That is not a
// Supabase token, and passing it to Supabase's getUser logged a 403 "bad_jwt"
// in the project's auth logs on every scheduled run. The cron secret must be
// recognised before any call to Supabase is made.

test("getAuthedUser does not send the cron secret to Supabase as a login", async () => {
  const saved = { secret: process.env.CRON_SECRET, url: process.env.SUPABASE_URL };
  process.env.CRON_SECRET = "cron-secret-for-test";
  // With no Supabase URL, reaching Supabase at all would throw.
  delete process.env.SUPABASE_URL;
  try {
    const req = { headers: { authorization: "Bearer cron-secret-for-test" } };
    const { user } = await getAuthedUser(req);
    assert.equal(user, null);
    assert.equal(isCronRequest(req), true);
  } finally {
    if (saved.secret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = saved.secret;
    if (saved.url !== undefined) process.env.SUPABASE_URL = saved.url;
  }
});
