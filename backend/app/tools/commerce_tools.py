"""Commerce tools exposed to the agents.

CRITICAL: the LLM never talks to Razorpay directly. Every money action goes
through these functions -> policy engine -> (approval) -> Razorpay service.
"""

import uuid

from sqlalchemy.orm import Session

from app.models.models import Offer, log_audit
from app.services.payment_provider import (PaymentProviderError,
                                           get_payment_provider)
from app.services.policy import evaluate_order, payment_gate_ok


def calculate_offer(product_prices_paise: list[int], discount_percent: float) -> dict:
    """Deterministic price math for a bundle/discount proposal."""
    original = sum(product_prices_paise)
    discounted = int(original * (1 - discount_percent / 100))
    return {
        "original_price_rupees": original / 100,
        "offer_price_rupees": discounted / 100,
        "discount_percent": round(discount_percent, 2),
        "savings_rupees": (original - discounted) / 100,
    }


def create_offer_proposal(db: Session, *, name: str, discount_type: str, discount_value: float,
                          applies_to_product_ids: list[str], bundle_price: int | None,
                          recommendation_id: str | None, reason: str) -> dict:
    """Create an offer in PROPOSED state. It does nothing until approved."""
    prices = []
    from app.models.models import Product
    for pid in applies_to_product_ids:
        p = db.get(Product, pid)
        if not p:
            return {"error": f"Unknown product {pid}"}
        prices.append(p.price)

    original_total = sum(prices)
    discount_percent = discount_value if discount_type == "percent" else (
        (1 - discount_value / max(original_total, 1)) * 100)

    result = calculate_offer(prices, discount_percent)
    policy = evaluate_order(db, amount_paise=int(result["offer_price_rupees"] * 100),
                            discount_percent=result["discount_percent"],
                            product_ids=applies_to_product_ids)

    offer = Offer(
        id=f"offer_{uuid.uuid4().hex[:10]}",
        name=name,
        recommendation_id=recommendation_id,
        discount_type=discount_type,
        discount_value=discount_value,
        max_discount=None,
        applies_to_product_ids=applies_to_product_ids,
        bundle_price=bundle_price or int(result["offer_price_rupees"] * 100),
        status="proposed" if policy.allowed else "blocked",
        policy_status="passed" if policy.allowed else "blocked",
        reason=reason,
    )
    db.add(offer)
    log_audit(
        db,
        actor="ai_revenue_agent",
        action="PROPOSE_OFFER",
        entity_type="offer",
        entity_id=offer.id,
        input_data={"products": applies_to_product_ids, "discount_percent": result["discount_percent"]},
        reason=reason,
        policy_status="passed" if policy.allowed else "blocked",
        approval_status="pending_merchant_approval" if policy.allowed else "n/a",
        execution_status="awaiting_approval" if policy.allowed else "not_executed",
        metadata={"summary": policy.summary},
    )
    db.commit()
    return {
        "offer_id": offer.id,
        "status": offer.status,
        "policy_summary": policy.summary,
        "checks": [{"name": c.name, "passed": c.passed, "detail": c.detail} for c in policy.checks],
        **result,
    }


async def create_razorpay_order(db: Session, *, local_order_id: str, amount_paise: int,
                          receipt: str, notes: dict | None = None) -> dict:
    """The ONLY path from agent tools to a payment order. Policy gate first."""
    provider = get_payment_provider()
    ok, why = payment_gate_ok()
    if not ok:
        log_audit(db, actor="system", action="CREATE_PAYMENT_ORDER", entity_type="order",
                  entity_id=local_order_id, execution_status="failed", reason=why)
        return {"error": why}

    try:
        p_order = await provider.create_order(amount_paise, receipt=receipt, notes=notes)
    except PaymentProviderError as exc:
        log_audit(db, actor="system", action="CREATE_PAYMENT_ORDER", entity_type="order",
                  entity_id=local_order_id, execution_status="failed", reason=str(exc))
        return {"error": str(exc)}

    log_audit(db, actor="system", action="CREATE_PAYMENT_ORDER", entity_type="order",
              entity_id=local_order_id, input_data={"amount": amount_paise},
              reason=f"Checkout initiated via {provider.name} provider",
              policy_status="passed", execution_status="success",
              metadata={"provider": provider.name, "provider_order_id": p_order.get("id")})
    return {"provider": provider.name, "provider_order_id": p_order.get("id"),
            "amount": p_order.get("amount"), "currency": p_order.get("currency")}
