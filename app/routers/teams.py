from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from app.core.database import get_db
from app.models.team import Team
from app.models.instance import Instance

router = APIRouter(prefix="/api", tags=["teams"])


class TeamCreate(BaseModel):
    name: str
    description: Optional[str] = None
    keywords: Optional[str] = None
    instance_id: int


@router.get("/teams")
def list_teams(instance_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(Team).filter(Team.active == True)
    if instance_id:
        q = q.filter(Team.instance_id == instance_id)
    return q.order_by(Team.name).all()


@router.post("/teams")
def create_team(payload: TeamCreate, db: Session = Depends(get_db)):
    instance = db.query(Instance).filter(Instance.id == payload.instance_id).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada")
    team = Team(**payload.model_dump())
    db.add(team)
    db.commit()
    db.refresh(team)
    return team


@router.delete("/teams/{team_id}")
def delete_team(team_id: int, db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Equipe não encontrada")
    team.active = False
    db.commit()
    return {"status": "deactivated"}
