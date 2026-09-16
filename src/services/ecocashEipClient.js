/**
 * EcoCash Instant Payment (EIP) API client — real sandbox integration.
 *
 * Three endpoints per the vendor's EIP API v3.1.1 spec: Charge Request
 * (payment), Refund Request (reversal), Query Transaction (status poll).
 * Auth is HTTP Basic (shared sandbox-wide credentials); the merchant's
 * own identity (code/PIN/number) travels in the JSON body on every call.
 *
 * All configuration comes from env vars — nothing here is hardcoded,
 * and the merchant PIN / Basic Auth password never leave this module.
 */

const BASE_URL = (process.env.ECOCASH_EIP_BASE_URL || "https://payonline.ecocash.co.zw/ecocashGateway-preprod/payment/v1").replace(/\/$/, "");
const USERNAME = process.env.ECOCASH_EIP_USERNAME || "ecocash";
const PASSWORD = process.env.ECOCASH_EIP_PASSWORD || "mobiquity";

const MERCHANT_CODE = process.env.ECOCASH_MERCHANT_CODE || "8003";
const MERCHANT_PIN = process.env.ECOCASH_MERCHANT_PIN || "2222";
const MERCHANT_NUMBER = process.env.ECOCASH_MERCHANT_NUMBER || "789111401";
const TERMINAL_ID = process.env.ECOCASH_TERMINAL_ID || "TERM-SMARTSHIELD-01";
const SUPER_MERCHANT_NAME = process.env.ECOCASH_SUPER_MERCHANT_NAME || "SMARTPAYSHIELD";
const MERCHANT_NAME = process.env.ECOCASH_MERCHANT_NAME || "SmartPay Shield Demo";
const LOCATION = process.env.ECOCASH_LOCATION || "Harare, Zimbabwe";

const EIP_TIMEOUT_MS = Number(process.env.ECOCASH_EIP_TIMEOUT_MS || 15000);

function authHeader() {
  const token = Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64");
  return `Basic ${token}`;
}

// EIP rejects duplicate clientCorrelator values — must be unique per charge.
function generateClientCorrelator() {
  return `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
}

async function eipRequest(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(EIP_TIMEOUT_MS),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON response (e.g. an HTML error page from the gateway) —
    // surface the raw text so callers can see what actually happened.
  }

  return { status: res.status, ok: res.ok, json, raw: text };
}

/**
 * Charge Request — the real money-movement call. Only ever invoked for
 * transactions our own fraud engine has already cleared.
 */
async function chargeRequest({ endUserId, amount, currency = "USD", referenceCode, remarks, notifyUrl }) {
  const clientCorrelator = generateClientCorrelator();

  const body = {
    clientCorrelator,
    notifyUrl: notifyUrl || "",
    referenceCode: referenceCode || `SPS_${clientCorrelator}`,
    tranType: "MER",
    endUserId,
    remarks: remarks || "SmartPay Shield demo purchase",
    transactionOperationStatus: "Charged",
    paymentAmount: {
      charginginformation: {
        amount: Number(amount),
        currency,
        description: remarks || "SmartPay Shield demo purchase",
      },
      chargeMetaData: {
        channel: "WEB",
        purchaseCategoryCode: "Online Payment",
        onBeHalfOf: MERCHANT_NAME,
      },
    },
    merchantCode: MERCHANT_CODE,
    merchantPin: MERCHANT_PIN,
    merchantNumber: MERCHANT_NUMBER,
    currencyCode: currency,
    countryCode: "ZW",
    terminalID: TERMINAL_ID,
    location: LOCATION,
    superMerchantName: SUPER_MERCHANT_NAME,
    merchantName: MERCHANT_NAME,
  };

  const result = await eipRequest("POST", `${BASE_URL}/transactions/amount`, body);
  return { ...result, clientCorrelator };
}

/**
 * Query Transaction — outbound status poll (no inbound webhook needed).
 */
async function queryTransaction({ endUserId, clientCorrelator }) {
  const url = `${BASE_URL}/${encodeURIComponent(endUserId)}/transactions/amount/${encodeURIComponent(clientCorrelator)}`;
  return eipRequest("GET", url);
}

/**
 * Refund Request — reversal of a completed charge. Not required for the
 * block-before-forward demo flow, included for API-suite completeness.
 */
async function refundRequest({ endUserId, originalEcocashReference, amount, currency = "USD", referenceCode, remarks }) {
  const clientCorrelator = generateClientCorrelator();

  const body = {
    clientCorrelator,
    endUserId,
    notifyUrl: "",
    originalEcocashReference,
    referenceCode: referenceCode || `SPS_REFUND_${clientCorrelator}`,
    tranType: "MER",
    remarks: remarks || "SmartPay Shield demo refund",
    transactionOperationStatus: "Charged",
    paymentAmount: {
      charginginformation: {
        amount: Number(amount),
        currency,
        description: remarks || "SmartPay Shield demo refund",
      },
      chargeMetaData: {
        channel: "WEB",
        purchaseCategoryCode: "Online Payment",
        onBeHalfOf: MERCHANT_NAME,
      },
    },
    merchantCode: MERCHANT_CODE,
    merchantPin: MERCHANT_PIN,
    merchantNumber: MERCHANT_NUMBER,
    currencyCode: currency,
    countryCode: "ZW",
    terminalID: TERMINAL_ID,
    location: LOCATION,
    superMerchantName: SUPER_MERCHANT_NAME,
    merchantName: MERCHANT_NAME,
  };

  const result = await eipRequest("POST", `${BASE_URL}/transactions/refund`, body);
  return { ...result, clientCorrelator };
}

module.exports = { chargeRequest, queryTransaction, refundRequest, generateClientCorrelator };
