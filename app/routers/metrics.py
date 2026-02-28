from fastapi import APIRouter, Depends, Query, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from app.core.database import get_db
from app.services import metrics_service
from app.services import analysis_service


class GroupConfigUpdate(BaseModel):
    responsible_id: Optional[int] = None
    manager_id: Optional[int] = None
    group_tags: Optional[list[str]] = None


class AssignBody(BaseModel):
    attendant_id: Optional[int] = None

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


@router.get("/overview")
def overview(instance_id: Optional[int] = None, db: Session = Depends(get_db)):
    return metrics_service.get_overview_metrics(db, instance_id)


@router.get("/extended")
def extended_metrics(instance_id: Optional[int] = None, db: Session = Depends(get_db)):
    return metrics_service.get_extended_metrics(db, instance_id)


@router.get("/extended/daily")
def daily_extended_metrics(
    days: int = Query(default=7, ge=1, le=30),
    instance_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    return metrics_service.get_daily_extended_metrics(db, days, instance_id)


@router.get("/overview-comparison")
def overview_comparison(
    days: int = Query(default=7, ge=1, le=30),
    instance_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    return metrics_service.get_overview_comparison(db, days, instance_id)


@router.get("/hourly-volume")
def hourly_volume(
    days: int = Query(default=7, ge=1, le=90),
    instance_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    return metrics_service.get_hourly_volume(db, days, instance_id)


@router.get("/attendants")
def attendants(instance_id: Optional[int] = None, db: Session = Depends(get_db)):
    return metrics_service.get_attendant_metrics(db, instance_id)


@router.get("/daily-volume")
def daily_volume(
    days: int = Query(default=7, ge=1, le=90),
    instance_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    return metrics_service.get_daily_volume(db, days, instance_id)


@router.get("/daily-sla")
def daily_sla(
    days: int = Query(default=7, ge=1, le=90),
    instance_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    return metrics_service.get_daily_sla(db, days, instance_id)


@router.get("/daily-status")
def daily_status(
    days: int = Query(default=7, ge=1, le=90),
    instance_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    return metrics_service.get_daily_status(db, days, instance_id)


@router.get("/conversations")
def conversations(
    limit: int = Query(default=20, ge=1, le=100),
    instance_id: Optional[int] = None,
    status: Optional[str] = None,
    attendant_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    return metrics_service.get_recent_conversations(db, limit, instance_id, status, attendant_id)


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: int, db: Session = Depends(get_db)):
    return metrics_service.get_conversation_detail(db, conversation_id)


@router.get("/conversations/{conversation_id}/messages")
def get_messages(conversation_id: int, db: Session = Depends(get_db)):
    return metrics_service.get_conversation_messages(db, conversation_id)


@router.post("/conversations/{conversation_id}/resolve")
def resolve_conversation(
    conversation_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    success = metrics_service.resolve_conversation(db, conversation_id)
    if not success:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    background_tasks.add_task(analysis_service.analyze_conversation, conversation_id)
    return {"status": "resolved"}


@router.patch("/conversations/{conversation_id}/assign")
def assign_conversation(
    conversation_id: int,
    body: AssignBody,
    db: Session = Depends(get_db),
):
    ok = metrics_service.assign_conversation(db, conversation_id, body.attendant_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Conversa ou atendente não encontrado")
    return {"status": "assigned"}


@router.post("/conversations/{conversation_id}/analyze")
def analyze_conversation(
    conversation_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    conv = metrics_service.get_conversation_detail(db, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    background_tasks.add_task(analysis_service.analyze_conversation, conversation_id)
    return {"status": "analyzing"}


@router.get("/analysis-stats")
def analysis_stats(instance_id: Optional[int] = None, db: Session = Depends(get_db)):
    return metrics_service.get_analysis_stats(db, instance_id)


@router.get("/groups/overview")
def groups_overview(instance_id: Optional[int] = None, db: Session = Depends(get_db)):
    return metrics_service.get_group_overview_metrics(db, instance_id)


@router.post("/groups/sync-names")
def sync_group_names(instance_id: int, db: Session = Depends(get_db)):
    return metrics_service.sync_group_names(db, instance_id)


@router.get("/groups")
def list_groups(
    instance_id: Optional[int] = None,
    limit: int = Query(default=50, ge=1, le=200),
    tag: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return metrics_service.get_group_conversations(db, instance_id, limit, tag)


@router.patch("/groups/{group_id}/config")
def update_group_config(
    group_id: int,
    body: GroupConfigUpdate,
    db: Session = Depends(get_db),
):
    ok = metrics_service.update_group_config(
        db, group_id, body.responsible_id, body.manager_id, body.group_tags
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    return {"status": "updated"}


@router.get("/groups/{conversation_id}/messages")
def get_group_messages(conversation_id: int, db: Session = Depends(get_db)):
    return metrics_service.get_conversation_messages(db, conversation_id)


@router.get("/sla-alerts")
def sla_alerts(
    instance_id: Optional[int] = None,
    threshold_minutes: int = Query(default=30, ge=1, le=1440),
    db: Session = Depends(get_db),
):
    return metrics_service.get_sla_alerts(db, instance_id, threshold_minutes)


@router.get("/calls")
def list_calls(
    instance_id: Optional[int] = None,
    limit: int = Query(default=50, ge=1, le=200),
    direction: Optional[str] = Query(default=None, description="inbound ou outbound"),
    db: Session = Depends(get_db),
):
    return metrics_service.get_calls(db, instance_id, limit, direction)
