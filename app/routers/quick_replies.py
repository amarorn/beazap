from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.models.quick_reply import QuickReply

router = APIRouter(prefix="/api/quick-replies", tags=["quick-replies"])


class QuickReplyCreate(BaseModel):
    title: str
    text: str
    sort_order: Optional[int] = 0


class QuickReplyUpdate(BaseModel):
    title: Optional[str] = None
    text: Optional[str] = None
    sort_order: Optional[int] = None
    active: Optional[bool] = None


@router.get("")
def list_quick_replies(db: Session = Depends(get_db)):
    return db.query(QuickReply).filter(QuickReply.active == True).order_by(
        QuickReply.sort_order, QuickReply.created_at
    ).all()


@router.post("")
def create_quick_reply(payload: QuickReplyCreate, db: Session = Depends(get_db)):
    qr = QuickReply(
        title=payload.title.strip(),
        text=payload.text.strip(),
        sort_order=payload.sort_order or 0,
    )
    db.add(qr)
    db.commit()
    db.refresh(qr)
    return qr


@router.put("/{qr_id}")
def update_quick_reply(qr_id: int, payload: QuickReplyUpdate, db: Session = Depends(get_db)):
    qr = db.query(QuickReply).filter(QuickReply.id == qr_id).first()
    if not qr:
        raise HTTPException(status_code=404, detail="Template não encontrado")
    if payload.title is not None:
        qr.title = payload.title.strip()
    if payload.text is not None:
        qr.text = payload.text.strip()
    if payload.sort_order is not None:
        qr.sort_order = payload.sort_order
    if payload.active is not None:
        qr.active = payload.active
    db.commit()
    db.refresh(qr)
    return qr


@router.delete("/{qr_id}")
def delete_quick_reply(qr_id: int, db: Session = Depends(get_db)):
    qr = db.query(QuickReply).filter(QuickReply.id == qr_id).first()
    if not qr:
        raise HTTPException(status_code=404, detail="Template não encontrado")
    db.delete(qr)
    db.commit()
    return {"status": "deleted"}
