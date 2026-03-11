import hashlib
import logging
import re
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import get_settings

logger = logging.getLogger(__name__)
from app.models.conversation import Conversation, ConversationStatus
from app.models.message import Message, MessageDirection, MessageType
from app.models.attendant import Attendant
from app.models.instance import Instance
from app.services.wppconnect_service import send_text_message


def _normalize_webhook_data(data: Any) -> List[Dict[str, Any]]:
    """Normaliza data do webhook open-wa / WPPConnect: aceita lista, objeto ou wrapper."""
    if data is None:
        return []
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        if "chatId" in data or "from" in data or data.get("wid"):
            return [data]
        wrapped = data.get("data") or data.get("message") or data.get("payload")
        if isinstance(wrapped, dict) and ("chatId" in wrapped or "from" in wrapped):
            return [wrapped]
        if isinstance(wrapped, list) and wrapped:
            return wrapped
        return [data]
    return []


def _extract_text_wpp(msg_data: Dict[str, Any]) -> Optional[str]:
    """Extrai texto de uma mensagem open-wa."""
    body = msg_data.get("body")
    if body and isinstance(body, str):
        return body
    content = msg_data.get("content")
    if content and isinstance(content, str):
        return content
    caption = msg_data.get("caption")
    if caption and isinstance(caption, str):
        return caption
    return None


def _get_message_type_wpp(msg_data: Dict[str, Any]) -> MessageType:
    """Determina o tipo de mensagem a partir do payload open-wa."""
    msg_type = str(msg_data.get("type", "")).lower()
    if msg_type == "image" or msg_data.get("isMedia") and "image" in str(msg_data.get("mimetype", "")):
        return MessageType.image
    if msg_type == "video" or msg_data.get("isMedia") and "video" in str(msg_data.get("mimetype", "")):
        return MessageType.video
    if msg_type in ("audio", "ptt"):
        return MessageType.audio
    if msg_type == "document":
        return MessageType.document
    if msg_type == "sticker":
        return MessageType.sticker
    if msg_type == "location" or msg_type == "vcard":
        return MessageType.location
    if msg_type in ("chat", ""):
        return MessageType.text
    return MessageType.other


def _normalize_phone(jid: str) -> str:
    return jid.split("@")[0].split(":")[0]


def _digits_only(s: Optional[str]) -> str:
    if not s:
        return ""
    return re.sub(r"\D+", "", str(s).strip())


def _get_or_create_conversation(
    db: Session,
    contact_phone: str,
    contact_name: Optional[str],
    instance_id: int,
    attendant_id: Optional[int],
    now: datetime,
    is_group: bool = False,
    create_if_missing: bool = True,
    contact_jid: Optional[str] = None,
    contact_send_jid: Optional[str] = None,
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
    if not conv and contact_jid and contact_jid.endswith("@lid"):
        conv = (
            db.query(Conversation)
            .filter(
                Conversation.contact_jid == contact_jid,
                Conversation.instance_id == instance_id,
                Conversation.status == ConversationStatus.open,
            )
            .first()
        )
        if conv:
            conv.contact_phone = contact_phone
            if contact_send_jid:
                conv.contact_send_jid = contact_send_jid
            if contact_name and not conv.contact_name:
                conv.contact_name = contact_name
            conv.last_message_at = now
            return conv, False
    if not conv:
        if not create_if_missing:
            return None, False
        conv = Conversation(
            contact_phone=contact_phone,
            contact_jid=contact_jid,
            contact_send_jid=contact_send_jid,
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
        if contact_jid and not conv.contact_jid:
            conv.contact_jid = contact_jid
        if contact_send_jid and not conv.contact_send_jid:
            conv.contact_send_jid = contact_send_jid
        conv.last_message_at = now
        return conv, False


def _extract_message_id(msg_data: Dict[str, Any]) -> Optional[str]:
    """Extrai o ID unico da mensagem (open-wa / WPPConnect WA-JS)."""
    msg_id = msg_data.get("id")
    if isinstance(msg_id, dict):
        out = msg_id.get("_serialized") or msg_id.get("id")
        if out:
            return str(out)
        remote = msg_id.get("remote")
        mid = msg_id.get("id")
        if remote is not None and mid is not None:
            return f"{remote}_{mid}"
        if mid is not None:
            return str(mid)
    if isinstance(msg_id, str) and msg_id:
        return msg_id
    if msg_id is not None and not isinstance(msg_id, dict):
        return str(msg_id)
    mid = msg_data.get("messageId")
    if mid:
        return str(mid)
    from_jid = msg_data.get("from") or msg_data.get("wid") or ""
    if isinstance(from_jid, dict):
        from_jid = from_jid.get("_serialized") or ""
    t = msg_data.get("timestamp") or msg_data.get("t") or ""
    body = (msg_data.get("body") or msg_data.get("content") or "")[:200]
    if from_jid or body:
        raw = f"{from_jid}|{t}|{body}"
        return f"wpp_{hashlib.sha256(raw.encode()).hexdigest()[:32]}"
    return None


def _extract_chat_id(msg_data: Dict[str, Any]) -> str:
    """Extrai o chatId (remoteJid) do payload open-wa / WPPConnect."""
    chat_id = (
        msg_data.get("chatId")
        or msg_data.get("from")
        or msg_data.get("wid")
        or msg_data.get("author")
        or ""
    )
    if isinstance(chat_id, dict):
        return chat_id.get("_serialized") or chat_id.get("user") or ""
    return str(chat_id) if chat_id else ""


def _extract_from_me(msg_data: Dict[str, Any]) -> bool:
    """Extrai fromMe do payload open-wa."""
    from_me = msg_data.get("fromMe")
    if from_me is not None:
        return bool(from_me)
    msg_id = msg_data.get("id")
    if isinstance(msg_id, dict):
        return bool(msg_id.get("fromMe", False))
    return False


def _extract_sender_info(msg_data: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    """Retorna (sender_phone, sender_name) para mensagens de grupo."""
    sender = msg_data.get("sender") or msg_data.get("author") or {}
    if isinstance(sender, dict):
        sender_id = sender.get("id")
        if isinstance(sender_id, dict):
            phone = sender_id.get("user") or _normalize_phone(sender_id.get("_serialized", ""))
        elif isinstance(sender_id, str):
            phone = _normalize_phone(sender_id)
        else:
            phone = None
        name = sender.get("pushname") or sender.get("name") or sender.get("formattedName")
        return phone, name
    if isinstance(sender, str):
        return _normalize_phone(sender), None
    return None, None


def process_message_upsert(db: Session, instance_name: str, data: Any) -> Tuple[List[int], List[Tuple[str, str, str, str, str]], List[int]]:
    """Processa mensagens recebidas via webhook open-wa.
    Returns (new_conversation_ids, auto_messages_to_send, affected_conversation_ids).
    """
    instance = db.query(Instance).filter(Instance.instance_name == instance_name).first()
    if not instance:
        logger.warning("webhook: instancia nao encontrada instance_name=%r (crie instancia com esse nome)", instance_name)
        return [], [], []

    messages_data = _normalize_webhook_data(data)
    if get_settings().DEBUG and messages_data:
        for m in messages_data:
            msg_type = m.get("type", "unknown")
            logger.debug(f"webhook onmessage: instance={instance_name} type={msg_type}")

    new_conversation_ids: List[int] = []
    auto_messages_to_send: List[Tuple[str, str, str, str, str]] = []
    affected_conv_ids: List[int] = []
    for msg_data in messages_data:
        external_id = _extract_message_id(msg_data)
        if not external_id:
            if get_settings().DEBUG:
                logger.debug("webhook: mensagem ignorada sem id msg_data keys=%s", list(msg_data.keys())[:20])
            continue

        chat_id = _extract_chat_id(msg_data)
        if not chat_id or chat_id == "None":
            logger.warning(
                "webhook: mensagem sem chatId/from ignorada instance=%s keys=%s",
                instance_name,
                list(msg_data.keys())[:25],
            )
            continue
        from_me = _extract_from_me(msg_data)

        is_group = msg_data.get("isGroupMsg", False) or "@g.us" in chat_id

        existing = db.query(Message).filter(Message.evolution_id == external_id).first()
        if existing:
            if existing.conversation_id and existing.conversation_id not in affected_conv_ids:
                affected_conv_ids.append(existing.conversation_id)
            continue

        push_name = msg_data.get("notifyName") or (msg_data.get("sender") or {}).get("pushname") if isinstance(msg_data.get("sender"), dict) else None
        timestamp_raw = msg_data.get("timestamp") or msg_data.get("t") or 0
        timestamp = datetime.utcfromtimestamp(int(timestamp_raw)) if timestamp_raw else datetime.utcnow()

        direction = MessageDirection.outbound if from_me else MessageDirection.inbound
        msg_type = _get_message_type_wpp(msg_data)
        text = _extract_text_wpp(msg_data)

        contact_phone = _normalize_phone(chat_id)
        contact_jid = chat_id

        if is_group:
            contact_name = None
            sender_phone, sender_name = _extract_sender_info(msg_data) if not from_me else (None, None)
            attendant_id = None
        else:
            contact_name = push_name if not from_me else None
            sender_phone = None
            sender_name = None
            attendant = db.query(Attendant).filter(
                Attendant.instance_id == instance.id,
                Attendant.active == True,
            ).first()
            attendant_id = attendant.id if attendant else None

        conv, is_new = _get_or_create_conversation(
            db=db,
            contact_phone=contact_phone,
            contact_name=contact_name,
            instance_id=instance.id,
            attendant_id=attendant_id,
            now=timestamp,
            is_group=is_group,
            create_if_missing=(direction == MessageDirection.inbound),
            contact_jid=contact_jid,
        )

        if conv is None:
            continue

        if is_new and direction == MessageDirection.inbound and not is_group:
            new_conversation_ids.append(conv.id)
            if instance.auto_message_enabled and instance.auto_message_text:
                attendant_name = attendant.name if attendant else "Atendente"
                msg_text = instance.auto_message_text.replace("{nome_atendente}", attendant_name)
                send_phone = conv.contact_jid or chat_id or contact_phone
                auto_messages_to_send.append((
                    instance.api_url,
                    instance.api_key,
                    instance.instance_name,
                    send_phone,
                    msg_text,
                ))

        message = Message(
            evolution_id=external_id,
            conversation_id=conv.id,
            direction=direction,
            msg_type=msg_type,
            content=text,
            timestamp=timestamp,
            sender_phone=sender_phone,
            sender_name=sender_name,
        )
        db.add(message)
        affected_conv_ids.append(conv.id)

        if direction == MessageDirection.inbound:
            conv.inbound_count = (conv.inbound_count or 0) + 1
        else:
            conv.outbound_count = (conv.outbound_count or 0) + 1
            if not is_group and msg_type != MessageType.call and not conv.first_response_at:
                conv.first_response_at = timestamp
                delta = (timestamp - conv.opened_at).total_seconds()
                conv.first_response_time_seconds = delta

    db.commit()
    return new_conversation_ids, auto_messages_to_send, list(dict.fromkeys(affected_conv_ids))


def send_auto_message_task(api_url: str, token: str, session: str, contact_phone: str, msg_text: str) -> None:
    """Envia mensagem automatica em background via open-wa."""
    ok = send_text_message(api_url, token, session, contact_phone, msg_text)
    if ok:
        logger.info("Mensagem automatica enviada para %s (session=%s)", contact_phone, session)
    else:
        logger.warning("Falha ao enviar mensagem automatica para %s (session=%s)", contact_phone, session)


def process_groups_upsert(db: Session, instance_name: str, data: Any):
    """Trata eventos de grupo open-wa (onparticipantschanged etc)."""
    instance = db.query(Instance).filter(Instance.instance_name == instance_name).first()
    if not instance:
        return

    groups_data = data if isinstance(data, list) else [data]
    for group_data in groups_data:
        group_id = group_data.get("id") or group_data.get("chatId") or ""
        if isinstance(group_id, dict):
            group_id = group_id.get("_serialized", "")
        if not group_id:
            continue
        subject = group_data.get("subject") or group_data.get("name") or group_data.get("groupMetadata", {}).get("subject")
        picture_url = group_data.get("pictureUrl") or group_data.get("profilePicThumbObj", {}).get("img")

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
    outcome = CALL_STATUS_TO_OUTCOME.get(status, status or "Ligacao")
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
        label += " (video)"
    return label


def process_call_event(db: Session, instance_name: str, body: Any):
    """Trata evento 'incomingcall' do open-wa."""
    instance = db.query(Instance).filter(Instance.instance_name == instance_name).first()
    if not instance:
        return

    if not body or not isinstance(body, dict):
        return

    call_id = body.get("id") or body.get("peerJid")
    if not call_id:
        return

    external_id = f"call_{call_id}"
    existing = db.query(Message).filter(Message.evolution_id == external_id).first()

    contact_jid = body.get("peerJid") or body.get("from") or body.get("chatId") or ""
    contact_phone = _normalize_phone(contact_jid)
    if not contact_phone:
        return

    is_video = body.get("isVideo", False)
    is_group = body.get("isGroup", False)
    if is_group:
        return

    from_me = body.get("fromMe", False)
    timestamp = datetime.utcnow()

    status = body.get("offerCall", "offer")
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
            evolution_id=external_id,
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


def process_message_revoked(db: Session, instance_name: str, data: Any) -> List[int]:
    """Trata evento 'onrevokedmessage' do open-wa (mensagem apagada). Retorna lista de conversation_ids afetados."""
    if not data or not isinstance(data, dict):
        return []
    msg_id = data.get("refId") or data.get("msgId")
    if isinstance(msg_id, dict):
        msg_id = msg_id.get("_serialized") or msg_id.get("id")
    if not msg_id:
        return []
    msg = db.query(Message).filter(Message.evolution_id == msg_id).first()
    if msg:
        conv_id = msg.conversation_id
        msg.is_deleted = True
        db.commit()
        return [conv_id]
    return []


def process_message_ack(db: Session, instance_name: str, data: Any):
    """Trata evento 'onack' do open-wa (status de leitura/entrega)."""
    # Por enquanto apenas loga; pode ser expandido para rastrear status
    pass
