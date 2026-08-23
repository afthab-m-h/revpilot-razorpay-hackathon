from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db.session import Base, engine
from app.api.routes import (admin, agent, analytics, audit, campaigns, orders,
                            payments, products, webhooks)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="RevPilot", version="0.1.0",
              description="AI Revenue Agent for Merchants — bounded, explainable, auditable commerce on Razorpay Test Mode.")

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(products.router)
app.include_router(admin.router)
app.include_router(orders.router)
app.include_router(payments.router)
app.include_router(webhooks.router)
app.include_router(agent.router)
app.include_router(campaigns.router)
app.include_router(analytics.router)
app.include_router(audit.router)


@app.get("/")
def root():
    return {"service": "revpilot", "status": "ok"}


@app.get("/health")
def health():
    from app.services.payment_provider import get_payment_provider
    provider = get_payment_provider()
    return {
        "database": "ok",
        "payment_provider": provider.name,
        "payment_provider_configured": provider.is_configured(),
        "llm_configured": bool(get_settings().gemini_api_key),
    }
