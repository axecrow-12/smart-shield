const express = require("express");
const router = express.Router();
const { db } = require("../config/firebase");
const {
  generatePaymentId,
  generatePaymentToken,
  getExpiryTime,
  isExpired,
} = require("../services/tokenService");
const { scoreTransaction } = require("../services/fraudService");

router.get("/", async (req, res) => {
  try {
    res.json({ message: "Payment route working" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/create-payment", async (req, res) => {
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

    const paymentLink = `https://smartpayshield.app/pay?token=${token}`;

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
    res.status(500).json({
      error: "Failed to create payment request",
      details: error.message,
    });
  }
});

router.post("/validate-token", async (req, res) => {
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
    res.status(500).json({
      error: "Validation failed",
      details: error.message,
    });
  }
});

router.post("/process", async (req, res) => {
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

    const fraudResult = scoreTransaction(payment, context);

    let status = "approved";
    if (fraudResult.level === "HIGH") {
      status = "rejected";
    } else if (fraudResult.level === "MEDIUM") {
      status = "review";
    }

    const transactionData = {
      paymentId: payment.paymentId,
      token: payment.token,
      amount: payment.amount,
      merchantName: payment.merchantName,
      merchantUid: payment.merchantUid,
      customerPhone: payment.customerPhone || null,
      fraudResult,
      status,
      createdAt: Date.now(),
    };

    await db.collection("transactions").add(transactionData);

    await db.collection("paymentRequests").doc(payment.paymentId).update({
      used: true,
      status,
    });

    res.json({
      message: "Payment processed",
      status,
      fraudResult,
      transaction: transactionData,
    });
  } catch (error) {
    res.status(500).json({
      error: "Payment processing failed",
      details: error.message,
    });
  }
});

router.get("/transactions", async (req, res) => {
  try {
    const snapshot = await db
      .collection("transactions")
      .orderBy("createdAt", "desc")
      .limit(20)
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
    res.status(500).json({
      error: "Failed to fetch transactions",
      details: error.message,
    });
  }
});

module.exports = router;