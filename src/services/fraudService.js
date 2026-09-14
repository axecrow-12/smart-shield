const ML_API_URL = process.env.ML_API_URL || "http://localhost:8000";
const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 2500);

/**
 * Local rule-based scoring (fallback when the ML service is unreachable,
 * and always applied for token-integrity checks the ML model doesn't see).
 */
function scoreLocalRules(payment, context = {}) {
  let score = 0;
  const reasons = [];

  if (payment.used) {
    score += 50;
    reasons.push("TOKEN_ALREADY_USED");
  }

  if (payment.expiresAt && Date.now() > payment.expiresAt) {
    score += 40;
    reasons.push("TOKEN_EXPIRED");
  }

  if (payment.amount > 500) {
    score += 20;
    reasons.push("HIGH_TRANSACTION_AMOUNT");
  }

  if (context.isNewDevice) {
    score += 20;
    reasons.push("UNFAMILIAR_DEVICE");
  }

  if (context.rapidAttempts) {
    score += 25;
    reasons.push("MULTIPLE_RAPID_ATTEMPTS");
  }

  if (context.locationMismatch) {
    score += 20;
    reasons.push("LOCATION_MISMATCH");
  }

  return { score: Math.min(score, 100), reasons };
}

/**
 * Map a payment + request context onto the 19 features the v4
 * Zimbabwe LightGBM model expects. Any field can be overridden
 * explicitly via context.mlFeatures (used by demo scenarios).
 */
function buildMlFeatures(payment, context = {}) {
  const base = {
    amount: Number(payment.amount) || 0,
    transaction_type: context.transactionType || "merchant",
    sim_change_frequency: context.simChangeFrequency ?? 0,
    network_type: context.networkType || "ecoz_mobile",
    new_device_login: context.isNewDevice ? 1 : 0,
    time_since_login_seconds:
      context.timeSinceLoginSeconds ?? (context.rapidAttempts ? 30 : 3600),
    is_smurf_pattern: context.isSmurfPattern ? 1 : 0,
    recent_cashins_24h:
      context.recentCashins24h ?? (context.rapidAttempts ? 6 : 0),
    is_post_downtime: context.isPostDowntime ? 1 : 0,
    receiver_risk_score: context.receiverRiskScore ?? 0.0,
    is_legit_merchant: context.isLegitMerchant === false ? 0 : 1,
    is_mule_destination: context.isMuleDestination ? 1 : 0,
    merchant_name_risk: context.merchantNameRisk || "LEGIT",
    Token_latency_seconds: context.tokenLatencySeconds ?? 5,
    geo_velocity_kmh:
      context.geoVelocityKmh ?? (context.locationMismatch ? 350 : 0),
    distance_from_last_cashout_km:
      context.distanceKm ?? (context.locationMismatch ? 120 : 0),
    transaction_hour: new Date().getHours(),
    is_night_transaction:
      new Date().getHours() >= 22 || new Date().getHours() < 5 ? 1 : 0,
    cashout_interval_hours: context.cashoutIntervalHours ?? 24.0,
  };

  return { ...base, ...(context.mlFeatures || {}) };
}

async function callMlApi(features) {
  const res = await fetch(`${ML_API_URL}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(features),
    signal: AbortSignal.timeout(ML_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`ML API responded ${res.status}`);
  }

  return res.json();
}

// Map the ML service's 5-tier risk level onto the backend's 3-tier
// routing level (HIGH -> reject, MEDIUM -> review, LOW -> approve).
function toRoutingLevel(riskLevel) {
  if (riskLevel === "CRITICAL" || riskLevel === "HIGH") return "HIGH";
  if (riskLevel === "MEDIUM") return "MEDIUM";
  return "LOW";
}

function levelFromScore(score) {
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

/**
 * Score a transaction: LightGBM ML service + local token rules combined.
 * Falls back to local rules alone if the ML service is unreachable.
 */
async function scoreTransaction(payment, context = {}) {
  const local = scoreLocalRules(payment, context);

  let ml = null;
  try {
    ml = await callMlApi(buildMlFeatures(payment, context));
  } catch (error) {
    console.warn(`ML API unavailable, using local rules only: ${error.message}`);
  }

  if (!ml) {
    return {
      score: local.score,
      level: levelFromScore(local.score),
      reasons: local.reasons,
      decision: null,
      source: "rules_fallback",
    };
  }

  // Token-integrity violations are decisive regardless of the ML score.
  const score = Math.min(100, Math.max(ml.risk_score, local.score));
  const reasons = [...new Set([...ml.reasons, ...local.reasons])];
  let level = toRoutingLevel(ml.risk_level);
  const localLevel = levelFromScore(local.score);
  if (localLevel === "HIGH" || (localLevel === "MEDIUM" && level === "LOW")) {
    level = localLevel;
  }

  return {
    score,
    level,
    reasons,
    mlScore: ml.risk_score,
    mlRiskLevel: ml.risk_level,
    mlTopFeatures: ml.top_features || [],
    decision: ml.decision,
    source: "ml+rules",
  };
}

module.exports = { scoreTransaction, scoreLocalRules, buildMlFeatures };
