# RevPilot

**AI Revenue Agent for Merchants** — built for the Razorpay hackathon.

RevPilot autonomously detects revenue opportunities in merchant data, recommends personalized bundles and offers through an AI shopping agent, and executes commerce actions through a payment provider — with **every financial action bounded, explainable, gated and auditable**.

> All payments run on a simulated sandbox gateway (`MockPaymentProvider`) by default.
> Real Razorpay Test Mode integration is included and can be enabled with Test keys — no live payments anywhere in this project.

---

## Problem

Merchants sit on customer data, product data and payment infrastructure — but converting that information into revenue requires manual analysis and intervention.

## Solution

RevPilot turns that process into AI agents:

```
DATA -> INTELLIGENCE -> OPPORTUNITY -> AI DECISION -> MERCHANT APPROVAL -> COMMERCE ACTION -> PAYMENT -> MEASUREMENT -> LEARNING
        Observe  ->  Reason  ->  Propose  ->  Gate  ->  Act  ->  Verify  ->  Learn
```

Two roles, one platform:

| Role | Experience |
|---|---|
| **Customer** | Browse the StrideX catalog, work with an AI shopping agent that reasons over real co-purchase data, then check out through a simulated gateway (success *and* failure paths). |
| **Merchant** | Revenue dashboard, product/stock management, AI-detected opportunities with a human approval gate, report exports (CSV/XLSX/PDF/DOCX) and a complete audit trail. |

## Demo

Quick tour (2 minutes):

1. Open `http://localhost:5173` — pick **CUSTOMER**
2. Ask the chat: *"I need running shoes for a half marathon under ₹5000"* — watch the tool-calling trace (`search_products` → `get_cross_sell_products`)
3. Add products to cart → Checkout → **Pay now** → order marked `paid`, stock decremented, revenue recorded
4. Try again with **Simulate failure** → order stays unfulfilled, failure audited
5. Back to landing → pick **MERCHANT**
6. Open **AI Opportunities** → Review → *"Try 30% — policy will block this"* → the policy engine blocks it and the audit log records it
7. Propose a compliant 6% bundle → **Approve & execute**
8. **Reports** → export anything as CSV / XLSX / PDF / DOCX
9. **Audit** → filter by actor to show the full chain: proposal → policy → approval → payment → webhook

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full diagram and design decisions.

Short version:

```
                    ┌────────────────────────────────────────┐
   Customer ────────►  React SPA (Vite + TS + Tailwind)      │
   Merchant ────────►  store · dashboard · reports          │
                    └──────────────┬─────────────────────────┘
                                   ▼
                    ┌────────────────────────────────────────┐
                    │           FastAPI backend              │
                    │                                        │
                    │   Gemini AI Agents (tool calling)      │
                    │        │                               │
                    │        ▼                               │
                    │   Commerce Tools ──► Policy Engine     │
                    │        │            │  bounds + gates │
                    │        ▼            ▼                  │
                    │   Payment Provider Abstraction         │
                    │    ├── MockPaymentProvider (default)   │
                    │    └── RazorpayPaymentProvider         │
                    │        (Test Mode, isolated)           │
                    │        │                               │
                    │        ▼                               │
                    │   Webhooks (signed) ──► Audit Log      │
                    └──────────────┬─────────────────────────┘
                                   ▼
                        SQLite (SQLAlchemy) · analytics engine
```

### The safety model (the core of this project)

The LLM never touches money directly:

```
Gemini ──► agent picks TOOLS ──► commerce tools ──► POLICY ENGINE ──► PaymentProvider ──► audit trail
```

- The model can only call read-only catalog/analytics tools plus `create_offer_proposal`
- Every offer passes through the **policy engine**: max order value ₹10,000 · max discount 20% · product existence · stock check
- Violations are **blocked and audited**, not silently clamped — try proposing 30% off and watch it fail
- Approved offers still require explicit **merchant approval** before activation
- Payment creation goes exclusively through the `PaymentProvider` interface; there is no path from the LLM to a payment API
- Every step writes to the `audit_logs` table: actor, action, entity, reason, policy status, approval status, execution status

### Deterministic intelligence

Recommendations are computed from real order history (co-purchase matrix P(B|A)), not hallucinated:

- Cross-sell affinities ("30% of Speed Pro buyers also bought these socks")
- Cart-abandonment detection from browsing events
- Low-conversion product detection from funnel analytics
- Gemini's job is orchestration and explanation — never raw math or pricing

## Tech Stack

| Layer | Tools |
|---|---|
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS · Recharts · react-markdown |
| Reports | SheetJS (xlsx) · jsPDF · docx — generated client-side from live API data |
| Backend | Python 3.12 · FastAPI · SQLAlchemy 2 · Pydantic v2 |
| Payments | `PaymentProvider` abstraction → MockPaymentProvider (default) / Razorpay Test Mode |
| AI | Google Gemini function calling (`GEMINI_MODEL`, default `gemini-3.5-flash`) with graceful deterministic fallback |
| Database | SQLite via SQLAlchemy (swap `DATABASE_URL` for PostgreSQL) |

## Setup

```powershell
git clone https://github.com/afthab-m-h/revpilot-razorpay-hackathon.git
cd revpilot-razorpay-hackathon
.\start.ps1
```

First time only, prepare the two halves:

```powershell
# backend
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
Copy-Item .env.example .env      # then edit values if needed
.venv\Scripts\python scripts\seed.py          # full demo dataset (~8k orders)

# frontend
cd ..\frontend
npm install
cd ..
.\start.ps1                     # starts backend :8000 + frontend :5173, opens browser
.\stop.ps1                      # stops both cleanly
```

### Environment variables (`backend/.env`)

| Variable | Purpose | Default |
|---|---|---|
| `PAYMENT_PROVIDER` | `mock` (default) or `razorpay` | `mock` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay **Test Mode** keys — only needed when provider is `razorpay` | — |
| `WEBHOOK_SECRET` | Razorpay webhook signing secret | — |
| `MOCK_PAYMENT_SECRET` | HMAC secret for the mock gateway's signatures | dev default |
| `GEMINI_API_KEY` | Google AI Studio key — enables the LLM agent layer | empty → deterministic fallback |
| `GEMINI_MODEL` | Model id | `gemini-3.5-flash` |
| `DATABASE_URL` | SQLAlchemy URL | SQLite |

**No secret ever leaves the backend.** The frontend receives only booleans and public ids.

## Test payment flow

With the default mock provider:

1. Cart → **Checkout** — backend prices the cart server-side, runs the policy engine, creates an order locally, then asks the provider for an order id
2. Sandbox modal opens (labelled `MockPaymentProvider`) — choose **Pay now** or **Simulate failure**
3. The chosen outcome generates a signed gateway event pushed through the exact same pipeline as a real webhook: signature verify → find order → update DB → decrement stock on capture → audit entry → analytics update
4. Failed payments leave the order `payment_failed` and **unfulfilled** — no revenue recorded

To switch to real Razorpay Test Mode: set `PAYMENT_PROVIDER=razorpay` + test keys in `.env`. The integration (server-side Orders API, checkout signature verification, `payment.captured` / `payment.failed` / `order.paid` webhooks) is fully implemented and isolated in one module.

## Failure handling

Deliberate demos built into the product:

- **Policy block**: propose a 30% discount from the merchant console → `BLOCKED: Discount 30.00% vs max allowed 20%` — audited, nothing executed
- **Payment failure**: simulate at checkout → order stays unfulfilled, failure recorded via verified webhook
- **LLM outage/quota**: Gemini errors degrade to a deterministic catalog-backed fallback; usage/rate-limit state is tracked and surfaced honestly (`AI QUOTA · 20/20 · RATE LIMITED · RETRY IN 42s`) without inventing quota numbers

## API surface (main endpoints)

```
GET  /api/products[?search=&category=]        GET  /api/products/{id}/cross-sell
POST /api/orders/checkout                     GET  /api/orders[?customer_id=&status=]
POST /api/payments/verify                     POST /api/payments/simulate   (mock only)
POST /api/webhooks/razorpay                   GET  /health
GET  /api/analytics/summary|funnel|opportunities
POST /api/offers/{id}/approve|reject          POST /api/opportunities/{id}/dismiss
POST /api/merchant/products (CRUD + /stock)   GET  /api/audit[?actor=]
POST /api/agent/chat | /revenue               GET  /api/agent/activity | /usage
```

## Repository layout

```
revpilot/
├── backend/
│   ├── app/
│   │   ├── api/routes/       # products, orders, payments, webhooks, agent, offers, analytics, audit, admin
│   │   ├── models/ schemas/  # SQLAlchemy models, Pydantic schemas
│   │   ├── services/         # agent (Gemini), analytics, policy, payment_provider, razorpay, gemini_usage
│   │   └── tools/            # catalog / commerce / analytics tools exposed to the agents
│   ├── scripts/              # seed.py (full reseed), add_products.py (incremental)
│   └── requirements.txt
├── frontend/src/             # pages (landing/store/merchant), components, lib
├── docs/architecture.md
├── start.ps1 / stop.ps1      # dev launchers
└── data notes                # SQLite db lives in backend/ (gitignored)
```

## Honest labels

All metrics, orders and payments in this project are **simulated/test data** and are labelled as such in the UI and generated reports.

## Future improvements

- PostgreSQL migration, multi-tenant merchants
- Campaign execution (email/SMS simulation) for approved offers
- Embedding-based recommendations alongside co-purchase rules
- Idempotency keys for duplicate-order protection
