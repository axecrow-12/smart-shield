/**
 * Shared payment-record helpers, used by both the standard checkout flow
 * (paymentRoutes.js) and Vendor Tap mode (vendorTapRoutes.js) so both
 * paths finalize a transaction identically — same collection, same
 * shape — and show up in the live feed / analytics pages with zero
 * special-casing on the frontend.
 */
const { db } = require("../config/firebase");
const { isExpired } = require("./tokenService");

async function loadPaymentByToken(token) {
  const snapshot = await db.collection("paymentRequests").where("token", "==", token).limit(1).get();
  if (snapshot.empty) return { error: "not_found" };

  const payment = snapshot.docs[0].data();
  if (payment.used) return { error: "used", payment };
  if (isExpired(payment.expiresAt)) return { error: "expired", payment };

  return { payment };
}

async function finalizePayment(payment, fraudResult, status) {
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

  return transactionData;
}

module.exports = { loadPaymentByToken, finalizePayment };
