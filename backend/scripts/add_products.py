"""Incrementally expand the catalog in an EXISTING database.

Unlike seed.py (full reseed), this script:
- inserts only NEW products (existing rows untouched)
- generates a modest correlated order + browsing history for them so
  co-purchase analytics and AI recommendations can discover them
- never deletes anything

Run: python scripts/add_products.py [--orders-per-anchor 60]
"""

import argparse
import datetime as dt
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import Base, SessionLocal, engine  # noqa: E402
from app.models.models import Customer, Event, Order, OrderItem, Product  # noqa: E402
from scripts.seed import CORRELATIONS, PRODUCTS  # noqa: E402

random.seed(123)

# ids added in the catalog expansion
NEW_IDS = ["shoe_003", "shoe_004", "sock_003", "sock_004",
           "shorts_002", "shorts_003", "watch_002", "watch_003",
           "acc_001", "acc_002", "acc_003",
           "nutr_001", "nutr_002", "nutr_003", "rec_001", "rec_002"]

PRODUCT_MAP = {p["id"]: p for p in PRODUCTS}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--orders-per-anchor", type=int, default=60)
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)   # no drop - preserves all data
    db = SessionLocal()

    # 1. insert missing products ------------------------------------------------
    added = []
    for pid in NEW_IDS:
        if db.get(Product, pid):
            continue
        p = dict(PRODUCT_MAP[pid])
        db.add(Product(**p))
        added.append(pid)
    db.commit()
    print(f"products inserted: {len(added)} {added}")
    if db.query(Customer).count() == 0:
        print("WARNING: no customers found - run seed.py first for full history")
        return

    customer_ids = [c.id for c in db.query(Customer.id).all()]
    now = dt.datetime.now(dt.timezone.utc)

    # 2. correlated paid orders anchored on new products -------------------------
    anchors = [pid for pid in NEW_IDS if pid in CORRELATIONS]
    created_orders = 0
    for anchor in anchors:
        product = PRODUCT_MAP[anchor]
        related = CORRELATIONS.get(anchor, [])
        for i in range(args.orders_per_anchor):
            ts = now - dt.timedelta(days=random.uniform(0, 30))
            order = Order(id=f"ORD-{random.getrandbits(32):08X}",
                          customer_id=random.choice(customer_ids),
                          amount=0, status="paid", ai_assisted=False,
                          created_at=ts)
            total = 0
            items = [anchor] + [rid for rid, prob in related if random.random() < prob]
            seen = set()
            for pid in items:
                if pid in seen:
                    continue
                seen.add(pid)
                prod = PRODUCT_MAP.get(pid) or {
                    "price": db.get(Product, pid).price}  # existing product fallback
                qty = 1
                order.items.append(OrderItem(product_id=pid, quantity=qty, unit_price=prod["price"]))
                total += prod["price"] * qty
                db.add(Event(customer_id=order.customer_id, product_id=pid,
                             event_type="purchase", timestamp=ts))
            if len(seen) < 1:
                continue
            order.amount = total
            db.add(order)
            created_orders += 1

            # browsing funnel for the anchor so performance panels look real
            cust = order.customer_id
            for _ in range(8):
                db.add(Event(customer_id=cust, product_id=anchor, event_type="view",
                             timestamp=ts - dt.timedelta(hours=random.uniform(1, 200))))
            for _ in range(2):
                db.add(Event(customer_id=cust, product_id=anchor, event_type="add_to_cart",
                             timestamp=ts - dt.timedelta(hours=random.uniform(0.5, 48))))

            if created_orders % 100 == 0:
                db.commit()
    db.commit()
    print(f"orders created: {created_orders}")
    print("catalog size:", db.query(Product).count())
    db.close()


if __name__ == "__main__":
    main()
