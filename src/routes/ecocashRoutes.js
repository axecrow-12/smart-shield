const express = require("express");
const router = express.Router();
const { db } = require("../config/firebase");
const { v4: uuidv4 } = require("uuid");
const { scoreTransaction } = require("../services/fraudService");

router.get("/", (req, res) => {
  res.json({ message: "EcoCash mock route working" });
});

router.get("/all", async (req, res) => {
  try {
    const snapshot = await db.collection("ecocashTransactions").get();

    const transactions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      count: transactions.length,
      transactions,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch EcoCash transactions",
      details: error.message,
    });
  }
});

router.post("/initiate", async (req, res) => {
  try {
    const { amount, customerPhone, merchantName, paymentId } = req.body;

    if (!amount || !customerPhone || !merchantName) {
      return res.status(400).json({
        error: "amount, customerPhone, and merchantName are required",
      });
    }

    const providerReference = `ECO-${uuidv4().replace(/-/g, "").slice(0, 16)}`;

    const ecocashTransaction = {
      provider: "ecocash",
      providerReference,
      paymentId: paymentId || null,
      amount: Number(amount),
      customerPhone,
      merchantName,
      providerStatus: "PENDING",
      callbackReceived: false,
      callbackPayload: null,
      providerMessage: null,
      fraudResult: null,
      internalStatus: "pending",
      initiatedAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.collection("ecocashTransactions").doc(providerReference).set(ecocashTransaction);

    res.status(201).json({
      message: "EcoCash payment initiated",
      ecocashTransaction,
      mockInstructions: {
        callbackUrl: "http://localhost:5000/api/ecocash/callback",
        providerReference,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to initiate EcoCash payment",
      details: error.message,
    });
  }
});

router.post("/callback", async (req, res) => {
  try {
    const {
      providerReference,
      status,
      amount,
      customerPhone,
      providerMessage,
      rawPayload,
      context,
    } = req.body;

    if (!providerReference || !status) {
      return res.status(400).json({
        error: "providerReference and status are required",
      });
    }

    const docRef = db.collection("ecocashTransactions").doc(providerReference);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({
        error: "EcoCash transaction not found",
      });
    }

    const existingTransaction = docSnap.data();

    let fraudResult = null;
    let internalStatus = "pending";

    if (existingTransaction.paymentId) {
      const paymentRef = db.collection("paymentRequests").doc(existingTransaction.paymentId);
      const paymentSnap = await paymentRef.get();

      if (paymentSnap.exists) {
        const payment = paymentSnap.data();

        const scoringContext = context || {
          isNewDevice: false,
          rapidAttempts: false,
          locationMismatch: false,
        };

        fraudResult = scoreTransaction(payment, scoringContext);

        if (status === "SUCCESS") {
          if (fraudResult.level === "HIGH") {
            internalStatus = "rejected";
          } else if (fraudResult.level === "MEDIUM") {
            internalStatus = "review";
          } else {
            internalStatus = "approved";
          }
        } else if (status === "FAILED") {
          internalStatus = "rejected";
        } else if (status === "PENDING") {
          internalStatus = "review";
        }

        await paymentRef.update({
          ecocashProviderReference: providerReference,
          ecocashStatus: status,
          fraudResult,
          status: internalStatus,
          updatedAt: Date.now(),
        });

        await db.collection("transactions").add({
          paymentId: existingTransaction.paymentId,
          provider: "ecocash",
          providerReference,
          amount: amount || existingTransaction.amount,
          customerPhone: customerPhone || existingTransaction.customerPhone,
          merchantName: existingTransaction.merchantName,
          providerStatus: status,
          fraudResult,
          status: internalStatus,
          source: "ecocash_callback",
          providerMessage: providerMessage || null,
          createdAt: Date.now(),
        });

        await db.collection("fraudLogs").add({
          paymentId: existingTransaction.paymentId,
          providerReference,
          result: fraudResult,
          context: scoringContext,
          source: "ecocash_callback",
          createdAt: Date.now(),
        });
      } else {
        if (status === "SUCCESS") {
          internalStatus = "approved";
        } else if (status === "FAILED") {
          internalStatus = "rejected";
        } else {
          internalStatus = "review";
        }
      }
    } else {
      if (status === "SUCCESS") {
        internalStatus = "approved";
      } else if (status === "FAILED") {
        internalStatus = "rejected";
      } else {
        internalStatus = "review";
      }
    }

    const updatedTransaction = {
      ...existingTransaction,
      providerStatus: status,
      callbackReceived: true,
      callbackPayload: rawPayload || req.body,
      providerMessage: providerMessage || null,
      callbackReceivedAt: Date.now(),
      fraudResult,
      internalStatus,
      updatedAt: Date.now(),
    };

    await docRef.set(updatedTransaction);

    res.json({
      message: "EcoCash callback processed successfully",
      providerReference,
      providerStatus: status,
      internalStatus,
      fraudResult,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to process EcoCash callback",
      details: error.message,
    });
  }
});

router.get("/status/:providerReference", async (req, res) => {
  try {
    const { providerReference } = req.params;

    const docSnap = await db
      .collection("ecocashTransactions")
      .doc(providerReference)
      .get();

    if (!docSnap.exists) {
      return res.status(404).json({
        error: "EcoCash transaction not found",
      });
    }

    res.json({
      message: "EcoCash status fetched successfully",
      transaction: docSnap.data(),
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch EcoCash status",
      details: error.message,
    });
  }
});

module.exports = router;