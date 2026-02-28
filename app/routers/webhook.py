from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.webhook import WebhookPayload
from app.services import webhook_service

router = APIRouter(prefix="/webhook", tags=["webhook"])


@router.post("/{path:path}")
async def receive_webhook(
    path: str,
    request: Request,
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
        webhook_service.process_message_upsert(db, instance_name, body.get("data"))
    elif event == "messages.update":
        webhook_service.process_message_update(db, instance_name, body.get("data"))
    elif event in ("groups.upsert", "groups.update"):
        webhook_service.process_groups_upsert(db, instance_name, body.get("data"))
    elif event == "call":
        webhook_service.process_call_event(db, instance_name, body)

    return {"status": "ok", "event": event}
