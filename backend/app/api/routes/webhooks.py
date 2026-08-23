"""Payment webhook receiver.

Flow: gateway -> verify signature -> find order -> update DB -> audit -> analytics.
Handles: payment.authorized, payment.captured, payment.failed, order.paid.
Works for ANY provider (mock or Razorpay) via the PaymentProvider interface.
"""

import json

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Order, Payment, Product, log_audit
from app.services.payment_provider import get_payment_provider

router = APIRouter(tags=["webhooks"])

HANDLED_EVENTS = {"payment.authorized", "payment.captured", "payment.failed", "order.paid"}


async def _read_raw_body(request: Request) -> bytes:
    return await request.body()


@router.post("/api/webhooks/razorpay")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str = Header(default=""),
    x_razorpay_event_id: str = Header(default=""),
    db: Session = Depends(get_db),
):
    raw = await _read_raw_body(request)
    provider = get_payment_provider()

    if not provider.verify_webhook_signature(raw, x_razorpay_signature):
        log_audit(db, actor="payment_gateway", action="WEBHOOK_RECEIVED",
                  policy_status="failed", execution_status="rejected",
                  reason="Webhook signature verification failed — ignoring event",
                  metadata={"event_id": x_razorpay_event_id})
        raise HTTPException(400, "Invalid webhook signature")

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON")

    return handle_payment_event(db, payload)


def handle_payment_event(db: Session, payload: dict) -> dict:
    """Shared event processing — used by real webhooks AND the mock simulator."""
    event = payload.get("event", "")
    entity_payload = (payload.get("payload") or {}).get("payment") or \
                     (payload.get("payload") or {}).get("order") or {}
    data = entity_payload.get("entity", {}) if isinstance(entity_payload, dict) else {}
    rp_order_id = data.get("order_id") or data.get("id")
    notes = data.get("notes", {})
    local_order_id = notes.get("order_id")

    if event not in HANDLED_EVENTS:
        return {"handled": False, "event": event}

    order = None
    if local_order_id:
        order = db.get(Order, local_order_id)
    if not order and rp_order_id:
        order = db.query(Order).filter(Order.razorpay_order_id == rp_order_id).first()

    if not order:
        # Signature was valid but we don't know the order — audit and ack so
        # the gateway doesn't retry forever.
        log_audit(db, actor="payment_gateway", action=f"WEBHOOK_{event.upper()}",
                  policy_status="passed", execution_status="ignored",
                  reason="Valid webhook for unknown order",
                  metadata={"razorpay_order_id": rp_order_id})
        return {"handled": True, "note": "unknown order"}

    if event in ("payment.captured", "order.paid"):
        new_status = "paid"
    elif event == "payment.failed":
        new_status = "payment_failed"
    else:  # payment.authorized — money not captured yet; do NOT fulfill
        new_status = "authorized"

    previous = order.status
    order.status = new_status

    payment_id = data.get("id")
    existing = db.query(Payment).filter(Payment.order_id == order.id).first() if payment_id is None else \
        db.query(Payment).filter(Payment.razorpay_payment_id == payment_id).first()
    if not existing:
        existing = Payment(id=payment_id or f"pay_hook_{order.id}", order_id=order.id,
                           amount=data.get("amount", order.amount))
        db.add(existing)
    if payment_id:
        existing.razorpay_payment_id = payment_id
    existing.status = data.get("status", new_status)
    existing.method = data.get("method")
    existing.error_description = (data.get("error_description") or "")[:500] or None
    existing.raw_payload = _safe(payload)
    db.commit()

    # Decrement stock only on real capture
    if new_status == "paid" and previous != "paid":
        for item in order.items:
            product = db.get(Product, item.product_id)
            if product:
                product.stock = max(product.stock - item.quantity, 0)

    failed = new_status == "payment_failed"
    log_audit(db, actor="payment_gateway", action=f"WEBHOOK_{event.upper()}",
              entity_type="order", entity_id=order.id,
              input_data={"previous_status": previous},
              policy_status="passed",
              approval_status="n/a",
              execution_status=("payment_failed_recorded" if failed else "success"),
              reason=(
                  f"Payment FAILED for order {order.id}. Order remains NOT fulfilled; "
                  "no revenue will be recorded until the gateway confirms a successful payment."
                  if failed else
                  f"Order {order.id} transitioned {previous} -> {new_status} via verified webhook."
              ),
              metadata={"event": event, "razorpay_payment_id": payment_id,
                        "error_description": data.get("error_description")})

    return {"handled": True, "event": event, "order_id": order.id, "status": order.status}


def _safe(obj) -> dict:
    try:
        return json.loads(json.dumps(obj, default=str))
    except Exception:
        return {}
