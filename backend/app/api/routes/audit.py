from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import AuditLog

router = APIRouter(tags=["audit"])


@router.get("/api/audit")
def audit_log(actor: str | None = None, action: str | None = None,
              limit: int = Query(default=100, le=500),
              db: Session = Depends(get_db)):
    q = db.query(AuditLog).order_by(AuditLog.timestamp.desc())
    if actor:
        q = q.filter(AuditLog.actor == actor)
    if action:
        q = q.filter(AuditLog.action == action)
    rows = q.limit(limit).all()
    return [{
        "id": r.id, "timestamp": r.timestamp, "actor": r.actor, "action": r.action,
        "entity_type": r.entity_type, "entity_id": r.entity_id,
        "input": r.input, "reason": r.reason, "policy_status": r.policy_status,
        "approval_status": r.approval_status, "execution_status": r.execution_status,
        "metadata": r.metadata_,
    } for r in rows]
