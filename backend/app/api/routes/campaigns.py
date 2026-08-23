import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Offer, Recommendation, log_audit
from app.schemas.schemas import OfferOut
from app.services.policy import evaluate_order

router = APIRouter(prefix="/api/offers", tags=["offers"])


@router.get("")
def list_offers(db: Session = Depends(get_db)):
    offers = db.query(Offer).order_by(Offer.created_at.desc()).limit(50).all()
    out = []
    for o in offers:
        d = OfferOut.model_validate(o).model_dump()
        d["applies_to_product_ids"] = o.applies_to_product_ids
        d["bundle_price"] = o.bundle_price
        d["recommendation_id"] = o.recommendation_id
        out.append(d)
    return out


@router.post("/{offer_id}/approve")
def approve_offer(offer_id: str, db: Session = Depends(get_db)):
    """Merchant approval — the gate between AI proposal and execution."""
    offer = db.get(Offer, offer_id)
    if not offer:
        raise HTTPException(404, "Offer not found")
    if offer.status == "blocked":
        raise HTTPException(422, "This offer was blocked by policy and cannot be approved")
    if offer.status != "proposed":
        raise HTTPException(409, f"Offer is {offer.status}, cannot approve")

    # re-verify policy at approval time (bounds may have changed)
    from app.models.models import Product
    prices = []
    for pid in offer.applies_to_product_ids:
        p = db.get(Product, pid)
        prices.append(p.price if p else 0)
    original_total = sum(prices)
    discount_percent = offer.discount_value if offer.discount_type == "percent" else (
        (1 - offer.bundle_price / original_total) * 100 if offer.bundle_price and original_total else 0)
    policy = evaluate_order(db, amount_paise=int(original_total * (1 - discount_percent / 100)),
                            discount_percent=discount_percent,
                            product_ids=offer.applies_to_product_ids)

    if policy.allowed:
        offer.approval_status = "approved"
        offer.status = "active"
        log_audit(db, actor="merchant", action="APPROVE_OFFER",
                  entity_type="offer", entity_id=offer.id,
                  reason=f"Merchant approved '{offer.name}'",
                  policy_status="passed", approval_status="approved",
                  execution_status="executed", metadata={"summary": policy.summary})
    db.commit()
    return {"offer_id": offer.id, "status": offer.status,
            "policy_summary": policy.summary}


@router.post("/{offer_id}/reject")
def reject_offer(offer_id: str, db: Session = Depends(get_db)):
    offer = db.get(Offer, offer_id)
    if not offer:
        raise HTTPException(404, "Offer not found")

    was = offer.status
    offer.approval_status = "rejected"
    offer.status = "rejected"
    log_audit(db, actor="merchant", action="REJECT_OFFER",
              entity_type="offer", entity_id=offer.id,
              reason=f"Merchant rejected '{offer.name}' (was {was})",
              approval_status="rejected", execution_status="not_executed")
    db.commit()
    return {"offer_id": offer.id, "status": offer.status}
