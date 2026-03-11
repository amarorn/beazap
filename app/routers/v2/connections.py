"""V2 Connections API - start/validate WPPConnect session."""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import get_settings
from app.modules.connections.service import get_connection, get_connection_by_session
from app.modules.providers.wppconnect import WppConnectProvider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v2/connections", tags=["v2-connections"])


class StartRequest(BaseModel):
    tenant_id: str
    connection_id: str
    session_name: str


class StartResponse(BaseModel):
    status: str
    qr_code: str | None = None
    error: str | None = None


@router.post("/start", response_model=StartResponse)
async def start_connection(req: StartRequest, db: Session = Depends(get_db)):
    """Inicia/valida sessao WPPConnect. Retorna status e qr_code quando aplicavel."""
    settings = get_settings()
    conn = get_connection(db, req.connection_id, req.tenant_id)
    if not conn:
        conn = get_connection_by_session(db, req.session_name)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    api_url = conn.api_url or settings.WPPCONNECT_API_URL
    api_key = conn.api_key or settings.WPPCONNECT_API_KEY
    session_name = conn.instance_name
    provider = WppConnectProvider(base_url=api_url, api_key=api_key)
    result = await provider.connect(session_name)
    return StartResponse(
        status=result["status"],
        qr_code=result.get("qr_code"),
        error=result.get("error"),
    )
