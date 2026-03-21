from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # order_id ? list of websockets
        self.connections = {}

    async def connect(self, order_id: int, websocket: WebSocket):
        await websocket.accept()

        if order_id not in self.connections:
            self.connections[order_id] = []

        self.connections[order_id].append(websocket)
        print("?? CONNECTED:", self.connections.keys())   # ADD THIS
        print(f"?? Connected to {order_id} | total: {len(self.connections[order_id])}")

    def disconnect(self, order_id: int, websocket: WebSocket):
        if order_id in self.connections:
            if websocket in self.connections[order_id]:
                self.connections[order_id].remove(websocket)

            if not self.connections[order_id]:
                del self.connections[order_id]

        print(f"? Disconnected from {order_id}")

    async def broadcast(self, order_id: int, message: dict):
        targets = self.connections.get(order_id, []) + self.connections.get(0, [])

        disconnected = []

        for ws in targets:
            try:
                await ws.send_json(message)
            except Exception as e:
                print("?? Removing dead connection:", e)
                disconnected.append(ws)

        # cleanup
        for ws in disconnected:
            if order_id in self.connections and ws in self.connections[order_id]:
                self.disconnect(order_id, ws)
            elif 0 in self.connections and ws in self.connections[0]:
                self.disconnect(0, ws)

        print(f"?? Broadcast order {order_id} ? {len(targets)} clients")


manager = ConnectionManager()