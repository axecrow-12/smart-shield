/**
 * Request validation for the payment, fraud, and EcoCash routes.
 * Rejects with 400 + a field-specific message before any handler runs.
 */

const MAX_AMOUNT = 10000;
const PHONE_RE = /^\+?[0-9]{9,15}$/;
const TOKEN_RE = /^[a-f0-9]{32}$/i;
const ECO_REF_RE = /^ECO-[a-f0-9]{16}$/i;
const ECO_STATUSES = ["SUCCESS", "FAILED", "PENDING"];

function bad(res, message) {
  return res.status(400).json({ error: message });
}

function checkAmount(res, amount) {
  const n = Number(amount);
  if (amount === undefined || amount === null || Number.isNaN(n)) {
    bad(res, "amount must be a number");
    return null;
  }
  if (n <= 0 || n > MAX_AMOUNT) {
    bad(res, `amount must be between 0 and ${MAX_AMOUNT}`);
    return null;
  }
  return n;
}

function checkContext(res, context) {
  if (context === undefined || context === null) return true;
  if (typeof context !== "object" || Array.isArray(context)) {
    bad(res, "context must be an object");
    return false;
  }
  const ml = context.mlFeatures;
  if (ml !== undefined && (typeof ml !== "object" || ml === null || Array.isArray(ml))) {
    bad(res, "context.mlFeatures must be an object");
    return false;
  }
  return true;
}

function validateCreatePayment(req, res, next) {
  const { amount, merchantName, customerPhone } = req.body || {};
  if (checkAmount(res, amount) === null) return;
  if (typeof merchantName !== "string" || !merchantName.trim() || merchantName.length > 80) {
    return bad(res, "merchantName must be a non-empty string (max 80 chars)");
  }
  if (customerPhone !== undefined && customerPhone !== null && !PHONE_RE.test(String(customerPhone))) {
    return bad(res, "customerPhone must be a valid phone number (e.g. +263771234567)");
  }
  next();
}

function validateTokenBody(req, res, next) {
  const { token, context } = req.body || {};
  if (typeof token !== "string" || !TOKEN_RE.test(token)) {
    return bad(res, "token must be a 32-character hex string");
  }
  if (!checkContext(res, context)) return;
  next();
}

function validateFraudScore(req, res, next) {
  const { payment, context } = req.body || {};
  if (!payment || typeof payment !== "object" || Array.isArray(payment)) {
    return bad(res, "payment is required and must be an object");
  }
  if (checkAmount(res, payment.amount) === null) return;
  if (!checkContext(res, context)) return;
  next();
}

function validateEcocashInitiate(req, res, next) {
  const { amount, customerPhone, merchantName } = req.body || {};
  if (checkAmount(res, amount) === null) return;
  if (typeof merchantName !== "string" || !merchantName.trim() || merchantName.length > 80) {
    return bad(res, "merchantName must be a non-empty string (max 80 chars)");
  }
  if (!PHONE_RE.test(String(customerPhone || ""))) {
    return bad(res, "customerPhone must be a valid phone number (e.g. +263771234567)");
  }
  next();
}

function validateEcocashCallback(req, res, next) {
  const { providerReference, status, context } = req.body || {};
  if (typeof providerReference !== "string" || !ECO_REF_RE.test(providerReference)) {
    return bad(res, "providerReference must look like ECO-<16 hex chars>");
  }
  if (!ECO_STATUSES.includes(status)) {
    return bad(res, `status must be one of ${ECO_STATUSES.join(", ")}`);
  }
  if (!checkContext(res, context)) return;
  next();
}

module.exports = {
  validateCreatePayment,
  validateTokenBody,
  validateFraudScore,
  validateEcocashInitiate,
  validateEcocashCallback,
  // exported for tests
  _internals: { PHONE_RE, TOKEN_RE, ECO_REF_RE, MAX_AMOUNT },
};
