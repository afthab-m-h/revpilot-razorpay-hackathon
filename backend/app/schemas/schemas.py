from datetime import datetime

from pydantic import BaseModel, Field


class ProductOut(BaseModel):
    id: str
    name: str
    description: str
    category: str
    price: int  # paise
    stock: int
    rating: float
    tags: list[str] = []

    model_config = {"from_attributes": True}


class OrderItemIn(BaseModel):
    product_id: str
    quantity: int = Field(default=1, ge=1, le=10)


class OrderCreate(BaseModel):
    customer_id: str | None = None
    items: list[OrderItemIn]
    offer_id: str | None = None
    ai_assisted: bool = False


class OrderItemOut(BaseModel):
    product_id: str
    quantity: int
    unit_price: int

    model_config = {"from_attributes": True}


class OrderOut(BaseModel):
    id: str
    customer_id: str | None
    razorpay_order_id: str | None
    amount: int
    discount_amount: int
    status: str
    ai_assisted: bool
    created_at: datetime
    items: list[OrderItemOut] = []

    model_config = {"from_attributes": True}


class CheckoutResponse(BaseModel):
    order: OrderOut
    razorpay_order_id: str | None
    key_id: str
    amount: int
    currency: str = "INR"


class PaymentVerifyIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    history: list[ChatMessage] = []


class OfferPreviewIn(BaseModel):
    type: str = "bundle"
    product_ids: list[str]
    discount_percent: float
    name: str | None = None


class OfferOut(BaseModel):
    id: str
    name: str
    discount_type: str
    discount_value: float
    status: str
    policy_status: str | None
    approval_status: str | None
    reason: str | None

    model_config = {"from_attributes": True}
