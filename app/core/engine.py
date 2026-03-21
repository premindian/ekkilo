from app.db.database import get_db
from app.core.ws_manager import manager


class Engine:
    def __init__(self, agents):
        self.agents = agents

        # ? Map agent ? status
        self.status_map = {
            "ListParser": "PARSED",
            "Matcher": "MATCHED",
            "Pricing": "PRICED",
            "Optimizer": "OPTIMIZED",
            "Dispatcher": "SENT"
        }

    async def run(self, context):
        db = await get_db()
        order_id = context.order_id

        for agent in self.agents:
            agent_name = agent.__class__.__name__
            print(f"?? Running {agent_name}...")

            # -----------------------------
            # ? RUN AGENT
            # -----------------------------
            context = await agent.run(context)

            # -----------------------------
            # ? MAP STATUS
            # -----------------------------
            status = self.status_map.get(agent_name)

            if not status:
                continue

            # -----------------------------
            # ? SAVE EVENT (DB)
            # -----------------------------
            await db.execute("""
                INSERT INTO order_events (order_id, status)
                VALUES ($1, $2)
            """, order_id, status)

            print(f"?? Event saved: {status}")

            # -----------------------------
            # ? WEBSOCKET BROADCAST
            # -----------------------------
            await manager.broadcast(order_id, {
                "type": "status_update",
                "order_id": order_id,
                "status": status
            })

            print(f"?? Broadcast: {status}")

        return context