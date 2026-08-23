import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Order, log_audit
from app.schemas.schemas import PaymentVerifyIn
from app.services.payment_provider import (PaymentProviderError,
                                           get_payment_provider)
from app.api.routes.webhooks import handle_payment_event

router = APIRouter(prefix="/api/payments", tags=["payments"])


@router.post("/verify")
async def verify_payment(payload: PaymentVerifyIn, db: Session = Depends(get_db)):
    """Verify the checkout signature server-side before fulfilling.

    Per gateway docs: verify HMAC signature AND confirm payment/order status
    before marking anything paid. Works identically for mock and Razorpay.
    """
    provider = get_payment_provider()
    ok = provider.verify_checkout_signature(payload.razorpay_order_id,
                                            payload.razorpay_payment_id,
                                            payload.razorpay_signature)
    if not ok:
        log_audit(db, actor="system", action="VERIFY_PAYMENT",
                  entity_type="payment", entity_id=payload.razorpay_payment_id,
                  policy_status="failed", execution_status="failed",
                  reason="Signature verification failed — refusing to fulfill",
                  metadata={"provider_order_id": payload.razorpay_order_id})
        raise HTTPException(400, "Invalid payment signature")

    try:
        payment = await provider.fetch_payment(payload.razorpay_payment_id)
    except PaymentProviderError as exc:
        raise HTTPException(502, f"Could not fetch payment from provider: {exc}")

    status = payment.get("status")  # captured | authorized | failed | ...
    captured = status == "captured"
    log_audit(db, actor="system", action="VERIFY_PAYMENT",
              entity_type="payment", entity_id=payload.razorpay_payment_id,
              input_data={"amount": payment.get("amount")},
              policy_status="passed", execution_status="success" if captured else f"status_{status}",
              reason=f"Signature valid; {provider.name} reports status={status}",
              metadata={"order_id": payload.razorpay_order_id})

    return {"verified": True, "captured": captured, "provider": provider.name,
            "payment_status": status,
            "payment_id": payment.get("id"), "method": payment.get("method"),
            "amount": payment.get("amount")}


class SimulateIn(BaseModel):
    order_id: str          # local order id, e.g. ORD-XXXXXXXX
    outcome: str = "success"  # success | failure


@router.post("/simulate")
async def simulate_payment(payload: SimulateIn, db: Session = Depends(get_db)):
    """MOCK PROVIDER ONLY — simulates a customer completing checkout.

    Generates a signed payment event and pushes it through the exact same
    webhook processing path a real gateway event would take:
    sign -> verify -> find order -> update DB -> audit -> analytics.
    """
    provider = get_payment_provider()
    if provider.name != "mock":
        raise HTTPException(400, f"Simulation is only available on the mock provider "
                                 f"(active: {provider.name})")

    order = db.get(Order, payload.order_id)
    if not order:
        raise HTTPException(404, f"Order {payload.order_id} not found")
    if not order.razorpay_order_id:
        raise HTTPException(409, "Order has no provider order id (checkout not initiated)")
    if order.status == "paid":
        return {"simulated": False, "note": "Order already paid", "status": order.status}

    sim = provider.simulate_payment(order.razorpay_order_id, order.amount,
                                    outcome=payload.outcome)

    # Process exactly like an inbound webhook: verify signature first.
    if not provider.verify_webhook_signature(sim["raw"], sim["signature"]):
        raise HTTPException(500, "Simulated webhook signature failed self-check")

    result = handle_payment_event(db, json.loads(sim["raw"]))
    result["checkout_signature"] = provider.checkout_signature(
        order.razorpay_order_id, sim["entity"]["id"])
    result["payment_id"] = sim["entity"]["id"]
    return {"simulated": True, **result}


def create_pending_payment(db: Session, order_id: str, amount: int) -> str:
    from app.models.models import Payment
    pid = f"pay_local_{uuid.uuid4().hex[:10]}"
    db.add(Payment(id=pid, order_id=order_id, amount=amount, status="pending"))
    db.commit()
    return pid
