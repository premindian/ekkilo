from fastapi import FastAPI, WebSocket
from app.api.routes import router
from app.api.admin import router as admin_router
from fastapi.staticfiles import StaticFiles
from app.core.ws_manager import manager
from fastapi.middleware.cors import CORSMiddleware
app = FastAPI()

from app.api.whatsapp import router as whatsapp_router

app.include_router(whatsapp_router, prefix="/whatsapp")



app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(router)
app.include_router(admin_router)

app.mount("/static", StaticFiles(directory="app/static"), name="static")

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
        