"""Servico de previsao de churn usando LLM."""
import json
import logging
from collections import Counter
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import func

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.conversation import Conversation, ConversationStatus

logger = logging.getLogger(__name__)

CHURN_SYSTEM_PROMPT = """Voce e um especialista em analise de comportamento do cliente e previsao de churn. Sua tarefa e analisar o historico de interacoes de um cliente e determinar seu nivel de risco de churn (Baixo, Medio, Alto). Forneca as razoes para essa avaliacao e sugira acoes proativas para retencao. Retorne APENAS um objeto JSON valido, sem markdown, sem explicacoes."""

CHURN_USER_PROMPT_TEMPLATE = """Analise o perfil de interacao do cliente com o numero de contato {numero_cliente} no periodo de {data_inicio} a {data_fim}. Considere os seguintes dados:

**Historico de Interacoes:**
- Total de Conversas: {total_conversas}
- Conversas Resolvidas: {conversas_resolvidas}
- Conversas Abandonadas: {conversas_abandonadas}
- Media de Tempo de Resolucao: {avg_resolucao} segundos
- Media de Tempo de Primeira Resposta: {avg_primeira_resposta} segundos
- Ultima Interacao: {ultima_interacao_dias} dias atras

**Analise de Sentimento e Satisfacao (ultimas {periodo_analise_sentimento} conversas ou {dias_analise_sentimento} dias):**
- Sentimento Predominante: {sentimento_predominante}
- Media de Satisfacao: {media_satisfacao} (escala de 1 a 5)
- Tendencia de Satisfacao: {tendencia_satisfacao}
- Categorias Mais Frequentes: {categorias_frequentes}

**Informacoes Adicionais (se disponivel):**
- Resumos de Conversas Recentes (ultimas 3): {resumos_conversas_recentes}

Com base nesses dados, avalie o risco de churn do cliente. Forneca o nivel de risco, as principais razoes para essa avaliacao e sugira 2-3 acoes proativas que a equipe de atendimento ou vendas pode tomar para reter o cliente.

Retorne APENAS este JSON:
{{
  "cliente_id": "{numero_cliente}",
  "risco_churn": "Baixo" ou "Medio" ou "Alto",
  "razoes": [
    "Razao 1 para o risco de churn.",
    "Razao 2 para o risco de churn."
  ],
  "acoes_sugeridas": [
    "Acao 1 (ex: contato proativo para verificar satisfacao).",
    "Acao 2 (ex: oferta de suporte especializado)."
  ]
}}"""


def _call_llm(system_prompt: str, user_content: str) -> str:
    provider = settings.LLM_PROVIDER.lower()
    if provider == "anthropic":
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        )
        return resp.content[0].text.strip()
    from openai import OpenAI
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=1024,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
    )
    return resp.choices[0].message.content.strip()


def _parse_json(raw: str) -> dict[str, Any]:
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


def predict_churn(
    numero_cliente: str,
    data_inicio: str,
    data_fim: str,
    instance_id: Optional[int] = None,
    periodo_analise_sentimento: int = 5,
    dias_analise_sentimento: int = 30,
) -> Optional[dict[str, Any]]:
    """Avalia o risco de churn de um cliente com base no historico de interacoes."""
    provider = settings.LLM_PROVIDER.lower()
    if provider not in ("anthropic", "openai"):
        logger.warning("LLM_PROVIDER invalido para previsao de churn.")
        return None
    if provider == "openai" and not settings.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY nao configurada.")
        return None
    if provider == "anthropic" and not settings.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY nao configurada.")
        return None

    try:
        di = datetime.fromisoformat(data_inicio.replace("Z", "+00:00"))
        df = datetime.fromisoformat(data_fim.replace("Z", "+00:00")) + timedelta(days=1)
    except (ValueError, TypeError):
        logger.error("Formato de data invalido.")
        return None

    db = SessionLocal()
    try:
        base = db.query(Conversation).filter(
            Conversation.contact_phone == numero_cliente,
            Conversation.opened_at >= di,
            Conversation.opened_at < df,
            Conversation.is_group == False,
        )
        if instance_id:
            base = base.filter(Conversation.instance_id == instance_id)

        convs = base.order_by(Conversation.opened_at.desc()).all()
        if not convs:
            logger.info("Cliente %s sem conversas no periodo.", numero_cliente)
            return None

        total = len(convs)
        resolved = sum(1 for c in convs if c.status == ConversationStatus.resolved)
        abandoned = sum(1 for c in convs if c.status == ConversationStatus.abandoned)

        resolution_times = []
        for c in convs:
            if c.status == ConversationStatus.resolved and c.resolved_at and c.opened_at:
                sec = (c.resolved_at - c.opened_at).total_seconds()
                resolution_times.append(sec)
        avg_resolucao = round(sum(resolution_times) / len(resolution_times), 0) if resolution_times else 0

        resp_times = [c.first_response_time_seconds for c in convs if c.first_response_time_seconds is not None]
        avg_primeira_resposta = round(sum(resp_times) / len(resp_times), 0) if resp_times else 0

        def _to_naive(dt):
            if dt is None:
                return None
            return dt.replace(tzinfo=None) if getattr(dt, "tzinfo", None) else dt

        last_ts = None
        for c in convs:
            t = c.last_message_at or c.opened_at or c.resolved_at
            if t:
                t_naive = _to_naive(t)
                if last_ts is None or t_naive > last_ts:
                    last_ts = t_naive
        now = datetime.utcnow()
        ultima_interacao_dias = int((now - last_ts).total_seconds() / 86400) if last_ts else 0

        recent_conv = convs[:periodo_analise_sentimento]
        sentimento_counts = Counter()
        satisfactions = []
        categories = []
        for c in recent_conv:
            if c.analysis_sentiment:
                sentimento_counts[c.analysis_sentiment.lower()] += 1
            if c.analysis_satisfaction is not None:
                satisfactions.append(c.analysis_satisfaction)
            if c.analysis_category:
                categories.append(c.analysis_category)

        sentimento_predominante = (
            sentimento_counts.most_common(1)[0][0] if sentimento_counts else "neutro"
        )
        media_satisfacao = round(sum(satisfactions) / len(satisfactions), 1) if satisfactions else 0
        categorias_frequentes = ", ".join(set(categories)) if categories else "nao informado"

        tendencia_satisfacao = "estavel"
        if len(convs) >= 6:
            older = convs[3:6]
            older_sat = [c.analysis_satisfaction for c in older if c.analysis_satisfaction is not None]
            recent_sat = satisfactions[:3]
            if older_sat and recent_sat:
                avg_older = sum(older_sat) / len(older_sat)
                avg_recent = sum(recent_sat) / len(recent_sat)
                if avg_recent - avg_older >= 0.5:
                    tendencia_satisfacao = "em alta"
                elif avg_older - avg_recent >= 0.5:
                    tendencia_satisfacao = "em queda"

        resumos = []
        for c in recent_conv[:3]:
            if c.analysis_summary and c.analysis_summary.strip():
                resumos.append(c.analysis_summary.strip()[:300])
        resumos_conversas_recentes = "\n".join(f"- {r}" for r in resumos) if resumos else "(Nenhum resumo disponivel)"

        user_content = CHURN_USER_PROMPT_TEMPLATE.format(
            numero_cliente=numero_cliente,
            data_inicio=data_inicio[:10],
            data_fim=data_fim[:10],
            total_conversas=total,
            conversas_resolvidas=resolved,
            conversas_abandonadas=abandoned,
            avg_resolucao=int(avg_resolucao),
            avg_primeira_resposta=int(avg_primeira_resposta),
            ultima_interacao_dias=ultima_interacao_dias,
            periodo_analise_sentimento=periodo_analise_sentimento,
            dias_analise_sentimento=dias_analise_sentimento,
            sentimento_predominante=sentimento_predominante,
            media_satisfacao=media_satisfacao,
            tendencia_satisfacao=tendencia_satisfacao,
            categorias_frequentes=categorias_frequentes,
            resumos_conversas_recentes=resumos_conversas_recentes,
        )
        raw = _call_llm(CHURN_SYSTEM_PROMPT, user_content)
        data = _parse_json(raw)
        data["periodo"] = {"inicio": data_inicio, "fim": data_fim}
        data["metricas_utilizadas"] = {
            "total_conversas": total,
            "conversas_resolvidas": resolved,
            "conversas_abandonadas": abandoned,
            "ultima_interacao_dias": ultima_interacao_dias,
            "media_satisfacao": media_satisfacao,
        }
        return data
    except json.JSONDecodeError as e:
        logger.error("Erro ao parsear JSON de churn: %s", e)
        return None
    except Exception as e:
        logger.error("Erro ao prever churn: %s", e)
        return None
    finally:
        db.close()
