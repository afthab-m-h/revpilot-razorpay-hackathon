import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.session import get_db
from app.models.models import AgentRun, Recommendation, log_audit
from app.schemas.schemas import ChatRequest, OfferPreviewIn
from app.services.agent import run_agent
from app.tools.commerce_tools import calculate_offer, create_offer_proposal

router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.post("/chat")
def chat(payload: ChatRequest, db: Session = Depends(get_db)):
    """Customer-facing shopping agent."""
    history = [(m.role, m.content) for m in payload.history]
    result = run_agent(db, agent_type="shopping_agent",
                       user_message=payload.message, history=history)
    return result


@router.post("/revenue")
def revenue_agent(payload: dict, db: Session = Depends(get_db)):
    """Merchant-facing revenue agent (e.g. 'Analyze my store')."""
    message = payload.get("message") or "Analyze my store and find revenue opportunities."
    return run_agent(db, agent_type="revenue_agent", user_message=message)


@router.get("/usage")
def usage_status():
    """Safe Gemini usage snapshot for the current app instance.

    Never includes API key material. reset_in_seconds is present ONLY when the
    provider actually reported a retry delay.
    """
    from app.services.gemini_usage import gemini_usage
    out = gemini_usage.status()
    out["model_configured"] = bool(get_settings().gemini_api_key)
    return out


@router.post("/offers/preview")
def preview_offer(payload: OfferPreviewIn, db: Session = Depends(get_db)):
    from app.models.models import Product
    prices = []
    for pid in payload.product_ids:
        p = db.get(Product, pid)
        if not p:
            return {"error": f"Unknown product {pid}"}
        prices.append(p.price)
    math = calculate_offer(prices, payload.discount_percent)
    return {**math, "type": payload.type, "product_ids": payload.product_ids}


@router.get("/activity")
def activity(db: Session = Depends(get_db), limit: int = 30):
    runs = db.query(AgentRun).order_by(AgentRun.created_at.desc()).limit(limit).all()
    return [{"id": r.id, "session_id": r.session_id, "agent_type": r.agent_type,
             "input": r.input, "output": r.output, "tools_used": r.tools_used,
             "trace": r.trace, "created_at": r.created_at} for r in runs]


@router.post("/opportunities/{rec_id}/propose")
def propose_from_opportunity(rec_id: str, discount_percent: float = 6.0,
                             db: Session = Depends(get_db)):
    """Turn an analytics opportunity into a policy-checked offer proposal."""
    rec = db.get(Recommendation, rec_id)
    opp = rec.proposed_action if rec else None
    if rec is None or not opp:
        return {"error": "Opportunity not found or has no proposed action"}

    result = create_offer_proposal(
        db,
        name=f"{rec.type}_{rec.id[:8]}",
        discount_type="percent",
        discount_value=discount_percent,
        applies_to_product_ids=[pid for pid in (rec.target, rec.related_target) if pid],
        bundle_price=None,
        recommendation_id=rec.id,
        reason=rec.reason or "",
    )
    log_audit(db, actor="ai_revenue_agent", action="OPPORTUNITY_TO_PROPOSAL",
              entity_type="recommendation", entity_id=rec.id,
              reason=f"Converted opportunity into offer proposal with {discount_percent}% off")
    return result
