# SmartPay Shield (smart-shield)

Smart fraud detection for Zimbabwe mobile money (EcoCash/OneMoney). Two services:

- **Node/Express backend** (`src/`, port **5050**) — QR payment tokens, payment processing, a mock EcoCash provider, and a **real EcoCash Instant Payment (EIP) sandbox integration** (see below), all backed by Firestore. Also serves the merchant dashboard (`public/index.html`) and a real customer-facing checkout page (`public/pay.html`) that a second device can open by scanning the QR code on the same network.
- **Python ML service** (`ml_core/`, port **8000**) — FastAPI serving a LightGBM v4 fraud model + 8 Zimbabwe-specific rules, with explainable risk scores (0–100), decisions (APPROVE / MONITOR / CHALLENGE / VERIFY / BLOCK), and per-feature SHAP contributions (`top_features`) on every score. Any triggered deterministic rule floors the score at 70 (VERIFY).

Every payment processed by the backend is scored live by the ML service (`ml+rules`); if the ML service is down, the backend falls back to local rules (`rules_fallback`). **MEDIUM-risk transactions don't dead-end** — the customer is handed an interactive verification challenge (a 6-digit code shown on `pay.html`, since no SMS provider is wired up) and their response decides the final outcome. See [Customer verification](#customer-verification-medium-risk) below.

> **New here or presenting a demo?** See [docs/RUNNING_AND_NAVIGATION.md](docs/RUNNING_AND_NAVIGATION.md) for a plain-language, step-by-step guide to starting everything and a full walkthrough of the dashboard.

## Quick start — Docker (any machine with Docker)

```bash
docker compose up --build
```

Dashboard at `http://127.0.0.1:5050`, ML docs at `http://127.0.0.1:8000/docs`. Three containers: Firestore emulator, ML service, backend.

## Quick start — local processes (fully offline demo)

Prerequisites: Node 18+, Python 3.10+.

```bash
npm install
pip install -r ml_core/requirements.txt
cp .env.example .env
```

`npm install` also compiles the Tailwind stylesheet automatically (a `postinstall` hook). The compiled `public/tailwind.css` is committed too, so a fresh clone renders correctly even before `npm install` finishes — see [Styling](#styling) below.

Then run **three terminals**:

```bash
# 1. Firestore emulator (port 8765)
npm run emulator
```

```bash
# 2. ML scoring API (port 8000, Swagger docs at http://127.0.0.1:8000/docs)
cd ml_core && python api/app.py
```

```bash
# 3. Backend (port 5050)
npm run dev
```

Verify everything with the end-to-end smoke test (18 checks: payment creation, token replay blocking, ML fraud blocking, EcoCash flow):

```bash
npm run smoke
```

> **Note (Windows):** use `127.0.0.1`, not `localhost`, in URLs — on some machines `localhost` resolves to IPv6 and the services bind IPv4. Port 5000 is often reserved by Windows itself, hence 5050.
>
> **Note (emulator):** `npm run emulator` uses a portable JDK 11 + emulator jar from `tools/` when present (works around a Windows bug where JDK 16+ can't open NIO selectors). Without `tools/`, it falls back to `firebase emulators:start` (needs Java 21+).

## Tests

```bash
npm test
```

```bash
cd ml_core && python -m pytest tests/ -q
```

Node (`tests/`): fraud service ML mapping, fallback and merge logic, request validators. Python (`ml_core/tests/`): risk-engine rules, scoring bounds, train/serve encoding parity, all API endpoints. `npm run smoke` covers the full integration (needs all three services running).

## Styling

Both `public/index.html` and `public/pay.html` are styled with [Tailwind CSS v4](https://tailwindcss.com), built via the standalone CLI (no PostCSS config, no `tailwind.config.js` — v4's config lives directly in CSS). One shared source compiles to one shared stylesheet for both pages:

- Source: [src/styles/tailwind.css](src/styles/tailwind.css) — the "Frost Sentinel" design tokens (colors, fonts, animations) live in an `@theme` block; a handful of named `@layer components` classes exist only where JavaScript does a full `element.className = "..."` reassignment (status dot, decision chips, KPI trend arrows, nav/page active states) and so must carry their entire style on their own.
- Compiled output: `public/tailwind.css` (committed — see above).

```bash
npm run build:css    # one-shot rebuild after editing src/styles/tailwind.css
npm run watch:css     # rebuilds automatically while you edit
```

No other build step exists in this project — the HTML/JS are plain static files served by Express, same as always.

## Auth & validation

All payment/fraud/ecocash endpoints validate input (amount bounds, phone/token/reference formats, status whitelist) and require a Firebase ID token — except in demo mode (`ALLOW_ANON_DEMO=1` in `.env`, the default for the expo). The EcoCash `/callback` is validated but unauthenticated by design (it simulates an external provider webhook).

## Cloud mode (real Firestore)

Comment out `FIRESTORE_EMULATOR_HOST` in `.env` and either drop `serviceAccountKey.json` at the repo root or set `GOOGLE_APPLICATION_CREDENTIALS`.

## API overview

Backend (`http://127.0.0.1:5050`):

| Endpoint | Description |
|---|---|
| `POST /api/payments/create-payment` | Create payment request (returns one-time token + QR payload, 10-min expiry) |
| `POST /api/payments/validate-token` | Check a token is valid/unused/unexpired |
| `POST /api/payments/process` | Process payment — scored by ML; approved/rejected immediately, or `verification_required` for MEDIUM risk |
| `POST /api/payments/verify` | Resolve a pending MEDIUM-risk challenge — `{token, code}` to confirm, or `{token, deny:true}` to decline |
| `GET /api/payments/transactions` | Recent transactions |
| `POST /api/ecocash/initiate` / `callback` / `status/:ref` | Mock EcoCash provider flow |
| `POST /api/ecocash-eip/charge` | **Real** EcoCash sandbox charge — scores first; only forwards LOW-risk transactions |
| `GET /api/ecocash-eip/status/:clientCorrelator` | Poll a forwarded charge's real sandbox status |
| `GET /api/ecocash-eip/config` | Non-secret UI hints (e.g. default test MSISDN) |
| `POST /api/fraud/score` | Score an arbitrary payment + context |
| `GET /api/auth/me` | Verify a Firebase ID token |
| `GET /api/disputes` / `POST /api/disputes` / `POST /api/disputes/:id/resolve` | Open and resolve disputes against a finalized transaction |
| `GET /api/system/config` | Non-secret runtime config for the Settings page |
| `GET /api/vendor-tap/has-credential` / `POST /register/options` / `register/verify` / `assert/options` / `assert/verify` | Vendor Tap fast-lane — see below |

ML service (`http://127.0.0.1:8000`, full OpenAPI docs at `/docs`):
`/score`, `/batch-score`, `/check-rules`, `/analyze`, `/model-info`, `/health`.

The `context` object on `process`/`score` accepts demo-friendly flags (`isNewDevice`, `rapidAttempts`, `locationMismatch`) and an `mlFeatures` override for any of the 19 model features (e.g. `is_mule_destination`, `geo_velocity_kmh`).

## Customer verification (MEDIUM risk)

HIGH and LOW risk resolve synchronously (rejected / approved). MEDIUM risk instead holds the payment token open and returns `{ status: "verification_required", verification: { demoCode, expiresAt } }` — the customer completes it on `pay.html` by entering the code (or explicitly declining "this wasn't me"), which finalizes the transaction as approved or rejected. Three wrong attempts or letting the 2-minute window expire also auto-rejects. Nothing is written to the `transactions` collection, and the token isn't marked `used`, until this resolves one way or the other. The Attack Simulator's **Unverified merchant** scenario is the one guaranteed way to trigger this tier — none of the other six scenarios land in MEDIUM, since any triggered deterministic rule floors the score at 70 (HIGH).

## Real EcoCash sandbox (EIP)

`src/services/ecocashEipClient.js` talks to EcoCash's actual Instant Payment API sandbox (Charge / Refund / Query Transaction, HTTP Basic auth) — see `.env.example` for the full config block. The dashboard's **"EcoCash Sandbox (Live)"** card drives it:

- Every request is scored with the same `scoreTransaction()` used everywhere else, **before** anything is sent to EcoCash.
- HIGH or MEDIUM risk is blocked locally — no real charge is ever sent, nothing to reverse.
- Only LOW risk is forwarded as a real Charge Request, then polled via `GET /status/:clientCorrelator` (not the inbound `notifyUrl` webhook) until it resolves — no public tunnel/ngrok required for the block path or the polling path.
- Stored separately from the mock flow, in its own `ecocashEipTransactions` Firestore collection.

The approve path needs your own registered sandbox test MSISDN (EcoCash requires test numbers to be allow-listed by their POC) — enter it directly in the card at demo time.

## Vendor Tap mode (fast repeat customers)

An **additive** fast lane for a high-throughput vendor (a kiosk, a stall) serving many repeat customers back-to-back, where the standard flow's 2-minute typed-code challenge for MEDIUM risk would kill throughput. Instead of a self-reported "new device" flag, Vendor Tap uses real **WebAuthn device attestation** — the customer's own phone (Face ID / Touch ID / Android biometric) cryptographically signs the transaction with a device-bound key.

- First tap for a given phone: a one-time WebAuthn **registration** ceremony (a few extra seconds, creates the device-bound keypair). Every tap after that: a WebAuthn **assertion** — a single biometric gesture, no typing, faster than the standard flow.
- `context.deviceAttested` / `context.attestationAgeSeconds` feed into the same `scoreTransaction()` everyone else uses — a real attestation overrides the self-reported `isNewDevice` flag, but a request with no attestation at all degrades gracefully to standard behavior. No OTP fallback for MEDIUM/HIGH — those are rejected outright, since the whole point of this mode is speed, not a second slower path.
- **Needs an HTTPS front door.** WebAuthn only runs in a secure context (HTTPS, or `localhost`/`127.0.0.1`) — the plain-LAN-HTTP QR link the standard checkout flow uses will not work here. Run `ngrok http 5050` and use the tunnel's HTTPS URL. See `docs/RUNNING_AND_NAVIGATION.md`.
- Fully separate from the standard flow: its own page (`public/vendor-tap.html`), its own Firestore collection (`deviceCredentials` — credential ID, public key, sign counter, enrolled-at timestamp; never any biometric data, which never leaves the phone), but reuses the same `create-payment` tokens and the same `finalizePayment()`, so results show up in the existing transaction feed / Fraud Monitoring / Merchants / Reports pages unchanged. Toggle "⚡ Vendor Tap" on the Merchant Terminal card to generate its link/QR instead of the standard one.

| `GET /api/vendor-tap/has-credential?customerId=` | Does this device already have an enrolled credential? |
| `POST /api/vendor-tap/register/options` / `register/verify` | WebAuthn registration ceremony (first tap) |
| `POST /api/vendor-tap/assert/options` / `assert/verify` | WebAuthn assertion ceremony (every tap after) |

## ML core

- Model: `ml_core/model/fraud_detection_model_v4_zimbabwe.lgb` (LightGBM, 19 features, trained on `ml_core/data/TAPnPAY_fraud_enhanced.csv`, 10k synthetic Zimbabwe transactions).
- Training pipeline: `ml_core/notebooks/TAPnPAY_Fraud_Detection_v4_Production.ipynb`.
- Scoring engine: `ml_core/utils/risk_engine.py` (hybrid rules + ML, 0–100 risk score).

⚠️ `.lgb` model files are line-ending-sensitive text — `.gitattributes` marks them `-text` so git never CRLF-converts them. If the ML service reports "Model format error, expect a tree here", the file was CRLF-mangled; restore LF endings.
