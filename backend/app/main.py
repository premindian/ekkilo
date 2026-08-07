from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio

# routers
from app.api.routes import router
from app.api.admin import router as admin_router
from app.api.whatsapp import router as whatsapp_router
from app.api.auth import router as auth_router
from app.api.grocery_lists import router as grocery_lists_router
from app.api.user_preferences import router as preferences_router
from app.api.orders import router as orders_router

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

    task = asyncio.create_task(retry_failed_messages())

    yield

    print("🛑 App shutting down...")
    task.cancel()


# -----------------------------------------
# ✅ CREATE APP (ONLY ONCE)
# -----------------------------------------
app = FastAPI(lifespan=lifespan)


# -----------------------------------------
# ✅ CORS (EXPLICIT FOR RENDER)
# -----------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://ekkilo-1.onrender.com",
        "https://ekkilo.onrender.com",
        "http://localhost:3000",
        "http://localhost:8000",
        "*"  # Allow all as fallback
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# -----------------------------------------
# ✅ PREFLIGHT (OPTIONAL)
# -----------------------------------------
@app.options("/{full_path:path}")
async def preflight_handler():
    return {"ok": True}


# -----------------------------------------
# ✅ HEALTH CHECK
# -----------------------------------------
@app.get("/health")
async def health_check():
    return {"status": "ok", "message": "Backend is running"}


# -----------------------------------------
# ✅ ROUTERS
# -----------------------------------------
app.include_router(router)
app.include_router(admin_router)
app.include_router(whatsapp_router, prefix="/whatsapp")
app.include_router(auth_router, prefix="/api")
app.include_router(grocery_lists_router, prefix="/api")
app.include_router(preferences_router, prefix="/api")
app.include_router(orders_router, prefix="/api")


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
