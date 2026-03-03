import logging
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Any, Dict, Optional

from app.core.config import get_settings
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


def _get_call_log(message_content: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not message_content:
        return None
    if "callLogMessage" in message_content:
        return message_content["callLogMessage"]
    if "callLogMesssage" in message_content:
        return message_content["callLogMesssage"]
    protocol = message_content.get("protocolMessage", {})
    if isinstance(protocol, dict):
        if "callLogMessage" in protocol:
            return protocol["callLogMessage"]
        if "callLogMesssage" in protocol:
            return protocol["callLogMesssage"]
    return None


def _format_call_content(call_log: Dict[str, Any], from_me: bool) -> str:
    outcome = call_log.get("callOutcome")
    duration = call_log.get("durationSecs")
    is_video = call_log.get("isVideo", False)
    if isinstance(duration, dict):
        duration = duration.get("low") or duration.get("high") or 0
    outcome_map = {
        "CONNECTED": "Atendida",
        "MISSED": "Perdida",
        "FAILED": "Falhou",
        "REJECTED": "Rejeitada",
        "ACCEPTED_ELSEWHERE": "Atendida em outro dispositivo",
        "ONGOING": "Em andamento",
        "SILENCED_BY_DND": "Silenciada (não perturbe)",
        "SILENCED_UNKNOWN_CALLER": "Silenciada (desconhecido)",
    }
    label = outcome_map.get(str(outcome), str(outcome) if outcome else "Ligação")
    parts = [label]
    if duration and int(duration) > 0:
        parts.append(f"{int(duration)}s")
    if is_video:
        parts.append("(vídeo)")
    direction = "Enviada" if from_me else "Recebida"
    return f"{direction}: {' '.join(parts)}"


def _get_message_type(message_content: Dict[str, Any]) -> MessageType:
    if not message_content:
        return MessageType.other
    if _get_call_log(message_content):
        return MessageType.call
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
    create_if_missing: bool = True,
) -> tuple:
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
        if not create_if_missing:
            return None, False
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
        return conv, True
    else:
        if contact_name and not conv.contact_name:
            conv.contact_name = contact_name
        if attendant_id and not conv.attendant_id:
            conv.attendant_id = attendant_id
        conv.last_message_at = now
        return conv, False


def process_message_upsert(db: Session, instance_name: str, data: Any) -> list:
    """Returns list of newly created conversation IDs (inbound only) for team routing."""
    instance = db.query(Instance).filter(Instance.instance_name == instance_name).first()
    if not instance:
        return []

    messages_data = data if isinstance(data, list) else [data]
    if get_settings().DEBUG and messages_data:
        logger = logging.getLogger(__name__)
        for m in messages_data:
            content = m.get("message") or {}
            keys = list(content.keys()) if content else []
            msg_type = "call" if _get_call_log(content) else (keys[0] if keys else "empty")
            logger.debug(f"webhook messages.upsert: instance={instance_name} type={msg_type} keys={keys[:5]}")

    new_conversation_ids: list = []
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
        msg_type = _get_message_type(message_content)
        call_log = _get_call_log(message_content) if msg_type == MessageType.call else None
        if call_log:
            text = _format_call_content(call_log, from_me)
        else:
            text = _extract_text(message_content)

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

        # Outbound messages from webhook never create a new conversation —
        # they should only be appended to an existing open one.
        conv, is_new = _get_or_create_conversation(
            db=db,
            contact_phone=contact_phone,
            contact_name=contact_name,
            instance_id=instance.id,
            attendant_id=attendant_id,
            now=timestamp,
            is_group=is_group,
            create_if_missing=(direction == MessageDirection.inbound),
        )

        if conv is None:
            # Outbound message with no matching open conversation — skip
            continue

        if is_new and direction == MessageDirection.inbound and not is_group:
            new_conversation_ids.append(conv.id)

        call_outcome = None
        call_duration_secs = None
        is_video_call = None
        if call_log:
            call_outcome = str(call_log.get("callOutcome", "")) if call_log.get("callOutcome") else None
            dur = call_log.get("durationSecs")
            if dur is not None:
                call_duration_secs = int(dur) if not isinstance(dur, dict) else int(dur.get("low") or dur.get("high") or 0)
            is_video_call = call_log.get("isVideo")

        message = Message(
            evolution_id=evolution_id,
            conversation_id=conv.id,
            direction=direction,
            msg_type=msg_type,
            content=text,
            timestamp=timestamp,
            sender_phone=sender_phone,
            sender_name=sender_name,
            call_outcome=call_outcome,
            call_duration_secs=call_duration_secs,
            is_video_call=is_video_call,
        )
        db.add(message)

        if direction == MessageDirection.inbound:
            conv.inbound_count = (conv.inbound_count or 0) + 1
        else:
            conv.outbound_count = (conv.outbound_count or 0) + 1
            if not is_group and msg_type != MessageType.call and not conv.first_response_at:
                conv.first_response_at = timestamp
                delta = (timestamp - conv.opened_at).total_seconds()
                conv.first_response_time_seconds = delta

    db.commit()
    return new_conversation_ids


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


CALL_STATUS_TO_OUTCOME = {
    "offer": "INCOMING",
    "ringing": "RINGING",
    "reject": "REJECTED",
    "accept": "CONNECTED",
    "timeout": "MISSED",
    "failed": "FAILED",
}


def _format_call_event_content(status: str, is_video: bool, from_me: bool) -> str:
    outcome = CALL_STATUS_TO_OUTCOME.get(status, status or "Ligação")
    if from_me:
        label_map = {
            "INCOMING": "Enviada: Chamada iniciada",
            "RINGING": "Enviada: Tocando",
            "REJECTED": "Enviada: Rejeitada",
            "CONNECTED": "Enviada: Atendida",
            "MISSED": "Enviada: Perdida",
            "FAILED": "Enviada: Falhou",
        }
    else:
        label_map = {
            "INCOMING": "Recebida: Chamada recebida",
            "RINGING": "Recebida: Tocando",
            "REJECTED": "Recebida: Rejeitada",
            "CONNECTED": "Recebida: Atendida",
            "MISSED": "Recebida: Perdida",
            "FAILED": "Recebida: Falhou",
        }
    label = label_map.get(outcome, outcome)
    if is_video:
        label += " (vídeo)"
    return label


def process_call_event(db: Session, instance_name: str, body: Any):
    """Trata evento 'call' da Evolution API (ligações em tempo real)."""
    instance = db.query(Instance).filter(Instance.instance_name == instance_name).first()
    if not instance:
        return

    if not body or not isinstance(body, dict):
        return

    data = body.get("data") or body
    if not data or not isinstance(data, dict):
        return

    from_me = data.get("fromMe", body.get("fromMe", False))
    is_incoming = data.get("isIncoming", body.get("isIncoming"))
    if isinstance(from_me, str):
        from_me = from_me.lower() in ("true", "1", "yes")
    if is_incoming is not None:
        if isinstance(is_incoming, str):
            is_incoming = is_incoming.lower() in ("true", "1", "yes")
        from_me = not is_incoming

    call_id = data.get("id")
    if not call_id:
        return

    evolution_id = f"call_{call_id}"
    existing = db.query(Message).filter(Message.evolution_id == evolution_id).first()

    contact_jid = data.get("from") or data.get("chatId") or ""
    contact_phone = _normalize_phone(contact_jid)
    if not contact_phone:
        return

    status = data.get("status", "")
    is_video = data.get("isVideo", False)
    is_group = data.get("isGroup", False)
    if is_group:
        return

    date_val = data.get("date")
    if isinstance(date_val, str):
        try:
            ts = datetime.fromisoformat(date_val.replace("Z", "+00:00"))
            timestamp = ts.replace(tzinfo=None) if ts.tzinfo else ts
        except Exception:
            timestamp = datetime.utcnow()
    else:
        timestamp = datetime.utcnow()

    outcome = CALL_STATUS_TO_OUTCOME.get(status, status)
    content = _format_call_event_content(status, is_video, from_me)
    direction = MessageDirection.outbound if from_me else MessageDirection.inbound

    attendant = db.query(Attendant).filter(
        Attendant.instance_id == instance.id,
        Attendant.active == True,
    ).first()
    attendant_id = attendant.id if attendant else None

    conv, _ = _get_or_create_conversation(
        db=db,
        contact_phone=contact_phone,
        contact_name=None,
        instance_id=instance.id,
        attendant_id=attendant_id,
        now=timestamp,
        is_group=False,
    )

    if existing:
        existing.call_outcome = outcome
        existing.content = content
        existing.is_video_call = is_video
        existing.timestamp = timestamp
        existing.direction = direction
    else:
        message = Message(
            evolution_id=evolution_id,
            conversation_id=conv.id,
            direction=direction,
            msg_type=MessageType.call,
            content=content,
            timestamp=timestamp,
            call_outcome=outcome,
            call_duration_secs=None,
            is_video_call=is_video,
        )
        db.add(message)
        if direction == MessageDirection.inbound:
            conv.inbound_count = (conv.inbound_count or 0) + 1
        else:
            conv.outbound_count = (conv.outbound_count or 0) + 1

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
