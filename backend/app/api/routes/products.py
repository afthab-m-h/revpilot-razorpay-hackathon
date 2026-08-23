from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Product
from app.schemas.schemas import ProductOut
from app.services.analytics import recommend_for_product

router = APIRouter(prefix="/api/products", tags=["products"])


@router.get("")
def list_products(category: str | None = None, search: str | None = None,
                  limit: int = Query(default=50, le=200), db: Session = Depends(get_db)):
    q = db.query(Product)
    if category:
        q = q.filter(Product.category.ilike(f"%{category}%"))
    if search:
        like = f"%{search.lower()}%"
        q = q.filter(Product.name.ilike(like) | Product.description.ilike(like))
    products = q.order_by(Product.rating.desc()).limit(limit).all()
    return [ProductOut.model_validate(p).model_dump() for p in products]


@router.get("/categories")
def categories(db: Session = Depends(get_db)):
    rows = db.query(Product.category).distinct().all()
    return [r[0] for r in rows]


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: str, db: Session = Depends(get_db)):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Product not found")
    return ProductOut.model_validate(p)


@router.get("/{product_id}/cross-sell")
def cross_sell(product_id: str, limit: int = 3, db: Session = Depends(get_db)):
    return recommend_for_product(db, product_id, limit=limit)
