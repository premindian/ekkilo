# imports
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
# routers
from app.api.routes import router
from app.api.admin import router as admin_router
from app.api.whatsapp import router as whatsapp_router
import os

app = FastAPI()

# include routers
app.include_router(router)
app.include_router(admin_router)
app.include_router(whatsapp_router, prefix="/whatsapp")

# -----------------------------------------
# ?? CORS (keep for now)
# -----------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------
# ?? ROUTERS (API FIRST - VERY IMPORTANT)
# -----------------------------------------
app.include_router(router)
app.include_router(admin_router)
app.include_router(whatsapp_router, prefix="/whatsapp")

# -----------------------------------------
# ?? STATIC (OLD - keep if needed)
# -----------------------------------------
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# -----------------------------------------
# ?? WEBSOCKETS
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


# -----------------------------------------
# ?? REACT BUILD SERVING (ADD THIS LAST)
# -----------------------------------------

# Serve React static files
app.mount("/assets", StaticFiles(directory="build/static"), name="assets")


@app.get("/")
async def serve_react():
    return FileResponse(os.path.join("build", "index.html"))


@app.get("/{full_path:path}")
async def serve_react_routes(full_path: str):
    """
    Catch-all for React routes
    MUST BE LAST
    """
    file_path = os.path.join("build", full_path)

    if os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)

    return FileResponse(os.path.join("build", "index.html"))