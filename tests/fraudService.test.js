const test = require("node:test");
const assert = require("node:assert");

const {
  scoreTransaction,
  scoreLocalRules,
  buildMlFeatures,
} = require("../src/services/fraudService");

test("scoreLocalRules: clean payment scores 0 with no reasons", () => {
  const r = scoreLocalRules({ amount: 20, used: false, expiresAt: Date.now() + 60000 }, {});
  assert.equal(r.score, 0);
  assert.deepEqual(r.reasons, []);
});

test("scoreLocalRules: used token is a decisive signal", () => {
  const r = scoreLocalRules({ amount: 20, used: true, expiresAt: Date.now() + 60000 }, {});
  assert.ok(r.score >= 50);
  assert.ok(r.reasons.includes("TOKEN_ALREADY_USED"));
});

test("scoreLocalRules: expired + high amount + risky context stack up (capped at 100)", () => {
  const r = scoreLocalRules(
    { amount: 600, used: false, expiresAt: Date.now() - 1000 },
    { isNewDevice: true, rapidAttempts: true, locationMismatch: true }
  );
  assert.equal(r.score, 100);
  assert.ok(r.reasons.includes("TOKEN_EXPIRED"));
  assert.ok(r.reasons.includes("HIGH_TRANSACTION_AMOUNT"));
});

test("buildMlFeatures: defaults are benign", () => {
  const f = buildMlFeatures({ amount: 25 }, {});
  assert.equal(f.amount, 25);
  assert.equal(f.new_device_login, 0);
  assert.equal(f.is_mule_destination, 0);
  assert.equal(f.geo_velocity_kmh, 0);
  assert.equal(f.network_type, "ecoz_mobile");
});

test("buildMlFeatures: context flags map onto model features", () => {
  const f = buildMlFeatures({ amount: 100 }, {
    isNewDevice: true,
    rapidAttempts: true,
    locationMismatch: true,
  });
  assert.equal(f.new_device_login, 1);
  assert.equal(f.time_since_login_seconds, 30);
  assert.equal(f.recent_cashins_24h, 6);
  assert.equal(f.geo_velocity_kmh, 350);
  assert.equal(f.distance_from_last_cashout_km, 120);
});

test("buildMlFeatures: mlFeatures overrides win", () => {
  const f = buildMlFeatures({ amount: 100 }, {
    locationMismatch: true,
    mlFeatures: { geo_velocity_kmh: 999, is_mule_destination: 1 },
  });
  assert.equal(f.geo_velocity_kmh, 999);
  assert.equal(f.is_mule_destination, 1);
});

test("scoreTransaction: falls back to local rules when ML API is down", async () => {
  const realFetch = global.fetch;
  global.fetch = async () => { throw new Error("ECONNREFUSED"); };
  try {
    const r = await scoreTransaction({ amount: 600, used: false, expiresAt: Date.now() + 60000 }, {});
    assert.equal(r.source, "rules_fallback");
    assert.ok(r.reasons.includes("HIGH_TRANSACTION_AMOUNT"));
    assert.equal(r.level, "LOW"); // 20 local points only
  } finally {
    global.fetch = realFetch;
  }
});

test("scoreTransaction: merges ML verdict with local rules", async () => {
  const realFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      risk_score: 92,
      risk_level: "CRITICAL",
      decision: "BLOCK",
      reasons: ["MULE_NETWORK_DETECTION"],
    }),
  });
  try {
    const r = await scoreTransaction(
      { amount: 600, used: false, expiresAt: Date.now() + 60000 }, {}
    );
    assert.equal(r.source, "ml+rules");
    assert.equal(r.level, "HIGH"); // CRITICAL maps to routing HIGH
    assert.equal(r.decision, "BLOCK");
    assert.equal(r.score, 92);
    assert.ok(r.reasons.includes("MULE_NETWORK_DETECTION"));
    assert.ok(r.reasons.includes("HIGH_TRANSACTION_AMOUNT"));
  } finally {
    global.fetch = realFetch;
  }
});

test("scoreTransaction: local token violation overrides a low ML score", async () => {
  const realFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ risk_score: 3, risk_level: "NORMAL", decision: "APPROVE", reasons: [] }),
  });
  try {
    const r = await scoreTransaction(
      { amount: 20, used: true, expiresAt: Date.now() + 60000 }, {}
    );
    assert.equal(r.level, "HIGH");
    assert.ok(r.score >= 50);
    assert.ok(r.reasons.includes("TOKEN_ALREADY_USED"));
  } finally {
    global.fetch = realFetch;
  }
});
