from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.webhook import WebhookPayload
from app.services import webhook_service
from app.services.routing_service import route_conversation
from app.services import databricks_service
from app.core.events import broadcast
from app.models.instance import Instance

EVENT_PATH_TO_EVENT = {
    "presence-update": "presence.update",
    "chats-update": "chats.update",
    "chats-upsert": "chats.upsert",
    "chats-set": "chats.set",
    "chats-delete": "chats.delete",
    "messages-upsert": "messages.upsert",
    "messages-update": "messages.update",
    "messages-delete": "messages.delete",
    "messages-set": "messages.set",
    "contacts-update": "contacts.update",
    "contacts-upsert": "contacts.upsert",
    "contacts-set": "contacts.set",
    "connection-update": "connection.update",
    "groups-upsert": "groups.upsert",
    "groups-update": "groups.update",
    "group-update": "group.update",
    "group-participants-update": "group.participants.update",
    "qrcode-updated": "qrcode.updated",
    "application-startup": "application.startup",
    "logout-instance": "logout.instance",
    "remove-instance": "remove.instance",
    "call": "call",
    "send-message": "send.message",
    "labels-association": "labels.association",
    "labels-edit": "labels.edit",
    "typebot-change-status": "typebot.change.status",
    "typebot-start": "typebot.start",
}

router = APIRouter(prefix="/webhook", tags=["webhook"])


def _kebab_to_dot(s: str) -> str:
    return s.replace("-", ".") if s else ""


async def _handle_webhook_body(
    body: dict,
    event: str,
    instance_name: str,
    background_tasks: BackgroundTasks,
    db: Session,
):
    if event == "messages.upsert":
        new_ids, auto_messages = webhook_service.process_message_upsert(db, instance_name, body.get("data"))
        await broadcast({"type": "new_message", "instance": instance_name})
        for cid in new_ids:
            background_tasks.add_task(route_conversation, cid)
        for api_url, api_key, inst_name, phone, text in auto_messages:
            background_tasks.add_task(webhook_service.send_auto_message_task, api_url, api_key, inst_name, phone, text)

        # Check inbound messages for Databricks keyword trigger
        instance_obj = db.query(Instance).filter(Instance.instance_name == instance_name).first()
        if instance_obj:
            messages_data = body.get("data") or []
            if not isinstance(messages_data, list):
                messages_data = [messages_data]
            for msg_data in messages_data:
                key = msg_data.get("key", {})
                if key.get("fromMe"):
                    continue
                remote_jid = key.get("remoteJid", "")
                if "@g.us" in remote_jid:
                    continue
                message_content = msg_data.get("message") or {}
                text = (
                    message_content.get("conversation")
                    or (message_content.get("extendedTextMessage") or {}).get("text")
                )
                if text:
                    phone = remote_jid.split("@")[0].split(":")[0]
                    databricks_service.check_and_trigger(db, instance_obj.id, phone, text)
    elif event == "messages.update":
        webhook_service.process_message_update(db, instance_name, body.get("data"))
        await broadcast({"type": "message_updated", "instance": instance_name})
    elif event in ("groups.upsert", "groups.update", "group.update", "group.participants.update"):
        webhook_service.process_groups_upsert(db, instance_name, body.get("data"))
        await broadcast({"type": "groups_updated", "instance": instance_name})
    elif event == "call":
        webhook_service.process_call_event(db, instance_name, body)
        await broadcast({"type": "new_call", "instance": instance_name})
    # presence.update, chats.update, contacts.update, connection.update, logout.instance, remove.instance - acknowledged

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

    instance_name = (
        body.get("instance") or body.get("instanceName") or (path.split("/")[0] if path else "")
    )
    if not instance_name:
        raise HTTPException(status_code=400, detail="Instance name required")

    event = body.get("event", "")
    if not event:
        first_seg = path.split("/")[0] if path else ""
        event = EVENT_PATH_TO_EVENT.get(first_seg, _kebab_to_dot(first_seg)) if first_seg else ""
    if not event and "/" in path:
        event = _kebab_to_dot(path.split("/", 1)[1])

    return await _handle_webhook_body(body, event, instance_name, background_tasks, db)


root_router = APIRouter(tags=["webhook-events"])


def _make_event_handler(event_path: str):
    async def handler(
        request: Request,
        background_tasks: BackgroundTasks,
        db: Session = Depends(get_db),
    ):
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON payload")
        instance_name = body.get("instance") or body.get("instanceName") or ""
        if not instance_name:
            raise HTTPException(status_code=400, detail="Instance name required")
        event = EVENT_PATH_TO_EVENT.get(event_path, _kebab_to_dot(event_path))
        return await _handle_webhook_body(body, event, instance_name, background_tasks, db)

    return handler


for ep in EVENT_PATH_TO_EVENT:
    root_router.add_api_route(f"/{ep}", _make_event_handler(ep), methods=["POST"])
