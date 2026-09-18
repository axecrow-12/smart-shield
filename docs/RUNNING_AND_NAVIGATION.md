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
| **Dashboard** | Fully live | Everything described below. This is where you'll spend the most demo time. |
| **Transactions** | Fully live | The same live feed as the Dashboard, but full-width and unfiltered — a bigger view of every transaction scored this session. |
| **Fraud Monitoring** | Fully live | Signal frequency, a risk-score histogram, and a table of every blocked transaction with its top ML driver — all derived from real transactions, nothing canned. |
| **Merchants** | Fully live | Per-merchant aggregates (volume, approved/blocked counts, block rate, avg risk) computed from real transactions — there's no merchant directory backend, so this is derived rather than stored, but every number is real. |
| **Disputes** | Fully live | A real workflow: open a dispute against any transaction (false positive, false negative, customer complaint, chargeback), then resolve it (upheld/overturned/refunded). Backed by its own Firestore collection. |
| **Reports** | Fully live | Session totals, decision/signal breakdowns, the live model's own metrics from `/model-info`, and a real CSV export button. |
| **Settings** | Fully live | Presenter preferences (your name, default merchant, feed refresh rate — saved in this browser) plus a read-only view of the backend's actual runtime config. No secrets are ever shown. |

Every page is backed by real data — nothing on the sidebar is a mockup anymore. The five pages beyond Dashboard/Transactions are all *derived* from the same transaction stream rather than their own dedicated backend tables (there's no separate "merchants" database, for instance) — worth saying out loud if someone asks how deep it goes.

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

**The QR code is scannable — a second device is the intended way to complete it.** It encodes a real link (also printed as text under the QR, in case scanning isn't convenient) that opens `pay.html`, a separate customer-facing checkout page. On that page the "customer" sees the merchant name and amount, and taps **Approve & Pay** to actually call the same `/api/payments/process` endpoint the dashboard uses — a genuine second half of the transaction, not a simulation. It even has its own small "simulate risk signals" toggles (new device / rapid attempts / location mismatch) so you can trigger a real BLOCK from the second device live, not just from the Attack Simulator.

To make this work, **the second device must be on the same Wi-Fi / hotspot as the laptop running the backend.** The server auto-detects its own LAN IP address and bakes it into the QR code — if it picks the wrong network adapter (common on machines with a VPN or virtual-machine software installed), set `PUBLIC_BASE_URL` in `.env` to the correct one, e.g. `PUBLIC_BASE_URL=http://192.168.1.23:5050`. If the expo Wi-Fi has client isolation (common on public/guest networks — devices can't see each other even though they share one network), turn on a mobile hotspot from your own phone and connect the laptop to it instead; you may also need to allow Node.js through Windows Firewall for private networks the first time you try this.

If you don't want to deal with a second device at all, that's fine too — the **Attack simulator** (next column) is the primary way to demo the fraud engine and needs nothing but the one screen.

**4. EcoCash Sandbox (Live)** (left column, below the merchant terminal)
This one talks to EcoCash's *real* Instant Payment API sandbox, not a simulation. Enter a Zimbabwe-format MSISDN and an amount, click **Charge (Live Sandbox)**:

- The transaction is scored first, same engine as everything else. HIGH or MEDIUM risk is **blocked locally** — you'll see `ecocash: null` in the result and nothing ever reaches EcoCash's servers.
- Only LOW risk gets a real Charge Request sent, then the card polls for the sandbox's real result (`PENDING SUBSCRIBER VALIDATION` → `COMPLETED`/`FAILED`) until it resolves.

Blocking works with any well-formatted number — nothing real is contacted. **Actually completing a charge needs your own registered sandbox test MSISDN** (EcoCash only accepts test numbers their POC has allow-listed for your account).

**5. Attack simulator** (middle column)
Seven buttons, each firing a complete, realistic transaction through the actual fraud pipeline (Node backend → LightGBM ML API → risk engine → back). Use these to demo the system without needing a real payment flow:

- **Legitimate purchase** — a clean transaction, should approve
- **OTP interception / SIM swap** — simulates a hijacked session
- **Mule network payout** — simulates paying a known high-risk account
- **Velocity / smurfing** — simulates rapid small structured transactions
- **Impossible travel** — simulates a transaction from a geographically implausible location jump
- **Unverified merchant** — the one scenario that lands in MEDIUM risk rather than clearly safe or clearly HIGH. On the dashboard this shows as amber "AWAITING CUSTOMER VERIFICATION" — the merchant side can't resolve it; only a customer on `pay.html` can (see below)
- **Token replay** — creates a payment, processes it once, then immediately tries to process the *same* token again, to prove the system rejects reused tokens

Each scenario's badge (Safe / Medium / High Risk / Verify / Low) is a preview hint of what to expect — the actual verdict always comes from the live model, not the badge.

**6. Fraud engine verdict** (right column, appears after you run a scenario)
The animated risk gauge (0–100), the decision (Approved / Rejected / Awaiting Customer Verification), the specific fraud signals that were triggered, and — the most useful part for explaining the system — a **"Why the model thinks so"** breakdown showing exactly which input features pushed the score up or down and by how much. This comes straight from the LightGBM model's own feature-contribution output, not a canned explanation.

**7. Live transaction feed** (right column, below the verdict)
A running table of every *finalized* transaction scored this session, plus a small donut chart (approved/review/blocked split) and a sparkline showing risk trending over time. This updates automatically every 3 seconds — you don't need to refresh anything. Click **View All →** to jump to the full-width Transactions page. (A MEDIUM-risk transaction pending customer verification won't appear here yet — it only shows up once the customer resolves it.)

### The customer's side of a borderline transaction

When a transaction scores MEDIUM risk (either the "Unverified merchant" scenario, or a real payment through `pay.html`), it doesn't just approve or reject — the **customer** is asked to confirm it, the way a real OTP/2FA challenge works:

1. `pay.html` shows a 6-digit code — clearly labeled as a demo stand-in, since no SMS provider is wired up here — with a 2-minute countdown.
2. The customer types the code back in and taps **Confirm it's me** → approved. Or taps **This wasn't me — decline** → rejected immediately. Three wrong code attempts also auto-rejects.
3. Only at that point does the transaction show up in the merchant dashboard's live feed.

This is the one part of the system that's genuinely customer-facing rather than merchant-facing — everywhere else, the customer only ever sees a final approve/decline.

### Vendor Tap mode (needs ngrok — optional, for a repeat-customer/high-throughput demo)

This is a separate fast lane for a vendor serving many repeat customers back-to-back, where the standard flow's 2-minute code challenge would be too slow. It replaces "type back a code" with a real biometric device attestation (WebAuthn — Face ID / Touch ID / Android fingerprint), which only runs in a secure context, so it needs HTTPS:

1. Start a tunnel: `C:\ngrok\ngrok.exe http 5050` (or wherever `ngrok.exe` lives on this machine), and note the `https://....ngrok-free.app` (or `.ngrok-free.dev`) URL it prints.
2. Set `PUBLIC_HTTPS_URL=https://<that ngrok URL>` in `.env`, then restart the backend (`npm run dev`). The Merchant terminal's **"⚡ Vendor Tap (fast lane, needs HTTPS)"** toggle now generates a QR/link that points straight at that HTTPS tunnel — no manual URL-swapping needed. If `PUBLIC_HTTPS_URL` isn't set, flipping the toggle shows a message telling you to do this instead of a QR that will fail on the phone.
3. Flip the toggle **before** creating the payment request, then scan the QR (or copy the text link printed under it) on the phone — it's already the correct `https://....ngrok-free.dev/vendor-tap?token=...` link.
4. **First tap for that phone**: it prompts a one-time WebAuthn enrollment (biometric), then immediately scores and finalizes.
5. Reload the same page on the same phone (or create a new payment and open the vendor-tap link again): it now recognizes the enrolled device and goes straight to a single fast biometric tap — no re-enrollment, no typed code.

If the phone's browser doesn't support WebAuthn, the page says so plainly and points back to the standard `pay.html` flow rather than dead-ending.

> **Note:** `ngrok`'s free tier assigns a new random URL every time you restart the tunnel — if you stop and restart `ngrok`, update `PUBLIC_HTTPS_URL` to match and restart the backend again.

### The other sidebar pages

- **Fraud Monitoring** — a signal-frequency bar chart (which reasons fire most often), a risk-score histogram across every transaction, and a table of just the blocked ones with their single biggest ML driver called out.
- **Merchants** — one row per merchant name seen this session: transaction count, total volume, approved/blocked counts, block rate, and average risk. There's no separate merchant database — this is computed live from the transaction stream every time you open the page.
- **Disputes** — pick any transaction from the dropdown, give a reason (false positive, false negative, customer complaint, chargeback), and open a dispute. Each one gets three resolve buttons (upheld / overturned / refunded); a transaction can't have two open disputes at once. Good for demoing "what happens when the model gets it wrong" as its own workflow rather than just a hypothetical.
- **Reports** — session totals (scored/approved/blocked/rate/volume), decision and signal breakdowns, the live model's own metrics pulled from the ML service's `/model-info` (real AUC/F1, not the demo defaults), and an **Export CSV** button that downloads every transaction currently loaded.
- **Settings** — two independent things on one page: presenter preferences on the left (your name feeds the greeting, default merchant pre-fills the terminal, feed refresh rate controls the polling interval — all saved to this browser via `localStorage`, so they follow you across reloads but not across machines), and a read-only dump of the backend's actual environment config on the right (ports, ML timeout, Firestore mode, the scoring policy's fixed weights, EcoCash sandbox merchant identity). The right side never shows a PIN, password, or API key — check `GET /api/system/config` yourself if you want to confirm.

---

## 7. Suggested demo flow

If you're presenting this live, a clean run-through is:

1. Open the dashboard, point out the top bar's green "System Online" status and the KPI strip.
2. Use the **Merchant terminal** to create a real payment request — show the QR code and the live countdown.
3. If you have a phone on the same Wi-Fi handy: scan the QR code, show the real checkout page load with the correct amount/merchant, and tap **Approve & Pay** — a completely independent device just completed a live transaction through the same fraud engine. Otherwise, skip straight to step 4.
4. Run the **Legitimate purchase** scenario — point out the low score, green approval, and the "why" breakdown showing nothing suspicious.
5. Run the **Mule network payout** scenario — point out the high score, red rejection, and the specific SHAP feature contributions driving it.
6. Run **Unverified merchant** — point out the amber "awaiting customer verification" state, then (if you have that second phone handy) show the actual code challenge on `pay.html` and resolve it live — this is the moment that shows the customer isn't just a passive recipient of a decision.
7. In the **EcoCash Sandbox (Live)** card, fire a large amount (e.g. $2,500) with any number — point out `ecocash: null` in the result: it never left this machine. If you have your registered sandbox MSISDN, fire a small amount too and show the real charge resolve against EcoCash's actual servers.
8. Run **Token replay** last — this is the strongest "aha" moment, since it proves the system won't let the same payment token be used twice even if the fraud score alone wouldn't have caught it.
9. Scroll to the live feed and point out the donut/sparkline updating in real time as a summary of everything just demoed.

---

*For architecture details, environment variables, and the full API reference, see [README.md](../README.md). For known quirks of this specific dev machine (Java/Firestore emulator workaround, Windows port reservations, etc.), see [CLAUDE.md](../CLAUDE.md).*
