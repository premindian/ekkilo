from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # order_id → list of websockets
        self.connections = {}

        # 🔥 separate admin channel
        self.admin_connections = []

    async def connect(self, order_id: int, websocket: WebSocket):
        await websocket.accept()

        if order_id == 0:
            self.admin_connections.append(websocket)
            print(f"🟢 ADMIN CONNECTED | total: {len(self.admin_connections)}")
            return

        if order_id not in self.connections:
            self.connections[order_id] = []

        self.connections[order_id].append(websocket)

        print(f"🟢 Connected to order {order_id} | total: {len(self.connections[order_id])}")

    def disconnect(self, order_id: int, websocket: WebSocket):
        if order_id == 0:
            if websocket in self.admin_connections:
                self.admin_connections.remove(websocket)
            print("🔴 Admin disconnected")
            return

        if order_id in self.connections:
            if websocket in self.connections[order_id]:
                self.connections[order_id].remove(websocket)

            if not self.connections[order_id]:
                del self.connections[order_id]

        print(f"🔴 Disconnected from order {order_id}")

    async def broadcast(self, order_id: int, message: dict):
        # 🔥 order specific + admin
        targets = self.connections.get(order_id, []) + self.admin_connections

        disconnected = []

        for ws in targets:
            try:
                await ws.send_json(message)
            except Exception as e:
                print("⚠️ Removing dead connection:", e)
                disconnected.append(ws)

        # cleanup
        for ws in disconnected:
            if ws in self.admin_connections:
                self.admin_connections.remove(ws)
            else:
                for oid, conns in self.connections.items():
                    if ws in conns:
                        conns.remove(ws)

        print(f"📡 Broadcast order {order_id} → {len(targets)} clients")


manager = ConnectionManager()