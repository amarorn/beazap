"""Messaging service - create pending outbound, resolve contacts/conversations."""
import logging
import re
from datetime import datetime
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from app.models.conversation import Conversation, ConversationStatus
from app.models.contact import Contact
from app.models.message import Message, MessageDirection, MessageType
from app.models.instance import Instance

logger = logging.getLogger(__name__)


def _normalize_phone(jid: str) -> str:
    return re.sub(r"\D+", "", str(jid).split("@")[0].split(":")[0]) or str(jid)


def ensure_contact(
    db: Session,
    tenant_id: str,
    connection_id: int,
    phone_number: str,
    name: Optional[str] = None,
    jid: Optional[str] = None,
) -> Contact:
    """Get or create Contact."""
    phone = _normalize_phone(phone_number)
    c = db.query(Contact).filter(
        Contact.instance_id == connection_id,
        Contact.contact_phone == phone,
    ).first()
    if c:
        if name and not c.contact_name:
            c.contact_name = name
        if jid and not c.contact_jid:
            c.contact_jid = jid
        return c
    c = Contact(
        instance_id=connection_id,
        contact_phone=phone,
        contact_jid=jid,
        contact_name=name,
    )
    db.add(c)
    db.flush()
    return c


def ensure_conversation(
    db: Session,
    tenant_id: str,
    connection_id: int,
    contact_phone: str,
    contact_name: Optional[str] = None,
    contact_jid: Optional[str] = None,
    is_group: bool = False,
) -> Conversation:
    """Get or create open Conversation."""
    conv = (
        db.query(Conversation)
        .filter(
            Conversation.instance_id == connection_id,
            Conversation.contact_phone == contact_phone,
            Conversation.status == ConversationStatus.open,
        )
        .first()
    )
    if conv:
        return conv
    conv = Conversation(
        contact_phone=contact_phone,
        contact_name=contact_name,
        contact_jid=contact_jid,
        instance_id=connection_id,
        status=ConversationStatus.open,
        opened_at=datetime.utcnow(),
        last_message_at=datetime.utcnow(),
        is_group=is_group,
    )
    db.add(conv)
    db.flush()
    return conv


def create_pending_outbound(
    db: Session,
    tenant_id: str,
    connection_id: int,
    phone_number: str,
    text: str,
    contact_id: Optional[int] = None,
    conversation_id: Optional[int] = None,
) -> Message:
    """Create outbound message with status=pending. Idempotent by (connection, phone, text, ts_window)."""
    phone = _normalize_phone(phone_number)
    if not conversation_id:
        ensure_contact(db, tenant_id, connection_id, phone)
        conv = ensure_conversation(db, tenant_id, connection_id, phone)
        conversation_id = conv.id
    msg = Message(
        evolution_id=f"pending_{connection_id}_{datetime.utcnow().timestamp()}",
        conversation_id=conversation_id,
        direction=MessageDirection.outbound,
        msg_type=MessageType.text,
        content=text,
        timestamp=datetime.utcnow(),
        message_status="pending",
    )
    db.add(msg)
    db.flush()
    return msg


def persist_inbound_message(
    db: Session,
    tenant_id: str,
    connection_id: int,
    provider_message_id: str,
    phone_number: str,
    text: Optional[str],
    from_me: bool,
    is_group: bool,
    sender_phone: Optional[str] = None,
    sender_name: Optional[str] = None,
    contact_name: Optional[str] = None,
) -> Tuple[Optional[Message], Optional[Contact], Optional[Conversation]]:
    """Persist inbound message. Returns (message, contact, conversation)."""
    existing = db.query(Message).filter(Message.evolution_id == provider_message_id).first()
    if existing:
        return existing, None, None
    phone = _normalize_phone(phone_number)
    contact = ensure_contact(db, tenant_id, connection_id, phone, name=contact_name)
    conv = ensure_conversation(
        db, tenant_id, connection_id, contact.id, phone,
        contact_name=contact_name, is_group=is_group,
    )
    direction = MessageDirection.outbound if from_me else MessageDirection.inbound
    msg = Message(
        evolution_id=provider_message_id,
        conversation_id=conv.id,
        direction=direction,
        msg_type=MessageType.text,
        content=text,
        timestamp=datetime.utcnow(),
        sender_phone=sender_phone,
        sender_name=sender_name,
    )
    db.add(msg)
    if direction == MessageDirection.inbound:
        conv.inbound_count = (conv.inbound_count or 0) + 1
    else:
        conv.outbound_count = (conv.outbound_count or 0) + 1
    conv.last_message_at = datetime.utcnow()
    db.flush()
    return msg, contact, conv
