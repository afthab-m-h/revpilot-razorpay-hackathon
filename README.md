<div align="center">

# REVPILOT

### AI Revenue Agent for Merchants

*Agentic commerce that grows merchant revenue — with every money action bounded, gated and auditable.*

**Built for the Razorpay Hackathon · simulated payments only**

</div>

---

## The Problem

Merchants sit on customer data, product data and payment infrastructure — but turning that into revenue still takes manual analysis and manual intervention.

## The Solution

RevPilot runs two AI agents on top of a live commerce backend:

- A **shopping agent** that understands intent ("half marathon shoes under ₹5,000"), searches the catalog with tools, and recommends products backed by real co-purchase data.
- A **revenue agent** that scans order history, detects opportunities, and proposes offers — which the **policy engine validates** and the **merchant approves** before anything executes.

```
Observe → Reason → Propose → Gate → Act → Verify → Learn
```

## Key Capabilities

| | |
|---|---|
| 🛍 **AI shopping agent** | Gemini tool-calling over a live catalog — visible activity trace, markdown answers |
| 📊 **Deterministic intelligence** | Cross-sell affinities, cart-abandonment and low-conversion detection computed from real order history — never hallucinated |
| 🔒 **Policy engine** | Max order value ₹10,000 · max discount 20% · product & stock checks · violations blocked *and* audited |
| ✅ **Human-in-the-loop** | AI proposals stay `proposed` until the merchant explicitly approves them |
| 💳 **Payment abstraction** | `MockPaymentProvider` sandbox by default; Razorpay Test Mode fully implemented behind the same interface |
| 🧾 **Complete audit trail** | Every proposal, policy check, approval, payment event and webhook — actor, reason, status |
| 📄 **Report exports** | Sales / inventory / opportunities / audit as CSV, XLSX, PDF, DOCX |

## Demo

> **Placeholder — demo video link will be added here.**

Quick self-guided tour once running:

1. Pick **CUSTOMER** → ask *"I need running shoes for a half marathon under ₹5000"* → watch the tool trace
2. Add to cart → Checkout → **Pay now** → order `paid`, stock decremented, revenue recorded
3. Repeat with **Simulate failure** → order stays unfulfilled, failure audited
4. Pick **MERCHANT** → AI Opportunities → Review → *"Try 30%"* → **blocked by policy**
5. Approve a compliant 6% bundle → export an **Audit report**

## Screenshots

> **Placeholder — screenshots will be added here.**

<!-- customer store · AI chat · checkout · merchant overview · opportunity review · policy block · audit trail -->

## Customer Journey

```
Browse catalog ──► AI assistance (intent + budget) ──► Product detail
      ──► cross-sell suggestions ──► Cart ──► Checkout
      ──► Simulated payment ──► Success (order paid) / Failure (not fulfilled)
      ──► Order history
```

## Merchant Journey

```
Dashboard (revenue · AOV · conversion · funnel) ──► Manage products & stock
      ──► Review AI opportunities ──► Propose offer ──► Policy gate
      ──► Approve / Reject ──► Track sales ──► Export reports ──► Audit everything
```

## Architecture

Full details in [docs/architecture.md](docs/architecture.md).

```
   React SPA (Vite + TS + Tailwind)
   store · dashboard · reports
              │  /api/*
              ▼
        FastAPI backend
              │
   ┌──────────┼───────────────┐
   ▼          ▼               ▼
Gemini    Analytics       Policy Engine
Agents    Engine          bounds · gates · audit
   │                          │
   ▼                          ▼
Commerce Tools ────► Payment Provider Abstraction
(read-only + offers)     ├── MockPaymentProvider (default)
                         └── RazorpayPaymentProvider (Test Mode)
                                    │
                                    ▼
                        Signed webhooks ──► SQLite ──► Audit log
```

## Safety & Policy Model

The LLM never touches money directly:

```
Gemini → picks TOOLS only → commerce tools → POLICY ENGINE → PaymentProvider → audit trail
```

- Tool declarations expose **read-only** catalog/analytics tools plus `create_offer_proposal` — there is no path from model output to a payment API
- All pricing math is deterministic Python; the model never invents amounts
- Policy violations return `BLOCKED` with a human-readable reason and an audit entry — nothing is silently clamped
- Policy is **re-evaluated at approval time**, invalidating stale proposals
- Server-side cart pricing: client totals are never trusted
- Webhook signatures are verified before any state changes; failed payments leave orders unfulfilled with no revenue recorded

## Failure Handling

Deliberate, demoable failures:

| Scenario | What happens |
|---|---|
| Agent proposes 30% off | `BLOCKED: Discount 30.00% vs max allowed 20%` — audited, nothing executed |
| Payment fails at gateway | Order → `payment_failed`, stays unfulfilled, failure recorded via verified webhook |
| LLM outage or quota exhausted | Deterministic catalog-backed fallback answers; usage tracked and surfaced honestly (`AI QUOTA · 20/20 · RATE LIMITED · RETRY IN 42s`) without invented numbers |

## Tech Stack

| Layer | Tools |
|---|---|
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS · Recharts · react-markdown |
| Reports | SheetJS · jsPDF · docx (generated client-side from live API data) |
| Backend | Python 3.12 · FastAPI · SQLAlchemy 2 · Pydantic v2 |
| Payments | `PaymentProvider` interface → Mock (default) / Razorpay Test Mode |
| AI | Google Gemini function calling with deterministic fallback |
| Database | SQLite via SQLAlchemy (`DATABASE_URL` swappable for PostgreSQL) |

## Setup

```powershell
git clone https://github.com/afthab-m-h/revpilot-razorpay-hackathon.git
cd revpilot-razorpay-hackathon
.\start.ps1        # starts backend :8000 + frontend :5173, opens the browser
.\stop.ps1         # stops both cleanly
```

First-time preparation:

```powershell
# backend
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
Copy-Item .env.example .env
.venv\Scripts\python scripts\seed.py        # full demo dataset (~8k correlated orders)

# frontend
cd ..\frontend
npm install
cd ..
.\start.ps1
```

## Environment Variables

All configuration lives in `backend/.env` (see `.env.example`). **No secret ever leaves the backend.**

| Variable | Purpose | Default |
|---|---|---|
| `PAYMENT_PROVIDER` | `mock` (default) or `razorpay` | `mock` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay **Test Mode** keys — only for provider = `razorpay` | — |
| `WEBHOOK_SECRET` | Razorpay webhook signing secret | — |
| `MOCK_PAYMENT_SECRET` | HMAC secret for mock gateway signatures | dev default |
| `GEMINI_API_KEY` | Google AI Studio key — empty ⇒ deterministic fallback mode | empty |
| `GEMINI_MODEL` | Model id | `gemini-3.5-flash` |
| `DATABASE_URL` | SQLAlchemy connection URL | SQLite file |

## API Surface

```
GET   /api/products[?search=&category=]          GET  /api/products/{id}/cross-sell
POST  /api/orders/checkout                       GET  /api/orders[?customer_id=&status=]
POST  /api/payments/verify                       POST /api/payments/simulate        (mock only)
POST  /api/webhooks/razorpay                     GET  /health
GET   /api/analytics/summary | funnel | opportunities
POST  /api/offers/{id}/approve | reject          POST /api/opportunities/{id}/dismiss
GET/POST/PATCH/DELETE /api/merchant/products     POST /api/merchant/products/{id}/stock
GET   /api/audit[?actor=]                        GET  /api/agent/activity | /usage
POST  /api/agent/chat | /revenue                 GET  /api/offers
```

## Repository Structure

```
revpilot/
├── backend/
│   ├── app/
│   │   ├── api/routes/      # products, orders, payments, webhooks,
│   │   │                    # agent, offers, analytics, audit, admin
│   │   ├── models/ schemas/ # SQLAlchemy models, Pydantic schemas
│   │   ├── services/        # agent (Gemini), analytics, policy,
│   │   │                    # payment_provider, razorpay, gemini_usage
│   │   └── tools/           # catalog / commerce / analytics tools for the agents
│   ├── scripts/             # seed.py (reseed) · add_products.py (incremental)
│   └── requirements.txt
├── frontend/src/            # landing, store/*, merchant/* pages + components
├── docs/architecture.md     # full architecture document
├── start.ps1 / stop.ps1     # dev launchers
└── README.md
```

> Note: the SQLite database lives in `backend/` at runtime and is gitignored.

## Honest Labels

All orders, metrics and payments in this project are **simulated/test data** and labelled as such in the UI and every generated report.

## Future Improvements

- PostgreSQL migration and multi-tenant merchants
- Campaign execution (email/SMS simulation) for approved offers
- Embedding-based recommendations alongside co-purchase rules
- Idempotency keys for duplicate-order protection

---

<div align="center">

*RevPilot doesn't give an AI unrestricted access to money.*
*It gives the agent the ability to act — within explicit policies, merchant approval and a complete audit trail.*

</div>
