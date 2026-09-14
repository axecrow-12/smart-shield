# SmartPay Shield (smart-shield)

Smart fraud detection for Zimbabwe mobile money (EcoCash/OneMoney). Two services:

- **Node/Express backend** (`src/`, port **5050**) — QR payment tokens, payment processing, mock EcoCash provider, Firestore persistence.
- **Python ML service** (`ml_core/`, port **8000**) — FastAPI serving a LightGBM v4 fraud model + 8 Zimbabwe-specific rules, with explainable risk scores (0–100), decisions (APPROVE / MONITOR / CHALLENGE / VERIFY / BLOCK), and per-feature SHAP contributions (`top_features`) on every score. Any triggered deterministic rule floors the score at 70 (VERIFY).

Every payment processed by the backend is scored live by the ML service (`ml+rules`); if the ML service is down, the backend falls back to local rules (`rules_fallback`).

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
| `POST /api/payments/process` | Process payment — scored by ML, status approved/review/rejected |
| `GET /api/payments/transactions` | Recent transactions |
| `POST /api/ecocash/initiate` / `callback` / `status/:ref` | Mock EcoCash provider flow |
| `POST /api/fraud/score` | Score an arbitrary payment + context |
| `GET /api/auth/me` | Verify a Firebase ID token |

ML service (`http://127.0.0.1:8000`, full OpenAPI docs at `/docs`):
`/score`, `/batch-score`, `/check-rules`, `/analyze`, `/model-info`, `/health`.

The `context` object on `process`/`score` accepts demo-friendly flags (`isNewDevice`, `rapidAttempts`, `locationMismatch`) and an `mlFeatures` override for any of the 19 model features (e.g. `is_mule_destination`, `geo_velocity_kmh`).

## ML core

- Model: `ml_core/model/fraud_detection_model_v4_zimbabwe.lgb` (LightGBM, 19 features, trained on `ml_core/data/TAPnPAY_fraud_enhanced.csv`, 10k synthetic Zimbabwe transactions).
- Training pipeline: `ml_core/notebooks/TAPnPAY_Fraud_Detection_v4_Production.ipynb`.
- Scoring engine: `ml_core/utils/risk_engine.py` (hybrid rules + ML, 0–100 risk score).

⚠️ `.lgb` model files are line-ending-sensitive text — `.gitattributes` marks them `-text` so git never CRLF-converts them. If the ML service reports "Model format error, expect a tree here", the file was CRLF-mangled; restore LF endings.
