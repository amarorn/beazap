"""Worker: consume wa.raw-events, apply idempotency, persist message, publish normalized."""
import asyncio
import logging
import os
import re
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.infrastructure.kafka import consume
from app.infrastructure.logging import setup_logging
from app.modules.events.bus import TOPIC_RAW, TOPIC_NORMALIZED, publish_normalized

setup_logging(service="message-processor")

logger = logging.getLogger(__name__)

engine = create_engine(settings.DATABASE_URL)
Session = sessionmaker(bind=engine)


def _extract_msg_id(payload: dict) -> str | None:
    mid = payload.get("id")
    if isinstance(mid, dict):
        return mid.get("_serialized") or str(mid.get("id", ""))
    return str(mid) if mid else None


def _extract_chat_id(payload: dict) -> str:
    cid = payload.get("chatId") or payload.get("from") or ""
    if isinstance(cid, dict):
        return cid.get("_serialized", "")
    return str(cid)


def _extract_text(payload: dict) -> str | None:
    return payload.get("body") or payload.get("content") or payload.get("caption")


def _extract_from_me(payload: dict) -> bool:
    return bool(payload.get("fromMe", False))


def _is_group(chat_id: str, payload: dict) -> bool:
    return payload.get("isGroupMsg", False) or "@g.us" in chat_id


def _normalize_phone(jid: str) -> str:
    return re.sub(r"\D+", "", str(jid).split("@")[0].split(":")[0]) or str(jid)


def process_raw_event(db, raw: dict) -> dict | None:
    """Process raw event: idempotency, persist, return normalized event or None."""
    provider = raw.get("provider", "wppconnect")
    tenant_id = raw.get("tenant_id", "1")
    connection_id = raw.get("connection_id", "")
    payload = raw.get("payload", {})
    body = payload.get("body") if isinstance(payload.get("body"), dict) else payload
    if not body:
        body = payload
    event_type = body.get("event") or payload.get("event") or "onmessage"
    if event_type not in ("onmessage", "onselfmessage"):
        return None
    event_key = raw.get("event_key", "")
    if not event_key:
        return None
    try:
        existing = db.execute(
            text("SELECT 1 FROM processed_events WHERE provider = :p AND event_key = :k"),
            {"p": provider, "k": event_key},
        ).first()
        if existing:
            return None
    except Exception:
        pass
    try:
        db.execute(
            text("INSERT INTO processed_events (provider, event_key) VALUES (:p, :k)"),
            {"p": provider, "k": event_key},
        )
        db.commit()
    except Exception as e:
        db.rollback()
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            return None
        raise
    conn_id = int(connection_id) if connection_id.isdigit() else None
    if not conn_id:
        return None
    provider_msg_id = _extract_msg_id(body)
    if not provider_msg_id:
        return None
    chat_id = _extract_chat_id(body)
    phone = _normalize_phone(chat_id)
    text = _extract_text(body)
    from_me = _extract_from_me(body)
    is_group = _is_group(chat_id, body)
    sender_phone = (body.get("sender") or {}).get("id") if isinstance(body.get("sender"), dict) else None
    if isinstance(sender_phone, dict):
        sender_phone = sender_phone.get("user") or _normalize_phone(str(sender_phone.get("_serialized", "")))
    sender_name = (body.get("sender") or {}).get("pushname") if isinstance(body.get("sender"), dict) else None
    contact_name = body.get("notifyName")
    from app.models.conversation import Conversation, ConversationStatus
    from app.models.contact import Contact
    from app.models.message import Message, MessageDirection, MessageType
    from datetime import datetime

    contact = db.query(Contact).filter(
        Contact.instance_id == conn_id,
        Contact.contact_phone == phone,
    ).first()
    if not contact:
        contact = Contact(instance_id=conn_id, contact_phone=phone, contact_name=contact_name, contact_jid=chat_id)
        db.add(contact)
        db.flush()
    conv = (
        db.query(Conversation)
        .filter(
            Conversation.instance_id == conn_id,
            Conversation.contact_phone == phone,
            Conversation.status == ConversationStatus.open,
        )
        .first()
    )
    if not conv:
        conv = Conversation(
            contact_phone=phone,
            contact_name=contact_name,
            contact_jid=chat_id,
            instance_id=conn_id,
            status=ConversationStatus.open,
            opened_at=datetime.utcnow(),
            last_message_at=datetime.utcnow(),
            is_group=is_group,
        )
        db.add(conv)
        db.flush()
    existing_msg = db.query(Message).filter(Message.evolution_id == provider_msg_id).first()
    if existing_msg:
        return {
            "event_type": "message.received",
            "tenant_id": tenant_id,
            "connection_id": connection_id,
            "conversation_id": conv.id,
            "contact_id": contact.id,
            "message_id": existing_msg.id,
            "direction": "inbound",
            "text": existing_msg.content,
            "occurred_at": datetime.utcnow().isoformat() + "Z",
        }
    direction = MessageDirection.outbound if from_me else MessageDirection.inbound
    msg = Message(
        evolution_id=provider_msg_id,
        conversation_id=conv.id,
        direction=direction,
        msg_type=MessageType.text,
        content=text,
        timestamp=datetime.utcnow(),
        sender_phone=str(sender_phone) if sender_phone else None,
        sender_name=sender_name,
    )
    db.add(msg)
    if direction == MessageDirection.inbound:
        conv.inbound_count = (conv.inbound_count or 0) + 1
    else:
        conv.outbound_count = (conv.outbound_count or 0) + 1
    conv.last_message_at = datetime.utcnow()
    db.commit()
    db.refresh(msg)
    return {
        "event_type": "message.received",
        "tenant_id": tenant_id,
        "connection_id": connection_id,
        "conversation_id": conv.id,
        "contact_id": contact.id,
        "message_id": msg.id,
        "direction": "inbound",
        "text": text,
        "content_type": "text",
        "occurred_at": datetime.utcnow().isoformat() + "Z",
    }


async def run():
    bootstrap = getattr(settings, "KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
    async for topic, partition, offset, value in consume(
        [TOPIC_RAW],
        group_id="message-processor",
        bootstrap_servers=bootstrap,
    ):
        try:
            db = Session()
            try:
                evt = process_raw_event(db, value)
                if evt:
                    await publish_normalized(evt)
                    logger.info(
                        "Processed raw event message_id=%s connection_id=%s",
                        evt.get("message_id"),
                        evt.get("connection_id"),
                    )
            finally:
                db.close()
        except Exception as e:
            logger.exception("message_processor error: %s", e)


if __name__ == "__main__":
    asyncio.run(run())
