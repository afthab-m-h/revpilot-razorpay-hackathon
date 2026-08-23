import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Recommendation, log_audit
from app.services import analytics

router = APIRouter(tags=["analytics"])


def _sync_opportunities_to_db(db: Session) -> list[Recommendation]:
    """Persist detected opportunities as recommendations so merchants can act on them."""
    opportunities = analytics.detect_opportunities(db)
    existing_keys = {r.type for r in db.query(Recommendation).filter(Recommendation.status == "open").all()}
    created = []
    for opp in opportunities:
        key = f"{opp['type']}:{opp['title']}"
        if key in existing_keys or any(r.title == opp["title"] for r in
                                       db.query(Recommendation).filter(Recommendation.status == "open").all()):
            continue
        rec = Recommendation(
            id=f"rec_{uuid.uuid4().hex[:10]}",
            type=opp["type"],
            target=opp.get("product_id"),
            related_target=opp.get("related_product_id"),
            title=opp["title"],
            reason=opp.get("reason"),
            confidence=opp.get("confidence", 0),
            expected_impact=opp.get("expected_impact"),
            proposed_action=opp.get("proposed_action"),
            status="open",
        )
        db.add(rec)
        created.append(rec)
    if created:
        log_audit(db, actor="ai_revenue_agent", action="DETECT_OPPORTUNITIES",
                  entity_type="recommendation",
                  reason=f"Detected {len(created)} new revenue opportunities from order data",
                  metadata={"titles": [r.title for r in created]})
        db.commit()
    return created


@router.get("/api/analytics/summary")
def summary(db: Session = Depends(get_db)):
    return analytics.revenue_summary(db)


@router.get("/api/analytics/funnel")
def funnel(limit: int = 15, db: Session = Depends(get_db)):
    return analytics.product_funnel(db, limit=limit)


@router.get("/api/analytics/opportunities")
def opportunities(refresh: bool = False, db: Session = Depends(get_db)):
    _sync_opportunities_to_db(db)
    rows = (db.query(Recommendation)
            .order_by(Recommendation.confidence.desc(), Recommendation.created_at.desc())
            .limit(20).all())
    out = []
    for r in rows:
        out.append({
            "id": r.id, "type": r.type, "title": r.title, "target": r.target,
            "related_target": r.related_target, "reason": r.reason,
            "confidence": r.confidence, "expected_impact": r.expected_impact,
            "proposed_action": r.proposed_action, "status": r.status,
        })
    return out


@router.post("/api/opportunities/{rec_id}/dismiss")
def dismiss(rec_id: str, db: Session = Depends(get_db)):
    r = db.get(Recommendation, rec_id)
    if not r:
        return {"error": "not found"}
    r.status = "dismissed"
    log_audit(db, actor="merchant", action="DISMISS_RECOMMENDATION",
              entity_type="recommendation", entity_id=r.id,
              reason=f"Merchant dismissed '{r.title}'")
    return {"id": r.id, "status": r.status}
