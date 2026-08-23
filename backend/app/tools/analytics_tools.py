"""Analytics tools exposed to the AI revenue agent (read-only)."""

from sqlalchemy.orm import Session

from app.services import analytics


def get_revenue_summary(db: Session) -> dict:
    return analytics.revenue_summary(db)


def get_revenue_opportunities(db: Session) -> dict:
    opportunities = analytics.detect_opportunities(db)
    return {"count": len(opportunities), "opportunities": opportunities}


def get_cross_sell_affinities(db: Session) -> dict:
    affinities = analytics.cross_sell_affinities(db, top_n=5)
    return {"affinities": affinities}
