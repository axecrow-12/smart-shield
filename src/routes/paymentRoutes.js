const express = require("express");
const router = express.Router();
const { logError } = require("../utils/logger");
const { db } = require("../config/firebase");
const {
  generatePaymentId,
  generatePaymentToken,
  getExpiryTime,
  isExpired,
} = require("../services/tokenService");
const { scoreTransaction } = require("../services/fraudService");
const { finalizePayment } = require("../services/paymentService");
const { getLanUrl } = require("../utils/network");
const { requireAuthUnlessDemo } = require("../middleware/authMiddleware");
const {
  validateCreatePayment,
  validateTokenBody,
  validateVerify,
} = require("../middleware/validate");

router.get("/", async (req, res) => {
  try {
    res.json({ message: "Payment route working" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/create-payment", requireAuthUnlessDemo, validateCreatePayment, async (req, res) => {
  try {
    const { amount, merchantName, customerPhone } = req.body;

    if (!amount || !merchantName) {
      return res.status(400).json({
        error: "amount and merchantName are required",
      });
    }

    const paymentId = generatePaymentId();
    const token = generatePaymentToken();
    const expiresAt = getExpiryTime(10);

    const qrPayload = JSON.stringify({
      type: "smartpayshield_payment",
      paymentId,
      token,
      merchantName,
      amount: Number(amount),
      expiresAt,
    });

    // Real, reachable link: opens the customer-facing pay page on this
    // machine's LAN address so a phone on the same network/hotspot can
    // scan the QR code and actually complete the payment.
    const paymentLink = `${getLanUrl(req)}/pay?token=${token}`;

    const paymentRequest = {
      paymentId,
      token,
      amount: Number(amount),
      merchantName,
      customerPhone: customerPhone || null,
      merchantUid: "demo-merchant",
      status: "pending",
      used: false,
      expiresAt,
      createdAt: Date.now(),
      paymentLink,
      qrPayload,
    };

    await db.collection("paymentRequests").doc(paymentId).set(paymentRequest);

    res.status(201).json({
      message: "Payment request created",
      paymentRequest,
    });
  } catch (error) {
    logError("Failed to create payment request", error);
    res.status(500).json({ error: "Failed to create payment request" });
  }
});

router.post("/validate-token", requireAuthUnlessDemo, validateTokenBody, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "token is required" });
    }

    const snapshot = await db
      .collection("paymentRequests")
      .where("token", "==", token)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: "Invalid token" });
    }

    const doc = snapshot.docs[0];
    const payment = doc.data();

    if (payment.used) {
      return res.status(409).json({ error: "Token already used" });
    }

    if (isExpired(payment.expiresAt)) {
      return res.status(410).json({ error: "Token expired" });
    }

    res.json({
      message: "Token valid",
      payment,
    });
  } catch (error) {
    logError("Validation failed", error);
    res.status(500).json({ error: "Validation failed" });
  }
});

router.post("/process", requireAuthUnlessDemo, validateTokenBody, async (req, res) => {
  try {
    const { token, context } = req.body;

    if (!token) {
      return res.status(400).json({ error: "token is required" });
    }

    const snapshot = await db
      .collection("paymentRequests")
      .where("token", "==", token)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: "Invalid token" });
    }

    const doc = snapshot.docs[0];
    const payment = doc.data();

    if (payment.used) {
      return res.status(409).json({ error: "Token already used" });
    }

    if (isExpired(payment.expiresAt)) {
      return res.status(410).json({ error: "Token expired" });
    }

    const fraudResult = await scoreTransaction(payment, context);

    // MEDIUM risk doesn't dead-end into a silent "review" anymore — the
    // customer becomes an active participant: we hold the token open
    // (NOT marking it used yet) and require them to clear a verification
    // challenge on pay.html before the transaction finalizes either way.
    if (fraudResult.level === "MEDIUM") {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const verifyExpiresAt = Date.now() + 2 * 60 * 1000;

      await db.collection("paymentRequests").doc(payment.paymentId).update({
        verification: { code, expiresAt: verifyExpiresAt, attempts: 0, fraudResult },
      });

      await db.collection("fraudLogs").add({
        paymentId: payment.paymentId,
        result: fraudResult,
        context: context || {},
        stage: "verification_required",
        createdAt: Date.now(),
      });

      return res.json({
        message: "Verification required before this payment can complete",
        status: "verification_required",
        fraudResult,
        verification: {
          expiresAt: verifyExpiresAt,
          // No SMS/USSD provider is wired up in this demo — the code that
          // would normally be delivered out-of-band is returned directly
          // so the customer-facing page can display it plainly. Never do
          // this in a real deployment.
          demoCode: code,
        },
      });
    }

    const status = fraudResult.level === "HIGH" ? "rejected" : "approved";
    const transactionData = await finalizePayment(payment, fraudResult, status);

    res.json({
      message: "Payment processed",
      status,
      fraudResult,
      transaction: transactionData,
    });
  } catch (error) {
    logError("Payment processing failed", error);
    res.status(500).json({ error: "Payment processing failed" });
  }
});

// Customer resolves a MEDIUM-risk challenge: either confirms the code
// (correct code -> approved) or explicitly declines ("this wasn't me" ->
// rejected). Three wrong code attempts also auto-rejects, same as a real
// OTP flow locking out after repeated failures.
router.post("/verify", requireAuthUnlessDemo, validateVerify, async (req, res) => {
  try {
    const { token, code, deny } = req.body || {};
    if (typeof token !== "string" || !token) {
      return res.status(400).json({ error: "token is required" });
    }

    const snapshot = await db.collection("paymentRequests").where("token", "==", token).limit(1).get();
    if (snapshot.empty) {
      return res.status(404).json({ error: "Invalid token" });
    }

    const doc = snapshot.docs[0];
    const payment = doc.data();

    if (payment.used) {
      return res.status(409).json({ error: "Token already used" });
    }
    if (!payment.verification) {
      return res.status(400).json({ error: "No verification is pending for this token" });
    }

    const { code: expected, expiresAt, attempts, fraudResult } = payment.verification;

    if (deny) {
      const transactionData = await finalizePayment(payment, fraudResult, "rejected");
      return res.json({ status: "rejected", fraudResult, transaction: transactionData, reason: "customer_declined" });
    }

    if (Date.now() > expiresAt) {
      const transactionData = await finalizePayment(payment, fraudResult, "rejected");
      return res.json({ status: "rejected", fraudResult, transaction: transactionData, reason: "verification_expired" });
    }

    if (String(code) !== expected) {
      const nextAttempts = attempts + 1;
      if (nextAttempts >= 3) {
        const transactionData = await finalizePayment(payment, fraudResult, "rejected");
        return res.json({ status: "rejected", fraudResult, transaction: transactionData, reason: "too_many_attempts" });
      }
      await db.collection("paymentRequests").doc(payment.paymentId).update({
        "verification.attempts": nextAttempts,
      });
      return res.status(400).json({
        error: "Incorrect code",
        attemptsRemaining: 3 - nextAttempts,
      });
    }

    const transactionData = await finalizePayment(payment, fraudResult, "approved");
    res.json({ status: "approved", fraudResult, transaction: transactionData });
  } catch (error) {
    logError("Payment verification failed", error);
    res.status(500).json({ error: "Payment verification failed" });
  }
});

router.get("/transactions", requireAuthUnlessDemo, async (req, res) => {
  try {
    // Default 20 for the live feed; analytics pages ask for more (capped).
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 200);
    const snapshot = await db
      .collection("transactions")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const transactions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      message: "Transactions fetched successfully",
      count: transactions.length,
      transactions,
    });
  } catch (error) {
    logError("Failed to fetch transactions", error);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

module.exports = router;