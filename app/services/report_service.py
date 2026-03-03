"""
report_service.py — Pipeline de agregação + geração de relatório semanal por atendente via LLM.

Fluxo:
  conversations + messages
    → atendimento_raw   (1 linha por conversa fechada no período)
    → cliente_atend_raw (1 linha por cliente × atendente × semana)
    → atendente_raw     (1 linha por atendente × semana)
    → LLM → atendente_raw.llm_summary
"""

import json
import logging
from collections import defaultdict, Counter
from datetime import datetime, date, timedelta
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.conversation import Conversation, ConversationStatus
from app.models.attendant import Attendant
from app.models.report import AtendimentoRaw, ClienteAtendRaw, AtendentRaw

logger = logging.getLogger(__name__)


# ─── Helpers de período ───────────────────────────────────────────────────────

def _get_week_start(ref: Optional[date] = None) -> date:
    """Retorna a segunda-feira da semana de referência (default: semana atual)."""
    ref = ref or date.today()
    return ref - timedelta(days=ref.weekday())


def _format_seconds(secs: Optional[float]) -> str:
    if not secs:
        return "não disponível"
    secs = int(secs)
    if secs < 60:
        return f"{secs}s"
    if secs < 3600:
        return f"{secs // 60}min {secs % 60}s"
    return f"{secs // 3600}h {(secs % 3600) // 60}min"


# ─── Etapa 1: populate atendimento_raw ───────────────────────────────────────

def populate_atendimento_raw(db: Session, instance_id: int, days: int = 7) -> int:
    """Busca conversas fechadas do período e faz UPSERT em atendimento_raw."""
    since = datetime.utcnow() - timedelta(days=days)
    week_start = _get_week_start()

    # Inclui TODOS os status (open, resolved, abandoned) para capturar a atividade completa da semana
    convs = (
        db.query(Conversation)
        .filter(
            Conversation.instance_id == instance_id,
            Conversation.is_group == False,
            Conversation.opened_at >= since,
        )
        .all()
    )
    logger.info("populate_atendimento_raw: encontradas %d conversas (instance=%s, days=%d)", len(convs), instance_id, days)

    upserted = 0
    for conv in convs:
        # Calcular semana da conversa
        conv_week = _get_week_start(conv.opened_at.date() if conv.opened_at else date.today())

        resolution_secs = None
        if conv.resolved_at and conv.opened_at:
            delta = (conv.resolved_at - conv.opened_at).total_seconds()
            resolution_secs = max(0.0, delta)

        # Apaga registro anterior para a mesma conversa (UPSERT simples)
        db.query(AtendimentoRaw).filter(
            AtendimentoRaw.conversation_id == conv.id
        ).delete(synchronize_session=False)

        att_name = None
        att_role = None
        if conv.attendant_id:
            att = db.query(Attendant).filter(Attendant.id == conv.attendant_id).first()
            if att:
                att_name = att.name
                att_role = att.role.value if att.role else None

        row = AtendimentoRaw(
            conversation_id=conv.id,
            attendant_id=conv.attendant_id,
            attendant_name=att_name,
            instance_id=instance_id,
            contact_phone=conv.contact_phone,
            contact_name=conv.contact_name,
            status=conv.status.value,
            opened_at=conv.opened_at,
            resolved_at=conv.resolved_at,
            first_response_seconds=conv.first_response_time_seconds,
            resolution_seconds=resolution_secs,
            inbound_count=conv.inbound_count or 0,
            outbound_count=conv.outbound_count or 0,
            analysis_category=conv.analysis_category,
            analysis_sentiment=conv.analysis_sentiment,
            analysis_satisfaction=conv.analysis_satisfaction,
            period_week=conv_week,
        )
        db.add(row)
        upserted += 1

    db.commit()
    logger.info("populate_atendimento_raw: %d conversas processadas (instance=%s, days=%d)", upserted, instance_id, days)
    return upserted


# ─── Etapa 2: populate cliente_atend_raw ─────────────────────────────────────

def populate_cliente_atend_raw(db: Session, instance_id: int, period_week: date) -> int:
    """Agrega atendimento_raw por (cliente × atendente × semana)."""
    rows = (
        db.query(AtendimentoRaw)
        .filter(
            AtendimentoRaw.instance_id == instance_id,
            AtendimentoRaw.period_week == period_week,
            AtendimentoRaw.attendant_id.isnot(None),
        )
        .all()
    )

    # Agrupa
    groups: dict = defaultdict(list)
    for r in rows:
        groups[(r.contact_phone, r.attendant_id)].append(r)

    # Remove linhas existentes para recomputar
    db.query(ClienteAtendRaw).filter(
        ClienteAtendRaw.instance_id == instance_id,
        ClienteAtendRaw.period_week == period_week,
    ).delete(synchronize_session=False)

    upserted = 0
    for (phone, att_id), items in groups.items():
        resolved = sum(1 for i in items if i.status == "resolved")
        abandoned = sum(1 for i in items if i.status == "abandoned")
        responses = [i.first_response_seconds for i in items if i.first_response_seconds]
        resolutions = [i.resolution_seconds for i in items if i.resolution_seconds]
        satisfactions = [i.analysis_satisfaction for i in items if i.analysis_satisfaction]
        categories = [i.analysis_category for i in items if i.analysis_category]
        sentiments = [i.analysis_sentiment for i in items if i.analysis_sentiment]

        dominant_cat = Counter(categories).most_common(1)[0][0] if categories else None
        dominant_sent = Counter(sentiments).most_common(1)[0][0] if sentiments else None

        db.add(ClienteAtendRaw(
            contact_phone=phone,
            attendant_id=att_id,
            instance_id=instance_id,
            period_week=period_week,
            total_conversations=len(items),
            resolved_conversations=resolved,
            abandoned_conversations=abandoned,
            avg_response_seconds=sum(responses) / len(responses) if responses else None,
            avg_resolution_seconds=sum(resolutions) / len(resolutions) if resolutions else None,
            total_messages_in=sum(i.inbound_count for i in items),
            total_messages_out=sum(i.outbound_count for i in items),
            avg_satisfaction=sum(satisfactions) / len(satisfactions) if satisfactions else None,
            dominant_category=dominant_cat,
            dominant_sentiment=dominant_sent,
        ))
        upserted += 1

    db.commit()
    logger.info("populate_cliente_atend_raw: %d pares cliente×atendente (instance=%s, week=%s)", upserted, instance_id, period_week)
    return upserted


# ─── Etapa 3: populate atendente_raw ─────────────────────────────────────────

def _sla_rate(items: list, threshold_secs: int) -> float:
    valids = [i for i in items if i.first_response_seconds is not None]
    if not valids:
        return 0.0
    within = sum(1 for i in valids if i.first_response_seconds <= threshold_secs)
    return round(within / len(valids) * 100, 1)


def populate_atendente_raw(db: Session, instance_id: int, period_week: date) -> int:
    """Agrega atendimento_raw por (atendente × semana)."""
    rows = (
        db.query(AtendimentoRaw)
        .filter(
            AtendimentoRaw.instance_id == instance_id,
            AtendimentoRaw.period_week == period_week,
            AtendimentoRaw.attendant_id.isnot(None),
        )
        .all()
    )

    groups: dict = defaultdict(list)
    for r in rows:
        groups[r.attendant_id].append(r)

    upserted = 0
    for att_id, items in groups.items():
        att_name = items[0].attendant_name or f"Atendente #{att_id}"

        # Busca role do atendente
        att = db.query(Attendant).filter(Attendant.id == att_id).first()
        role = att.role.value if att and att.role else "agent"

        resolved = sum(1 for i in items if i.status == "resolved")
        abandoned = sum(1 for i in items if i.status == "abandoned")
        total = len(items)
        resolution_rate = round(resolved / total * 100, 1) if total > 0 else 0.0

        responses = [i.first_response_seconds for i in items if i.first_response_seconds]
        resolutions = [i.resolution_seconds for i in items if i.resolution_seconds]
        satisfactions = [i.analysis_satisfaction for i in items if i.analysis_satisfaction]

        categories = [i.analysis_category for i in items if i.analysis_category]
        sentiments = [i.analysis_sentiment for i in items if i.analysis_sentiment]
        top_cats = dict(Counter(categories).most_common(5))
        top_sents = dict(Counter(sentiments))

        # Remove linha existente para atualizar
        existing = db.query(AtendentRaw).filter(
            AtendentRaw.attendant_id == att_id,
            AtendentRaw.period_week == period_week,
        ).first()
        if existing:
            # Preserva llm_summary/generated_at se já existe
            existing.attendant_name = att_name
            existing.role = role
            existing.total_conversations = total
            existing.resolved_conversations = resolved
            existing.abandoned_conversations = abandoned
            existing.resolution_rate = resolution_rate
            existing.avg_first_response_seconds = sum(responses) / len(responses) if responses else None
            existing.avg_resolution_seconds = sum(resolutions) / len(resolutions) if resolutions else None
            existing.total_messages_sent = sum(i.outbound_count for i in items)
            existing.total_messages_received = sum(i.inbound_count for i in items)
            existing.avg_satisfaction = sum(satisfactions) / len(satisfactions) if satisfactions else None
            existing.sla_5min_rate = _sla_rate(items, 300)
            existing.sla_15min_rate = _sla_rate(items, 900)
            existing.sla_30min_rate = _sla_rate(items, 1800)
            existing.top_categories = json.dumps(top_cats, ensure_ascii=False)
            existing.top_sentiments = json.dumps(top_sents, ensure_ascii=False)
            existing.last_updated = datetime.utcnow()
        else:
            db.add(AtendentRaw(
                attendant_id=att_id,
                attendant_name=att_name,
                role=role,
                instance_id=instance_id,
                period_week=period_week,
                total_conversations=total,
                resolved_conversations=resolved,
                abandoned_conversations=abandoned,
                resolution_rate=resolution_rate,
                avg_first_response_seconds=sum(responses) / len(responses) if responses else None,
                avg_resolution_seconds=sum(resolutions) / len(resolutions) if resolutions else None,
                total_messages_sent=sum(i.outbound_count for i in items),
                total_messages_received=sum(i.inbound_count for i in items),
                avg_satisfaction=sum(satisfactions) / len(satisfactions) if satisfactions else None,
                sla_5min_rate=_sla_rate(items, 300),
                sla_15min_rate=_sla_rate(items, 900),
                sla_30min_rate=_sla_rate(items, 1800),
                top_categories=json.dumps(top_cats, ensure_ascii=False),
                top_sentiments=json.dumps(top_sents, ensure_ascii=False),
            ))
        upserted += 1

    db.commit()
    logger.info("populate_atendente_raw: %d atendentes (instance=%s, week=%s)", upserted, instance_id, period_week)
    return upserted


# ─── Etapa 4: LLM summary ────────────────────────────────────────────────────

REPORT_SYSTEM_PROMPT = (
    "Você é um analista de qualidade de atendimento ao cliente. "
    "Escreva relatórios objetivos, construtivos e em português brasileiro. "
    "Não mencione números exatos — interprete-os qualitativamente."
)

REPORT_USER_TEMPLATE = """\
Avalie a performance do(a) atendente abaixo com base nas métricas da semana de trabalho.
Escreva exatamente 3 parágrafos sem títulos ou marcadores:
1. Resumo geral da semana (volume, ritmo, resultado)
2. Pontos positivos e destaques de qualidade
3. Pontos de atenção e sugestões práticas de melhoria

Dados do período:
Atendente: {name} (função: {role})
Semana: {week_label}
Conversas: {total} total | {resolved} resolvidas | {abandoned} abandonadas
Taxa de resolução: {resolution_rate}%
Tempo médio de 1ª resposta: {avg_response}
Tempo médio de resolução: {avg_resolution}
SLA respondido em até 5min: {sla_5}% | 15min: {sla_15}% | 30min: {sla_30}%
Satisfação média do cliente: {avg_satisfaction}
Tipos de atendimento mais frequentes: {top_categories}
Sentimentos predominantes: {top_sentiments}
"""


def _build_report_prompt(row: AtendentRaw) -> str:
    week_label = row.period_week.strftime("%d/%m/%Y") if row.period_week else "–"
    try:
        cats = json.loads(row.top_categories or "{}")
        cat_str = ", ".join(f"{k} ({v}x)" for k, v in cats.items()) or "–"
    except Exception:
        cat_str = "–"
    try:
        sents = json.loads(row.top_sentiments or "{}")
        sent_str = ", ".join(f"{k} ({v}x)" for k, v in sents.items()) or "–"
    except Exception:
        sent_str = "–"

    role_map = {"manager": "gerente", "agent": "agente"}
    role_label = role_map.get(row.role or "agent", row.role or "agente")

    avg_sat = f"{row.avg_satisfaction:.1f}/5" if row.avg_satisfaction else "não disponível"

    return REPORT_USER_TEMPLATE.format(
        name=row.attendant_name,
        role=role_label,
        week_label=f"semana iniciada em {week_label}",
        total=row.total_conversations,
        resolved=row.resolved_conversations,
        abandoned=row.abandoned_conversations,
        resolution_rate=f"{row.resolution_rate:.1f}",
        avg_response=_format_seconds(row.avg_first_response_seconds),
        avg_resolution=_format_seconds(row.avg_resolution_seconds),
        sla_5=f"{row.sla_5min_rate:.1f}",
        sla_15=f"{row.sla_15min_rate:.1f}",
        sla_30=f"{row.sla_30min_rate:.1f}",
        avg_satisfaction=avg_sat,
        top_categories=cat_str,
        top_sentiments=sent_str,
    )


def _call_llm_text(prompt: str) -> str:
    provider = settings.LLM_PROVIDER.lower()
    if provider == "anthropic":
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=700,
            system=REPORT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text.strip()
    else:
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=700,
            messages=[
                {"role": "system", "content": REPORT_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        )
        return resp.choices[0].message.content.strip()


def generate_llm_summary(row: AtendentRaw) -> str:
    prompt = _build_report_prompt(row)
    return _call_llm_text(prompt)


# ─── Orquestrador principal ───────────────────────────────────────────────────

def generate_all_reports(instance_id: int, days: int = 7) -> dict:
    """
    Pipeline completo: agrega dados + gera resumo LLM por atendente.
    Projetado para rodar em background (BackgroundTasks do FastAPI).
    """
    provider = settings.LLM_PROVIDER.lower()
    if provider == "openai" and not settings.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY não configurada — relatório ignorado.")
        return {"status": "error", "error": "LLM não configurado"}
    if provider == "anthropic" and not settings.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY não configurada — relatório ignorado.")
        return {"status": "error", "error": "LLM não configurado"}

    db = SessionLocal()
    try:
        # Etapa 1
        populate_atendimento_raw(db, instance_id, days)

        # Etapa 2 e 3 — agrupa por semana coberta pelo período
        period_week = _get_week_start()
        populate_cliente_atend_raw(db, instance_id, period_week)
        populate_atendente_raw(db, instance_id, period_week)

        # Etapa 4 — LLM por atendente
        rows = db.query(AtendentRaw).filter(
            AtendentRaw.instance_id == instance_id,
            AtendentRaw.period_week == period_week,
        ).all()

        processed = 0
        for row in rows:
            try:
                summary = generate_llm_summary(row)
                row.llm_summary = summary
                row.generated_at = datetime.utcnow()
                db.commit()
                processed += 1
                logger.info("Relatório gerado para atendente=%s semana=%s", row.attendant_name, period_week)
            except Exception as e:
                logger.error("Erro ao gerar relatório para atendente=%s: %s", row.attendant_id, e)
                db.rollback()

        return {"status": "ok", "attendants_processed": processed, "period_week": str(period_week)}

    except Exception as e:
        logger.error("generate_all_reports error: %s", e)
        return {"status": "error", "error": str(e)}
    finally:
        db.close()
