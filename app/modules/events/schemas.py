"""Event schemas for Kafka topics."""
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class RawEvent(BaseModel):
    """Payload for wa.raw-events."""
    provider: str = "wppconnect"
    tenant_id: str
    connection_id: str
    event_key: str
    payload: dict[str, Any]
    occurred_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")


class NormalizedEvent(BaseModel):
    """Payload for wa.normalized-events (event_type=message.received)."""
    event_type: str = "message.received"
    tenant_id: str
    connection_id: str
    conversation_id: int
    contact_id: int
    message_id: int
    direction: str = "inbound"
    text: Optional[str] = None
    content_type: str = "text"
    occurred_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")


class OutboundRequested(BaseModel):
    """Payload for message.outbound.requested."""
    message_id: int
    tenant_id: str
    connection_id: str
    phone_number: str
    text: str
    requested_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")


class OutboundSent(BaseModel):
    """Payload for message.outbound.sent."""
    message_id: int
    tenant_id: str
    connection_id: str
    provider_message_id: Optional[str] = None
    sent_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")


class OutboundFailed(BaseModel):
    """Payload for message.outbound.failed."""
    message_id: int
    tenant_id: str
    connection_id: str
    error: str
    failed_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
