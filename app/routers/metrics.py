import logging
from fastapi import APIRouter, Body, Depends, Query, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from app.core.database import get_db
from app.services import metrics_service
from app.services import analysis_service
from app.services import churn_prediction_service
from app.services import trends_anomalies_service


class GroupConfigUpdate(BaseModel):
    responsible_id: Optional[int] = None
    manager_id: Optional[int] = None
    group_tags: Optional[list[str]] = None


class AssignBody(BaseModel):
    attendant_id: Optional[int] = None


class SendMessageBody(BaseModel):
    text: str


class ClassifyIntentBody(BaseModel):
    customer_products: Optional[str] = ""
    contract_value: Optional[str] = ""
    customer_since: Optional[str] = ""


class AutomationClassifyBody(BaseModel):
    mensagem_cliente: Optional[str] = None


class GenerateResponseBody(BaseModel):
    intencao_detectada: str
    mensagem_cliente: str
    parametros_pendentes: Optional[list[str]] = None


class ConfirmActionBody(BaseModel):
    intencao_detectada: str
    entidades_coletadas: dict
    status_execucao_acao: str
    resultado_acao: Optional[str] = None
    motivo_falha: Optional[str] = None
    proximos_passos: Optional[str] = None


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


@router.get("/teams")
def team_metrics(instance_id: Optional[int] = None, db: Session = Depends(get_db)):
    return metrics_service.get_team_metrics(db, instance_id)


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


@router.post("/conversations/{conversation_id}/send")
async def send_message(
    conversation_id: int,
    body: SendMessageBody,
    db: Session = Depends(get_db),
):
    if not body.text or not body.text.strip():
        raise HTTPException(status_code=400, detail="Texto da mensagem não pode ser vazio")
    result = await metrics_service.send_message_to_conversation(db, conversation_id, body.text.strip())
    if "error" in result:
        logging.getLogger(__name__).warning("send_message failed conv=%s: %s", conversation_id, result["error"])
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/conversations/{conversation_id}/suggestions")
def get_suggestions(
    conversation_id: int,
    company_tone: str = Query(default=""),
    db: Session = Depends(get_db),
):
    from app.services import suggestion_service
    suggestions = suggestion_service.generate_suggestions(conversation_id, company_tone)
    return {"suggestions": suggestions}


@router.get("/conversations/{conversation_id}/draft")
def get_draft(
    conversation_id: int,
    company_name: str = Query(default=""),
    company_tone: str = Query(default=""),
    relevant_policies: str = Query(default=""),
    knowledge_base_context: str = Query(default=""),
    db: Session = Depends(get_db),
):
    """Gera rascunho completo de resposta com confidence e flags de revisão."""
    from app.services import suggestion_service
    result = suggestion_service.generate_draft_response(
        conversation_id=conversation_id,
        company_name=company_name,
        company_tone=company_tone,
        relevant_policies=relevant_policies,
        knowledge_base_context=knowledge_base_context,
    )
    if result is None:
        raise HTTPException(status_code=503, detail="Não foi possível gerar o rascunho.")
    return result


@router.post("/conversations/{conversation_id}/classify-intent")
def classify_intent(
    conversation_id: int,
    body: ClassifyIntentBody | None = Body(default=None),
    db: Session = Depends(get_db),
):
    """Classifica a intenção da conversa e sugere roteamento."""
    from app.services import intent_classification_service
    payload = body if body is not None else ClassifyIntentBody()
    result = intent_classification_service.classify_intent(
        conversation_id=conversation_id,
        customer_products=payload.customer_products or "",
        contract_value=payload.contract_value or "",
        customer_since=payload.customer_since or "",
    )
    if result is None:
        raise HTTPException(status_code=503, detail="Não foi possível classificar a intenção.")
    return result


@router.post("/conversations/{conversation_id}/automation/classify")
def automation_classify_intent(
    conversation_id: int,
    body: AutomationClassifyBody | None = Body(default=None),
):
    """Classifica intenção para fluxo automático e determina se automação ou humano."""
    from app.services import automation_flows_service
    payload = body if body is not None else AutomationClassifyBody()
    result = automation_flows_service.classify_intent_routing_from_conversation(
        conversation_id=conversation_id,
        mensagem_cliente=payload.mensagem_cliente,
    )
    if result is None:
        raise HTTPException(status_code=503, detail="Não foi possível classificar a intenção.")
    return result


@router.post("/automation/generate-response")
def automation_generate_response(body: GenerateResponseBody):
    """Gera resposta automática e extrai entidades da mensagem."""
    from app.services import automation_flows_service
    result = automation_flows_service.generate_automated_response(
        intencao_detectada=body.intencao_detectada,
        mensagem_cliente=body.mensagem_cliente,
        parametros_pendentes=body.parametros_pendentes,
    )
    if result is None:
        raise HTTPException(status_code=503, detail="Não foi possível gerar a resposta.")
    return result


@router.post("/automation/confirm")
def automation_confirm_action(body: ConfirmActionBody):
    """Gera mensagem final após execução da ação (sucesso ou falha)."""
    from app.services import automation_flows_service
    result = automation_flows_service.generate_confirmation_message(
        intencao_detectada=body.intencao_detectada,
        entidades_coletadas=body.entidades_coletadas,
        status_execucao_acao=body.status_execucao_acao,
        resultado_acao=body.resultado_acao,
        motivo_falha=body.motivo_falha,
        proximos_passos=body.proximos_passos,
    )
    if result is None:
        raise HTTPException(status_code=503, detail="Não foi possível gerar a mensagem.")
    return result


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


@router.get("/churn/predict")
def predict_churn(
    numero_cliente: str = Query(..., description="Numero de telefone do cliente"),
    data_inicio: str = Query(..., description="Data inicio ISO (ex: 2024-03-01)"),
    data_fim: str = Query(..., description="Data fim ISO (ex: 2024-03-31)"),
    instance_id: Optional[int] = Query(default=None),
    periodo_sentimento: int = Query(default=5, ge=1, le=20, description="Ultimas N conversas para analise de sentimento"),
    dias_sentimento: int = Query(default=30, ge=7, le=90, description="Ultimos N dias para analise de sentimento"),
):
    """Avalia o risco de churn do cliente com base no historico de interacoes."""
    result = churn_prediction_service.predict_churn(
        numero_cliente=numero_cliente,
        data_inicio=data_inicio,
        data_fim=data_fim,
        instance_id=instance_id,
        periodo_analise_sentimento=periodo_sentimento,
        dias_analise_sentimento=dias_sentimento,
    )
    if result is None:
        raise HTTPException(status_code=503, detail="Nao foi possivel avaliar o risco de churn.")
    return result


@router.get("/trends/emerging-topics")
def get_emerging_topics(
    data_inicio: str = Query(..., description="Data inicio ISO (ex: 2024-03-01)"),
    data_fim: str = Query(..., description="Data fim ISO (ex: 2024-03-07)"),
    instance_id: Optional[int] = Query(default=None),
):
    """Identifica topicos emergentes em resumos de conversas do periodo."""
    result = trends_anomalies_service.analyze_emerging_topics(data_inicio, data_fim, instance_id)
    if result is None:
        raise HTTPException(status_code=503, detail="Nao foi possivel analisar topicos emergentes.")
    return result


@router.get("/trends/metric-anomalies")
def get_metric_anomalies(
    data_inicio: str = Query(..., description="Data inicio ISO (ex: 2024-03-01)"),
    data_fim: str = Query(..., description="Data fim ISO (ex: 2024-03-07)"),
    categoria: str = Query(..., description="Categoria (reclamacao, suporte, etc.)"),
    instance_id: Optional[int] = Query(default=None),
):
    """Identifica anomalias em metricas comparando periodo atual vs historico."""
    result = trends_anomalies_service.analyze_metric_anomalies(
        data_inicio, data_fim, categoria, instance_id
    )
    if result is None:
        raise HTTPException(status_code=503, detail="Nao foi possivel analisar anomalias.")
    return result


@router.get("/trends/sentiment-anomalies")
def get_sentiment_anomalies(
    data_inicio: str = Query(..., description="Data inicio ISO (ex: 2024-03-01)"),
    data_fim: str = Query(..., description="Data fim ISO (ex: 2024-03-07)"),
    contexto: str = Query(..., description="Nome do topico (categoria) ou atendente"),
    tipo: str = Query(..., description="topico ou atendente"),
    instance_id: Optional[int] = Query(default=None),
):
    """Identifica anomalias na distribuicao de sentimentos para topico ou atendente."""
    result = trends_anomalies_service.analyze_sentiment_anomalies(
        data_inicio, data_fim, contexto, tipo, instance_id
    )
    if result is None:
        raise HTTPException(status_code=503, detail="Nao foi possivel analisar anomalias de sentimento.")
    return result


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


# ─── Notes ────────────────────────────────────────────────────────────────────
class NoteCreate(BaseModel):
    content: str
    author_name: Optional[str] = "Agente"


@router.get("/conversations/{conversation_id}/notes")
def get_notes(conversation_id: int, db: Session = Depends(get_db)):
    from app.models.conversation_note import ConversationNote
    notes = (
        db.query(ConversationNote)
        .filter(ConversationNote.conversation_id == conversation_id)
        .order_by(ConversationNote.created_at.desc())
        .all()
    )
    return [
        {
            "id": n.id,
            "author_name": n.author_name,
            "content": n.content,
            "created_at": n.created_at.isoformat(),
        }
        for n in notes
    ]


@router.post("/conversations/{conversation_id}/notes")
def add_note(conversation_id: int, body: NoteCreate, db: Session = Depends(get_db)):
    from app.models.conversation import Conversation
    from app.models.conversation_note import ConversationNote
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    if not body.content or not body.content.strip():
        raise HTTPException(status_code=400, detail="Conteúdo não pode ser vazio")
    note = ConversationNote(
        conversation_id=conversation_id,
        author_name=(body.author_name or "Agente").strip(),
        content=body.content.strip(),
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return {
        "id": note.id,
        "author_name": note.author_name,
        "content": note.content,
        "created_at": note.created_at.isoformat(),
    }


@router.delete("/conversations/{conversation_id}/notes/{note_id}")
def delete_note(conversation_id: int, note_id: int, db: Session = Depends(get_db)):
    from app.models.conversation_note import ConversationNote
    note = db.query(ConversationNote).filter(
        ConversationNote.id == note_id,
        ConversationNote.conversation_id == conversation_id,
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="Nota não encontrada")
    db.delete(note)
    db.commit()
    return {"status": "deleted"}
