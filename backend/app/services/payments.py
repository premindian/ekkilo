"""
Razorpay UPI checkout helpers.
If RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are unset, payments are disabled
and orders fall back to the legacy immediate-confirm flow.
"""
import hashlib
import hmac
import os
from typing import Optional

import httpx

from app.db.database import get_db


def payments_enabled() -> bool:
    return bool(os.getenv("RAZORPAY_KEY_ID") and os.getenv("RAZORPAY_KEY_SECRET"))


def razorpay_key_id() -> str:
    return (os.getenv("RAZORPAY_KEY_ID") or "").strip()


def razorpay_key_secret() -> str:
    return (os.getenv("RAZORPAY_KEY_SECRET") or "").strip()


async def ensure_payment_schema(db=None):
    db = db or await get_db()
    for stmt in (
        "ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'UNPAID'",
        "ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30)",
        "ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS payment_id TEXT",
        "ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT",
        "ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ",
        "ALTER TABLE final_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) DEFAULT 0",
    ):
        try:
            await db.execute(stmt)
        except Exception as e:
            print(f"⚠️ payment schema: {e}")


async def create_razorpay_order(amount_rupees: float, receipt: str, notes: dict = None) -> dict:
    """Create Razorpay order; amount in rupees → paise."""
    amount_paise = int(round(float(amount_rupees) * 100))
    if amount_paise < 100:
        raise ValueError("Minimum payment is ₹1")

    auth = (razorpay_key_id(), razorpay_key_secret())
    payload = {
        "amount": amount_paise,
        "currency": "INR",
        "receipt": str(receipt)[:40],
        "notes": notes or {},
        "payment_capture": 1,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            "https://api.razorpay.com/v1/orders",
            json=payload,
            auth=auth,
        )
    if res.status_code >= 400:
        raise RuntimeError(f"Razorpay order failed: {res.status_code} {res.text[:200]}")
    return res.json()


def verify_payment_signature(
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
) -> bool:
    body = f"{razorpay_order_id}|{razorpay_payment_id}".encode()
    expected = hmac.new(
        razorpay_key_secret().encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, (razorpay_signature or "").strip())


async def order_grand_total(final_order_id: int, db=None) -> float:
    db = db or await get_db()
    row = await db.fetchrow("""
        SELECT COALESCE(SUM(total_amount), 0) as total
        FROM store_orders WHERE final_order_id = $1
    """, final_order_id)
    return float(row["total"] or 0) if row else 0.0
