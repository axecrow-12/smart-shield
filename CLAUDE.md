# SmartPay Shield — project notes for Claude Code

Fraud-detection demo app: Node/Express backend (port **5050**) + Python FastAPI ML service (port 8000, LightGBM v4) + Firestore emulator (port **8765**). Frontend is `public/index.html` (Frost Sentinel glassmorphism theme), served by the backend. See README.md for full setup.

## Run / verify

- `npm run emulator` · `cd ml_core && python api/app.py` · `npm run dev` (three terminals)
- Verify: `npm run smoke` (18-check e2e), `npm test` (Node), `cd ml_core && python -m pytest tests/ -q`
- Retrain model: `cd ml_core && python scripts/train_model.py` (writes metrics into model metadata)

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
