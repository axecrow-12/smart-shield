# Running SmartPay Shield & Navigating the Dashboard

This is the one document to hand someone who has never run this project before — a demo presenter, a teammate, or future-you. It covers exactly how to start every piece, in what order, and what each screen in the dashboard does.

---

## 1. What you're starting

SmartPay Shield is three separate processes that talk to each other over HTTP. All three must be running for the dashboard to work fully.

| # | Service | Port | What it does |
|---|---|---|---|
| 1 | **Firestore emulator** | 8765 | Local database — stores payments, transactions, fraud logs. No cloud account needed. |
| 2 | **ML scoring API** (Python/FastAPI) | 8000 | Runs the LightGBM v4 fraud model + Zimbabwe rule set. Returns a risk score for every transaction. |
| 3 | **Backend + dashboard** (Node/Express) | 5050 | The API the dashboard calls, and it also serves the dashboard's HTML/CSS/JS itself. |

You open **three terminals**, one per service, and leave them running. The dashboard lives at `http://127.0.0.1:5050/` once all three are up.

> **Always use `127.0.0.1`, never `localhost`.** On this project's dev machine `localhost` resolves to IPv6 while the services bind IPv4, so `localhost:5050` will hang or refuse to connect. This may not affect every machine, but `127.0.0.1` always works, so just use it.

---

## 2. First-time setup (only once per machine)

```bash
# from the repo root
npm install
pip install -r ml_core/requirements.txt
cp .env.example .env
```

That's it — `.env` already has sensible demo defaults (see [.env.example](../.env.example)). You don't need a real Firebase project, a service account key, or any cloud credentials for the demo setup below.

---

## 3. Starting the three services

Open three terminals in the repo root and run one command in each, **in this order**:

**Terminal 1 — Firestore emulator**
```bash
npm run emulator
```
Wait until it says it's listening. This is your local database.

**Terminal 2 — ML scoring API**
```bash
cd ml_core
python api/app.py
```
Wait until you see `Uvicorn running on http://0.0.0.0:8000`. This loads the trained LightGBM model into memory — if this step fails, nothing downstream will score correctly.

**Terminal 3 — Backend + dashboard**
```bash
npm run dev
```
Wait until you see `Server running on port 5050`.

Now open your browser to:

```
http://127.0.0.1:5050/
```

That's the whole dashboard — merchant terminal, attack simulator, live feed, everything — served from this one URL.

### Quickest sanity check

Before doing anything in the browser, confirm all three are actually talking to each other:

```bash
npm run smoke
```

This runs an 18-step automated check (create a payment, score it, replay-attack it, run it through EcoCash, etc.) against the live stack. If it prints `18 passed, 0 failed`, everything is wired correctly and you're ready to demo. If something fails, it tells you exactly which step and why — check that all three terminals are still running and didn't crash.

---

## 4. Stopping and restarting

To stop: go to each terminal and press `Ctrl+C`. Order doesn't matter when stopping.

To restart after a crash or a code change: just re-run the one command for whichever terminal died — you don't need to restart the other two. The dashboard in your browser will just refresh its data ("● backend offline" or "● ml api offline" will briefly show in the status area if a service is down, and recover once you restart it) — no browser refresh needed, it polls automatically every few seconds.

---

## 5. Common problems

| Symptom | Cause | Fix |
|---|---|---|
| `npm run dev` says "port in use" or dies silently | Something else is already using port 5050, or (on Windows) port 5000 is reserved by the OS itself | Check `.env` — `PORT` should be `5050`, not `5000` |
| Dashboard shows "ML Service Offline" in the top bar | Terminal 2 isn't running, crashed, or is still loading the model | Check Terminal 2's output; re-run `python api/app.py` |
| ML API fails to start with "Model format error, expect a tree here" | The `.lgb` model file got corrupted by Windows line-ending conversion | See [README.md](../README.md) — restore the file from git (`.gitattributes` should prevent this going forward) |
| Firestore emulator won't start / Java errors | Broken Java on this machine (JDK 16+ has a known NIO bug here) | `npm run emulator` already works around this using a bundled JDK 11 in `tools/` — if `tools/` is missing, see [README.md](../README.md) for the portable JDK setup |
| `npm run smoke` fails on the very first check | One of the three services isn't actually up yet | Give each terminal a few seconds after starting before running smoke; the ML API in particular takes a moment to load the model |

---

## 6. Navigating the dashboard

Once `http://127.0.0.1:5050/` is open, here's what's on screen and what each part is for.

### Top bar (always visible)

| Element | What it does |
|---|---|
| **Search box** | Type a merchant name or transaction ID — filters the live feed table on the Dashboard in real time. Client-side only, doesn't hit the server. |
| **System status dot** | Green = both backend and ML service are reachable. Red = one of them is down (hover to see which). This is a genuine live health check, polled every 10 seconds. |
| **Bell icon** | Shows a red badge with the count of transactions currently sitting in "review" status — i.e. flagged as medium-risk and needing a human look. Empty badge means nothing needs attention right now. |
| **User chip** (top right) | Decorative — shows the demo presenter identity. Not a real login. |
| **☰ menu icon** (mobile only, under ~900px width) | Opens the sidebar as a slide-over panel. |

### Left sidebar — page navigation

| Page | Status | What's there |
|---|---|---|
| **Dashboard** | Fully live | Everything described below. This is where you'll spend the whole demo. |
| **Transactions** | Fully live | The same live feed as the Dashboard, but full-width and unfiltered — a bigger view of every transaction scored this session. |
| **Fraud Monitoring** | Placeholder | Not built for this demo. Honest "coming soon" message — there's no fake data behind it. |
| **Merchants** | Placeholder | Same — no merchant directory exists in the backend yet. |
| **Disputes** | Placeholder | Same — no dispute/chargeback workflow exists yet. |
| **Reports** | Placeholder | Same — no export/analytics backend exists yet. |
| **Settings** | Placeholder | Same — no configurable thresholds/integrations UI exists yet. |

The five placeholder pages are intentional — they exist so the sidebar reads as a complete product, but nothing on them is faked. Everything with real numbers lives on Dashboard and Transactions.

### Dashboard page, top to bottom

**1. Greeting header**
"Good morning/afternoon/evening" — genuinely computed from your system clock, not hardcoded. The date range next to it shows the real last-7-days window. The pulsing "Live" pill just indicates the page is actively polling for new data (every 3 seconds).

**2. KPI strip** — five cards, all computed from real transactions scored this session (not fabricated):

| Card | Meaning |
|---|---|
| Transactions Scored | Total count processed this session |
| Blocked | How many were rejected outright |
| Block Rate | Blocked ÷ total, as a percentage |
| Avg. Risk Score | Mean risk score (0–100) across everything scored |
| Model Accuracy | The LightGBM model's real ROC-AUC from its held-out test set (fetched live from the ML API's `/model-info` endpoint), shown as a percentage |

The small trend arrows under the first four compare the more recent half of this session's transactions against the earlier half — a genuine within-session trend, not a historical claim. Model Accuracy has no trend arrow on purpose: there's no accuracy history to compare against, so it just states its source instead of inventing a number.

**3. Merchant terminal** (left column)
This is where you play the role of a merchant. Enter an amount and merchant name, click **Create payment request**, and it generates a real one-time QR code + token (10-minute expiry, counting down live) by calling the backend's payment API. This is a genuine payment request stored in the Firestore emulator, not a mockup.

**4. Attack simulator** (middle column)
Six buttons, each firing a complete, realistic transaction through the actual fraud pipeline (Node backend → LightGBM ML API → risk engine → back). Use these to demo the system without needing a real payment flow:

- **Legitimate purchase** — a clean transaction, should approve
- **OTP interception / SIM swap** — simulates a hijacked session
- **Mule network payout** — simulates paying a known high-risk account
- **Velocity / smurfing** — simulates rapid small structured transactions
- **Impossible travel** — simulates a transaction from a geographically implausible location jump
- **Token replay** — creates a payment, processes it once, then immediately tries to process the *same* token again, to prove the system rejects reused tokens

Each scenario's badge (Safe / Medium / High Risk / Low) is a preview hint of what to expect — the actual verdict always comes from the live model, not the badge.

**5. Fraud engine verdict** (right column, appears after you run a scenario)
The animated risk gauge (0–100), the decision (Approved / Review / Rejected), the specific fraud signals that were triggered, and — the most useful part for explaining the system — a **"Why the model thinks so"** breakdown showing exactly which input features pushed the score up or down and by how much. This comes straight from the LightGBM model's own feature-contribution output, not a canned explanation.

**6. Live transaction feed** (right column, below the verdict)
A running table of every transaction scored this session, plus a small donut chart (approved/review/blocked split) and a sparkline showing risk trending over time. This updates automatically every 3 seconds — you don't need to refresh anything. Click **View All →** to jump to the full-width Transactions page.

---

## 7. Suggested demo flow

If you're presenting this live, a clean run-through is:

1. Open the dashboard, point out the top bar's green "System Online" status and the KPI strip.
2. Use the **Merchant terminal** to create a real payment request — show the QR code and the live countdown.
3. Run the **Legitimate purchase** scenario — point out the low score, green approval, and the "why" breakdown showing nothing suspicious.
4. Run the **Mule network payout** scenario — point out the high score, red rejection, and the specific SHAP feature contributions driving it.
5. Run **Token replay** last — this is the strongest "aha" moment, since it proves the system won't let the same payment token be used twice even if the fraud score alone wouldn't have caught it.
6. Scroll to the live feed and point out the donut/sparkline updating in real time as a summary of everything just demoed.

---

*For architecture details, environment variables, and the full API reference, see [README.md](../README.md). For known quirks of this specific dev machine (Java/Firestore emulator workaround, Windows port reservations, etc.), see [CLAUDE.md](../CLAUDE.md).*
