/**
 * End-to-end smoke test for SmartPay Shield.
 *
 * Prerequisites (each in its own terminal):
 *   1. firebase emulators:start --only firestore   (or cloud credentials)
 *   2. python ml_core/api/app.py                   (ML scoring service)
 *   3. npm run dev                                 (Node backend)
 *
 * Run: npm run smoke
 */

const BASE = process.env.API_URL || "http://127.0.0.1:5050";
const ML = process.env.ML_API_URL || "http://127.0.0.1:8000";

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

async function req(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

async function main() {
  console.log(`Smoke test against ${BASE} (ML: ${ML})\n`);

  // 0. Services up
  const mlHealth = await req("GET", `${ML}/health`);
  check("ML API /health", mlHealth.status === 200);

  const root = await req("GET", `${BASE}/`);
  check("Backend root responds", root.status === 200);

  // 1. Create payment
  const create = await req("POST", `${BASE}/api/payments/create-payment`, {
    amount: 25.5,
    merchantName: "Mbare Fresh Produce",
    customerPhone: "+263771234567",
  });
  check("Create payment (201)", create.status === 201, JSON.stringify(create.json));
  const payment = create.json?.paymentRequest;
  const token = payment?.token;
  check("Payment has token + QR payload", Boolean(token && payment.qrPayload));

  // 2. Validate token
  const validate = await req("POST", `${BASE}/api/payments/validate-token`, { token });
  check("Validate token (200)", validate.status === 200);

  // 3. Process payment with a clean context -> should approve via ML
  const processClean = await req("POST", `${BASE}/api/payments/process`, {
    token,
    context: { isNewDevice: false, rapidAttempts: false, locationMismatch: false },
  });
  check("Process clean payment (200)", processClean.status === 200);
  check(
    "Clean payment approved",
    processClean.json?.status === "approved",
    `status=${processClean.json?.status}`
  );
  check(
    "Fraud score came from ML service",
    processClean.json?.fraudResult?.source === "ml+rules",
    `source=${processClean.json?.fraudResult?.source}`
  );

  // 4. Token replay -> must be rejected
  const replay = await req("POST", `${BASE}/api/payments/process`, { token });
  check("Token replay blocked (409)", replay.status === 409);

  // 5. High-risk payment -> should be rejected or flagged for review
  const create2 = await req("POST", `${BASE}/api/payments/create-payment`, {
    amount: 480,
    merchantName: "Unknown Vendor",
  });
  const token2 = create2.json?.paymentRequest?.token;
  const processFraud = await req("POST", `${BASE}/api/payments/process`, {
    token: token2,
    context: {
      isNewDevice: true,
      rapidAttempts: true,
      locationMismatch: true,
      mlFeatures: {
        is_mule_destination: 1,
        receiver_risk_score: 0.95,
        geo_velocity_kmh: 400,
        is_smurf_pattern: 1,
      },
    },
  });
  check("Process fraud payment (200)", processFraud.status === 200);
  check(
    "Fraudulent payment blocked",
    processFraud.json?.status === "rejected",
    `status=${processFraud.json?.status}, score=${processFraud.json?.fraudResult?.score}`
  );
  check(
    "Fraud reasons include ML patterns",
    (processFraud.json?.fraudResult?.reasons || []).includes("MULE_NETWORK_DETECTION"),
    JSON.stringify(processFraud.json?.fraudResult?.reasons)
  );

  // 6. EcoCash flow
  const create3 = await req("POST", `${BASE}/api/payments/create-payment`, {
    amount: 60,
    merchantName: "EcoTest Store",
  });
  const paymentId3 = create3.json?.paymentRequest?.paymentId;
  const initiate = await req("POST", `${BASE}/api/ecocash/initiate`, {
    amount: 60,
    customerPhone: "+263779999999",
    merchantName: "EcoTest Store",
    paymentId: paymentId3,
  });
  check("EcoCash initiate (201)", initiate.status === 201);
  const ref = initiate.json?.ecocashTransaction?.providerReference;

  const callback = await req("POST", `${BASE}/api/ecocash/callback`, {
    providerReference: ref,
    status: "SUCCESS",
    amount: 60,
  });
  check("EcoCash callback processed (200)", callback.status === 200);
  check(
    "EcoCash payment approved",
    callback.json?.internalStatus === "approved",
    `internalStatus=${callback.json?.internalStatus}`
  );

  const status = await req("GET", `${BASE}/api/ecocash/status/${ref}`);
  check("EcoCash status fetch (200)", status.status === 200);

  // 7. Transactions list
  const txs = await req("GET", `${BASE}/api/payments/transactions`);
  check("Transactions list (200)", txs.status === 200);
  check("Transactions recorded", (txs.json?.count ?? 0) >= 2, `count=${txs.json?.count}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`Smoke test crashed: ${e.message}`);
  process.exit(1);
});
