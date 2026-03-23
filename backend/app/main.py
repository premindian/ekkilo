from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio

# routers
from app.api.routes import router
from app.api.admin import router as admin_router
from app.api.whatsapp import router as whatsapp_router

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
# ✅ CORS
# -----------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 🔥 tighten later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------------------
# ✅ PREFLIGHT (OPTIONAL)
# -----------------------------------------
@app.options("/{full_path:path}")
async def preflight_handler():
    return {"ok": True}


# -----------------------------------------
# ✅ ROUTERS
# -----------------------------------------
app.include_router(router)
app.include_router(admin_router)
app.include_router(whatsapp_router, prefix="/whatsapp")


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