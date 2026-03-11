from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.instance import Instance
from app.models.attendant import Attendant, AttendantRole
from app.schemas.metrics import InstanceCreate, InstanceUpdate, AttendantCreate, AttendantUpdate
from app.services.wppconnect_service import (
    get_connection_state,
    get_qrcode,
    generate_token,
    normalize_qrcode_base64,
)
from app.services.email_service import send_qrcode_email
from app.core.config import get_settings
import httpx
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["instances"])


@router.get("/instances")
def list_instances(db: Session = Depends(get_db)):
    return db.query(Instance).filter(Instance.active == True).all()


@router.post("/instances")
async def create_instance(payload: InstanceCreate, db: Session = Depends(get_db)):
    settings = get_settings()
    default_url = getattr(settings, "WPPCONNECT_API_URL", None) or "http://localhost:21465"
    effective_api_url = (payload.api_url or "").strip() or default_url

    existing = db.query(Instance).filter(Instance.instance_name == payload.instance_name).first()
    if existing:
        if existing.active:
            raise HTTPException(status_code=400, detail="Ja existe uma instancia ativa com esse 'Instance name'. Use outro nome ou remova a instancia atual.")
        existing.name = payload.name
        existing.api_url = effective_api_url
        api_key = payload.api_key or ""
        if not api_key.strip():
            secret = getattr(settings, "WPPCONNECT_SECRET", "THISISMYSECURETOKEN")
            token = generate_token(effective_api_url, secret, payload.instance_name)
            if token:
                api_key = token
        existing.api_key = api_key or existing.api_key
        existing.phone_number = payload.phone_number
        existing.active = True
        db.commit()
        db.refresh(existing)
        instance = existing
    else:
        api_key = payload.api_key or ""
        if not api_key.strip():
            secret = getattr(settings, "WPPCONNECT_SECRET", "THISISMYSECURETOKEN")
            token = generate_token(effective_api_url, secret, payload.instance_name)
            if token:
                api_key = token
        db_data = payload.model_dump(exclude={"owner_email"})
        db_data["api_url"] = effective_api_url
        db_data["api_key"] = api_key or payload.api_key or ""
        instance = Instance(**db_data, owner_email=payload.owner_email)
        db.add(instance)
        db.commit()
        db.refresh(instance)

    # Try to get QR code from WPPConnect
    qrcode_img = None
    api_error = None
    try:
        qrcode_img = await get_qrcode(instance.api_url, instance.api_key, payload.instance_name)
    except Exception as e:
        api_error = str(e)

    # Send QR by email if requested and available
    email_sent = None
    if qrcode_img and payload.owner_email:
        email_sent = send_qrcode_email(payload.owner_email, payload.instance_name, qrcode_img)

    return {
        "id": instance.id,
        "name": instance.name,
        "instance_name": instance.instance_name,
        "api_url": instance.api_url,
        "api_key": instance.api_key,
        "phone_number": instance.phone_number,
        "active": instance.active,
        "created_at": instance.created_at,
        "qrcode": qrcode_img,
        "api_error": api_error,
        "email_sent": email_sent,
    }


@router.get("/instances/{instance_id}/qrcode")
async def get_instance_qrcode(instance_id: int, db: Session = Depends(get_db)):
    """Retorna QR code da sessao WPPConnect para esta instancia."""
    instance = db.query(Instance).filter(Instance.id == instance_id, Instance.active == True).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instancia nao encontrada")
    qrcode_img = await get_qrcode(instance.api_url, instance.api_key, instance.instance_name)
    if qrcode_img:
        return {"qrcode": qrcode_img}
    conn = await get_connection_state(
        instance.api_url or "", instance.api_key or "", instance.instance_name
    )
    if conn.get("state") == "open":
        return {"qrcode": None, "connected": True}
    logger.warning(
        "get_instance_qrcode 503 instance_id=%s instance_name=%s api_url=%s",
        instance_id, instance.instance_name, instance.api_url,
    )
    api_base = (instance.api_url or "").rstrip("/") or get_settings().WPPCONNECT_API_URL
    sess = instance.instance_name
    hint_webhook = (
        f" Para sessao '{sess}' defina webhook.url no wppconnect-server config apontando para "
        f"http://localhost:8000/webhook/{sess} e reinicie o server antes de gerar o QR."
    )
    raise HTTPException(
        status_code=503,
        detail=(
            f"QR indisponivel (WPPConnect {api_base}, sessao {sess}). "
            "Se ja conectou no celular, nao ha QR ate fazer logout na sessao. "
            "Se ainda nao conectou: suba o BeaZap antes do WPPConnect, confira webhook e api_key, "
            "e tente de novo em ate 90s."
            + (hint_webhook if sess != "default" else "")
        ),
    )


@router.post("/instances/{instance_id}/send-qrcode-email")
async def send_qrcode_email_endpoint(instance_id: int, payload: dict = {}, db: Session = Depends(get_db)):
    """Fetches a fresh QR code and emails it to the instance owner."""
    instance = db.query(Instance).filter(Instance.id == instance_id, Instance.active == True).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instancia nao encontrada")

    to_email = payload.get("email") or instance.owner_email
    if not to_email:
        raise HTTPException(status_code=400, detail="Nenhum email configurado para esta instancia.")

    qrcode_img = await get_qrcode(instance.api_url, instance.api_key, instance.instance_name)
    if not qrcode_img:
        raise HTTPException(
            status_code=404,
            detail="QR Code nao disponivel. Verifique a URL da API e se o open-wa esta acessivel.",
        )

    sent = send_qrcode_email(to_email, instance.instance_name, qrcode_img)
    if not sent:
        raise HTTPException(status_code=502, detail="Falha ao enviar email. Verifique as configuracoes SMTP.")

    return {"status": "ok", "email": to_email}


@router.get("/instances/{instance_id}/status")
async def check_instance_status(instance_id: int, db: Session = Depends(get_db)):
    """Verifica o estado de conexao da instancia com o open-wa."""
    instance = db.query(Instance).filter(Instance.id == instance_id).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instancia nao encontrada")
    if not instance.api_url or not instance.api_key:
        return {"state": "unknown", "error": "Instancia sem URL ou API Key configurada"}

    result = await get_connection_state(
        instance.api_url, instance.api_key, instance.instance_name
    )
    result["instance_name"] = instance.instance_name
    result["api_url"] = instance.api_url
    return result


@router.put("/instances/{instance_id}")
async def update_instance(instance_id: int, payload: InstanceUpdate, db: Session = Depends(get_db)):
    instance = db.query(Instance).filter(Instance.id == instance_id, Instance.active == True).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instancia nao encontrada")
    if payload.name is not None:
        instance.name = payload.name
    if payload.api_url is not None:
        instance.api_url = payload.api_url
    if payload.api_key is not None:
        instance.api_key = payload.api_key
    if payload.phone_number is not None:
        instance.phone_number = payload.phone_number
    if payload.owner_email is not None:
        instance.owner_email = payload.owner_email if payload.owner_email != '' else None
    db.commit()
    db.refresh(instance)

    qrcode_img = None
    api_error = None
    api_url = instance.api_url or ""
    api_key = instance.api_key or ""
    if api_url and api_key:
        try:
            qrcode_img = await get_qrcode(api_url, api_key, instance.instance_name)
        except Exception as e:
            api_error = str(e)

    return {
        "id": instance.id,
        "name": instance.name,
        "instance_name": instance.instance_name,
        "api_url": instance.api_url,
        "api_key": instance.api_key,
        "phone_number": instance.phone_number,
        "owner_email": instance.owner_email,
        "active": instance.active,
        "created_at": instance.created_at,
        "api_error": api_error,
        "qrcode": qrcode_img,
    }


# --- Webhook config removed (open-wa configures webhook via env var) ---


@router.get("/instances/{instance_id}/auto-message")
def get_auto_message(instance_id: int, db: Session = Depends(get_db)):
    instance = db.query(Instance).filter(Instance.id == instance_id, Instance.active == True).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instancia nao encontrada")
    return {"enabled": instance.auto_message_enabled, "text": instance.auto_message_text or ""}


@router.put("/instances/{instance_id}/auto-message")
def set_auto_message(instance_id: int, payload: dict, db: Session = Depends(get_db)):
    instance = db.query(Instance).filter(Instance.id == instance_id, Instance.active == True).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instancia nao encontrada")
    instance.auto_message_enabled = bool(payload.get("enabled", False))
    instance.auto_message_text = payload.get("text") or None
    db.commit()
    return {"enabled": instance.auto_message_enabled, "text": instance.auto_message_text or ""}


@router.delete("/instances/{instance_id}")
def delete_instance(instance_id: int, db: Session = Depends(get_db)):
    instance = db.query(Instance).filter(Instance.id == instance_id).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instancia nao encontrada")
    instance.active = False
    db.commit()
    return {"status": "deactivated"}


@router.get("/attendants")
def list_attendants(instance_id: int = None, db: Session = Depends(get_db)):
    q = db.query(Attendant).filter(Attendant.active == True)
    if instance_id:
        q = q.filter(Attendant.instance_id == instance_id)
    return q.all()


@router.post("/attendants")
def create_attendant(payload: AttendantCreate, db: Session = Depends(get_db)):
    existing = db.query(Attendant).filter(Attendant.phone == payload.phone).first()
    if existing:
        raise HTTPException(status_code=400, detail="Telefone ja cadastrado")
    instance = db.query(Instance).filter(Instance.id == payload.instance_id).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instancia nao encontrada")
    role = AttendantRole(payload.role)
    attendant = Attendant(
        name=payload.name,
        phone=payload.phone,
        email=payload.email,
        role=role,
        instance_id=payload.instance_id,
        team_id=payload.team_id,
    )
    db.add(attendant)
    db.commit()
    db.refresh(attendant)
    return attendant


@router.put("/attendants/{attendant_id}")
def update_attendant(attendant_id: int, payload: AttendantUpdate, db: Session = Depends(get_db)):
    att = db.query(Attendant).filter(Attendant.id == attendant_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Atendente nao encontrado")
    if payload.name is not None:
        att.name = payload.name
    if payload.phone is not None:
        existing = db.query(Attendant).filter(Attendant.phone == payload.phone, Attendant.id != attendant_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Telefone ja cadastrado por outro atendente")
        att.phone = payload.phone
    if payload.email is not None:
        att.email = payload.email
    if payload.role is not None:
        att.role = AttendantRole(payload.role)
    if payload.team_id is not None:
        att.team_id = payload.team_id if payload.team_id != 0 else None
    db.commit()
    db.refresh(att)
    return att


@router.delete("/attendants/{attendant_id}")
def delete_attendant(attendant_id: int, db: Session = Depends(get_db)):
    att = db.query(Attendant).filter(Attendant.id == attendant_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Atendente nao encontrado")
    att.active = False
    db.commit()
    return {"status": "deactivated"}
