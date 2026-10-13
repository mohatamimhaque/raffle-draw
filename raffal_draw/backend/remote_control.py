import asyncio
import time
from collections import OrderedDict
from typing import Any, Awaitable, Callable, Dict, Optional


class RemoteControl:
    """Runtime-only state for the Supabase transport layer."""

    def __init__(self):
        self.enabled = False
        self.next_draw_allowed = False
        self.device_connected = False
        self._processed_request_ids: OrderedDict[str, float] = OrderedDict()
        self._lock = asyncio.Lock()
        self._broadcast_callback: Optional[Callable[[str, Dict[str, Any]], Awaitable[None]]] = None

    def set_broadcast_callback(self, callback: Callable[[str, Dict[str, Any]], Awaitable[None]]) -> None:
        self._broadcast_callback = callback

    def state(self, drawing_in_progress: bool) -> Dict[str, Any]:
        return {
            "mobile_remote_enabled": self.enabled,
            "next_draw_allowed": self.next_draw_allowed,
            "draw_in_progress": drawing_in_progress,
            "device_connected": self.device_connected,
        }

    async def publish_state(self, drawing_in_progress: bool) -> None:
        if self._broadcast_callback:
            await self._broadcast_callback("remote_state", self.state(drawing_in_progress))

    async def set_enabled(self, enabled: bool, drawing_in_progress: bool) -> Dict[str, Any]:
        async with self._lock:
            self.enabled = enabled
            if not enabled:
                self.next_draw_allowed = False
                self.device_connected = False
        await self.publish_state(drawing_in_progress)
        return self.state(drawing_in_progress)

    async def set_next_draw_allowed(self, allowed: bool, drawing_in_progress: bool) -> Dict[str, Any]:
        async with self._lock:
            self.next_draw_allowed = allowed if self.enabled else False
        await self.publish_state(drawing_in_progress)
        return self.state(drawing_in_progress)

    async def handle_message(self, payload: Dict[str, Any], drawing_in_progress: bool) -> str:
        if payload.get("type") == "sync_request":
            self.device_connected = True
            await self.publish_state(drawing_in_progress)
            return "SYNCED"
        return "READY"

    async def claim_request(self, request_id: Any, drawing_in_progress: bool) -> str:
        if not isinstance(request_id, str) or len(request_id) > 100 or not request_id.strip():
            return "INVALID_REQUEST"
        now = time.monotonic()
        async with self._lock:
            while self._processed_request_ids and now - next(iter(self._processed_request_ids.values())) > 300:
                self._processed_request_ids.popitem(last=False)
            if request_id in self._processed_request_ids:
                return "DUPLICATE_REQUEST"
            self._processed_request_ids[request_id] = now
            if not self.enabled:
                return "MOBILE_REMOTE_DISABLED"
            if not self.next_draw_allowed:
                return "NEXT_DRAW_NOT_ALLOWED"
            if drawing_in_progress:
                return "DRAW_ALREADY_IN_PROGRESS"
            self.device_connected = True
            self.next_draw_allowed = False
        return "ACCEPTED"