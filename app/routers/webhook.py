import asyncio
import logging
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services import webhook_service
from app.services.routing_service import route_conversation
from app.services import databricks_service
from app.services.wppconnect_service import store_qrcode
from app.core.events import broadcast
from app.models.instance import Instance

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhook", tags=["webhook"])


def _detect_event(body: dict) -> str:
    """Detecta o tipo de evento a partir do payload open-wa.

    O open-wa envia o objeto Message diretamente para o webhook.
    Eventos especiais (qr, STARTUP, etc) vem com campo 'event' ou 'namespace'.
    """
    # open-wa event flags (qr, STARTUP, MD_DETECT, etc.)
    if "event" in body:
        return body["event"]
    ns = body.get("namespace", "")
    if ns:
        return ns
    # incoming call has peerJid/offerCall fields
    if "peerJid" in body or "offerCall" in body:
        return "incomingcall"
    # message: has 'id', 'chatId' or 'from', 'body' or 'type'
    if "chatId" in body or "from" in body:
        return "onmessage"
    # Revoked message
    if "revokedMsgId" in body or "refId" in body:
        return "onrevokedmessage"
    # ACK/status update
    if "ack" in body and "id" in body and "body" not in body:
        return "onack"
    return "unknown"


async def _handle_openwa_webhook(
    body: dict,
    instance_name: str,
    background_tasks: BackgroundTasks,
    db: Session,
):
    """Processa webhook do open-wa Easy API."""
    event = _detect_event(body)
    if not isinstance(event, str):
        event = "unknown"
    event_lower = event.lower()
    if event in ("message", "Message", "messages", "onanymessage"):
        event = "onmessage"
        event_lower = "onmessage"

    # WPPConnect: payload pode ter chave "event" que sobrescrevia o nome do hook (functions.ts corrigido).
    # Ainda assim, tratar aqui evita 500 se cair em process_message_upsert com payload de presenca.
    _noop_events = {
        "onpresencechanged",
        "onparticipantschanged",
        "onreactionmessage",
        "onpollresponse",
        "onupdatelabel",
        "status-find",
        "phonecode",
        "closesession",
        "logoutsession",
        "session-logged",
    }
    if event_lower in _noop_events:
        return {"status": "ok", "event": event}

    # QR code event — open-wa envia "qr"/"qrUrl", WPPConnect Server envia "qrcode"/"QRCODE_UPDATED"
    if event in ("qr", "qrUrl", "qrcode", "QRCODE_UPDATED", "onqrcode"):
        raw = (
            body.get("data") or body.get("qr") or body.get("response")
            or body.get("qrUrl") or body.get("qrcode") or ""
        )
        # WPPConnect envia data como dict: {"data": {"base64Image": "...", "urlCode": "..."}}
        if isinstance(raw, dict):
            raw = raw.get("base64Image") or raw.get("base64") or raw.get("urlCode") or raw.get("qrcode") or ""
        qr_data = str(raw) if raw else ""
        if qr_data and len(qr_data) > 50:
            store_qrcode(instance_name, qr_data)
            # WEBHOOK_GLOBAL_URL costuma ser /webhook/default; a sessao real pode vir no body.
            # Gravar tambem sob session/instance evita 503 quando instance_name no banco != path.
            extra_keys = []
            for k in ("session", "instance", "instanceName", "sessionName"):
                v = body.get(k)
                if v and str(v) != instance_name:
                    extra_keys.append(str(v))
            data_obj = body.get("data")
            if isinstance(data_obj, dict):
                for k in ("session", "instance", "instanceName"):
                    v = data_obj.get(k)
                    if v and str(v) not in extra_keys and str(v) != instance_name:
                        extra_keys.append(str(v))
            for key in extra_keys:
                store_qrcode(key, qr_data)
            await broadcast({"type": "qr_code", "instance": instance_name})
        return {"status": "ok", "event": event}

    # open-wa startup/status events
    if event in ("STARTUP", "MD_DETECT", "qrUrl", "CONNECTED"):
        logger.info("open-wa event=%s instance=%s", event, instance_name)
        if event == "CONNECTED":
            await broadcast({"type": "connected", "instance": instance_name})
        return {"status": "ok", "event": event}

    # open-wa sends message data directly in the body
    msg_data = body

    if event in ("onmessage", "onselfmessage"):
        instance_obj = db.query(Instance).filter(Instance.instance_name == instance_name).first()
        new_ids, auto_messages, affected_ids = webhook_service.process_message_upsert(db, instance_name, msg_data)
        if instance_obj:
            async def _publish_raw_safe(b, name, iid, ev):
                try:
                    from app.modules.events.webhook_adapter import publish_webhook_as_raw
                    await publish_webhook_as_raw(b, name, iid, ev)
                except Exception as e:
                    logger.warning("publish_webhook_as_raw (async): %s", e)
            asyncio.create_task(_publish_raw_safe(body, instance_name, str(instance_obj.id), event))
        await broadcast({"type": "new_message", "instance": instance_name, "conversation_ids": affected_ids})
        for cid in new_ids:
            background_tasks.add_task(route_conversation, cid)
        for api_url, api_key, inst_name, phone, text in auto_messages:
            background_tasks.add_task(webhook_service.send_auto_message_task, api_url, api_key, inst_name, phone, text)

        # Check inbound messages for Databricks keyword trigger
        if instance_obj and not body.get("fromMe") and not body.get("isGroupMsg"):
            text = body.get("body") or ""
            chat_id = body.get("chatId") or body.get("from") or ""
            phone = str(chat_id).split("@")[0].split(":")[0]
            if text and phone:
                databricks_service.check_and_trigger(db, instance_obj.id, phone, text)

    elif event == "onrevokedmessage":
        affected_ids = webhook_service.process_message_revoked(db, instance_name, body) or []
        await broadcast({"type": "message_updated", "instance": instance_name, "conversation_ids": affected_ids})

    elif event == "incomingcall":
        webhook_service.process_call_event(db, instance_name, body)
        await broadcast({"type": "new_call", "instance": instance_name})

    elif event == "onack":
        webhook_service.process_message_ack(db, instance_name, body)

    elif event == "unknown":
        if body.get("from") or body.get("chatId") or body.get("wid"):
            logger.info(
                "webhook: event unknown mas parece mensagem; tentando onmessage instance=%s",
                instance_name,
            )
            instance_obj = db.query(Instance).filter(Instance.instance_name == instance_name).first()
            new_ids, auto_messages, affected_ids = webhook_service.process_message_upsert(
                db, instance_name, body
            )
            if instance_obj:
                async def _publish_raw_unknown(b, name, iid):
                    try:
                        from app.modules.events.webhook_adapter import publish_webhook_as_raw
                        await publish_webhook_as_raw(b, name, iid, "onmessage")
                    except Exception as e:
                        logger.warning("publish_webhook_as_raw unknown (async): %s", e)
                asyncio.create_task(_publish_raw_unknown(body, instance_name, str(instance_obj.id)))
            await broadcast(
                {"type": "new_message", "instance": instance_name, "conversation_ids": affected_ids}
            )
            for cid in new_ids:
                background_tasks.add_task(route_conversation, cid)
            for item in auto_messages:
                background_tasks.add_task(webhook_service.send_auto_message_task, *item)
        else:
            logger.warning(
                "webhook: event unknown instance=%s keys=%s",
                instance_name,
                list(body.keys())[:30] if isinstance(body, dict) else type(body),
            )

    return {"status": "ok", "event": event}


@router.post("/{path:path}")
async def receive_webhook(
    path: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Instance name from URL path (ex: /webhook/default)
    instance_name = path.split("/")[0] if path else ""

    # Also check body for instance/session fields (compat)
    if not instance_name:
        instance_name = body.get("instance") or body.get("session") or body.get("instanceName") or ""
    if not instance_name:
        raise HTTPException(status_code=400, detail="Instance name required")

    return await _handle_openwa_webhook(body, instance_name, background_tasks, db)
