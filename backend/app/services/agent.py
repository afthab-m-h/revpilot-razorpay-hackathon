"""AI agents (Gemini) with explicit tool-calling.

Design rules:
- LLM selects and sequences TOOLS; it never sees raw SQL/data.
- The LLM NEVER calls Razorpay directly; money actions route through the
  policy engine + merchant approval.
- Every step is appended to a visible activity `trace` for the UI.
- If GEMINI_API_KEY is missing we degrade gracefully to a deterministic flow.
"""

import json
import re
import uuid

import google.generativeai as genai
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.models import AgentRun
from app.services.gemini_usage import gemini_usage, parse_quota_error
from app.tools import analytics_tools, catalog_tools, commerce_tools


class AgentTrace:
    def __init__(self) -> None:
        self.steps: list[dict] = []

    def add(self, message: str) -> None:
        self.steps.append({"message": message})


def _llm_available() -> bool:
    return bool(get_settings().gemini_api_key)


def _configure_llm() -> None:
    genai.configure(api_key=get_settings().gemini_api_key)


def _plain(value):
    """Recursively convert protobuf containers (MapComposite/RepeatedComposite)
    into plain Python types so tool args/results stay JSON-serializable."""
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    if isinstance(value, (str, bool, int, float)) or value is None:
        return value
    if hasattr(value, "items"):
        return {k: _plain(v) for k, v in value.items()}
    try:
        return [_plain(v) for v in value]
    except TypeError:
        return value


# ------------------------------------------------------------- tool schemas --

SHOPPING_TOOLS = [
    {
        "name": "search_products",
        "description": "Search the product catalog by keyword, category, max price (rupees) or minimum rating.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "query": {"type": "STRING", "description": "Free-text search keywords"},
                "category": {"type": "STRING"},
                "max_price_rupees": {"type": "NUMBER"},
                "min_rating": {"type": "NUMBER"},
                "limit": {"type": "INTEGER"},
            },
            "required": [],
        },
    },
    {
        "name": "get_product_details",
        "description": "Get full details of one product by id.",
        "parameters": {
            "type": "OBJECT",
            "properties": {"product_id": {"type": "STRING"}},
            "required": ["product_id"],
        },
    },
    {
        "name": "get_cross_sell_products",
        "description": "Get data-driven cross-sell recommendations for a product (co-purchase affinities).",
        "parameters": {
            "type": "OBJECT",
            "properties": {"product_id": {"type": "STRING"}, "limit": {"type": "INTEGER"}},
            "required": ["product_id"],
        },
    },
    {
        "name": "get_customer_profile",
        "description": "Get a customer's profile, segment and lifetime value.",
        "parameters": {
            "type": "OBJECT",
            "properties": {"customer_id": {"type": "STRING"}},
            "required": ["customer_id"],
        },
    },
]

REVENUE_TOOLS = SHOPPING_TOOLS[:0] + [
    {
        "name": "get_revenue_summary",
        "description": "Get merchant revenue metrics: revenue, orders, AOV, conversion rate.",
        "parameters": {"type": "OBJECT", "properties": {}, "required": []},
    },
    {
        "name": "get_revenue_opportunities",
        "description": "Detect revenue opportunities: cross-sell bundles, cart abandonment, low-conversion products.",
        "parameters": {"type": "OBJECT", "properties": {}, "required": []},
    },
    {
        "name": "calculate_offer",
        "description": "Deterministic bundle/discount math given product prices in paise.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "product_prices_paise": {"type": "ARRAY", "items": {"type": "INTEGER"}},
                "discount_percent": {"type": "NUMBER"},
            },
            "required": ["product_prices_paise", "discount_percent"],
        },
    },
    {
        "name": "create_offer_proposal",
        "description": (
            "Create an offer PROPOSAL. It stays proposed/blocked until merchant approval. "
            "Policy engine enforces max discount and order bounds automatically."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "name": {"type": "STRING"},
                "discount_type": {"type": "STRING"},
                "discount_value": {"type": "NUMBER"},
                "applies_to_product_ids": {"type": "ARRAY", "items": {"type": "STRING"}},
                "bundle_price": {"type": "INTEGER"},
                "recommendation_id": {"type": "STRING"},
                "reason": {"type": "STRING"},
            },
            "required": ["name", "discount_type", "discount_value", "applies_to_product_ids", "reason"],
        },
    },
]

SHOPPING_SYSTEM_PROMPT = """You are RevPilot, an AI shopping assistant for StrideX (running & fitness gear).

Rules:
- Understand the customer's intent (activity, budget, preferences), then use tools.
- ALWAYS call search_products before recommending anything. Never invent products.
- After finding a good product, call get_cross_sell_products to find bundle add-ons.
- Explain WHY you recommend each item using concrete facts from tool results:
  fit for the activity, price vs budget, rating, co-purchase percentage.
- Prices are in rupees. Be concise and helpful. Never promise discounts that
  don't exist; only mention bundles returned by tools."""

REVENUE_SYSTEM_PROMPT = """You are RevPilot Revenue Agent for the StrideX merchant.

Rules:
- Start from DATA: call get_revenue_summary and get_revenue_opportunities first.
- For any commerce action, propose offers via create_offer_proposal ONLY after
  checking the numbers with calculate_offer.
- You CANNOT execute payments or give discounts beyond policy — the policy
  engine will block violations and the merchant must approve proposals.
- Always include a clear business reason and expected impact for every proposal.
- Be concise, structured, and honest about confidence levels."""


# ------------------------------------------------------------------ runner ---

def _dispatch(db: Session, name: str, args: dict) -> dict:
    mapping = {
        "search_products": lambda: catalog_tools.search_products(
            db,
            query=args.get("query", ""),
            category=args.get("category"),
            max_price_rupees=args.get("max_price_rupees"),
            min_rating=args.get("min_rating"),
            limit=args.get("limit", 6),
        ),
        "get_product_details": lambda: catalog_tools.get_product_details(db, args["product_id"]),
        "get_cross_sell_products": lambda: catalog_tools.get_cross_sell_products(
            db, args["product_id"], limit=args.get("limit", 3)),
        "get_customer_profile": lambda: catalog_tools.get_customer_profile(db, args["customer_id"]),
        "get_customer_history": lambda: catalog_tools.get_customer_history(db, args["customer_id"]),
        "get_revenue_summary": lambda: analytics_tools.get_revenue_summary(db),
        "get_revenue_opportunities": lambda: analytics_tools.get_revenue_opportunities(db),
        "get_cross_sell_affinities": lambda: analytics_tools.get_cross_sell_affinities(db),
        "calculate_offer": lambda: commerce_tools.calculate_offer(
            args["product_prices_paise"], args["discount_percent"]),
        "create_offer_proposal": lambda: commerce_tools.create_offer_proposal(
            db,
            name=args["name"],
            discount_type=args.get("discount_type", "percent"),
            discount_value=args["discount_value"],
            applies_to_product_ids=args["applies_to_product_ids"],
            bundle_price=args.get("bundle_price"),
            recommendation_id=args.get("recommendation_id"),
            reason=args.get("reason", ""),
        ),
    }
    fn = mapping.get(name)
    return fn() if fn else {"error": f"Unknown tool {name}"}


def run_agent(db: Session, *, agent_type: str, user_message: str,
              history: list[tuple[str, str]] | None = None) -> dict:
    """Run one agentic turn. Returns {reply, trace, session_id}."""
    session_id = uuid.uuid4().hex[:12]
    trace = AgentTrace()
    trace.add(f"Analyzing request: \"{user_message[:80]}\"")

    if not _llm_available():
        reply, tools_used = _fallback_flow(db, agent_type, user_message, trace)
        _persist_run(db, session_id, agent_type, user_message, reply, tools_used, trace)
        return {"session_id": session_id, "reply": reply, "trace": trace.steps}

    # Known-active rate limit (server gave a retry time): skip the LLM entirely
    # and serve the deterministic fallback until it clears.
    if gemini_usage.should_skip():
        trace.add("Gemini rate limit active — using deterministic fallback")
        fb_reply, tools_used = _fallback_flow(db, agent_type, user_message, trace)
        reply = ("The AI assistant is rate-limited right now, so here's a quick "
                 "data-driven answer instead:\n\n" + fb_reply)
        _persist_run(db, session_id, agent_type, user_message, reply, tools_used, trace)
        return {"session_id": session_id, "reply": reply,
                "trace": trace.steps, "rate_limited": True}

    _configure_llm()
    settings = get_settings()
    system_prompt = REVENUE_SYSTEM_PROMPT if agent_type == "revenue_agent" else SHOPPING_SYSTEM_PROMPT
    gemini_tools = REVENUE_TOOLS if agent_type == "revenue_agent" else SHOPPING_TOOLS

    model = genai.GenerativeModel(
        settings.gemini_model,
        system_instruction=system_prompt,
        tools=[{"function_declarations": gemini_tools}],
    )

    contents = []
    for role, text in (history or [])[-8:]:
        contents.append({"role": "user" if role == "user" else "model", "parts": [{"text": text}]})
    contents.append({"role": "user", "parts": [{"text": user_message}]})

    tools_used: list[str] = []
    rate_limited = False
    try:
        def _send(text):
            gemini_usage.record_request()
            return chat.send_message(text)

        chat = model.start_chat(history=contents[:-1])
        response = _send(contents[-1]["parts"][0]["text"])

        for _ in range(6):  # bounded tool loop
            candidate = response.candidates[0] if response.candidates else None
            calls = []
            if candidate and candidate.content:
                calls = [p.function_call for p in candidate.content.parts if p.function_call]
            if not calls:
                break
            parts = []
            for call in calls:
                tools_used.append(call.name)
                # Normalize protobuf containers -> plain Python types so tool
                # results and audit entries stay JSON-serializable.
                args = _plain(dict(call.args or {}))
                trace.add(f"Calling tool {call.name}")
                result = _dispatch(db, call.name, args)
                trace.add(_summarize_tool_result(call.name, result))
                parts.append({
                    "function_response": {"name": call.name, "response": _safe_json(result)}
                })
            response = _send({"role": "user", "parts": parts})

        reply = response.text if response.candidates else "I could not complete that request."
        gemini_usage.record_success()
    except Exception as exc:  # LLM outage must not break commerce
        type_name = exc.__class__.__name__
        text = str(exc)
        is_quota = type_name == "ResourceExhausted" or "RESOURCE_EXHAUSTED" in text or "429" in text
        if is_quota:
            retry_seconds, limit = parse_quota_error(text)
            gemini_usage.record_rate_limited(retry_seconds, limit, reason=type_name)
            rate_limited = True
            trace.add("Gemini rate limit hit — switching to deterministic fallback")
            fb_reply, _fb_tools = _fallback_flow(db, agent_type, user_message, trace)
            reply = ("The AI assistant has hit its usage limit, so here's a quick "
                     "data-driven answer instead:\n\n" + fb_reply)
        else:
            reply = (f"The AI assistant is temporarily unavailable ({type_name}). "
                     f"You can still browse and buy normally.")
            trace.add("LLM error — degraded to non-AI mode")

    _persist_run(db, session_id, agent_type, user_message, reply, tools_used, trace)
    return {"session_id": session_id, "reply": reply,
            "trace": trace.steps, **({"rate_limited": True} if rate_limited else {})}


def _summarize_tool_result(name: str, result: dict) -> str:
    if not isinstance(result, dict):
        return f"{name} done"
    if "error" in result:
        return f"{name} failed: {result['error']}"
    if name == "search_products":
        names = [p["name"] for p in result.get("products", [])]
        return f"Found {result.get('count', 0)} products: {', '.join(names[:5])}"
    if name == "get_cross_sell_products":
        recs = result.get("recommendations", [])
        return ("Cross-sell candidates: "
                + ", ".join(r["product"]["name"] for r in recs)) if recs else "No cross-sell found"
    if name == "get_revenue_summary":
        return (f"Revenue Rs.{result.get('revenue_rupees', 0):,.0f}, "
                f"{result.get('orders', 0)} paid orders")
    if name == "get_revenue_opportunities":
        return f"Detected {result.get('count', 0)} revenue opportunities"
    if name == "create_offer_proposal":
        return f"Offer proposal status: {result.get('status')} — {result.get('policy_summary')}"
    return f"{name} completed"


def _safe_json(obj) -> dict:
    try:
        return json.loads(json.dumps(obj, default=str))
    except Exception:
        return {"raw": str(obj)[:500]}


def _persist_run(db: Session, session_id: str, agent_type: str, user_message: str,
                 reply: str, tools_used: list[str], trace: AgentTrace) -> None:
    try:
        db.add(AgentRun(id=f"run_{session_id}", session_id=session_id, agent_type=agent_type,
                        input=user_message, output=reply, tools_used=tools_used,
                        trace=trace.steps))
        db.commit()
    except Exception:
        db.rollback()  # never let logging poison the request session


# ------------------------------------------------------------ fallback mode --

def _fallback_flow(db: Session, agent_type: str, message: str, trace: AgentTrace) -> tuple[str, list[str]]:
    """Deterministic degradation so commerce works without an LLM key."""
    if agent_type == "revenue_agent":
        summary = analytics_tools.get_revenue_summary(db)
        opps = analytics_tools.get_revenue_opportunities(db)
        trace.add("Revenue summary computed")
        lines = [f"Revenue: Rs.{summary['revenue_rupees']:,.0f} across {summary['orders']} orders "
                 f"(AOV Rs.{summary['aov_rupees']:,.0f})."]
        for o in opps.get("opportunities", [])[:3]:
            lines.append(f"- [{o['impact']}] {o['title']}: {o['reason']}")
        return "\n".join(lines), ["get_revenue_summary", "get_revenue_opportunities"]

    trace.add("Searching catalog (deterministic mode)")
    result = catalog_tools.search_products(db, query=message, limit=4)
    if not result["products"]:
        result = catalog_tools.search_products(db, query="", limit=4)
    names = ", ".join(p["name"] + f" (Rs.{p['price_rupees']:,.0f})" for p in result["products"])
    cross = ""
    if result["products"]:
        cs = catalog_tools.get_cross_sell_products(db, result["products"][0]["id"], limit=1)
        if cs.get("recommendations"):
            top = cs["recommendations"][0]
            cross = (f"\n\nCustomers buying {result['products'][0]['name']} also grab "
                     f"{top['product']['name']} at Rs.{top['product']['price'] / 100:,.0f}. "
                     f"{top['reason']}.")
    trace.add(f"Found {result['count']} matching products")
    return f"Here are the best matches I found: {names}.{cross}", ["search_products"]
