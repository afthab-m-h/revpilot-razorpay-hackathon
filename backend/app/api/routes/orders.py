import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Offer, Order, OrderItem, Payment, Product, log_audit
from app.schemas.schemas import CheckoutResponse, OrderCreate, OrderOut
from app.services.payment_provider import PaymentProviderError, get_payment_provider
from app.services.policy import evaluate_order, payment_gate_ok

router = APIRouter(prefix="/api/orders", tags=["orders"])


def _price_cart(db: Session, items, offer: Offer | None):
    """Deterministic pricing — never trust client totals."""
    total = 0
    rows = []
    for item in items:
        p = db.get(Product, item.product_id)
        if not p:
            raise HTTPException(400, f"Unknown product {item.product_id}")
        if p.stock < item.quantity:
            raise HTTPException(409, f"Insufficient stock for {p.name}")
        total += p.price * item.quantity
        rows.append((item.product_id, item.quantity, p.price))

    discount = 0
    if offer and offer.status in ("approved", "active"):
        bundle_price = offer.bundle_price
        if bundle_price and len(rows) >= 2:
            original_bundle = sum(price for _, _, price in rows)
            if original_bundle > bundle_price:
                discount = min(original_bundle - bundle_price, original_bundle - 1) // 1
                # apply proportional discount across items
                ratio = (original_bundle - bundle_price) / original_bundle
                discount = int(original_bundle * ratio)
    return total, discount, rows


@router.post("/checkout", response_model=CheckoutResponse)
async def create_order(payload: OrderCreate, db: Session = Depends(get_db)):
    offer = db.get(Offer, payload.offer_id) if payload.offer_id else None
    total, discount, rows = _price_cart(db, payload.items, offer)
    final_amount = total - discount

    policy = evaluate_order(
        db, amount_paise=final_amount,
        discount_percent=(discount / total * 100) if total and discount else 0.0,
        product_ids=[r[0] for r in rows],
    )
    if not policy.allowed:
        log_audit(db, actor="system", action="CREATE_ORDER", execution_status="blocked",
                  reason=policy.summary, input_data={"amount": final_amount})
        raise HTTPException(422, policy.summary)

    order = Order(id=f"ORD-{uuid.uuid4().hex[:8].upper()}",
                  customer_id=payload.customer_id,
                  amount=final_amount,
                  discount_amount=discount,
                  offer_id=offer.id if offer else None,
                  status="created",
                  ai_assisted=payload.ai_assisted)
    for pid, qty, price in rows:
        order.items.append(OrderItem(product_id=pid, quantity=qty, unit_price=price))
    db.add(order)
    db.commit()
    db.refresh(order)

    provider = get_payment_provider()
    provider_order_id = None
    ok, why = payment_gate_ok()
    if ok:
        try:
            p_order = await provider.create_order(final_amount, receipt=order.id,
                                                  notes={"order_id": order.id})
            provider_order_id = p_order["id"]
            order.razorpay_order_id = provider_order_id
            db.commit()
            log_audit(db, actor="system", action="CREATE_PAYMENT_ORDER",
                      entity_type="order", entity_id=order.id,
                      input_data={"amount": final_amount},
                      reason=f"Checkout — server-side order creation via {provider.name} provider",
                      policy_status="passed", execution_status="success",
                      metadata={"provider": provider.name,
                                "provider_order_id": provider_order_id})
        except PaymentProviderError as exc:
            log_audit(db, actor="system", action="CREATE_PAYMENT_ORDER",
                      entity_type="order", entity_id=order.id,
                      execution_status="failed", reason=str(exc))
            raise HTTPException(502, f"Payment provider error: {exc}")
    else:
        log_audit(db, actor="system", action="CREATE_ORDER", entity_type="order",
                  entity_id=order.id, execution_status="created_local_only", reason=why)

    return CheckoutResponse(order=OrderOut.model_validate(order),
                            razorpay_order_id=provider_order_id,
                            key_id=provider.public_key(),
                            amount=final_amount)


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_id: str, db: Session = Depends(get_db)):
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(404, "Order not found")
    return OrderOut.model_validate(order)


@router.get("")
def list_orders(status: str | None = None, limit: int = 25, db: Session = Depends(get_db)):
    q = db.query(Order).order_by(Order.created_at.desc())
    if status:
        q = q.filter(Order.status == status)
    orders = q.limit(limit).all()

    def with_items(o: Order):
        d = OrderOut.model_validate(o).model_dump()
        d["customer_id"] = o.customer_id
        d["items"] = [
            {"product_id": i.product_id,
             "product_name": db.get(Product, i.product_id).name if db.get(Product, i.product_id) else i.product_id,
             "quantity": i.quantity, "unit_price": i.unit_price}
            for i in o.items
        ]
        payment = db.query(Payment).filter(Payment.order_id == o.id)\
                    .order_by(Payment.created_at.desc()).first()
        if payment:
            d["payment_status"] = payment.status
            d["razorpay_payment_id"] = payment.razorpay_payment_id
        return d

    return [with_items(o) for o in orders]
