import json
import logging
from typing import Set, Dict, Any
from fastapi import WebSocket

logger = logging.getLogger("raffle.websocket")

class WebSocketManager:
    """Manages active WebSocket connections for audience and controller clients."""

    def __init__(self):
        self.audience_connections: Set[WebSocket] = set()
        self.controller_connections: Set[WebSocket] = set()

    async def connect_audience(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.audience_connections.add(websocket)
        logger.info(f"Audience connected. Active audience connections: {len(self.audience_connections)}")

    def disconnect_audience(self, websocket: WebSocket) -> None:
        if websocket in self.audience_connections:
            self.audience_connections.remove(websocket)
            logger.info(f"Audience disconnected. Active audience connections: {len(self.audience_connections)}")

    async def connect_controller(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.controller_connections.add(websocket)
        logger.info(f"Controller connected. Active controller connections: {len(self.controller_connections)}")

    def disconnect_controller(self, websocket: WebSocket) -> None:
        if websocket in self.controller_connections:
            self.controller_connections.remove(websocket)
            logger.info(f"Controller disconnected. Active controller connections: {len(self.controller_connections)}")

    async def broadcast_to_audience(self, event_type: str, data: Dict[str, Any]) -> None:
        payload = json.dumps({"type": event_type, "data": data})
        stale_sockets = set()

        for connection in list(self.audience_connections):
            try:
                await connection.send_text(payload)
            except Exception as e:
                logger.warning(f"Error sending to audience socket: {e}")
                stale_sockets.add(connection)

        for socket in stale_sockets:
            self.disconnect_audience(socket)

    async def broadcast_to_controller(self, event_type: str, data: Dict[str, Any]) -> None:
        payload = json.dumps({"type": event_type, "data": data})
        stale_sockets = set()

        for connection in list(self.controller_connections):
            try:
                await connection.send_text(payload)
            except Exception as e:
                logger.warning(f"Error sending to controller socket: {e}")
                stale_sockets.add(connection)

        for socket in stale_sockets:
            self.disconnect_controller(socket)

    async def broadcast(self, event_type: str, data: Dict[str, Any]) -> None:
        """Broadcast an event to both audience and controller."""
        await self.broadcast_to_audience(event_type, data)
        await self.broadcast_to_controller(event_type, data)

ws_manager = WebSocketManager()
