/**
 * Real EcoCash Instant Payment (EIP) sandbox integration.
 *
 * Kept fully separate from the mock flow in ecocashRoutes.js: different
 * mount path (/api/ecocash-eip), different Firestore collection
 * (ecocashEipTransactions vs. ecocashTransactions), so the two can
 * never collide and the existing mock + its smoke coverage stay
 * untouched.
 *
 * Design: score BEFORE forwarding. A transaction our own fraud engine
 * flags HIGH or MEDIUM is blocked locally and never reaches EcoCash's
 * real servers — no charge exists to reverse. Only a LOW-risk verdict
 * is forwarded as a real Charge Request, then polled (not webhook-
 * driven) until it resolves, so the demo has no dependency on EcoCash's
 * servers being able to reach us over the internet.
 */
const express = require("express");
const router = express.Router();
const { db } = require("../config/firebase");
const { logError } = require("../utils/logger");
const { scoreTransaction } = require("../services/fraudService");
const { getLanUrl } = require("../utils/network");
const { requireAuthUnlessDemo } = require("../middleware/authMiddleware");
const ecocash = require("../services/ecocashEipClient");

const MSISDN_RE = /^2637[0-9]{8}$/; // Zimbabwe mobile MSISDN, e.g. 263777222093

router.get("/config", (req, res) => {
  res.json({
    defaultEndUserId: process.env.ECOCASH_TEST_MSISDN || "",
  });
});

router.post("/charge", requireAuthUnlessDemo, async (req, res) => {
  try {
    const { amount, endUserId, remarks } = req.body || {};

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0 || numAmount > 10000) {
      return res.status(400).json({ error: "amount must be a number between 0 and 10000" });
    }
    if (typeof endUserId !== "string" || !MSISDN_RE.test(endUserId)) {
      return res.status(400).json({ error: "endUserId must be a Zimbabwe MSISDN, e.g. 263771234567" });
    }

    // Payment-shaped object compatible with scoreTransaction()'s existing
    // local-rule checks (amount / used / expiresAt) — reused unmodified.
    const payment = { amount: numAmount, used: false, expiresAt: Date.now() + 10 * 60 * 1000 };
    const fraudResult = await scoreTransaction(payment, {});

    await db.collection("fraudLogs").add({
      source: "ecocash_eip",
      endUserId,
      amount: numAmount,
      result: fraudResult,
      createdAt: Date.now(),
    });

    if (fraudResult.level === "HIGH" || fraudResult.level === "MEDIUM") {
      return res.json({
        status: "blocked",
        fraudResult,
        ecocash: null,
        message: "Blocked before reaching EcoCash — no real charge was sent.",
      });
    }

    const notifyUrl = `${getLanUrl(req)}/api/ecocash-eip/notify`;
    const charge = await ecocash.chargeRequest({
      endUserId,
      amount: numAmount,
      referenceCode: `SPS_${Date.now()}`,
      remarks: remarks || "SmartPay Shield live sandbox demo",
      notifyUrl,
    });

    if (!charge.ok) {
      logError("EcoCash EIP charge request failed", new Error(`HTTP ${charge.status}`), { raw: charge.raw });
      return res.status(502).json({
        status: "error",
        fraudResult,
        error: "EcoCash sandbox rejected the charge request",
      });
    }

    const record = {
      clientCorrelator: charge.clientCorrelator,
      endUserId,
      amount: numAmount,
      fraudResult,
      ecocashInitialResponse: charge.json,
      transactionOperationStatus: charge.json?.transactionOperationStatus || "PENDING SUBSCRIBER VALIDATION",
      ecocashReference: charge.json?.ecocashReference || null,
      notifyPayload: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.collection("ecocashEipTransactions").doc(charge.clientCorrelator).set(record);

    res.json({
      status: "forwarded",
      fraudResult,
      ecocash: {
        clientCorrelator: charge.clientCorrelator,
        endUserId,
        transactionOperationStatus: record.transactionOperationStatus,
      },
    });
  } catch (error) {
    logError("EcoCash EIP charge failed", error);
    res.status(500).json({ error: "EcoCash EIP charge failed" });
  }
});

router.get("/status/:clientCorrelator", requireAuthUnlessDemo, async (req, res) => {
  try {
    const { clientCorrelator } = req.params;
    const { endUserId } = req.query;

    if (typeof endUserId !== "string" || !MSISDN_RE.test(endUserId)) {
      return res.status(400).json({ error: "endUserId query param must be a Zimbabwe MSISDN" });
    }

    const query = await ecocash.queryTransaction({ endUserId, clientCorrelator });

    if (!query.ok) {
      logError("EcoCash EIP status query failed", new Error(`HTTP ${query.status}`), { raw: query.raw });
      return res.status(502).json({ error: "EcoCash sandbox query failed", status: query.status });
    }

    const status = query.json?.transactionOperationStatus || "UNKNOWN";
    const ecocashReference = query.json?.ecocashReference || null;

    const docRef = db.collection("ecocashEipTransactions").doc(clientCorrelator);
    const snap = await docRef.get();
    if (snap.exists) {
      await docRef.update({ transactionOperationStatus: status, ecocashReference, updatedAt: Date.now() });
    }

    res.json({ clientCorrelator, endUserId, transactionOperationStatus: status, ecocashReference, raw: query.json });
  } catch (error) {
    logError("EcoCash EIP status check failed", error);
    res.status(500).json({ error: "EcoCash EIP status check failed" });
  }
});

// Best-effort webhook receiver for notifyUrl. Nothing in the demo
// depends on this ever being called (see status polling above) — it's
// only useful if the presenter has a public tunnel (e.g. ngrok) running.
router.post("/notify", async (req, res) => {
  try {
    const body = req.body || {};
    const clientCorrelator = body.clientCorrelator;
    if (clientCorrelator) {
      const docRef = db.collection("ecocashEipTransactions").doc(String(clientCorrelator));
      const snap = await docRef.get();
      if (snap.exists) {
        await docRef.update({
          transactionOperationStatus: body.transactionOperationStatus || "UNKNOWN",
          ecocashReference: body.ecocashReference || null,
          notifyPayload: body,
          updatedAt: Date.now(),
        });
      }
    }
    res.json({ received: true });
  } catch (error) {
    logError("EcoCash EIP notify handling failed", error);
    res.status(500).json({ error: "notify handling failed" });
  }
});

module.exports = router;
