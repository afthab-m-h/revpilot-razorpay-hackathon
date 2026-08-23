"""Seed the database with a fictional merchant (StrideX) + correlated data.

Creates:
- 8 products
- N customers (default 2000)
- Orders with realistic co-purchase correlations (shoes -> socks/gel etc.)
- Browsing events so the analytics engine can discover patterns

Run: python scripts/seed.py [--customers 2000] [--orders 8000]
"""

import argparse
import datetime as dt
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import Base, SessionLocal, engine  # noqa: E402
from app.models.models import (Base, Customer, Event, Merchant, Order,  # noqa: E402
                               OrderItem, Product)

random.seed(42)

MERCHANT = {"id": "stridex", "name": "StrideX", "category": "Running & Fitness"}

# price in paise
PRODUCTS = [
    dict(id="shoe_001", name="StrideX Speed Pro", category="Running Shoes",
         description="Lightweight racer built for half-marathon pace. Carbon-infused plate, breathable knit.",
         price=479_900, stock=142, rating=4.7,
         tags=["running", "half-marathon", "long-distance", "racing"]),
    dict(id="shoe_002", name="StrideX Run Lite", category="Running Shoes",
         description="Everyday trainer with soft cushioning for daily miles.",
         price=429_900, stock=210, rating=4.4,
         tags=["running", "daily-trainer", "comfort"]),
    dict(id="sock_002", name="Anti-Blaze Running Socks", category="Running Socks",
         description="Moisture-wicking compression socks that prevent blisters on long runs.",
         price=39_900, stock=340, rating=4.6,
         tags=["running", "accessory", "compression"]),
    dict(id="gel_001", name="QuickFuel Energy Gel (Pack of 6)", category="Nutrition",
         description="Fast-absorbing carbs for mid-run energy. Citrus flavour.",
         price=59_900, stock=520, rating=4.5,
         tags=["running", "nutrition", "endurance"]),
    dict(id="watch_001", name="PaceTrack GPS Watch", category="Sports Watch",
         description="GPS tracking, heart-rate monitoring and structured workouts.",
         price=899_900, stock=58, rating=4.8,
         tags=["running", "gps", "training-tech"]),
    dict(id="shorts_001", name="AeroSplit Running Shorts", category="Running Shorts",
         description="Feather-light split shorts with secure gel pockets.",
         price=199_900, stock=180, rating=4.3,
         tags=["running", "apparel"]),
    dict(id="bottle_001", name="HydraFlow Bottle 500ml", category="Accessories",
         description="Handheld running bottle with quick-squeeze valve.",
         price=74_900, stock=260, rating=4.2,
         tags=["running", "hydration", "accessory"]),
    dict(id="sleeve_001", name="FlexRecover Compression Sleeves", category="Recovery",
         description="Calf compression sleeves to speed up post-run recovery.",
         price=129_900, stock=150, rating=4.1,
         tags=["running", "recovery", "compression"]),
]

# Co-purchase correlations we deliberately inject into generated orders.
CORRELATIONS = {
    "shoe_001": [("sock_002", 0.38), ("gel_001", 0.22), ("watch_001", 0.10)],
    "shoe_002": [("bottle_001", 0.25), ("sock_002", 0.30)],
    "watch_001": [("shoe_001", 0.28), ("gel_001", 0.15)],
    "shorts_001": [("bottle_001", 0.18), ("sock_002", 0.12)],
}

FIRST_NAMES = ["Aarav", "Diya", "Kabir", "Meera", "Rohan", "Ananya", "Vikram", "Isha",
               "Arjun", "Sara", "Nikhil", "Priya", "Dev", "Tara", "Yash", "Nisha"]
LAST_NAMES = ["Sharma", "Patel", "Iyer", "Reddy", "Khan", "Gupta", "Menon", "Joshi",
              "Verma", "Nair"]


def gen_customers(n: int) -> list[Customer]:
    segments = ["standard"] * 70 + ["frequent"] * 22 + ["vip"] * 8
    return [
        Customer(id=f"cust_{i:05d}",
                 name=f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}",
                 email=f"customer{i:04d}@example.com",
                 segment=random.choice(segments))
        for i in range(1, n + 1)
    ]


def gen_order(db, customer: Customer, ts: dt.datetime) -> Order:
    anchor = random.choice(PRODUCTS)["id"]
    items = [anchor]
    for related, prob in CORRELATIONS.get(anchor, []):
        if random.random() < prob:
            items.append(related)

    product_map = {p["id"]: p for p in PRODUCTS}
    order = Order(id=f"ORD-{random.getrandbits(32):08X}", customer_id=customer.id,
                  amount=0, status="paid", created_at=ts)
    total = 0
    seen = set()
    for pid in items:
        if pid in seen:
            continue
        seen.add(pid)
        product = product_map[pid]
        qty = 1 if not pid.startswith("gel") else random.choice([1, 1, 2])
        order.items.append(OrderItem(product_id=pid, quantity=qty, unit_price=product["price"]))
        total += product["price"] * qty

        db.add(Event(customer_id=customer.id, product_id=pid, event_type="purchase", timestamp=ts))
    order.amount = total
    return order


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--customers", type=int, default=2000)
    parser.add_argument("--orders", type=int, default=8000)
    args = parser.parse_args()

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    db.add(Merchant(**MERCHANT))
    for p in PRODUCTS:
        db.add(Product(**p))
    print(f"Seeded merchant + {len(PRODUCTS)} products")

    customers = gen_customers(args.customers)
    db.add_all(customers)
    print(f"Seeded {len(customers)} customers")

    now = dt.datetime.now(dt.timezone.utc)
    start = now - dt.timedelta(days=60)

    def rand_ts(before: dt.datetime) -> dt.datetime:
        ts = start + dt.timedelta(seconds=random.random() * 60 * 24 * 3600)
        return min(ts, before)

    # Realistic funnel: for every order emit ~10 views, ~3 add-to-carts,
    # ~25 abandoned checkout starts, then the converting session.
    # This gives a site-wide conversion around 4%.
    events_per_order = 10 + 3 + 25
    print(f"Generating ~{args.orders * events_per_order} browsing events...")
    batch = []

    def add_event(cust_id: str, product_id: str, etype: str, ts: dt.datetime) -> None:
        batch.append(Event(customer_id=cust_id, product_id=product_id,
                           event_type=etype, timestamp=max(ts, start)))
        if len(batch) >= 50000:
            db.add_all(batch)
            db.commit()
            batch.clear()

    for i in range(args.orders):
        cust = random.choice(customers)
        ts_order = rand_ts(now)
        for _ in range(10):   # views
            add_event(cust.id, random.choice(PRODUCTS)["id"], "view",
                      ts_order - dt.timedelta(hours=random.uniform(1, 400)))
        for _ in range(3):    # carts
            add_event(cust.id, random.choice(PRODUCTS)["id"], "add_to_cart",
                      ts_order - dt.timedelta(hours=random.uniform(0.5, 100)))
        for _ in range(25):   # abandoned checkouts (no purchase follows)
            add_event(cust.id, random.choice(PRODUCTS)["id"], "checkout_started",
                      ts_order - dt.timedelta(hours=random.uniform(0.5, 300)))
        db.add(gen_order(db, cust, ts_order))
        if i % 1000 == 0:
            db.commit()
            print(f"  orders: {i}")

    db.commit()

    counts = {
        "orders": db.query(Order).count(),
        "events": db.query(Event).count(),
        "products": db.query(Product).count(),
        "customers": db.query(Customer).count(),
    }
    print("Done:", counts)


if __name__ == "__main__":
    main()
