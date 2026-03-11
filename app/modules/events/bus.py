"""Event bus - publishes to Kafka topics."""
import logging
from typing import Optional

from app.infrastructure.kafka import get_producer, produce

logger = logging.getLogger(__name__)

TOPIC_RAW = "wa.raw-events"
TOPIC_NORMALIZED = "wa.normalized-events"
TOPIC_OUTBOUND_REQUESTED = "message.outbound.requested"
TOPIC_OUTBOUND_SENT = "message.outbound.sent"
TOPIC_OUTBOUND_FAILED = "message.outbound.failed"

_producer: Optional[object] = None


async def get_event_producer():
    global _producer
    if _producer is None:
        from app.core.config import get_settings
        settings = get_settings()
        bootstrap = getattr(settings, "KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
        _producer = await get_producer(bootstrap_servers=bootstrap)
        await _producer.start()
    return _producer


async def publish_raw(event_key: str, tenant_id: str, connection_id: str, payload: dict) -> None:
    p = await get_event_producer()
    await produce(p, TOPIC_RAW, {
        "provider": "wppconnect",
        "tenant_id": tenant_id,
        "connection_id": connection_id,
        "event_key": event_key,
        "payload": payload,
        "occurred_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }, key=event_key.encode() if event_key else None)


async def publish_normalized(event: dict) -> None:
    p = await get_event_producer()
    await produce(p, TOPIC_NORMALIZED, event)


async def publish_outbound_requested(event: dict) -> None:
    p = await get_event_producer()
    await produce(p, TOPIC_OUTBOUND_REQUESTED, event, key=str(event.get("message_id", "")).encode())


async def publish_outbound_sent(event: dict) -> None:
    p = await get_event_producer()
    await produce(p, TOPIC_OUTBOUND_SENT, event)


async def publish_outbound_failed(event: dict) -> None:
    p = await get_event_producer()
    await produce(p, TOPIC_OUTBOUND_FAILED, event)


async def shutdown_event_producer() -> None:
    global _producer
    if _producer:
        await _producer.stop()
        _producer = None
