from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.instance import Instance
from app.models.attendant import Attendant, AttendantRole
from app.schemas.metrics import InstanceCreate, InstanceUpdate, AttendantCreate, AttendantUpdate
from app.services.evolution_service import create_evolution_instance, get_qrcode, configure_webhook, get_webhook
from app.services.email_service import send_qrcode_email
import httpx

router = APIRouter(prefix="/api", tags=["instances"])


@router.get("/instances")
def list_instances(db: Session = Depends(get_db)):
    return db.query(Instance).filter(Instance.active == True).all()


@router.post("/instances")
async def create_instance(payload: InstanceCreate, db: Session = Depends(get_db)):
    existing = db.query(Instance).filter(Instance.instance_name == payload.instance_name).first()
    if existing:
        if existing.active:
            raise HTTPException(status_code=400, detail="Já existe uma instância ativa com esse 'Instance name'. Use outro nome ou remova a instância atual.")
        existing.name = payload.name
        existing.api_url = payload.api_url
        existing.api_key = payload.api_key
        existing.phone_number = payload.phone_number
        existing.active = True
        db.commit()
        db.refresh(existing)
        instance = existing
    else:
        db_data = payload.model_dump(exclude={"owner_email"})
        instance = Instance(**db_data, owner_email=payload.owner_email)
        db.add(instance)
        db.commit()
        db.refresh(instance)

    # Try to create/connect instance in Evolution API and get QR code
    qrcode = None
    evolution_error = None
    evolution_created = False
    try:
        result = await create_evolution_instance(payload.api_url, payload.api_key, payload.instance_name)
        if result.get("_already_exists"):
            evolution_error = f"Instância já existe na Evolution API (HTTP {result.get('_status')}). Tentando obter QR diretamente."
        else:
            evolution_created = True
            # Some Evolution versions return the QR directly in the create response
            qrcode = (
                (result.get("qrcode") or {}).get("base64")
                or result.get("base64")
            )
    except Exception as e:
        evolution_error = str(e)

    # If QR not in create response, fetch separately
    if not qrcode:
        try:
            qrcode = await get_qrcode(payload.api_url, payload.api_key, payload.instance_name)
        except Exception:
            pass

    # Send QR by email if requested and available
    email_sent = None
    if qrcode and payload.owner_email:
        email_sent = send_qrcode_email(payload.owner_email, payload.instance_name, qrcode)

    return {
        "id": instance.id,
        "name": instance.name,
        "instance_name": instance.instance_name,
        "api_url": instance.api_url,
        "api_key": instance.api_key,
        "phone_number": instance.phone_number,
        "active": instance.active,
        "created_at": instance.created_at,
        "qrcode": qrcode,
        "evolution_created": evolution_created,
        "evolution_error": evolution_error,
        "email_sent": email_sent,
    }


@router.get("/instances/{instance_id}/qrcode")
async def get_instance_qrcode(instance_id: int, db: Session = Depends(get_db)):
    """Fetches a fresh QR code from the Evolution API for this instance."""
    instance = db.query(Instance).filter(Instance.id == instance_id, Instance.active == True).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada")
    qrcode = await get_qrcode(instance.api_url, instance.api_key, instance.instance_name)
    if not qrcode:
        raise HTTPException(status_code=404, detail="QR Code não disponível. A instância pode já estar conectada ou a Evolution API está inacessível.")
    return {"qrcode": qrcode}


@router.post("/instances/{instance_id}/send-qrcode-email")
async def send_qrcode_email_endpoint(instance_id: int, payload: dict = {}, db: Session = Depends(get_db)):
    """Fetches a fresh QR code and emails it to the instance owner_email (or a custom email in the payload)."""
    instance = db.query(Instance).filter(Instance.id == instance_id, Instance.active == True).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada")

    to_email = payload.get("email") or instance.owner_email
    if not to_email:
        raise HTTPException(status_code=400, detail="Nenhum email configurado para esta instância.")

    qrcode = await get_qrcode(instance.api_url, instance.api_key, instance.instance_name)
    if not qrcode:
        raise HTTPException(status_code=404, detail="QR Code não disponível. A instância pode já estar conectada ou a Evolution API está inacessível.")

    sent = send_qrcode_email(to_email, instance.instance_name, qrcode)
    if not sent:
        raise HTTPException(status_code=502, detail="Falha ao enviar email. Verifique as configurações SMTP no servidor.")

    return {"status": "ok", "email": to_email}


@router.post("/instances/{instance_id}/webhook")
async def set_instance_webhook(
    instance_id: int,
    payload: dict,
    db: Session = Depends(get_db),
):
    """Configures the webhook on the Evolution API for this instance."""
    instance = db.query(Instance).filter(Instance.id == instance_id, Instance.active == True).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada")
    server_url = payload.get("server_url", "").rstrip("/")
    if not server_url:
        raise HTTPException(status_code=400, detail="server_url é obrigatório")
    webhook_url = f"{server_url}/webhook/{instance.instance_name}"
    try:
        result = await configure_webhook(instance.api_url, instance.api_key, instance.instance_name, webhook_url)
        return {"status": "ok", "webhook_url": webhook_url, "result": result}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erro ao configurar webhook na Evolution API: {e}")


@router.get("/instances/{instance_id}/webhook")
async def get_instance_webhook(instance_id: int, db: Session = Depends(get_db)):
    """Returns the current webhook configuration from the Evolution API."""
    instance = db.query(Instance).filter(Instance.id == instance_id, Instance.active == True).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada")
    data = await get_webhook(instance.api_url, instance.api_key, instance.instance_name)
    return data or {}


@router.get("/instances/{instance_id}/status")
async def check_instance_status(instance_id: int, db: Session = Depends(get_db)):
    """Verifica o estado de conexão da instância com a Evolution API."""
    instance = db.query(Instance).filter(Instance.id == instance_id).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada")
    if not instance.api_url or not instance.api_key:
        return {"state": "unknown", "error": "Instância sem URL ou API Key configurada"}

    url = f"{instance.api_url.rstrip('/')}/instance/connectionState/{instance.instance_name}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers={"apikey": instance.api_key})
        if resp.status_code == 200:
            data = resp.json()
            # Evolution API v1: {"instance": {"state": "open"}}
            # Evolution API v2: {"state": "open"}
            state = (
                data.get("instance", {}).get("state")
                or data.get("state")
                or "unknown"
            )
            return {"state": str(state).lower(), "instance_name": instance.instance_name, "api_url": instance.api_url}
        return {"state": "error", "error": f"HTTP {resp.status_code}", "api_url": instance.api_url}
    except httpx.ConnectError:
        return {"state": "unreachable", "error": f"Não foi possível conectar em {instance.api_url}", "api_url": instance.api_url}
    except httpx.TimeoutException:
        return {"state": "timeout", "error": "Evolution API não respondeu em 10s", "api_url": instance.api_url}
    except Exception as e:
        return {"state": "error", "error": str(e), "api_url": instance.api_url}


@router.put("/instances/{instance_id}")
async def update_instance(instance_id: int, payload: InstanceUpdate, db: Session = Depends(get_db)):
    instance = db.query(Instance).filter(Instance.id == instance_id, Instance.active == True).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada")
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

    evolution_created = False
    evolution_error = None
    qrcode = None
    api_url = instance.api_url or ""
    api_key = instance.api_key or ""
    instance_name = instance.instance_name
    if api_url and api_key and instance_name:
        try:
            result = await create_evolution_instance(api_url, api_key, instance_name)
            if result.get("_already_exists"):
                evolution_error = f"Instância já existe na Evolution API (HTTP {result.get('_status')})."
            else:
                evolution_created = True
                qrcode = (
                    (result.get("qrcode") or {}).get("base64")
                    or result.get("base64")
                )
        except Exception as e:
            evolution_error = str(e)
    if not qrcode and api_url and api_key and instance_name:
        try:
            qrcode = await get_qrcode(api_url, api_key, instance_name)
        except Exception:
            pass

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
        "evolution_created": evolution_created,
        "evolution_error": evolution_error,
        "qrcode": qrcode,
    }


@router.get("/instances/{instance_id}/auto-message")
def get_auto_message(instance_id: int, db: Session = Depends(get_db)):
    instance = db.query(Instance).filter(Instance.id == instance_id, Instance.active == True).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada")
    return {"enabled": instance.auto_message_enabled, "text": instance.auto_message_text or ""}


@router.put("/instances/{instance_id}/auto-message")
def set_auto_message(instance_id: int, payload: dict, db: Session = Depends(get_db)):
    instance = db.query(Instance).filter(Instance.id == instance_id, Instance.active == True).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada")
    instance.auto_message_enabled = bool(payload.get("enabled", False))
    instance.auto_message_text = payload.get("text") or None
    db.commit()
    return {"enabled": instance.auto_message_enabled, "text": instance.auto_message_text or ""}


@router.delete("/instances/{instance_id}")
def delete_instance(instance_id: int, db: Session = Depends(get_db)):
    instance = db.query(Instance).filter(Instance.id == instance_id).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada")
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
        raise HTTPException(status_code=400, detail="Telefone já cadastrado")
    instance = db.query(Instance).filter(Instance.id == payload.instance_id).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada")
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
        raise HTTPException(status_code=404, detail="Atendente não encontrado")
    if payload.name is not None:
        att.name = payload.name
    if payload.phone is not None:
        existing = db.query(Attendant).filter(Attendant.phone == payload.phone, Attendant.id != attendant_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Telefone já cadastrado por outro atendente")
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
        raise HTTPException(status_code=404, detail="Atendente não encontrado")
    att.active = False
    db.commit()
    return {"status": "deactivated"}
