import asyncio
import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.core.events import subscribe, unsubscribe

router = APIRouter(prefix="/api", tags=["events"])


@router.get("/events")
async def sse_stream():
    async def generate():
        q = subscribe()
        try:
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=30)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield 'data: {"type":"heartbeat"}\n\n'
        except asyncio.CancelledError:
            pass
        finally:
            unsubscribe(q)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
