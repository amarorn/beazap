from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.webhook import WebhookPayload
from app.services import webhook_service

router = APIRouter(prefix="/webhook", tags=["webhook"])


@router.post("/{instance_name}")
async def receive_webhook(
    instance_name: str,
    request: Request,
    db: Session = Depends(get_db),
):
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event = body.get("event", "")

    if event == "messages.upsert":
        webhook_service.process_message_upsert(db, instance_name, body.get("data"))
    elif event == "messages.update":
        webhook_service.process_message_update(db, instance_name, body.get("data"))

    return {"status": "ok", "event": event}
