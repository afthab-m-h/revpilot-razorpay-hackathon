"""Catalog tools exposed to the AI agents (read-only)."""

from sqlalchemy.orm import Session

from app.models.models import Customer, Order, OrderItem, Product
from app.services import analytics


def search_products(db: Session, query: str = "", category: str | None = None,
                    max_price_rupees: float | None = None, min_rating: float | None = None,
                    limit: int = 6) -> dict:
    q = db.query(Product)
    if query:
        like = f"%{query.lower()}%"
        q = q.filter(
            Product.name.ilike(like)
            | Product.category.ilike(like)
            | Product.description.ilike(like)
        )
    if category:
        q = q.filter(Product.category.ilike(f"%{category}%"))
    if max_price_rupees is not None:
        q = q.filter(Product.price <= int(max_price_rupees * 100))
    if min_rating is not None:
        q = q.filter(Product.rating >= min_rating)
    products = q.order_by(Product.rating.desc()).limit(limit).all()
    return {
        "count": len(products),
        "products": [
            {"id": p.id, "name": p.name, "category": p.category, "price_rupees": p.price / 100,
             "stock": p.stock, "rating": p.rating, "tags": p.tags,
             "description": p.description[:160]}
            for p in products
        ],
    }


def get_product_details(db: Session, product_id: str) -> dict:
    p = db.get(Product, product_id)
    if not p:
        return {"error": f"Product {product_id} not found"}
    return {"id": p.id, "name": p.name, "description": p.description, "category": p.category,
            "price_rupees": p.price / 100, "stock": p.stock, "rating": p.rating, "tags": p.tags}


def get_cross_sell_products(db: Session, product_id: str, limit: int = 3) -> dict:
    recs = analytics.recommend_for_product(db, product_id, limit=limit)
    return {"for_product": product_id, "recommendations": recs}


def get_customer_profile(db: Session, customer_id: str) -> dict:
    c = db.get(Customer, customer_id)
    if not c:
        return {"error": f"Customer {customer_id} not found"}
    paid = db.query(Order).filter(Order.customer_id == customer_id, Order.status == "paid").all()
    spend = sum(o.amount for o in paid)
    return {"id": c.id, "name": c.name, "email": c.email, "segment": c.segment,
            "paid_orders": len(paid), "lifetime_value_rupees": spend / 100}


def get_customer_history(db: Session, customer_id: str, limit: int = 10) -> dict:
    rows = (
        db.query(OrderItem, Order, Product)
        .join(Order, OrderItem.order_id == Order.id)
        .join(Product, OrderItem.product_id == Product.id)
        .filter(Order.customer_id == customer_id)
        .order_by(Order.created_at.desc())
        .limit(limit)
        .all()
    )
    return {"customer_id": customer_id,
            "items": [{"product": prod.name, "quantity": item.quantity,
                       "order_status": order.status} for item, order, prod in rows]}
