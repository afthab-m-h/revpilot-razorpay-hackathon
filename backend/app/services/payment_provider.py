"""Payment provider abstraction.

Business logic depends ONLY on this interface — never on Razorpay directly.

    Gemini -> AI agent -> commerce tools -> policy engine -> PaymentProvider -> audit

Providers:
- MockPaymentProvider  (default): fully simulates order creation, checkout,
  success/failure payments, status and signed webhook events. No credentials.
- RazorpayPaymentProvider: real Test Mode integration; enable with
  PAYMENT_PROVIDER=razorpay + test keys in .env.

All implementations must keep money actions auditable and signature-verified.
"""

import hashlib
import hmac
import uuid
from abc import ABC, abstractmethod
from typing import Any

from app.config import get_settings


class PaymentProviderError(Exception):
    pass


class PaymentProvider(ABC):
    name: str = "base"

    @abstractmethod
    def is_configured(self) -> bool: ...

    @abstractmethod
    def public_key(self) -> str:
        """Key handed to the frontend checkout widget."""

    @abstractmethod
    async def create_order(self, amount_paise: int, currency: str = "INR",
                           receipt: str | None = None,
                           notes: dict[str, Any] | None = None) -> dict[str, Any]: ...

    @abstractmethod
    async def fetch_payment(self, payment_id: str) -> dict[str, Any]: ...

    @abstractmethod
    def verify_checkout_signature(self, provider_order_id: str, payment_id: str,
                                  signature: str) -> bool: ...

    @abstractmethod
    def sign_webhook(self, raw_body: bytes) -> str: ...

    @abstractmethod
    def verify_webhook_signature(self, raw_body: bytes, signature: str) -> bool: ...

    # --- simulation support (mock only; base raises) ---
    def simulate_payment(self, provider_order_id: str, amount_paise: int,
                         outcome: str = "success") -> dict[str, Any]:
        raise NotImplementedError("This provider does not support simulation")


# --------------------------------------------------------------------- mock --

class MockPaymentProvider(PaymentProvider):
    """Deterministic in-process simulator for development/demo mode."""

    name = "mock"

    def _secret(self) -> bytes:
        return get_settings().mock_payment_secret.encode()

    def is_configured(self) -> bool:
        return True  # always available

    def public_key(self) -> str:
        return "rzp_test_mock_provider"

    async def create_order(self, amount_paise: int, currency: str = "INR",
                           receipt: str | None = None,
                           notes: dict[str, Any] | None = None) -> dict[str, Any]:
        return {
            "id": f"order_mock_{uuid.uuid4().hex[:14]}",
            "amount": amount_paise,
            "currency": currency,
            "receipt": receipt,
            "notes": notes or {},
            "status": "created",
            "provider": self.name,
        }

    async def fetch_order(self, provider_order_id: str) -> dict[str, Any]:
        return {"id": provider_order_id, "status": "created", "provider": self.name}

    async def fetch_payment(self, payment_id: str) -> dict[str, Any]:
        if not payment_id.startswith("pay_mock_"):
            return {"id": payment_id, "status": "unknown", "provider": self.name}
        outcome = "captured" if payment_id.endswith("_ok") else "failed"
        return {"id": payment_id, "amount": 0, "currency": "INR", "status": outcome,
                "method": "mock_upi", "provider": self.name}

    def verify_checkout_signature(self, provider_order_id: str, payment_id: str,
                                  signature: str) -> bool:
        expected = hmac.new(self._secret(),
                            f"{provider_order_id}|{payment_id}".encode(),
                            hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)

    def checkout_signature(self, provider_order_id: str, payment_id: str) -> str:
        return hmac.new(self._secret(),
                        f"{provider_order_id}|{payment_id}".encode(),
                        hashlib.sha256).hexdigest()

    def sign_webhook(self, raw_body: bytes) -> str:
        return hmac.new(self._secret(), raw_body, hashlib.sha256).hexdigest()

    def verify_webhook_signature(self, raw_body: bytes, signature: str) -> bool:
        if not signature:
            return False
        expected = hmac.new(self._secret(), raw_body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)

    def simulate_payment(self, provider_order_id: str, amount_paise: int,
                         outcome: str = "success") -> dict[str, Any]:
        """Generate a realistic payment entity + event, like the gateway would."""
        ok = outcome == "success"
        payment_id = f"pay_mock_{uuid.uuid4().hex[:10]}" + ("_ok" if ok else "_fail")
        entity = {
            "id": payment_id,
            "order_id": provider_order_id,
            "amount": amount_paise,
            "currency": "INR",
            "status": "captured" if ok else "failed",
            "method": "mock_upi",
            "captured": ok,
        }
        if not ok:
            entity["error_description"] = "Simulated payment failure (mock gateway)"
        event = "payment.captured" if ok else "payment.failed"
        payload = {"event": event, "payload": {"payment": {"entity": entity}}}
        raw = _dumps(payload)
        return {
            "event": event,
            "entity": entity,
            "signature": self.sign_webhook(raw),
            "raw": raw,
        }


def _dumps(obj: Any) -> bytes:
    import json
    return json.dumps(obj, default=str).encode()


# ----------------------------------------------------------------- razorpay --

class RazorpayPaymentProvider(PaymentProvider):
    """Real Razorpay Test Mode. Implementation stays isolated in services/razorpay.py."""

    name = "razorpay"

    def is_configured(self) -> bool:
        from app.services import razorpay as rzp
        return rzp.is_configured()

    def public_key(self) -> str:
        from app.config import get_settings
        return get_settings().razorpay_key_id

    async def create_order(self, amount_paise: int, currency: str = "INR",
                           receipt: str | None = None,
                           notes: dict[str, Any] | None = None) -> dict[str, Any]:
        from app.services import razorpay as rzp
        return await rzp.create_order(amount_paise, currency=currency, receipt=receipt,
                                      notes=notes)

    async def fetch_payment(self, payment_id: str) -> dict[str, Any]:
        from app.services import razorpay as rzp
        return await rzp.fetch_payment(payment_id)

    def verify_checkout_signature(self, provider_order_id: str, payment_id: str,
                                  signature: str) -> bool:
        from app.services import razorpay as rzp
        return rzp.verify_checkout_signature(provider_order_id, payment_id, signature)

    def sign_webhook(self, raw_body: bytes) -> str:
        from app.config import get_settings
        secret = get_settings().webhook_secret
        return hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest() if secret else ""

    def verify_webhook_signature(self, raw_body: bytes, signature: str) -> bool:
        from app.services import razorpay as rzp
        return rzp.verify_webhook_signature(raw_body, signature)


# ------------------------------------------------------------------- factory --

_PROVIDER: PaymentProvider | None = None


def get_payment_provider() -> PaymentProvider:
    global _PROVIDER
    if _PROVIDER is None:
        choice = get_settings().payment_provider.lower().strip()
        if choice == "razorpay":
            _PROVIDER = RazorpayPaymentProvider()
        else:
            _PROVIDER = MockPaymentProvider()
    return _PROVIDER
