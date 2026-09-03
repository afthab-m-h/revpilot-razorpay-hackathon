<div align="center">

<img src="assets/revpilot-logo.png" alt="RevPilot logo" width="180" />

### AI Agents That Grow Merchant Revenue

*Bounded. Gated. Auditable.*

<img src="https://img.shields.io/badge/Python-3.12-4A90D9?style=for-the-badge&logo=python&logoColor=white" alt="Python" />
<img src="https://img.shields.io/badge/FastAPI-Backend-0E8C7F?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI" />
<img src="https://img.shields.io/badge/React_18-TypeScript-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React TypeScript" />
<img src="https://img.shields.io/badge/TailwindCSS-Styling-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
<img src="https://img.shields.io/badge/Gemini-AI_Agents-8E75B2?style=for-the-badge&logo=google&logoColor=white" alt="Gemini" />
<img src="https://img.shields.io/badge/Razorpay-Test_Mode_Integration-3395FF?style=for-the-badge&logo=razorpay&logoColor=white" alt="Razorpay Test Mode" />
<img src="https://img.shields.io/badge/SQLite-SQLAlchemy-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />

**Built for the Razorpay hackathon · all payments are simulated/test — no live payments**

</div>

---

RevPilot is an AI revenue and agentic-commerce platform for merchants, built around two connected experiences. **Customers** shop through an AI agent that understands intent and recommends products backed by real purchase data, then check out through a simulated gateway where success *and* failure are handled properly. **Merchants** run the store from a console where AI-detected opportunities become offers only after passing a policy engine and receiving explicit human approval — and every step lands in a complete audit trail.

## Core Flow

```
DATA → INTELLIGENCE → OPPORTUNITY → AI DECISION → MERCHANT APPROVAL → COMMERCE → PAYMENT → AUDIT
```

## Two Roles, One Platform

| 🛍 Customer | 📈 Merchant |
| :--- | :--- |
| Product catalog with search & categories | Revenue dashboard (revenue · AOV · conversion · funnel) |
| AI shopping agent with visible tool-calling trace | Product & stock management (add / edit / delete) |
| Cross-sell recommendations from real co-purchase data | AI revenue opportunities with explainable reasoning |
| Cart with server-side pricing | Approval workflow — policy-checked offer proposals |
| Simulated checkout with success **and** failure handling | Report exports: CSV · XLSX · PDF · DOCX |
| Order history incl. failed-payment states | Complete financial audit trail & agent activity log |

## Demo & Screenshots

[![Watch the RevPilot demo](https://img.youtube.com/vi/1y0kQhWMdDg/maxresdefault.jpg)](https://youtu.be/1y0kQhWMdDg)

▶ [Watch the full RevPilot product walkthrough on YouTube](https://youtu.be/1y0kQhWMdDg)

### Screenshots

<p align="center">
  <img src="assets/Landing%20page%20(role%20selection).png" alt="RevPilot landing page with customer and merchant role selection" width="48%" />
  <img src="assets/Customer%20store%20%2B%20AI%20agent%20chat.png" alt="Customer store and AI shopping agent" width="48%" />
</p>
<p align="center">
  <img src="assets/Merchant%20dashboard%201.png" alt="Merchant revenue dashboard" width="48%" />
  <img src="assets/Merchant%20dashboard%202.png" alt="Merchant dashboard analytics" width="48%" />
</p>
<p align="center">
  <img src="assets/AI%20opportunity%20review%20%20policy%20block.png" alt="AI opportunity review and policy block" width="48%" />
  <img src="assets/Checkout%20%20simulated%20payment%20failure.png" alt="Simulated payment failure at checkout" width="48%" />
</p>
<p align="center">
  <img src="assets/Audit%20trail.png" alt="Audit trail" width="48%" />
</p>

## Why This Fits Track 01

| Track requirement | RevPilot implementation |
| :--- | :--- |
| Conversational in-app checkout | Shopping agent chat drives discovery straight into the cart and sandbox checkout modal |
| Agent-readable catalog | Structured product API (`search_products`, `get_product_details`) is what the agent actually calls |
| Upsell / cross-sell | Co-purchase matrix P(B\|A) computed over paid orders surfaces affinity-ranked add-ons |
| Revenue opportunities | Analytics engine detects cross-sell bundles, cart abandonment, low-conversion products |
| Campaign / offer orchestration | Opportunities become policy-checked offer proposals; merchants approve or reject them in-console |
| Explainable, bounded, gated money actions | Every proposal carries reason + confidence; the policy engine bounds discounts/orders and gates execution behind merchant approval — all audited |

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

## Safety Model

The LLM never touches money directly:

```
Gemini → picks TOOLS only → commerce tools → POLICY ENGINE → PaymentProvider → audit trail
```

- Tool declarations expose **read-only** catalog/analytics tools plus `create_offer_proposal` — there is no path from model output to a payment API
- All pricing math is deterministic Python; the model never invents amounts
- Policy engine enforces: max order value ₹10,000 · max discount 20% · product existence · stock availability
- Violations return `BLOCKED` with a human-readable reason and an audit entry — nothing is silently clamped
- Policy is **re-evaluated at approval time**, invalidating stale proposals
- Server-side cart pricing: client totals are never trusted
- Webhook signatures are verified before any state changes; failed payments leave orders unfulfilled with no revenue recorded

## Failure Handling

Deliberate, demoable failures:

| Scenario | What happens |
| :--- | :--- |
| Agent proposes 30% off | `BLOCKED: Discount 30.00% vs max allowed 20%` — audited, nothing executed |
| Payment fails at gateway | Order → `payment_failed`, stays unfulfilled, failure recorded via verified webhook |
| LLM outage or quota exhausted | Deterministic catalog-backed fallback answers; usage tracked and surfaced honestly (`AI QUOTA · 20/20 · RATE LIMITED · RETRY IN 42s`) without invented numbers |

## Tech Stack

| Layer | Tools |
| :--- | :--- |
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS · Recharts · react-markdown |
| Reports | SheetJS · jsPDF · docx (generated client-side from live API data) |
| Backend | Python 3.12 · FastAPI · SQLAlchemy 2 · Pydantic v2 |
| Payments | `PaymentProvider` interface → Mock (default) / Razorpay Test Mode |
| AI | Google Gemini function calling with deterministic fallback |
| Database | SQLite via SQLAlchemy (`DATABASE_URL` swappable for PostgreSQL) |

## Quick Start

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

All configuration lives in `backend/.env` (see [`.env.example`](backend/.env.example)). No secret ever leaves the backend.

| Variable | Purpose |
| :--- | :--- |
| `PAYMENT_PROVIDER` | `mock` by default; `razorpay` enables Razorpay Test Mode |
| `RAZORPAY_KEY_ID` | Razorpay Test Mode key ID; only needed for the Razorpay provider |
| `RAZORPAY_KEY_SECRET` | Razorpay Test Mode secret; only needed for the Razorpay provider |
| `WEBHOOK_SECRET` | Razorpay webhook signing secret |
| `MOCK_PAYMENT_SECRET` | Mock gateway HMAC secret |
| `GEMINI_API_KEY` | Optional; enables the Gemini agent layer, otherwise deterministic fallback |
| `GEMINI_MODEL` | Gemini model ID |
| `DATABASE_URL` | SQLAlchemy database URL; SQLite by default |

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

> The SQLite database lives in `backend/` at runtime and is gitignored.

## Honest Labels

All orders, metrics and payments in this project are **simulated/test data**, labelled as such in the UI and every generated report. Razorpay integration runs against Test Mode APIs only.

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
