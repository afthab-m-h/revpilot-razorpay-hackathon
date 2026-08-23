"""Merchant product management (additive to existing catalog routes).

All mutations are audited with actor=merchant. No payment logic here.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import OrderItem, Product, log_audit

router = APIRouter(prefix="/api/merchant/products", tags=["merchant-products"])


class ProductIn(BaseModel):
    name: str
    description: str = ""
    category: str
    price_paise: int = Field(gt=0)
    stock: int = Field(ge=0, default=0)
    rating: float = Field(ge=0, le=5, default=0.0)
    tags: list[str] = []


class StockIn(BaseModel):
    stock_delta: int


@router.post("")
def create_product(payload: ProductIn, db: Session = Depends(get_db)):
    product = Product(
        id=f"prd_{uuid.uuid4().hex[:10]}",
        name=payload.name,
        description=payload.description,
        category=payload.category,
        price=payload.price_paise,
        stock=payload.stock,
        rating=payload.rating,
        tags=payload.tags,
    )
    db.add(product)
    log_audit(db, actor="merchant", action="CREATE_PRODUCT",
              entity_type="product", entity_id=product.id,
              input_data={"name": payload.name, "price": payload.price_paise, "stock": payload.stock},
              execution_status="success")
    return {"id": product.id}


@router.patch("/{product_id}")
def update_product(product_id: str, payload: ProductIn, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    changes = {
        k: getattr(product, k) for k in ("name", "description", "category", "price", "stock", "rating")
    }
    product.name = payload.name
    product.description = payload.description
    product.category = payload.category
    product.price = payload.price_paise
    product.stock = payload.stock
    product.rating = payload.rating
    product.tags = payload.tags
    log_audit(db, actor="merchant", action="UPDATE_PRODUCT",
              entity_type="product", entity_id=product_id,
              input_data={"before": changes},
              reason=f"Edited '{payload.name}'",
              execution_status="success")
    return {"id": product.id, "status": "updated"}


@router.post("/{product_id}/stock")
def adjust_stock(product_id: str, payload: StockIn, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    new_stock = max(product.stock + payload.stock_delta, 0)
    log_audit(db, actor="merchant", action="ADJUST_STOCK",
              entity_type="product", entity_id=product_id,
              input_data={"delta": payload.stock_delta, "before": product.stock, "after": new_stock},
              execution_status="success")
    product.stock = new_stock
    db.commit()
    return {"id": product.id, "stock": new_stock}


@router.delete("/{product_id}")
def delete_product(product_id: str, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    referenced = db.query(OrderItem).filter(OrderItem.product_id == product_id).first() is not None
    if referenced:
        # Preserve order history integrity — retire instead of hard delete.
        product.stock = 0
        log_audit(db, actor="merchant", action="RETIRE_PRODUCT",
                  entity_type="product", entity_id=product_id,
                  reason=f"'{product.name}' appears in order history — retired (stock=0) instead of deleted",
                  execution_status="success")
        return {"id": product_id, "status": "retired"}
    log_audit(db, actor="merchant", action="DELETE_PRODUCT",
              entity_type="product", entity_id=product_id,
              input_data={"name": product.name},
              reason=f"Deleted '{product.name}' (never sold)",
              execution_status="success")
    db.delete(product)
    db.commit()
    return {"id": product_id, "status": "deleted"}
