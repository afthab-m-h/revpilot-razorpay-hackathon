from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Payment provider: "mock" (default, no credentials needed) or "razorpay"
    payment_provider: str = "mock"
    mock_payment_secret: str = "mock_secret_dev_only"

    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    webhook_secret: str = ""

    gemini_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"

    database_url: str = "sqlite:///./revpilot.db"
    frontend_origin: str = "http://localhost:5173"

    # Policy engine bounds (merchant-configurable in a real system).
    # All money values are PAISE (Rs.1 = 100 paise).
    max_order_value: int = 1_000_000      # = Rs.10,000
    max_discount_percent: float = 20.0
    require_merchant_approval: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
