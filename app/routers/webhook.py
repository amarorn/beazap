from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.webhook import WebhookPayload
from app.services import webhook_service
from app.services.routing_service import route_conversation
from app.services import databricks_service
from app.core.events import broadcast
from app.models.instance import Instance

router = APIRouter(prefix="/webhook", tags=["webhook"])


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

    instance_name = path.split("/")[0] if path else ""
    if not instance_name:
        raise HTTPException(status_code=400, detail="Instance name required")

    event = body.get("event", "")
    if not event and "/" in path:
        event = path.split("/", 1)[1].replace("-", ".")

    if event == "messages.upsert":
        new_ids = webhook_service.process_message_upsert(db, instance_name, body.get("data"))
        await broadcast({"type": "new_message", "instance": instance_name})
        for cid in new_ids:
            background_tasks.add_task(route_conversation, cid)

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
    elif event in ("groups.upsert", "groups.update"):
        webhook_service.process_groups_upsert(db, instance_name, body.get("data"))
        await broadcast({"type": "groups_updated", "instance": instance_name})
    elif event == "call":
        webhook_service.process_call_event(db, instance_name, body)
        await broadcast({"type": "new_call", "instance": instance_name})

    return {"status": "ok", "event": event}
