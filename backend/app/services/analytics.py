"""Deterministic analytics engine.

Principle: data -> analytics -> candidate recommendations; the LLM only explains
and orchestrates. No LLM sees raw data here.

All money values are paise internally; helpers return rupees for readability.
"""

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import Event, Order, OrderItem, Product


# ---------------------------------------------------------------- metrics ---

def revenue_summary(db: Session) -> dict:
    paid_orders = db.query(Order).filter(Order.status == "paid").all()
    revenue = sum(o.amount for o in paid_orders)
    orders_count = len(paid_orders)
    aov = int(revenue / orders_count) if orders_count else 0

    total_started = db.query(func.count(Event.id)).filter(
        Event.event_type == "checkout_started").scalar() or 0
    conversion = round(orders_count / total_started * 100, 2) if total_started else 0.0

    ai_revenue = sum(o.amount for o in paid_orders if o.ai_assisted)

    # revenue over last 14 days
    cutoff = datetime.now(timezone.utc) - timedelta(days=14)
    by_day: dict[str, int] = defaultdict(int)
    for o in paid_orders:
        ts = o.created_at if o.created_at.tzinfo else o.created_at.replace(tzinfo=timezone.utc)
        if ts >= cutoff:
            by_day[ts.strftime("%Y-%m-%d")] += o.amount

    return {
        "revenue_rupees": revenue / 100,
        "orders": orders_count,
        "aov_rupees": aov / 100,
        "conversion_rate_percent": conversion,
        "ai_assisted_orders": sum(1 for o in paid_orders if o.ai_assisted),
        "ai_attributed_revenue_rupees": ai_revenue / 100,
        "revenue_by_day_rupees": [
            {"date": d, "revenue": v / 100} for d, v in sorted(by_day.items())
        ],
    }


def product_funnel(db: Session, limit: int = 20) -> list[dict]:
    views = dict(db.query(Event.product_id, func.count(Event.id)).filter(
        Event.event_type == "view").group_by(Event.product_id).all())
    carts = dict(db.query(Event.product_id, func.count(Event.id)).filter(
        Event.event_type == "add_to_cart").group_by(Event.product_id).all())
    purchases = dict(db.query(OrderItem.product_id, func.count(OrderItem.id)).join(Order)
                     .filter(Order.status == "paid").group_by(OrderItem.product_id).all())

    rows = []
    for pid in set(views) | set(carts) | set(purchases):
        v, c, p = views.get(pid, 0), carts.get(pid, 0), purchases.get(pid, 0)
        rows.append({
            "product_id": pid,
            "views": v,
            "add_to_cart": c,
            "purchases": p,
            "cart_rate": round(c / v * 100, 2) if v else 0.0,
            "conversion": round(p / v * 100, 2) if v else 0.0,
        })
    rows.sort(key=lambda r: r["views"], reverse=True)
    return rows[:limit]


# ------------------------------------------------------------ co-purchase ---

def co_purchase_matrix(db: Session) -> dict[str, Counter]:
    """P(B | A): how often products are bought together in one paid order."""
    pairs: Counter = Counter()
    per_order: dict[str, set] = defaultdict(set)
    counts: Counter = Counter()

    rows = db.query(OrderItem.order_id, OrderItem.product_id).join(Order)\
             .filter(Order.status == "paid").all()
    for order_id, pid in rows:
        per_order[order_id].add(pid)
    for products in per_order.values():
        plist = sorted(products)
        for pid in plist:
            counts[pid] += 1
            for other in plist:
                if other != pid:
                    pairs[(pid, other)] += 1
    return pairs


def cross_sell_affinities(db: Session, top_n: int = 10) -> list[dict]:
    """Return strongest P(B|A) affinities across the catalog."""
    pairs = co_purchase_matrix(db)
    order_counts = dict(
        db.query(OrderItem.product_id, func.count(func.distinct(OrderItem.order_id)))
          .join(Order).filter(Order.status == "paid").group_by(OrderItem.product_id).all()
    )
    names = {p.id: p.name for p in db.query(Product).all()}
    results = []
    seen = set()
    for (a, b), count in pairs.most_common():
        base_a = order_counts.get(a, 0)
        if base_a < 5:
            continue
        prob = count / base_a
        key = tuple(sorted((a, b)))
        if key in seen:
            continue
        seen.add(key)
        results.append({
            "product_id": a,
            "product_name": names.get(a, a),
            "related_product_id": b,
            "related_product_name": names.get(b, b),
            "co_purchases": count,
            "base_purchases": base_a,
            "confidence": round(prob, 3),
        })
        if len(results) >= top_n * 2:
            break
    results.sort(key=lambda r: r["confidence"], reverse=True)
    return results[:top_n]


def recommend_for_product(db: Session, product_id: str, limit: int = 3) -> list[dict]:
    pairs = co_purchase_matrix(db)
    order_counts = dict(
        db.query(OrderItem.product_id, func.count(func.distinct(OrderItem.order_id)))
          .join(Order).filter(Order.status == "paid").group_by(OrderItem.product_id).all()
    )
    products = {p.id: p for p in db.query(Product).all()}
    affinity: dict[str, int] = {}
    for (a, b), count in pairs.items():
        if a == product_id:
            affinity[b] = max(affinity.get(b, 0), count)
        elif b == product_id:
            affinity[a] = max(affinity.get(a, 0), count)
    scored = []
    for cand, cnt in sorted(affinity.items(), key=lambda kv: kv[1], reverse=True):
        prod = products.get(cand)
        if not prod or prod.stock <= 0:
            continue
        confidence = cnt / max(order_counts.get(product_id, 1), 1)
        scored.append({
            "product": {
                "id": prod.id, "name": prod.name, "category": prod.category,
                "price": prod.price, "rating": prod.rating, "stock": prod.stock,
                "tags": prod.tags,
            },
            "confidence": round(confidence, 3),
            "co_purchases": cnt,
            "reason": (
                f"{round(confidence * 100)}% of customers buying "
                f"{products[product_id].name} also bought {prod.name}"
                if product_id in products else f"Frequently bought together with {prod.name}"
            ),
        })
    scored.sort(key=lambda x: x["confidence"], reverse=True)
    if len(scored) < limit:  # fallback: popular same-category items
        have = {s["product"]["id"] for s in scored}
        target_cat = products[product_id].category if product_id in products else None
        extra = [p for p in products.values()
                 if p.id != product_id and p.id not in have and p.stock > 0]
        extra.sort(key=lambda p: (p.category == target_cat, p.rating), reverse=True)
        for p in extra[: limit - len(scored)]:
            scored.append({
                "product": {"id": p.id, "name": p.name, "category": p.category,
                            "price": p.price, "rating": p.rating, "stock": p.stock,
                            "tags": p.tags},
                "confidence": 0.0,
                "co_purchases": 0,
                "reason": "Popular item with high customer rating",
            })
    return scored[:limit]


# --------------------------------------------------------- opportunities ----

def cart_abandonment_opportunity(db: Session, min_amount_rupees: float = 3000) -> dict | None:
    """Customers who started checkout on high-value carts but never paid."""
    started = db.query(Event.customer_id, Event.product_id).filter(
        Event.event_type == "checkout_started").all()
    paid_customers = {o.customer_id for o in db.query(Order.customer_id).filter(Order.status == "paid")}

    abandoned: Counter = Counter()
    products = {p.id: p for p in db.query(Product).all()}
    value = 0
    for cust, pid in started:
        if cust in paid_customers:
            continue
        prod = products.get(pid)
        if prod:
            abandoned[cust] += prod.price
    high_value = [(c, amt) for c, amt in abandoned.items() if amt >= min_amount_rupees * 100]
    if not high_value:
        return None
    for _, amt in high_value:
        value += amt
    avg_value = int(value / len(high_value))
    return {
        "type": "cart_abandonment",
        "count": len(high_value),
        "avg_cart_value_rupees": avg_value / 100,
        "total_value_rupees": value / 100,
        "suggested_action": "Send personalized recovery offer to high-value abandoned carts",
        "reason": f"{len(high_value)} customers abandoned carts averaging Rs.{avg_value / 100:,.0f}",
        "confidence": 0.8,
    }


def low_conversion_opportunities(db: Session, min_views: int = 100) -> list[dict]:
    out = []
    names = {p.id: p.name for p in db.query(Product).all()}
    for row in product_funnel(db, limit=50):
        if row["views"] >= min_views and row["cart_rate"] > 8 and row["conversion"] < 1.5:
            out.append({
                "type": "low_conversion",
                "product_id": row["product_id"],
                "product_name": names.get(row["product_id"], row["product_id"]),
                "views": row["views"],
                "purchases": row["purchases"],
                "conversion_percent": row["conversion"],
                "suggested_action": "Targeted limited-time discount to convert strong interest",
                "confidence": 0.7,
            })
    return out[:5]


def detect_opportunities(db: Session) -> list[dict]:
    opportunities: list[dict] = []

    for aff in cross_sell_affinities(db, top_n=5):
        related = next((p for p in db.query(Product).filter(Product.id == aff["related_product_id"])), None)
        base = next((p for p in db.query(Product).filter(Product.id == aff["product_id"])), None)
        bundle_price = (base.price + related.price) if base and related else None
        discounted = int(bundle_price * 0.94) if bundle_price else None
        opportunities.append({
            "type": "cross_sell",
            "impact": "HIGH" if aff["confidence"] >= 0.25 else "MEDIUM",
            "title": f"{aff['product_name']} → {aff['related_product_name']}",
            "product_id": aff["product_id"],
            "related_product_id": aff["related_product_id"],
            "confidence": aff["confidence"],
            "reason": (
                f"{round(aff['confidence'] * 100)}% co-purchase rate across "
                f"{aff['co_purchases']} paid orders"
            ),
            "expected_impact": {
                "aov_uplift_rupees": round((related.price / 100) if related else 0),
            },
            "proposed_action": {
                "kind": "bundle_offer",
                "bundle_price_rupees": (discounted or 0) / 100,
                "original_price_rupees": (bundle_price or 0) / 100,
                "discount_percent": 6.0,
            } if bundle_price else None,
        })

    ab = cart_abandonment_opportunity(db)
    if ab:
        opportunities.append({"impact": "HIGH" if ab["count"] >= 50 else "MEDIUM",
                              "title": f"{ab['count']} abandoned carts", **ab})

    opportunities.extend(low_conversion_opportunities(db))
    return opportunities
