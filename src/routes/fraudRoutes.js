const express = require("express");
const router = express.Router();
const { db } = require("../config/firebase");
const { scoreTransaction } = require("../services/fraudService");

router.get("/", (req, res) => {
  res.json({ message: "Fraud route working" });
});

router.post("/score", async (req, res) => {
  try {
    const { payment, context } = req.body;

    if (!payment) {
      return res.status(400).json({ error: "payment is required" });
    }

    const result = scoreTransaction(payment, context);

    await db.collection("fraudLogs").add({
      paymentId: payment.paymentId || null,
      result,
      context: context || {},
      createdAt: Date.now(),
    });

    res.json({
      message: "Fraud score generated",
      result,
    });
  } catch (error) {
    res.status(500).json({
      error: "Fraud scoring failed",
      details: error.message,
    });
  }
});

module.exports = router;