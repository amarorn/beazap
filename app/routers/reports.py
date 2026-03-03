import json
import logging
from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, BackgroundTasks, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.report import AtendentRaw, AtendimentoRaw, ClienteAtendRaw
from app.models.conversation import Conversation, ConversationStatus
from app.services import report_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reports", tags=["reports"])


class GenerateRequest(BaseModel):
    instance_id: int
    days: int = 7


class AttendantSummaryOut(BaseModel):
    attendant_id: int
    attendant_name: str
    role: Optional[str]
    period_week: str
    total_conversations: int
    resolved_conversations: int
    abandoned_conversations: int
    resolution_rate: float
    avg_first_response_seconds: Optional[float]
    avg_resolution_seconds: Optional[float]
    total_messages_sent: int
    total_messages_received: int
    avg_satisfaction: Optional[float]
    sla_5min_rate: float
    sla_15min_rate: float
    sla_30min_rate: float
    top_categories: dict
    top_sentiments: dict
    llm_summary: Optional[str]
    generated_at: Optional[str]


def _row_to_out(row: AtendentRaw) -> AttendantSummaryOut:
    try:
        cats = json.loads(row.top_categories or "{}")
    except Exception:
        cats = {}
    try:
        sents = json.loads(row.top_sentiments or "{}")
    except Exception:
        sents = {}
    return AttendantSummaryOut(
        attendant_id=row.attendant_id,
        attendant_name=row.attendant_name,
        role=row.role,
        period_week=str(row.period_week),
        total_conversations=row.total_conversations,
        resolved_conversations=row.resolved_conversations,
        abandoned_conversations=row.abandoned_conversations,
        resolution_rate=row.resolution_rate,
        avg_first_response_seconds=row.avg_first_response_seconds,
        avg_resolution_seconds=row.avg_resolution_seconds,
        total_messages_sent=row.total_messages_sent,
        total_messages_received=row.total_messages_received,
        avg_satisfaction=row.avg_satisfaction,
        sla_5min_rate=row.sla_5min_rate,
        sla_15min_rate=row.sla_15min_rate,
        sla_30min_rate=row.sla_30min_rate,
        top_categories=cats,
        top_sentiments=sents,
        llm_summary=row.llm_summary,
        generated_at=row.generated_at.isoformat() if row.generated_at else None,
    )


@router.post("/generate")
def generate_reports(
    body: GenerateRequest,
    background_tasks: BackgroundTasks,
):
    """
    Inicia geração do relatório semanal por atendente em background.
    O pipeline: agrega dados → chama LLM → salva resumo em atendente_raw.
    """
    background_tasks.add_task(
        report_service.generate_all_reports,
        body.instance_id,
        body.days,
    )
    return {
        "status": "generating",
        "message": f"Relatório em processamento para os últimos {body.days} dias. Aguarde alguns segundos e recarregue.",
    }


@router.get("/attendant-summaries", response_model=List[AttendantSummaryOut])
def get_attendant_summaries(
    instance_id: Optional[int] = None,
    period_week: Optional[str] = Query(default=None, description="YYYY-MM-DD (segunda-feira da semana)"),
    db: Session = Depends(get_db),
):
    """Retorna os resumos LLM por atendente para o período solicitado."""
    q = db.query(AtendentRaw)

    if instance_id:
        q = q.filter(AtendentRaw.instance_id == instance_id)

    if period_week:
        try:
            pw = date.fromisoformat(period_week)
            q = q.filter(AtendentRaw.period_week == pw)
        except ValueError:
            pass
    else:
        # Default: semana mais recente disponível
        latest = q.order_by(AtendentRaw.period_week.desc()).first()
        if latest:
            q = q.filter(AtendentRaw.period_week == latest.period_week)

    rows = q.order_by(AtendentRaw.resolution_rate.desc(), AtendentRaw.attendant_name).all()
    return [_row_to_out(r) for r in rows]


@router.get("/debug")
def debug_report_tables(instance_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Diagnóstico: mostra contagem de dados nas 3 tabelas raw e nas conversas fonte."""
    conv_q = db.query(Conversation).filter(Conversation.is_group == False)
    if instance_id:
        conv_q = conv_q.filter(Conversation.instance_id == instance_id)

    conv_total = conv_q.count()
    conv_open = conv_q.filter(Conversation.status == ConversationStatus.open).count()
    conv_resolved = conv_q.filter(Conversation.status == ConversationStatus.resolved).count()
    conv_abandoned = conv_q.filter(Conversation.status == ConversationStatus.abandoned).count()
    conv_with_att = conv_q.filter(Conversation.attendant_id.isnot(None)).count()

    raw_q = db.query(AtendimentoRaw)
    cli_q = db.query(ClienteAtendRaw)
    att_q = db.query(AtendentRaw)
    if instance_id:
        raw_q = raw_q.filter(AtendimentoRaw.instance_id == instance_id)
        cli_q = cli_q.filter(ClienteAtendRaw.instance_id == instance_id)
        att_q = att_q.filter(AtendentRaw.instance_id == instance_id)

    weeks = [str(r.period_week) for r in att_q.with_entities(AtendentRaw.period_week).distinct().all()]

    return {
        "source_conversations": {
            "total": conv_total,
            "open": conv_open,
            "resolved": conv_resolved,
            "abandoned": conv_abandoned,
            "with_attendant": conv_with_att,
            "without_attendant": conv_total - conv_with_att,
        },
        "atendimento_raw_count": raw_q.count(),
        "cliente_atend_raw_count": cli_q.count(),
        "atendente_raw_count": att_q.count(),
        "available_weeks": weeks,
        "note": (
            "Se 'atendimento_raw_count=0': clique Gerar Relatório com a instância selecionada. "
            "Se 'atendente_raw_count>0 mas llm_summary=null': LLM não configurado ou erro — veja logs do backend."
        ),
    }
