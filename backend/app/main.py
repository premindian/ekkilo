from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import asyncio
import os
from pathlib import Path

# routers
from app.api.routes import router
from app.api.whatsapp import router as whatsapp_router
from app.api.auth import router as auth_router
from app.api.grocery_lists import router as grocery_lists_router
from app.api.user_preferences import router as preferences_router
from app.api.orders import router as orders_router
from app.api.store_portal import router as store_portal_router
from app.api.admin_portal import router as admin_portal_router
from app.api.qc_benchmarks import router as qc_benchmarks_router
from app.api.payments import router as payments_router
from app.api.catalog import router as catalog_router

# services
from app.services.whatsapp_retry import retry_failed_messages

# websocket manager
from app.core.ws_manager import manager

# -----------------------------------------
# ✅ LIFESPAN (MODERN STARTUP)
# -----------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 App starting...")

    try:
        from app.db.database import get_db
        from app.services.order_status import ensure_order_schema
        from app.api.admin_portal import ensure_whatsapp_messages_schema
        from app.services.catalog import ensure_catalog_schema
        from app.services.staff_audit import ensure_staff_audit_schema
        from app.services.refund_requests import ensure_refund_requests_schema
        from app.services.product_import import seed_starter_catalog
        db = await get_db()
        await ensure_order_schema(db)
        await ensure_whatsapp_messages_schema(db)
        await ensure_catalog_schema(db)
        await ensure_staff_audit_schema(db)
        await ensure_refund_requests_schema(db)
        print("✅ Order + WhatsApp + Catalog + Audit + Refund schema verified")
        try:
            seeded = await seed_starter_catalog(db)
            print(
                f"🧺 Starter catalog: +{seeded.get('created', 0)} "
                f"(skipped {seeded.get('skipped', 0)})"
            )
        except Exception as se:
            print(f"⚠️ Starter catalog seed skipped: {se}")
    except Exception as e:
        print(f"⚠️ Schema ensure failed: {e}")

    # Critical: subscribe app to WABA so inbound WhatsApp messages hit our webhook
    try:
        from app.services.whatsapp.webhook_setup import ensure_waba_subscribed
        sub = await ensure_waba_subscribed()
        print(f"🔔 WhatsApp WABA subscribe: {sub}")
    except Exception as e:
        print(f"⚠️ WhatsApp WABA subscribe failed: {e}")

    task = asyncio.create_task(retry_failed_messages())

    yield

    print("🛑 App shutting down...")
    task.cancel()


# -----------------------------------------
# ✅ CREATE APP (ONLY ONCE)
# -----------------------------------------
app = FastAPI(lifespan=lifespan)


# -----------------------------------------
# ✅ CORS (production + local frontend)
# -----------------------------------------
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS",
        "https://ekkilo.onrender.com,https://www.ekkilo.onrender.com,http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------------------
# ✅ HEALTH CHECK
# -----------------------------------------
@app.get("/health")
async def health_check():
    return {"status": "ok", "message": "Backend is running"}


# -----------------------------------------
# ✅ ROUTERS (API ROUTES FIRST!)
# -----------------------------------------
app.include_router(router)
app.include_router(whatsapp_router, prefix="/whatsapp")
# Alias: some Meta apps are configured as https://host/webhook
app.include_router(whatsapp_router, prefix="")
app.include_router(auth_router, prefix="/api")
app.include_router(grocery_lists_router, prefix="/api")
app.include_router(preferences_router, prefix="/api")
app.include_router(orders_router, prefix="/api")
app.include_router(store_portal_router, prefix="/api")
app.include_router(admin_portal_router, prefix="/api")
app.include_router(qc_benchmarks_router, prefix="/api")
app.include_router(payments_router, prefix="/api")
app.include_router(catalog_router, prefix="/api")


# -----------------------------------------
# ✅ SERVE REACT FRONTEND (STATIC FILES)
# -----------------------------------------
# Path to built React app
frontend_build_path = Path(__file__).parent.parent.parent / "frontend" / "build"

if frontend_build_path.exists():
    print(f"✅ Serving React frontend from: {frontend_build_path}")
    
    # Mount static files (JS, CSS, images)
    app.mount("/static", StaticFiles(directory=str(frontend_build_path / "static")), name="static")
    
    # Catch-all route for React Router (MUST be last!)
    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        """Serve React app for all non-API routes"""
        # If requesting a specific file that exists, serve it
        file_path = frontend_build_path / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        
        # Otherwise serve index.html (React handles routing)
        return FileResponse(frontend_build_path / "index.html")
else:
    print(f"⚠️ Frontend build not found at: {frontend_build_path}")
    print("   Run 'npm run build' in frontend folder to build React app")


# -----------------------------------------
# ✅ WEBSOCKETS
# -----------------------------------------
@app.websocket("/ws/admin")
async def admin_ws(websocket: WebSocket):
    print("🔥 ADMIN WS HIT")

    try:
        await websocket.accept()
        print("✅ WS ACCEPTED")

        await manager.connect(0, websocket)

        while True:
            data = await websocket.receive_text()
            print("📩 ADMIN MSG:", data)

    except Exception as e:
        print("❌ WS ERROR:", str(e))


@app.websocket("/ws/{order_id}")
async def websocket_endpoint(websocket: WebSocket, order_id: int):
    await manager.connect(order_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except:
        manager.disconnect(order_id, websocket)
