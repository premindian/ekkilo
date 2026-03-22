from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

# routers
from app.api.routes import router
from app.api.admin import router as admin_router
from app.api.whatsapp import router as whatsapp_router

# 🔥 import your websocket manager (adjust path if needed)
from app.core.ws_manager import manager  

app = FastAPI()

# -----------------------------------------
# ✅ CORS
# -----------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://ekkilo-1.onrender.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    await manager.connect(0, websocket)
    try:
        while True:
            await websocket.receive_text()
    except:
        manager.disconnect(0, websocket)


@app.websocket("/ws/{order_id}")
async def websocket_endpoint(websocket: WebSocket, order_id: int):
    await manager.connect(order_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except:
        manager.disconnect(order_id, websocket)