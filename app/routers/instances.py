from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.instance import Instance
from app.models.attendant import Attendant, AttendantRole
from app.schemas.metrics import InstanceCreate, AttendantCreate, AttendantUpdate
import httpx

router = APIRouter(prefix="/api", tags=["instances"])


@router.get("/instances")
def list_instances(db: Session = Depends(get_db)):
    return db.query(Instance).filter(Instance.active == True).all()


@router.post("/instances")
def create_instance(payload: InstanceCreate, db: Session = Depends(get_db)):
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
        return existing
    instance = Instance(**payload.model_dump())
    db.add(instance)
    db.commit()
    db.refresh(instance)
    return instance


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
