import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { __test } from "../api/clickbankNotification.js";

const { decryptNotification, extractTrackingCodes, extractAmount, CREDITS, DEBITS } = __test;

// Encrypts the way ClickBank does, written out independently here rather than
// reusing anything from the handler -- otherwise a wrong key derivation would
// round-trip happily against itself and the test would prove nothing. This
// mirrors the published reference (PHP):
//   openssl_encrypt($json, 'AES-256-CBC', substr(sha1($secret), 0, 32),
//                   OPENSSL_RAW_DATA, $iv)
function encryptLikeClickBank(json, secret, { zeroPad = false } = {}) {
  // Same SHA-1 as the handler, for the same unavoidable reason -- this mirrors
  // ClickBank's own key derivation so the round-trip actually proves the
  // handler matches the protocol. See the note in api/clickbankNotification.js.
  // codeql[js/weak-cryptographic-algorithm]
  const key = crypto.createHash("sha1").update(secret).digest("hex").substring(0, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

  let body;
  if (zeroPad) {
    // Some receivers trim "\0..\32" off the plaintext, implying the padding is
    // not always PKCS#7. Reproduce that variant to prove the fallback path.
    cipher.setAutoPadding(false);
    const raw = Buffer.from(json, "utf8");
    const padLen = 16 - (raw.length % 16 || 16);
    const padded = Buffer.concat([raw, Buffer.alloc(padLen === 16 ? 0 : padLen)]);
    body = Buffer.concat([cipher.update(padded), cipher.final()]);
  } else {
    body = Buffer.concat([cipher.update(Buffer.from(json, "utf8")), cipher.final()]);
  }

  return { notification: body.toString("base64"), iv: iv.toString("base64") };
}

const SECRET = "TESTSECRET123456"; // ClickBank secret keys are up to 16 chars

test("decrypts a ClickBank-encrypted notification back to the original JSON", () => {
  const payload = { receipt: "ABC123", transactionType: "SALE", totalAccountAmount: 42.5 };
  const { notification, iv } = encryptLikeClickBank(JSON.stringify(payload), SECRET);

  const out = JSON.parse(decryptNotification(notification, iv, SECRET));
  assert.deepEqual(out, payload);
});

test("decrypts the zero-padded variant too, rather than failing a real sale over padding", () => {
  const payload = { receipt: "ZERO1", transactionType: "BILL", totalAccountAmount: 9.99 };
  const { notification, iv } = encryptLikeClickBank(JSON.stringify(payload), SECRET, { zeroPad: true });

  const out = JSON.parse(decryptNotification(notification, iv, SECRET));
  assert.deepEqual(out, payload);
});

test("a notification encrypted with a different secret does not decrypt to usable JSON", () => {
  const { notification, iv } = encryptLikeClickBank(JSON.stringify({ receipt: "X" }), "OTHERSECRET12345");

  // Either the decipher throws, or it yields bytes that are not the payload.
  // Both are fine; silently returning the real payload would not be.
  let recovered = null;
  try {
    recovered = JSON.parse(decryptNotification(notification, iv, SECRET));
  } catch {
    recovered = null;
  }
  assert.notDeepEqual(recovered, { receipt: "X" });
});

test("pulls the tracking code out of every shape trackingCodes comes in", () => {
  assert.deepEqual(extractTrackingCodes({ trackingCodes: ["auto_widget_1"] }), ["auto_widget_1"]);
  assert.deepEqual(extractTrackingCodes({ trackingCodes: "plainstring" }), ["plainstring"]);
  assert.deepEqual(
    extractTrackingCodes({ trackingCodes: [{ trackingCode: "objshape" }] }),
    ["objshape"]
  );
  assert.deepEqual(extractTrackingCodes({ vendorVariables: { tid: "viavendor" } }), ["viavendor"]);
  assert.deepEqual(extractTrackingCodes({}), []);
  assert.deepEqual(extractTrackingCodes({ trackingCodes: [""] }), []);
});

test("credits the affiliate's commission, never the gross order amount", () => {
  // The distinction that matters: totalOrderAmount is what the customer paid.
  // Crediting it would pay the affiliate several times what they earned.
  assert.equal(
    extractAmount({ totalAccountAmount: 27.4, totalOrderAmount: 99.0 }),
    27.4
  );
});

test("falls back to summing per-item affiliate payout when no account total is present", () => {
  assert.equal(
    extractAmount({ lineItems: [{ affiliatePayout: 10 }, { affiliatePayout: 5.25 }] }),
    15.25
  );
  assert.equal(extractAmount({ lineItems: [{ accountAmount: 3 }] }), 3);
  assert.equal(extractAmount({}), 0);
});

test("refunds and chargebacks reverse a balance instead of adding to it", () => {
  for (const t of ["SALE", "BILL"]) assert.equal(CREDITS.has(t), true, `${t} should credit`);
  for (const t of ["RFND", "CGBK", "INSF"]) assert.equal(DEBITS.has(t), true, `${t} should debit`);
  // No overlap -- a type must not both credit and debit.
  for (const t of DEBITS) assert.equal(CREDITS.has(t), false, `${t} must not also credit`);
});

test("amounts are taken as magnitudes so the transaction type alone decides direction", () => {
  // ClickBank reports a refund's amount negative in some payloads and positive
  // in others. If the sign came from the amount as well as the type, a negative
  // refund amount would double-negate into a credit.
  assert.equal(extractAmount({ totalAccountAmount: -27.4 }), 27.4);
});
