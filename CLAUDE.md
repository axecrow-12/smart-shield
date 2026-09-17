# SmartPay Shield — project notes for Claude Code

Fraud-detection demo app: Node/Express backend (port **5050**) + Python FastAPI ML service (port 8000, LightGBM v4) + Firestore emulator (port **8765**). Frontend is `public/index.html` (dashboard) + `public/pay.html` (customer checkout, opened by scanning the merchant QR on the same network) — Frost Sentinel glassmorphism theme, styled with Tailwind CSS v4, served by the backend. See README.md for full setup.

## Run / verify

- `npm run emulator` · `cd ml_core && python api/app.py` · `npm run dev` (three terminals)
- Verify: `npm run smoke` (18-check e2e), `npm test` (Node), `cd ml_core && python -m pytest tests/ -q`
- Retrain model: `cd ml_core && python scripts/train_model.py` (writes metrics into model metadata)
- Frontend styling: `npm run build:css` (one-shot) / `npm run watch:css` after editing `src/styles/tailwind.css`. Compiled `public/tailwind.css` is committed — a fresh clone renders correctly even before rebuilding, but edits to the source won't show until you rebuild.

## This machine's quirks (Windows laptop)

- **Java NIO selectors are broken for JDK 16+** (AF_UNIX pipe gets EINVAL machine-wide) — the standard Firestore emulator can't run. `tools/` (gitignored) holds a portable JDK 11 + emulator jar v1.19.8; `scripts/start_emulator.js` uses them automatically.
- **Port 5000 is reserved by Windows (PID 4)** — Node binds then dies silently. Backend uses 5050. Port 8080 is EnterpriseDB httpd.
- **`localhost` resolves to IPv6 ::1** but services bind IPv4 — always use `127.0.0.1`.
- **git `core.autocrlf=true` corrupts `.lgb` model files** (line-sensitive text). `.gitattributes` marks `*.lgb -text`. Symptom: "Model format error, expect a tree here" → restore LF endings.

## Invariants

- Categorical encodings in `ml_core/utils/risk_engine.py::extract_features` MUST match `ml_core/scripts/train_model.py` (pytest `TestEncodings` locks this).
- Scoring: rules contribute 40, ML 60; any triggered deterministic rule floors the score at 70 (VERIFY). ML unavailable ⇒ contributes 0 (flagged), never a silent default.
- Auth: payment/fraud/ecocash routes require a Firebase ID token unless `ALLOW_ANON_DEMO=1` (demo default in `.env`). EcoCash `/callback` is validated but unauthenticated by design (external webhook mock).
- 500 responses stay generic; details go to server-side logs only.
- MEDIUM-risk transactions (`POST /api/payments/process`) do NOT finalize immediately — the token stays unused, nothing is written to `transactions`, until the customer resolves a challenge via `POST /api/payments/verify` (correct code → approved, deny/3 wrong attempts/expiry → rejected). None of the six original attack-simulator scenarios reach MEDIUM (any triggered rule floors to HIGH); "Unverified merchant" (`is_legit_merchant: 0` alone) is the one that does — if you add new scenarios, don't assume MEDIUM is reachable without checking against the live ML API first.
- EcoCash EIP (`src/services/ecocashEipClient.js`, `src/routes/ecocashEipRoutes.js`) is a REAL sandbox integration, fully separate from the mock in `ecocashRoutes.js` (different collection: `ecocashEipTransactions` vs `ecocashTransactions`). It scores before forwarding — HIGH/MEDIUM never reaches EcoCash's servers at all. Status is polled (`GET /status/:clientCorrelator`), not webhook-driven, so it needs no public tunnel. Merchant identity/credentials live in `.env` (`ECOCASH_*`), with fallback defaults in the client matching this account's registered sandbox merchant (code 8003). Both paths are verified against the live sandbox: the block path (never reaches EcoCash) and, on 2026-09-17 by the user with their registered test MSISDN, the approve path (real charge forwarded and resolved).
- The five sidebar pages beyond Dashboard/Transactions (`src/routes/disputesRoutes.js`, `src/routes/systemRoutes.js`, and analytics rendered client-side in `public/index.html`'s `renderAnalytics()`) are real, not placeholders. Fraud Monitoring/Merchants/Reports are all *derived* client-side from `GET /api/payments/transactions?limit=200` — there's no separate merchants/reports backend table. Disputes has its own Firestore collection (`disputes`) and real open/resolve endpoints. `GET /api/system/config` is intentionally non-secret — never add a PIN/password/API key to it; the smoke test (`System config leaks no secrets`) checks for this.
- A handful of classes in `src/styles/tailwind.css` (`.statusDot`, `.decision`+`.d-*`, `.chip`+`.c-*`, `.kpiTrend`+`.up/.down/.flat`, `.navItem.active`, `.page.active`, `.state.active`, pay.html's `.v-*`/`.errIcon.tone-*`) exist because JS does a full `element.className = "..."` reassignment on those elements — they MUST stay self-contained (carry their entire style via `@apply`, not rely on sibling utility classes) or a reassignment will silently wipe styling.
