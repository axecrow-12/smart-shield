/**
 * Disputes — a small but real workflow: a merchant opens a dispute
 * against a finalized transaction (wrong verdict, customer complaint,
 * suspected chargeback) and later resolves it. Backed by its own
 * Firestore collection so the Disputes page shows genuine records,
 * not placeholder data.
 */
const express = require("express");
const router = express.Router();
const { db } = require("../config/firebase");
const { logError } = require("../utils/logger");
const { requireAuthUnlessDemo } = require("../middleware/authMiddleware");

const REASONS = ["false_positive", "false_negative", "customer_complaint", "chargeback"];
const RESOLUTIONS = ["upheld", "overturned", "refunded"];

router.get("/", requireAuthUnlessDemo, async (req, res) => {
  try {
    const snapshot = await db.collection("disputes").orderBy("openedAt", "desc").limit(100).get();
    const disputes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ count: disputes.length, disputes });
  } catch (error) {
    logError("Failed to list disputes", error);
    res.status(500).json({ error: "Failed to list disputes" });
  }
});

router.post("/", requireAuthUnlessDemo, async (req, res) => {
  try {
    const { transactionId, reason, note } = req.body || {};
    if (typeof transactionId !== "string" || !transactionId) {
      return res.status(400).json({ error: "transactionId is required" });
    }
    if (!REASONS.includes(reason)) {
      return res.status(400).json({ error: `reason must be one of ${REASONS.join(", ")}` });
    }
    if (note !== undefined && (typeof note !== "string" || note.length > 500)) {
      return res.status(400).json({ error: "note must be a string (max 500 chars)" });
    }

    const txSnap = await db.collection("transactions").doc(transactionId).get();
    if (!txSnap.exists) {
      return res.status(404).json({ error: "Transaction not found" });
    }
    const tx = txSnap.data();

    // Single-field query + in-code filter: avoids needing a composite
    // index if this ever runs against cloud Firestore.
    const existing = await db.collection("disputes")
      .where("transactionId", "==", transactionId)
      .get();
    if (existing.docs.some((d) => d.data().status === "open")) {
      return res.status(409).json({ error: "An open dispute already exists for this transaction" });
    }

    const dispute = {
      transactionId,
      merchantName: tx.merchantName || null,
      amount: tx.amount,
      originalStatus: tx.status,
      originalScore: tx.fraudResult?.score ?? null,
      reason,
      note: note || "",
      status: "open",
      resolution: null,
      openedAt: Date.now(),
      resolvedAt: null,
    };
    const ref = await db.collection("disputes").add(dispute);
    res.status(201).json({ id: ref.id, ...dispute });
  } catch (error) {
    logError("Failed to open dispute", error);
    res.status(500).json({ error: "Failed to open dispute" });
  }
});

router.post("/:id/resolve", requireAuthUnlessDemo, async (req, res) => {
  try {
    const { resolution } = req.body || {};
    if (!RESOLUTIONS.includes(resolution)) {
      return res.status(400).json({ error: `resolution must be one of ${RESOLUTIONS.join(", ")}` });
    }
    const ref = db.collection("disputes").doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Dispute not found" });
    if (snap.data().status !== "open") {
      return res.status(409).json({ error: "Dispute is already resolved" });
    }
    const update = { status: "resolved", resolution, resolvedAt: Date.now() };
    await ref.update(update);
    res.json({ id: req.params.id, ...snap.data(), ...update });
  } catch (error) {
    logError("Failed to resolve dispute", error);
    res.status(500).json({ error: "Failed to resolve dispute" });
  }
});

module.exports = router;
