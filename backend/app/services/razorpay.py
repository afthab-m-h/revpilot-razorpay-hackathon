"""Razorpay service — thin wrapper over the Orders/Payments REST APIs (Test mode).

Docs: https://razorpay.com/docs/api/orders/
We deliberately keep this in ONE place so every money action is auditable.
"""

import base64
import hashlib
import hmac
import json
from typing import Any

import httpx

from app.config import get_settings

BASE_URL = "https://api.razorpay.com/v1"


def is_configured() -> bool:
    s = get_settings()
    return bool(s.razorpay_key_id and s.razorpay_key_secret)


class RazorpayError(Exception):
    pass


def _auth() -> tuple[str, str]:
    s = get_settings()
    if not is_configured():
        raise RazorpayError("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured")
    return s.razorpay_key_id, s.razorpay_key_secret


async def create_order(amount_paise: int, currency: str = "INR", receipt: str | None = None,
                       notes: dict[str, Any] | None = None) -> dict[str, Any]:
    auth = _auth()
    payload: dict[str, Any] = {"amount": amount_paise, "currency": currency}
    if receipt:
        payload["receipt"] = receipt
    if notes:
        payload["notes"] = notes
    async with httpx.AsyncClient(auth=auth, timeout=30) as client:
        try:
            resp = await client.post(f"{BASE_URL}/orders", json=payload)
        except httpx.RequestError as exc:
            raise RazorpayError(f"create_order could not reach Razorpay: {exc}") from exc
        if resp.status_code >= 400:
            raise RazorpayError(f"create_order failed ({resp.status_code}): {resp.text}")
        return resp.json()


async def fetch_order(razorpay_order_id: str) -> dict[str, Any]:
    auth = _auth()
    async with httpx.AsyncClient(auth=auth, timeout=30) as client:
        try:
            resp = await client.get(f"{BASE_URL}/orders/{razorpay_order_id}")
        except httpx.RequestError as exc:
            raise RazorpayError(f"fetch_order could not reach Razorpay: {exc}") from exc
        if resp.status_code >= 400:
            raise RazorpayError(f"fetch_order failed ({resp.status_code}): {resp.text}")
        return resp.json()


async def fetch_payment(payment_id: str) -> dict[str, Any]:
    auth = _auth()
    async with httpx.AsyncClient(auth=auth, timeout=30) as client:
        try:
            resp = await client.get(f"{BASE_URL}/payments/{payment_id}")
        except httpx.RequestError as exc:
            raise RazorpayError(f"fetch_payment could not reach Razorpay: {exc}") from exc
        if resp.status_code >= 400:
            raise RazorpayError(f"fetch_payment failed ({resp.status_code}): {resp.text}")
        return resp.json()


def verify_checkout_signature(razorpay_order_id: str, razorpay_payment_id: str,
                              razorpay_signature: str) -> bool:
    """HMAC-SHA256(order_id + '|' + payment_id, key_secret) == signature."""
    s = get_settings()
    if not s.razorpay_key_secret:
        return False
    expected = hmac.new(
        s.razorpay_key_secret.encode(),
        f"{razorpay_order_id}|{razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, razorpay_signature)


def verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    """HMAC-SHA256(raw_body, webhook_secret) == X-Razorpay-Signature."""
    s = get_settings()
    if not s.webhook_secret or not signature:
        return False
    expected = hmac.new(s.webhook_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
