"""Adapter: transform WPPConnect/open-wa webhook payload to raw event and publish."""
import hashlib
import json
import logging
from datetime import datetime
from typing import Any

from app.core.config import get_settings
from app.modules.events.bus import publish_raw

logger = logging.getLogger(__name__)


def _extract_event_key(payload: dict) -> str:
    """Generate idempotency key from message payload."""
    mid = payload.get("id")
    if isinstance(mid, dict):
        mid = mid.get("_serialized") or mid.get("id")
    if mid:
        return str(mid)
    raw = json.dumps(payload, sort_keys=True, default=str)[:500]
    return hashlib.sha256(raw.encode()).hexdigest()


def _normalize_payload(body: dict) -> dict:
    """Normalize WPPConnect/open-wa payload to standard shape."""
    if "payload" in body:
        return body["payload"]
    return body


async def publish_webhook_as_raw(
    body: dict,
    instance_name: str,
    connection_id: str,
    event_type: str,
) -> None:
    """Publish webhook payload to wa.raw-events. Safe to call; catches Kafka errors."""
    settings = get_settings()
    tenant_id = str(getattr(settings, "DEFAULT_TENANT_ID", "1"))
    payload = _normalize_payload(body)
    event_key = _extract_event_key(payload) if event_type in ("onmessage", "onselfmessage") else f"{event_type}_{datetime.utcnow().timestamp()}"
    try:
        await publish_raw(
            event_key=event_key,
            tenant_id=tenant_id,
            connection_id=connection_id,
            payload={"event": event_type, "session": instance_name, "body": payload},
        )
        logger.info("Published raw event event_key=%s connection_id=%s", event_key, connection_id)
    except Exception as e:
        logger.warning("Failed to publish raw event (Kafka may be down): %s", e)
