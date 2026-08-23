"""Policy engine — every money-moving action is bounded, explainable and gated."""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.models import log_audit
from app.services.payment_provider import get_payment_provider


@dataclass
class PolicyCheck:
    name: str
    passed: bool
    detail: str


@dataclass
class PolicyResult:
    allowed: bool
    requires_approval: bool
    checks: list[PolicyCheck]

    @property
    def summary(self) -> str:
        failed = [c for c in self.checks if not c.passed]
        if not self.allowed:
            return "BLOCKED: " + "; ".join(c.detail for c in failed)
        if self.requires_approval:
            return "PASSED — merchant approval required before execution"
        return "PASSED"


def evaluate_order(db: Session, *, amount_paise: int, discount_percent: float = 0.0,
                   product_ids: list[str] | None = None) -> PolicyResult:
    """Evaluate an order/discount against merchant policy bounds."""
    settings = get_settings()
    checks: list[PolicyCheck] = []

    checks.append(PolicyCheck(
        "max_order_value",
        amount_paise <= settings.max_order_value,
        f"Order value Rs.{amount_paise / 100:,.0f} vs limit Rs.{settings.max_order_value / 100:,.0f}",
    ))
    checks.append(PolicyCheck(
        "max_discount",
        discount_percent <= settings.max_discount_percent,
        f"Discount {discount_percent:.2f}% vs max allowed {settings.max_discount_percent:.0f}%",
    ))

    from app.models.models import Product  # local import to avoid cycles
    for pid in product_ids or []:
        product = db.get(Product, pid)
        exists = product is not None
        in_stock = exists and product.stock > 0
        checks.append(PolicyCheck("product_exists", exists, f"Product {pid} {'found' if exists else 'not found'}"))
        checks.append(PolicyCheck("stock_available", in_stock,
                                  f"{pid} stock: {product.stock if exists else 'n/a'}"))

    allowed = all(c.passed for c in checks)
    result = PolicyResult(allowed=allowed, requires_approval=settings.require_merchant_approval and allowed, checks=checks)

    log_audit(
        db,
        actor="policy_engine",
        action="POLICY_EVALUATION",
        entity_type="order",
        input_data={"amount": amount_paise, "discount_percent": discount_percent, "products": product_ids},
        policy_status="passed" if allowed else "blocked",
        metadata={"checks": [{"name": c.name, "passed": c.passed, "detail": c.detail} for c in checks]},
    )
    return result


def evaluate_discount_proposal(db: Session, *, requested_discount_percent: float, order_value_paise: int) -> PolicyResult:
    """Convenience path used by the revenue agent when proposing offers."""
    return evaluate_order(db, amount_paise=order_value_paise, discount_percent=requested_discount_percent)


def payment_gate_ok() -> tuple[bool, str]:
    """Money actions require an active, configured payment provider."""
    provider = get_payment_provider()
    if not provider.is_configured():
        return False, f"Payment provider '{provider.name}' is not configured — money actions are disabled."
    return True, "ok"
