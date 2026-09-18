const test = require("node:test");
const assert = require("node:assert");

const {
  validateCreatePayment,
  validateTokenBody,
  validateFraudScore,
  validateEcocashInitiate,
  validateEcocashCallback,
  validateVendorTapRequest,
  validateVendorTapCustomerId,
} = require("../src/middleware/validate");

function run(mw, body, query) {
  let statusCode = null;
  let payload = null;
  let nexted = false;
  const req = { body, query: query || {} };
  const res = {
    status(c) { statusCode = c; return this; },
    json(p) { payload = p; return this; },
  };
  mw(req, res, () => { nexted = true; });
  return { statusCode, payload, nexted };
}

const TOKEN = "a".repeat(32);

test("create-payment: valid body passes", () => {
  const r = run(validateCreatePayment, {
    amount: 25.5, merchantName: "Shop", customerPhone: "+263771234567",
  });
  assert.ok(r.nexted);
});

test("create-payment: rejects missing/zero/huge amounts", () => {
  for (const amount of [undefined, 0, -5, 10001, "abc"]) {
    const r = run(validateCreatePayment, { amount, merchantName: "Shop" });
    assert.equal(r.statusCode, 400, `amount=${amount} should 400`);
  }
});

test("create-payment: rejects bad merchant and phone", () => {
  assert.equal(run(validateCreatePayment, { amount: 5, merchantName: "" }).statusCode, 400);
  assert.equal(run(validateCreatePayment, { amount: 5, merchantName: "x".repeat(81) }).statusCode, 400);
  assert.equal(
    run(validateCreatePayment, { amount: 5, merchantName: "Shop", customerPhone: "not-a-phone" }).statusCode,
    400
  );
});

test("token body: accepts 32-hex token with optional context", () => {
  assert.ok(run(validateTokenBody, { token: TOKEN }).nexted);
  assert.ok(run(validateTokenBody, { token: TOKEN, context: { mlFeatures: { a: 1 } } }).nexted);
});

test("token body: rejects malformed tokens and contexts", () => {
  assert.equal(run(validateTokenBody, { token: "short" }).statusCode, 400);
  assert.equal(run(validateTokenBody, { token: TOKEN + "zz" }).statusCode, 400);
  assert.equal(run(validateTokenBody, { token: TOKEN, context: "str" }).statusCode, 400);
  assert.equal(run(validateTokenBody, { token: TOKEN, context: { mlFeatures: [] } }).statusCode, 400);
});

test("fraud score: needs a payment object with numeric amount", () => {
  assert.ok(run(validateFraudScore, { payment: { amount: 9 } }).nexted);
  assert.equal(run(validateFraudScore, {}).statusCode, 400);
  assert.equal(run(validateFraudScore, { payment: { amount: "x" } }).statusCode, 400);
});

test("ecocash initiate: requires valid phone", () => {
  assert.ok(run(validateEcocashInitiate, {
    amount: 10, merchantName: "Shop", customerPhone: "+263779999999",
  }).nexted);
  assert.equal(run(validateEcocashInitiate, {
    amount: 10, merchantName: "Shop", customerPhone: "bad",
  }).statusCode, 400);
});

test("ecocash callback: reference format and status whitelist", () => {
  const ref = "ECO-" + "ab12".repeat(4);
  assert.ok(run(validateEcocashCallback, { providerReference: ref, status: "SUCCESS" }).nexted);
  assert.equal(run(validateEcocashCallback, { providerReference: "nope", status: "SUCCESS" }).statusCode, 400);
  assert.equal(run(validateEcocashCallback, { providerReference: ref, status: "HACKED" }).statusCode, 400);
});

const CUSTOMER_ID = "device1234abcd";

test("vendor tap request: options endpoints need token + customerId, no response required", () => {
  const mw = validateVendorTapRequest();
  assert.ok(run(mw, { token: TOKEN, customerId: CUSTOMER_ID }).nexted);
  assert.equal(run(mw, { token: "short", customerId: CUSTOMER_ID }).statusCode, 400);
  assert.equal(run(mw, { token: TOKEN, customerId: "x" }).statusCode, 400, "customerId too short");
  assert.equal(run(mw, { token: TOKEN, customerId: "has spaces!" }).statusCode, 400);
  assert.equal(run(mw, { token: TOKEN }).statusCode, 400, "missing customerId");
});

test("vendor tap request: verify endpoints also require a response object", () => {
  const mw = validateVendorTapRequest({ requireResponse: true });
  assert.equal(run(mw, { token: TOKEN, customerId: CUSTOMER_ID }).statusCode, 400, "missing response");
  assert.equal(run(mw, { token: TOKEN, customerId: CUSTOMER_ID, response: "not-an-object" }).statusCode, 400);
  assert.equal(run(mw, { token: TOKEN, customerId: CUSTOMER_ID, response: [] }).statusCode, 400, "array rejected");
  assert.ok(run(mw, { token: TOKEN, customerId: CUSTOMER_ID, response: { id: "cred1" } }).nexted);
});

test("vendor tap customerId (query param): validates has-credential lookups", () => {
  assert.ok(run(validateVendorTapCustomerId, {}, { customerId: CUSTOMER_ID }).nexted);
  assert.equal(run(validateVendorTapCustomerId, {}, {}).statusCode, 400, "missing");
  assert.equal(run(validateVendorTapCustomerId, {}, { customerId: "short" }).statusCode, 400);
});
