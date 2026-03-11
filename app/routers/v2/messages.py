"""V2 Messages API - send message (async, event-driven)."""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import get_settings
from app.modules.connections.service import get_connection
from app.modules.messaging.service import create_pending_outbound
from app.modules.events.bus import publish_outbound_requested

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v2/messages", tags=["v2-messages"])


class SendRequest(BaseModel):
    tenant_id: str
    connection_id: str
    phone_number: str
    text: str


class SendResponse(BaseModel):
    message_id: int
    status: str = "pending"


@router.post("/send", response_model=SendResponse)
async def send_message(req: SendRequest, db: Session = Depends(get_db)):
    """Cria mensagem outbound com status=pending, publica message.outbound.requested."""
    settings = get_settings()
    tenant_id = req.tenant_id or settings.DEFAULT_TENANT_ID
    conn = get_connection(db, req.connection_id, tenant_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    try:
        msg = create_pending_outbound(
            db, tenant_id, conn.id, req.phone_number, req.text,
        )
        db.commit()
        db.refresh(msg)
    except Exception as e:
        db.rollback()
        logger.exception("create_pending_outbound failed")
        raise HTTPException(status_code=500, detail=str(e))
    event = {
        "message_id": msg.id,
        "tenant_id": tenant_id,
        "connection_id": str(conn.id),
        "phone_number": req.phone_number,
        "text": req.text,
        "requested_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }
    try:
        await publish_outbound_requested(event)
    except Exception as e:
        logger.warning("publish_outbound_requested failed (message saved): %s", e)
    return SendResponse(message_id=msg.id, status="pending")
