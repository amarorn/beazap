from sqlalchemy.orm import Session
from datetime import datetime
from typing import Any, Dict, Optional

from app.models.conversation import Conversation, ConversationStatus
from app.models.message import Message, MessageDirection, MessageType
from app.models.attendant import Attendant
from app.models.instance import Instance


def _extract_text(message_content: Dict[str, Any]) -> Optional[str]:
    if not message_content:
        return None
    if "conversation" in message_content:
        return message_content["conversation"]
    if "extendedTextMessage" in message_content:
        return message_content["extendedTextMessage"].get("text")
    return None


def _get_message_type(message_content: Dict[str, Any]) -> MessageType:
    if not message_content:
        return MessageType.other
    if "imageMessage" in message_content:
        return MessageType.image
    if "videoMessage" in message_content:
        return MessageType.video
    if "audioMessage" in message_content or "pttMessage" in message_content:
        return MessageType.audio
    if "documentMessage" in message_content:
        return MessageType.document
    if "stickerMessage" in message_content:
        return MessageType.sticker
    if "locationMessage" in message_content:
        return MessageType.location
    return MessageType.text


def _normalize_phone(jid: str) -> str:
    return jid.split("@")[0].split(":")[0]


def _get_or_create_conversation(
    db: Session,
    contact_phone: str,
    contact_name: Optional[str],
    instance_id: int,
    attendant_id: Optional[int],
    now: datetime,
    is_group: bool = False,
) -> Conversation:
    conv = (
        db.query(Conversation)
        .filter(
            Conversation.contact_phone == contact_phone,
            Conversation.instance_id == instance_id,
            Conversation.status == ConversationStatus.open,
        )
        .first()
    )
    if not conv:
        conv = Conversation(
            contact_phone=contact_phone,
            contact_name=contact_name,
            instance_id=instance_id,
            attendant_id=attendant_id,
            status=ConversationStatus.open,
            opened_at=now,
            last_message_at=now,
            is_group=is_group,
        )
        db.add(conv)
        db.flush()
    else:
        if contact_name and not conv.contact_name:
            conv.contact_name = contact_name
        if attendant_id and not conv.attendant_id:
            conv.attendant_id = attendant_id
        conv.last_message_at = now
    return conv


def process_message_upsert(db: Session, instance_name: str, data: Any):
    instance = db.query(Instance).filter(Instance.instance_name == instance_name).first()
    if not instance:
        return

    messages_data = data if isinstance(data, list) else [data]

    for msg_data in messages_data:
        key = msg_data.get("key", {})
        evolution_id = key.get("id")
        remote_jid = key.get("remoteJid", "")
        from_me = key.get("fromMe", False)

        is_group = "@g.us" in remote_jid

        existing = db.query(Message).filter(Message.evolution_id == evolution_id).first()
        if existing:
            continue

        push_name = msg_data.get("pushName")
        message_content = msg_data.get("message") or {}
        timestamp_raw = msg_data.get("messageTimestamp", 0)
        timestamp = datetime.utcfromtimestamp(int(timestamp_raw)) if timestamp_raw else datetime.utcnow()

        direction = MessageDirection.outbound if from_me else MessageDirection.inbound
        text = _extract_text(message_content)
        msg_type = _get_message_type(message_content)

        if is_group:
            contact_phone = _normalize_phone(remote_jid)
            contact_name = None
            participant = key.get("participant", "")
            sender_phone = _normalize_phone(participant) if participant and not from_me else None
            sender_name = push_name if not from_me else None
            attendant_id = None
        else:
            contact_phone = _normalize_phone(remote_jid)
            contact_name = push_name if not from_me else None
            sender_phone = None
            sender_name = None
            attendant = db.query(Attendant).filter(
                Attendant.instance_id == instance.id,
                Attendant.active == True,
            ).first()
            attendant_id = attendant.id if attendant else None

        conv = _get_or_create_conversation(
            db=db,
            contact_phone=contact_phone,
            contact_name=contact_name,
            instance_id=instance.id,
            attendant_id=attendant_id,
            now=timestamp,
            is_group=is_group,
        )

        message = Message(
            evolution_id=evolution_id,
            conversation_id=conv.id,
            direction=direction,
            msg_type=msg_type,
            content=text,
            timestamp=timestamp,
            sender_phone=sender_phone,
            sender_name=sender_name,
        )
        db.add(message)

        if direction == MessageDirection.inbound:
            conv.inbound_count = (conv.inbound_count or 0) + 1
        else:
            conv.outbound_count = (conv.outbound_count or 0) + 1
            # Primeira resposta do atendente (somente para conversas individuais)
            if not is_group and not conv.first_response_at:
                conv.first_response_at = timestamp
                delta = (timestamp - conv.opened_at).total_seconds()
                conv.first_response_time_seconds = delta

    db.commit()


def process_groups_upsert(db: Session, instance_name: str, data: Any):
    """Trata eventos groups.upsert e groups.update — salva/atualiza nome e imagem do grupo."""
    instance = db.query(Instance).filter(Instance.instance_name == instance_name).first()
    if not instance:
        return

    groups_data = data if isinstance(data, list) else [data]
    for group_data in groups_data:
        group_id = group_data.get("id", "")
        if not group_id:
            continue
        subject = group_data.get("subject") or group_data.get("name")
        picture_url = group_data.get("pictureUrl") or group_data.get("picture")

        contact_phone = _normalize_phone(group_id)
        conv = (
            db.query(Conversation)
            .filter(
                Conversation.contact_phone == contact_phone,
                Conversation.instance_id == instance.id,
                Conversation.is_group == True,
            )
            .first()
        )
        if conv:
            if subject:
                conv.contact_name = subject
            if picture_url:
                conv.contact_avatar_url = picture_url

    db.commit()


def process_message_update(db: Session, instance_name: str, data: Any):
    updates = data if isinstance(data, list) else [data]
    for update in updates:
        key = update.get("key", {})
        evolution_id = key.get("id")
        status = update.get("update", {}).get("status")

        if evolution_id and status == "DELETED":
            msg = db.query(Message).filter(Message.evolution_id == evolution_id).first()
            if msg:
                msg.is_deleted = True

    db.commit()
