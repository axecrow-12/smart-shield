const test = require("node:test");
const assert = require("node:assert");

process.env.ECOCASH_MERCHANT_CODE = "8003";
process.env.ECOCASH_MERCHANT_PIN = "2222";
process.env.ECOCASH_MERCHANT_NUMBER = "789111401";

// Re-require after setting env so the module picks up the test values.
delete require.cache[require.resolve("../src/services/ecocashEipClient")];
const ecocash = require("../src/services/ecocashEipClient");

function fakeFetch(expected, response) {
  return async (url, opts) => {
    expected(url, opts);
    return {
      ok: response.ok !== false,
      status: response.status || 200,
      text: async () => JSON.stringify(response.body || {}),
    };
  };
}

test("chargeRequest: posts to the amount endpoint with Basic auth and the merchant identity", async () => {
  const realFetch = global.fetch;
  let captured = null;
  global.fetch = fakeFetch(
    (url, opts) => {
      captured = { url, opts, body: JSON.parse(opts.body) };
    },
    { body: { transactionOperationStatus: "PENDING SUBSCRIBER VALIDATION", ecocashReference: null } }
  );
  try {
    const result = await ecocash.chargeRequest({
      endUserId: "263777222093",
      amount: 18.5,
      referenceCode: "TEST_REF_1",
      remarks: "unit test",
      notifyUrl: "http://example.test/notify",
    });

    assert.ok(captured.url.endsWith("/transactions/amount"));
    assert.equal(captured.opts.method, "POST");
    assert.ok(captured.opts.headers.Authorization.startsWith("Basic "));
    assert.equal(
      Buffer.from(captured.opts.headers.Authorization.replace("Basic ", ""), "base64").toString(),
      "ecocash:mobiquity"
    );

    assert.equal(captured.body.endUserId, "263777222093");
    assert.equal(captured.body.merchantCode, "8003");
    assert.equal(captured.body.merchantPin, "2222");
    assert.equal(captured.body.merchantNumber, "789111401");
    assert.equal(captured.body.tranType, "MER");
    assert.equal(captured.body.paymentAmount.charginginformation.amount, 18.5);
    assert.equal(captured.body.notifyUrl, "http://example.test/notify");
    assert.ok(captured.body.clientCorrelator, "clientCorrelator must be generated");

    assert.equal(result.ok, true);
    assert.equal(result.json.transactionOperationStatus, "PENDING SUBSCRIBER VALIDATION");
    assert.ok(result.clientCorrelator);
  } finally {
    global.fetch = realFetch;
  }
});

test("chargeRequest: generates a unique clientCorrelator every call", async () => {
  const realFetch = global.fetch;
  const seen = [];
  global.fetch = fakeFetch(
    (url, opts) => seen.push(JSON.parse(opts.body).clientCorrelator),
    { body: {} }
  );
  try {
    await ecocash.chargeRequest({ endUserId: "263777222093", amount: 5 });
    await ecocash.chargeRequest({ endUserId: "263777222093", amount: 5 });
    assert.notEqual(seen[0], seen[1]);
  } finally {
    global.fetch = realFetch;
  }
});

test("queryTransaction: GETs the endUserId/clientCorrelator path with Basic auth", async () => {
  const realFetch = global.fetch;
  let captured = null;
  global.fetch = fakeFetch(
    (url, opts) => { captured = { url, opts }; },
    { body: { transactionOperationStatus: "COMPLETED", ecocashReference: "MP251117.0952.T0527795" } }
  );
  try {
    const result = await ecocash.queryTransaction({ endUserId: "263777222093", clientCorrelator: "abc123" });
    assert.ok(captured.url.includes("/263777222093/transactions/amount/abc123"));
    assert.equal(captured.opts.method, "GET");
    assert.ok(captured.opts.headers.Authorization.startsWith("Basic "));
    assert.equal(result.json.transactionOperationStatus, "COMPLETED");
    assert.equal(result.json.ecocashReference, "MP251117.0952.T0527795");
  } finally {
    global.fetch = realFetch;
  }
});

test("refundRequest: posts to the refund endpoint with the original EcoCash reference", async () => {
  const realFetch = global.fetch;
  let captured = null;
  global.fetch = fakeFetch(
    (url, opts) => { captured = { url, body: JSON.parse(opts.body) }; },
    { body: { transactionOperationStatus: "COMPLETED" } }
  );
  try {
    await ecocash.refundRequest({
      endUserId: "263777222093",
      originalEcocashReference: "MP251117.1507.T0528005",
      amount: 18.5,
    });
    assert.ok(captured.url.endsWith("/transactions/refund"));
    assert.equal(captured.body.originalEcocashReference, "MP251117.1507.T0528005");
    assert.equal(captured.body.merchantCode, "8003");
  } finally {
    global.fetch = realFetch;
  }
});

test("eipRequest surfaces non-ok responses instead of throwing", async () => {
  const realFetch = global.fetch;
  global.fetch = fakeFetch(() => {}, { ok: false, status: 500, body: { error: "boom" } });
  try {
    const result = await ecocash.chargeRequest({ endUserId: "263777222093", amount: 5 });
    assert.equal(result.ok, false);
    assert.equal(result.status, 500);
  } finally {
    global.fetch = realFetch;
  }
});
