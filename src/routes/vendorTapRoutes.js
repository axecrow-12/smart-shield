/**
 * Vendor Tap mode — fast repeat-customer transfers with real device
 * attestation (WebAuthn), for a vendor processing many customers
 * back-to-back where the standard flow's 2-minute typed-code challenge
 * would kill throughput.
 *
 * First tap for a given device: WebAuthn REGISTRATION (a few extra
 * seconds, one-time — creates a device-bound keypair). Every tap after
 * that: WebAuthn ASSERTION (a single biometric gesture, no typing) —
 * this is the "digital stamp": the customer's own phone cryptographically
 * signs this specific transaction, not a self-reported "trust me" flag.
 *
 * WebAuthn only runs in a secure context (HTTPS, or localhost/127.0.0.1)
 * — a plain LAN address will NOT work. Run this behind an HTTPS tunnel
 * (e.g. `ngrok http 5050`) when testing on a real phone. See
 * docs/RUNNING_AND_NAVIGATION.md.
 *
 * Separate from the standard checkout flow end to end: its own
 * Firestore collection (deviceCredentials, keyed by a per-device
 * customerId the frontend generates once and keeps in localStorage —
 * WebAuthn credentials are inherently device-bound, so there's no
 * account/login system to build here), but it still operates on
 * payment tokens created via the same POST /api/payments/create-payment
 * the Merchant Terminal already uses, and finalizes through the same
 * finalizePayment() every other flow uses.
 */
const express = require("express");
const router = express.Router();
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");
const { db } = require("../config/firebase");
const { logError } = require("../utils/logger");
const { scoreTransaction } = require("../services/fraudService");
const { loadPaymentByToken, finalizePayment } = require("../services/paymentService");
const { requireAuthUnlessDemo } = require("../middleware/authMiddleware");
const { validateVendorTapRequest, validateVendorTapCustomerId } = require("../middleware/validate");

const RP_NAME = "SmartPay Shield";

// WebAuthn's rpID must be the bare hostname (no scheme/port) the
// ceremony's origin matches, and expectedOrigin the full origin. Both
// are computed from the actual request so this works with whatever
// ngrok URL happens to be active that session, without hardcoding one.
function rpIdFor(req) {
  return req.hostname;
}
function originFor(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function credDoc(customerId) {
  return db.collection("deviceCredentials").doc(customerId);
}

function toStoredCredential(registrationInfo) {
  const { credential } = registrationInfo;
  return {
    id: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64"),
    counter: credential.counter,
    transports: credential.transports || [],
    createdAt: Date.now(),
  };
}

function fromStoredCredential(doc) {
  return {
    id: doc.id,
    publicKey: new Uint8Array(Buffer.from(doc.publicKey, "base64")),
    counter: doc.counter,
    transports: doc.transports || [],
  };
}

// Does this device (customerId) already have a credential? Lets the
// frontend decide, on load, whether to show the enroll or the fast path.
router.get("/has-credential", requireAuthUnlessDemo, validateVendorTapCustomerId, async (req, res) => {
  const snap = await credDoc(req.query.customerId).get();
  res.json({ hasCredential: snap.exists });
});

router.post("/register/options", requireAuthUnlessDemo, validateVendorTapRequest(), async (req, res) => {
  try {
    const { token, customerId } = req.body;
    const { error, payment } = await loadPaymentByToken(token);
    if (error === "not_found") return res.status(404).json({ error: "Invalid token" });
    if (error === "used") return res.status(409).json({ error: "Token already used" });
    if (error === "expired") return res.status(410).json({ error: "Token expired" });

    const existing = await credDoc(customerId).get();
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: rpIdFor(req),
      userName: customerId,
      timeout: 30000,
      attestationType: "none",
      excludeCredentials: existing.exists ? [{ id: existing.data().id }] : [],
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred", authenticatorAttachment: "platform" },
    });

    await db.collection("paymentRequests").doc(payment.paymentId).update({
      webauthnChallenge: { challenge: options.challenge, customerId, stage: "register", createdAt: Date.now() },
    });

    res.json({ options });
  } catch (error) {
    logError("Vendor Tap register/options failed", error);
    res.status(500).json({ error: "Failed to start device enrollment" });
  }
});

router.post("/register/verify", requireAuthUnlessDemo, validateVendorTapRequest({ requireResponse: true }), async (req, res) => {
  try {
    const { token, customerId, response } = req.body;
    const { error, payment } = await loadPaymentByToken(token);
    if (error === "not_found") return res.status(404).json({ error: "Invalid token" });
    if (error === "used") return res.status(409).json({ error: "Token already used" });
    if (error === "expired") return res.status(410).json({ error: "Token expired" });

    const pending = payment.webauthnChallenge;
    if (!pending || pending.stage !== "register" || pending.customerId !== customerId) {
      return res.status(400).json({ error: "No pending registration for this token/device" });
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: originFor(req),
      expectedRPID: rpIdFor(req),
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: "Device enrollment could not be verified" });
    }

    const stored = toStoredCredential(verification.registrationInfo);
    await credDoc(customerId).set(stored);

    const fraudResult = await scoreTransaction(payment, { deviceAttested: true, attestationAgeSeconds: 0 });
    const status = fraudResult.level === "HIGH" || fraudResult.level === "MEDIUM" ? "rejected" : "approved";
    const transactionData = await finalizePayment(payment, fraudResult, status);

    res.json({ enrolled: true, status, fraudResult, transaction: transactionData });
  } catch (error) {
    logError("Vendor Tap register/verify failed", error);
    res.status(500).json({ error: "Device enrollment failed" });
  }
});

router.post("/assert/options", requireAuthUnlessDemo, validateVendorTapRequest(), async (req, res) => {
  try {
    const { token, customerId } = req.body;
    const { error, payment } = await loadPaymentByToken(token);
    if (error === "not_found") return res.status(404).json({ error: "Invalid token" });
    if (error === "used") return res.status(409).json({ error: "Token already used" });
    if (error === "expired") return res.status(410).json({ error: "Token expired" });

    const credSnap = await credDoc(customerId).get();
    if (!credSnap.exists) {
      return res.status(404).json({ error: "No enrolled device for this customer — use registration first" });
    }

    const options = await generateAuthenticationOptions({
      rpID: rpIdFor(req),
      allowCredentials: [{ id: credSnap.data().id, transports: credSnap.data().transports }],
      timeout: 20000,
      userVerification: "preferred",
    });

    await db.collection("paymentRequests").doc(payment.paymentId).update({
      webauthnChallenge: { challenge: options.challenge, customerId, stage: "assert", createdAt: Date.now() },
    });

    res.json({ options });
  } catch (error) {
    logError("Vendor Tap assert/options failed", error);
    res.status(500).json({ error: "Failed to start device confirmation" });
  }
});

router.post("/assert/verify", requireAuthUnlessDemo, validateVendorTapRequest({ requireResponse: true }), async (req, res) => {
  try {
    const { token, customerId, response } = req.body;
    const { error, payment } = await loadPaymentByToken(token);
    if (error === "not_found") return res.status(404).json({ error: "Invalid token" });
    if (error === "used") return res.status(409).json({ error: "Token already used" });
    if (error === "expired") return res.status(410).json({ error: "Token expired" });

    const pending = payment.webauthnChallenge;
    if (!pending || pending.stage !== "assert" || pending.customerId !== customerId) {
      return res.status(400).json({ error: "No pending confirmation for this token/device" });
    }

    const credSnap = await credDoc(customerId).get();
    if (!credSnap.exists) {
      return res.status(404).json({ error: "No enrolled device for this customer" });
    }
    const credDocData = credSnap.data();

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: originFor(req),
      expectedRPID: rpIdFor(req),
      credential: fromStoredCredential(credDocData),
    });

    if (!verification.verified) {
      return res.status(400).json({ error: "Device confirmation could not be verified" });
    }

    // Replay protection: the authenticator's signature counter must
    // only ever move forward.
    await credDoc(customerId).update({ counter: verification.authenticationInfo.newCounter });

    const attestationAgeSeconds = Math.max(0, Math.round((Date.now() - credDocData.createdAt) / 1000));
    const fraudResult = await scoreTransaction(payment, { deviceAttested: true, attestationAgeSeconds });
    const status = fraudResult.level === "HIGH" || fraudResult.level === "MEDIUM" ? "rejected" : "approved";
    const transactionData = await finalizePayment(payment, fraudResult, status);

    res.json({ status, fraudResult, transaction: transactionData });
  } catch (error) {
    logError("Vendor Tap assert/verify failed", error);
    res.status(500).json({ error: "Device confirmation failed" });
  }
});

module.exports = router;
