import assert from "node:assert/strict";
import test from "node:test";
import { sendEmail } from "../api/_lib/email.js";

// The sender address is the whole ballgame here. Resend rejects any From on a
// domain the account has not verified, so a default that looks right but was
// never verified turns every send into a silent 403 -- which is exactly what
// notifications@amhere4utoday.com did for weeks while the job reported success.

function stubFetch(responses = [{ ok: true, status: 200 }]) {
  const calls = [];
  const queue = [...responses];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    const next = queue.shift() || responses[responses.length - 1];
    return {
      ok: next.ok,
      status: next.status,
      text: async () => next.text || "",
    };
  };
  return calls;
}

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const restoreFetch = globalThis.fetch;
  return Promise.resolve(fn()).finally(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    globalThis.fetch = restoreFetch;
  });
}

const MAIL = { to: "admin@example.com", subject: "Summary", body: "<p>hi</p>" };

test("no API key means no send, and no crash", async () => {
  await withEnv({ RESEND_API_KEY: undefined }, async () => {
    const calls = stubFetch();
    assert.equal(await sendEmail(MAIL), false);
    assert.equal(calls.length, 0, "must not call Resend without a key");
  });
});

test("the default sender is one Resend accepts with no DNS set up", async () => {
  await withEnv({ RESEND_API_KEY: "re_test", RESEND_FROM: undefined }, async () => {
    const calls = stubFetch();
    assert.equal(await sendEmail(MAIL), true);
    assert.match(calls[0].body.from, /onboarding@resend\.dev/);
  });
});

test("the default sender is never an unverified vanity domain", async () => {
  await withEnv({ RESEND_API_KEY: "re_test", RESEND_FROM: undefined }, async () => {
    const calls = stubFetch();
    await sendEmail(MAIL);
    assert.doesNotMatch(
      calls[0].body.from,
      /amhere4utoday\.com/,
      "defaulting to an unverified domain makes every send fail silently"
    );
  });
});

test("RESEND_FROM overrides the default once a domain is verified", async () => {
  await withEnv(
    { RESEND_API_KEY: "re_test", RESEND_FROM: "Affiliate Pro X <notifications@amhere4utoday.com>" },
    async () => {
      const calls = stubFetch();
      await sendEmail(MAIL);
      assert.equal(calls[0].body.from, "Affiliate Pro X <notifications@amhere4utoday.com>");
    }
  );
});

test("a rejected send reports false rather than pretending it went out", async () => {
  await withEnv({ RESEND_API_KEY: "re_test" }, async () => {
    stubFetch([{ ok: false, status: 403, text: "domain is not verified" }]);
    assert.equal(await sendEmail(MAIL), false);
  });
});

test("the recipient and subject reach Resend intact", async () => {
  await withEnv({ RESEND_API_KEY: "re_test" }, async () => {
    const calls = stubFetch();
    await sendEmail(MAIL);
    assert.equal(calls[0].body.to, MAIL.to);
    assert.equal(calls[0].body.subject, MAIL.subject);
    assert.equal(calls[0].body.html, MAIL.body);
    assert.match(calls[0].options.headers.Authorization, /^Bearer re_test$/);
  });
});
