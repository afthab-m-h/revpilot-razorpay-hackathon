# RevPilot Architecture

## System diagram

```
                        ┌─────────────────────────────────────────────┐
      CUSTOMER          │            React SPA (Vite + TS)            │      MERCHANT
   ─────────────────────►  store · categories · product detail       ◄─────────────────────
                         │  cart · checkout modal · orders             │  overview · products · sales
                         │  AI chat (markdown + usage indicator)       │  opportunities · reports · audit
                         └──────────────────┬──────────────────────────┘
                                            │ /api/* (vite proxy :5173 → :8000)
                                            ▼
                        ┌─────────────────────────────────────────────┐
                        │                FastAPI                      │
                        ├─────────────────────────────────────────────┤
                        │  routes: products · orders · payments       │
                        │          webhooks · agent · offers          │
                        │          analytics · audit · admin          │
                        └──────────────────┬──────────────────────────┘
                                           │
              ┌────────────────────────────┼─────────────────────────────┐
              ▼                            ▼                             ▼
   ┌──────────────────┐        ┌──────────────────┐         ┌──────────────────────┐
   │  Gemini Agents   │        │ Analytics Engine │         │    Policy Engine     │
   │  (tool calling)  │        │ (deterministic)  │         │ bounds + gates + log │
   │ shopping/revenue │        │ co-purchase P(B|A)│        └──────────┬───────────┘
   └────────┬─────────┘        │ funnels, abandon │                    │
            │  tools           └────────┬─────────┘                    │
            ▼                           │                              ▼
   ┌──────────────────┐                 │                   ┌──────────────────────┐
   │  Commerce Tools  │                 │                   │  Payment Provider    │
   │ search_products  │                 │                   │    (abstraction)     │
   │ get_cross_sell   │                 │                   │  ├── Mock (default)  │
   │ create_offer_*   │─────────────────┴──────────────────►│  └── Razorpay Test   │
   └──────────────────┘        every money action               └──────────┬───────────┘
                               passes through here                         │
                                                                           ▼
                                                              ┌──────────────────────┐
                                                              │ Checkout / Simulated │
                                                              │ gateway + webhooks   │
                                                              │ (HMAC signed events) │
                                                              └──────────┬───────────┘
                                                                         ▼
                                        ┌──────────────────────────────────────────┐
                                        │  SQLite (SQLAlchemy)                     │
                                        │  merchants customers products orders     │
                                        │  order_items payments offers             │
                                        │  recommendations events agent_runs       │
                                        │  audit_logs                              │
                                        └──────────────────────────────────────────┘
```

## The money path (why it's safe)

```
Gemini
  │  selects tools ONLY (declarations exclude any payment API)
  ▼
commerce_tools.create_offer_proposal()
  │
  ▼
PolicyEngine.evaluate_order()          ← max order ₹10,000 · max discount 20%
  │  allowed? proposed.                  product exists? stock > 0?
  │  violated? BLOCKED + audited.
  ▼
Merchant approval (POST /api/offers/{id}/approve)
  │  policy re-evaluated at approval time
  ▼
Order checkout (POST /api/orders/checkout)
  │  server-side pricing — client totals are never trusted
  ▼
PaymentProvider.create_order()         ← the ONLY route to a payment API
  │
  ▼
Webhook event (signed HMAC)
  │  signature verified BEFORE anything else
  ▼
handle_payment_event(): order status transition
  ├── payment.captured / order.paid → paid, stock decremented, revenue recorded
  └── payment.failed               → payment_failed, NOT fulfilled, failure audited
  │
  ▼
audit_logs (actor · action · entity · reason · policy/approval/execution status)
```

### Guarantees

1. **No LLM→payment path.** Gemini's tool declarations contain read-only catalog/analytics tools plus `create_offer_proposal`. Payment creation is not reachable from model output.
2. **Deterministic money math.** Discounts and bundle prices are computed in Python (`calculate_offer`), never by the model.
3. **Blocks are loud.** Policy violations return `BLOCKED` with a human-readable reason and an audit entry with `execution_status=not_executed`.
4. **Approval is re-checked.** Bounds are re-evaluated at approval time, so a policy change invalidates stale proposals.
5. **Provider-agnostic.** Business logic depends only on `PaymentProvider`; Razorpay is one swappable implementation behind it.

## AI agent design

- Two agents share one runner (`services/agent.py`): `shopping_agent` (customer chat) and `revenue_agent` (merchant console).
- Bounded tool loop (max 6 rounds). Tool args arrive as protobuf containers and are normalized to plain JSON before dispatch and persistence.
- Tools: `search_products`, `get_product_details`, `get_cross_sell_products`, `get_customer_profile`, `get_revenue_summary`, `get_revenue_opportunities`, `calculate_offer`, `create_offer_proposal`.
- Every step appends to a visible trace returned to the UI ("Calling tool X", "Found N products", ...).
- Degradation ladder: no key → deterministic fallback; known-active rate limit → instant fallback; mid-loop quota error → parse server retry delay into the usage tracker, then fallback. Commerce never depends on the LLM.

## Rate-limit handling

`services/gemini_usage.py` tracks per-instance usage in a fixed 60s window:

- `requests_limit` is learned **only** from a 429 message (`limit: N`)
- `reset_in_seconds` is exposed **only** when Gemini supplies a retry delay
- while a known-active limit stands, agent calls short-circuit to the deterministic fallback
- a successful call clears the limited state (recovery proven, not assumed)
- `GET /api/agent/usage` exposes local call counts and limit state; it never exposes the key or invented remaining-quota numbers

## Data & analytics

- `scripts/seed.py` — full reseed: merchant, 24 products, 2k customers, ~8k correlated orders, ~300k funnel events (≈4% conversion).
- `scripts/add_products.py` — incremental catalog expansion that preserves all existing history.
- Co-purchase matrix P(B|A) computed over paid orders drives cross-sell recommendations and opportunity detection (cross-sell bundles, cart abandonment, low-conversion products).

## Frontend notes

- Role-based landing page → `/store/*` (customer) and `/merchant/*` shells with separate navigation.
- Themes via CSS variables + `dark` class; persisted pre-paint to avoid flash. Light = warm white/gold, Dark = near-black/#0000FF.
- Reports are generated client-side from live API data (SheetJS/jsPDF/docx) and labelled as simulated.
