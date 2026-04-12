function scoreTransaction(payment, context = {}) {
  let score = 0;
  const reasons = [];

  if (payment.used) {
    score += 50;
    reasons.push("Token already used");
  }

  if (Date.now() > payment.expiresAt) {
    score += 40;
    reasons.push("Token expired");
  }

  if (payment.amount > 500) {
    score += 20;
    reasons.push("High transaction amount");
  }

  if (context.isNewDevice) {
    score += 20;
    reasons.push("Unfamiliar device");
  }

  if (context.rapidAttempts) {
    score += 25;
    reasons.push("Multiple rapid attempts");
  }

  if (context.locationMismatch) {
    score += 20;
    reasons.push("Suspicious location mismatch");
  }

  let level = "LOW";
  if (score >= 50) {
    level = "HIGH";
  } else if (score >= 25) {
    level = "MEDIUM";
  }

  return { score, level, reasons };
}

module.exports = { scoreTransaction };