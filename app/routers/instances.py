from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.instance import Instance
from app.models.attendant import Attendant, AttendantRole
from app.schemas.metrics import InstanceCreate, AttendantCreate

router = APIRouter(prefix="/api", tags=["instances"])


@router.get("/instances")
def list_instances(db: Session = Depends(get_db)):
    return db.query(Instance).filter(Instance.active == True).all()


@router.post("/instances")
def create_instance(payload: InstanceCreate, db: Session = Depends(get_db)):
    existing = db.query(Instance).filter(Instance.instance_name == payload.instance_name).first()
    if existing:
        raise HTTPException(status_code=400, detail="instance_name já existe")
    instance = Instance(**payload.model_dump())
    db.add(instance)
    db.commit()
    db.refresh(instance)
    return instance


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


@router.delete("/attendants/{attendant_id}")
def delete_attendant(attendant_id: int, db: Session = Depends(get_db)):
    att = db.query(Attendant).filter(Attendant.id == attendant_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Atendente não encontrado")
    att.active = False
    db.commit()
    return {"status": "deactivated"}
