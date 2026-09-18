/**
 * Read-only runtime configuration for the Settings page. Strictly
 * non-secret: no PINs, passwords, API keys, or service-account paths.
 */
const express = require("express");
const router = express.Router();
const { requireAuthUnlessDemo } = require("../middleware/authMiddleware");

router.get("/config", requireAuthUnlessDemo, (req, res) => {
  res.json({
    backend: {
      port: Number(process.env.PORT || 5050),
      demoMode: process.env.ALLOW_ANON_DEMO === "1",
      publicBaseUrl: process.env.PUBLIC_BASE_URL || null,
      publicHttpsUrl: process.env.PUBLIC_HTTPS_URL || null,
    },
    ml: {
      apiUrl: process.env.ML_API_URL || "http://localhost:8000",
      timeoutMs: Number(process.env.ML_TIMEOUT_MS || 2500),
    },
    firestore: {
      projectId: process.env.FIREBASE_PROJECT_ID || "smartpay-shield",
      emulatorHost: process.env.FIRESTORE_EMULATOR_HOST || null,
      mode: process.env.FIRESTORE_EMULATOR_HOST ? "emulator" : "cloud",
    },
    scoring: {
      // Fixed in code (fraudService.js / risk_engine.py) — shown so the
      // presenter can explain the policy, not editable at runtime.
      ruleContribution: 40,
      mlContribution: 60,
      ruleFloor: 70,
      routing: { high: "rejected", medium: "verification_required", low: "approved" },
      verification: { codeDigits: 6, windowMinutes: 2, maxAttempts: 3 },
    },
    ecocashEip: {
      baseUrl: process.env.ECOCASH_EIP_BASE_URL || "https://payonline.ecocash.co.zw/ecocashGateway-preprod/payment/v1",
      merchantCode: process.env.ECOCASH_MERCHANT_CODE || "8003",
      merchantNumber: process.env.ECOCASH_MERCHANT_NUMBER || "789111401",
      merchantName: process.env.ECOCASH_MERCHANT_NAME || "SmartPay Shield Demo",
      defaultTestMsisdn: process.env.ECOCASH_TEST_MSISDN || null,
      forwardsOnly: "LOW",
    },
  });
});

module.exports = router;
