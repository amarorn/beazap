"""Servico de analise de tendencias e anomalias usando LLM."""
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.attendant import Attendant
from app.models.conversation import Conversation, ConversationStatus

logger = logging.getLogger(__name__)

VALID_CATEGORIES = "reclamacao, problema_tecnico, nova_contratacao, suporte, elogio, informacao, outro"

TOPICS_SYSTEM_PROMPT = """Voce e um analista de tendencias de atendimento ao cliente. Sua tarefa e identificar topicos emergentes ou incomuns em um conjunto de resumos de conversas. Foque em temas que parecem novos, recorrentes ou que estao crescendo em volume. Retorne APENAS um objeto JSON valido, sem markdown, sem explicacoes."""

TOPICS_USER_PROMPT_TEMPLATE = """Analise os seguintes resumos de conversas de atendimento ao cliente, ocorridas no periodo de {data_inicio} a {data_fim}. As categorias de conversas existentes sao: {categorias_existentes}.

Resumos das Conversas:
{resumos_conversas}

Identifique ate 5 topicos emergentes ou tendencias notaveis que nao se encaixam perfeitamente nas categorias existentes ou que demonstram um aumento de volume. Para cada topico, forneca uma breve descricao e aponte exemplos de resumos que o ilustram.

Retorne APENAS este JSON:
{{
  "topicos_emergentes": [
    {{
      "nome": "Nome do Topico 1",
      "descricao": "Breve descricao do topico emergente.",
      "exemplos_resumos": ["Resumo da conversa X", "Resumo da conversa Y"]
    }}
  ]
}}"""

ANOMALIES_SYSTEM_PROMPT = """Voce e um analista de dados de atendimento ao cliente. Sua funcao e identificar anomalias (picos ou quedas inesperadas) em metricas de performance. Compare o periodo atual com o historico e aponte desvios significativos. Retorne APENAS um objeto JSON valido, sem markdown, sem explicacoes."""

ANOMALIES_USER_PROMPT_TEMPLATE = """Analise os seguintes dados de metricas de atendimento ao cliente para a categoria '{categoria_analisada}' no periodo de {data_inicio} a {data_fim}. Considere o historico para identificar anomalias.

Metricas do Periodo Atual:
- Volume de Conversas: {volume_atual}
- Media de Satisfacao: {satisfacao_atual}
- Taxa de Resolucao: {resolucao_atual}%
- Media de Tempo de Primeira Resposta: {tempo_resposta_atual} segundos

Metricas Historicas (Media das ultimas 4 semanas para o mesmo periodo):
- Volume de Conversas Historico: {volume_historico}
- Media de Satisfacao Historica: {satisfacao_historica}
- Taxa de Resolucao Historica: {resolucao_historica}%
- Media de Tempo de Primeira Resposta Historico: {tempo_resposta_historico} segundos

Identifique se ha alguma anomalia (pico ou queda significativa) em qualquer uma das metricas, comparando o periodo atual com o historico. Para cada anomalia, descreva-a e sugira uma possivel causa ou impacto.

Retorne APENAS este JSON:
{{
  "anomalias": [
    {{
      "metrica": "Volume de Conversas",
      "tipo": "pico" ou "queda",
      "valor_atual": 0,
      "valor_historico": 0,
      "descricao": "Descricao da anomalia e sua magnitude.",
      "sugestao_causa_impacto": "Possivel causa ou impacto da anomalia."
    }}
  ]
}}"""

SENTIMENT_SYSTEM_PROMPT = """Voce e um especialista em analise de sentimento. Sua tarefa e identificar anomalias na distribuicao de sentimentos (positivo, neutro, negativo) para um determinado contexto (topico ou atendente), comparando o periodo atual com o historico. Retorne APENAS um objeto JSON valido, sem markdown, sem explicacoes."""

SENTIMENT_USER_PROMPT_TEMPLATE = """Analise a distribuicao de sentimentos para o contexto '{contexto_analisado}' (tipo: {tipo_contexto}) no periodo de {data_inicio} a {data_fim}. Compare com a distribuicao historica para identificar anomalias.

Distribuicao de Sentimentos Atual:
- Positivo: {positivo_atual}%
- Neutro: {neutro_atual}%
- Negativo: {negativo_atual}%

Distribuicao de Sentimentos Historica (Media das ultimas 4 semanas):
- Positivo Historico: {positivo_historico}%
- Neutro Historico: {neutro_historico}%
- Negativo Historico: {negativo_historico}%

Identifique se ha uma mudanca significativa na distribuicao de sentimentos (ex: aumento inesperado de sentimentos negativos, queda de positivos). Descreva a anomalia e sugira uma possivel implicacao.

Retorne APENAS este JSON:
{{
  "anomalias_sentimento": [
    {{
      "contexto": "{contexto_analisado}",
      "tipo_contexto": "{tipo_contexto}",
      "mudanca_sentimento": "Aumento de sentimentos negativos" ou "Queda de sentimentos positivos",
      "descricao": "Descricao da anomalia na distribuicao de sentimentos.",
      "implicacao_sugerida": "Possivel implicacao para a qualidade do atendimento ou satisfacao do cliente."
    }}
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


def _get_summaries(
    db: Session,
    data_inicio: datetime,
    data_fim: datetime,
    instance_id: Optional[int] = None,
    limit: int = 100,
) -> str:
    q = (
        db.query(Conversation.analysis_summary)
        .filter(
            Conversation.analysis_summary.isnot(None),
            Conversation.analysis_summary != "",
            Conversation.opened_at >= data_inicio,
            Conversation.opened_at < data_fim,
            Conversation.is_group == False,
        )
    )
    if instance_id:
        q = q.filter(Conversation.instance_id == instance_id)
    rows = q.order_by(Conversation.opened_at.desc()).limit(limit).all()
    if not rows:
        return "(Nenhum resumo de conversa encontrado no periodo.)"
    lines = [f"- {r[0]}" for r in rows if r[0]]
    return "\n".join(lines)


def _metrics_for_period(
    db: Session,
    start: datetime,
    end: datetime,
    instance_id: Optional[int],
    category: Optional[str] = None,
    attendant_id: Optional[int] = None,
) -> dict[str, Any]:
    base = db.query(Conversation).filter(
        Conversation.opened_at >= start,
        Conversation.opened_at < end,
        Conversation.is_group == False,
    )
    if instance_id:
        base = base.filter(Conversation.instance_id == instance_id)
    if category:
        base = base.filter(Conversation.analysis_category == category)
    if attendant_id is not None:
        base = base.filter(Conversation.attendant_id == attendant_id)

    total = base.count()
    resolved = base.filter(Conversation.status == ConversationStatus.resolved).count()
    resolution_rate = (resolved / total * 100) if total > 0 else 0.0

    sat_query = db.query(func.avg(Conversation.analysis_satisfaction)).filter(
        Conversation.analysis_satisfaction.isnot(None),
        Conversation.opened_at >= start,
        Conversation.opened_at < end,
        Conversation.is_group == False,
    )
    if instance_id:
        sat_query = sat_query.filter(Conversation.instance_id == instance_id)
    if category:
        sat_query = sat_query.filter(Conversation.analysis_category == category)
    if attendant_id is not None:
        sat_query = sat_query.filter(Conversation.attendant_id == attendant_id)
    avg_sat = sat_query.scalar() or 0.0

    resp_query = db.query(func.avg(Conversation.first_response_time_seconds)).filter(
        Conversation.first_response_time_seconds.isnot(None),
        Conversation.opened_at >= start,
        Conversation.opened_at < end,
        Conversation.is_group == False,
    )
    if instance_id:
        resp_query = resp_query.filter(Conversation.instance_id == instance_id)
    if category:
        resp_query = resp_query.filter(Conversation.analysis_category == category)
    if attendant_id is not None:
        resp_query = resp_query.filter(Conversation.attendant_id == attendant_id)
    avg_resp = resp_query.scalar() or 0.0

    return {
        "volume": total,
        "satisfaction": round(float(avg_sat), 1),
        "resolution_rate": round(resolution_rate, 1),
        "avg_response_seconds": round(float(avg_resp), 0),
    }


def _sentiment_pct_for_period(
    db: Session,
    start: datetime,
    end: datetime,
    instance_id: Optional[int],
    category: Optional[str] = None,
    attendant_id: Optional[int] = None,
) -> dict[str, float]:
    base = db.query(
        Conversation.analysis_sentiment,
        func.count(Conversation.id),
    ).filter(
        Conversation.analysis_sentiment.isnot(None),
        Conversation.opened_at >= start,
        Conversation.opened_at < end,
        Conversation.is_group == False,
    )
    if instance_id:
        base = base.filter(Conversation.instance_id == instance_id)
    if category:
        base = base.filter(Conversation.analysis_category == category)
    if attendant_id is not None:
        base = base.filter(Conversation.attendant_id == attendant_id)
    rows = base.group_by(Conversation.analysis_sentiment).all()
    counts = {r[0].lower(): r[1] for r in rows}
    total = sum(counts.values()) or 1
    return {
        "positivo": round(100 * counts.get("positivo", 0) / total, 1),
        "neutro": round(100 * counts.get("neutro", 0) / total, 1),
        "negativo": round(100 * counts.get("negativo", 0) / total, 1),
    }


def analyze_emerging_topics(
    data_inicio: str,
    data_fim: str,
    instance_id: Optional[int] = None,
) -> Optional[dict[str, Any]]:
    """Identifica topicos emergentes em resumos de conversas."""
    provider = settings.LLM_PROVIDER.lower()
    if provider not in ("anthropic", "openai") or (provider == "openai" and not settings.OPENAI_API_KEY) or (provider == "anthropic" and not settings.ANTHROPIC_API_KEY):
        logger.warning("LLM nao configurado para analise de topicos.")
        return None

    try:
        di = datetime.fromisoformat(data_inicio.replace("Z", "+00:00"))
        df = datetime.fromisoformat(data_fim.replace("Z", "+00:00")) + timedelta(days=1)
    except (ValueError, TypeError):
        logger.error("Formato de data invalido. Use ISO (ex: 2024-03-01).")
        return None

    db = SessionLocal()
    try:
        resumos = _get_summaries(db, di, df, instance_id)
        user_content = TOPICS_USER_PROMPT_TEMPLATE.format(
            data_inicio=data_inicio[:10],
            data_fim=data_fim[:10],
            categorias_existentes=VALID_CATEGORIES,
            resumos_conversas=resumos,
        )
        raw = _call_llm(TOPICS_SYSTEM_PROMPT, user_content)
        data = _parse_json(raw)
        return {
            "topicos_emergentes": data.get("topicos_emergentes", []),
            "periodo": {"inicio": data_inicio, "fim": data_fim},
        }
    except json.JSONDecodeError as e:
        logger.error("Erro ao parsear JSON de topicos emergentes: %s", e)
        return None
    except Exception as e:
        logger.error("Erro ao analisar topicos emergentes: %s", e)
        return None
    finally:
        db.close()


def analyze_metric_anomalies(
    data_inicio: str,
    data_fim: str,
    categoria_analisada: str,
    instance_id: Optional[int] = None,
) -> Optional[dict[str, Any]]:
    """Identifica anomalias em metricas comparando periodo atual vs historico."""
    provider = settings.LLM_PROVIDER.lower()
    if provider not in ("anthropic", "openai") or (provider == "openai" and not settings.OPENAI_API_KEY) or (provider == "anthropic" and not settings.ANTHROPIC_API_KEY):
        logger.warning("LLM nao configurado para analise de anomalias.")
        return None

    try:
        di = datetime.fromisoformat(data_inicio.replace("Z", "+00:00"))
        df = datetime.fromisoformat(data_fim.replace("Z", "+00:00")) + timedelta(days=1)
    except (ValueError, TypeError):
        logger.error("Formato de data invalido.")
        return None

    db = SessionLocal()
    try:
        current = _metrics_for_period(db, di, df, instance_id, category=categoria_analisada)
        hist_start = di - timedelta(weeks=4)
        hist_end = df - timedelta(weeks=4)
        historic = _metrics_for_period(db, hist_start, hist_end, instance_id, category=categoria_analisada)

        user_content = ANOMALIES_USER_PROMPT_TEMPLATE.format(
            categoria_analisada=categoria_analisada,
            data_inicio=data_inicio[:10],
            data_fim=data_fim[:10],
            volume_atual=current["volume"],
            satisfacao_atual=current["satisfaction"],
            resolucao_atual=current["resolution_rate"],
            tempo_resposta_atual=current["avg_response_seconds"],
            volume_historico=historic["volume"],
            satisfacao_historica=historic["satisfaction"],
            resolucao_historica=historic["resolution_rate"],
            tempo_resposta_historico=historic["avg_response_seconds"],
        )
        raw = _call_llm(ANOMALIES_SYSTEM_PROMPT, user_content)
        data = _parse_json(raw)
        return {
            "anomalias": data.get("anomalias", []),
            "periodo": {"inicio": data_inicio, "fim": data_fim},
            "categoria": categoria_analisada,
            "metricas_atual": current,
            "metricas_historico": historic,
        }
    except json.JSONDecodeError as e:
        logger.error("Erro ao parsear JSON de anomalias: %s", e)
        return None
    except Exception as e:
        logger.error("Erro ao analisar anomalias de metricas: %s", e)
        return None
    finally:
        db.close()


def analyze_sentiment_anomalies(
    data_inicio: str,
    data_fim: str,
    contexto_analisado: str,
    tipo_contexto: str,
    instance_id: Optional[int] = None,
) -> Optional[dict[str, Any]]:
    """Identifica anomalias na distribuicao de sentimentos (topico ou atendente)."""
    provider = settings.LLM_PROVIDER.lower()
    if provider not in ("anthropic", "openai") or (provider == "openai" and not settings.OPENAI_API_KEY) or (provider == "anthropic" and not settings.ANTHROPIC_API_KEY):
        logger.warning("LLM nao configurado para analise de sentimento.")
        return None

    if tipo_contexto not in ("topico", "atendente"):
        logger.error("tipo_contexto deve ser 'topico' ou 'atendente'.")
        return None

    try:
        di = datetime.fromisoformat(data_inicio.replace("Z", "+00:00"))
        df = datetime.fromisoformat(data_fim.replace("Z", "+00:00")) + timedelta(days=1)
    except (ValueError, TypeError):
        logger.error("Formato de data invalido.")
        return None

    attendant_id = None
    category = None
    if tipo_contexto == "atendente":
        db_check = SessionLocal()
        att = db_check.query(Attendant).filter(Attendant.name == contexto_analisado)
        if instance_id:
            att = att.filter(Attendant.instance_id == instance_id)
        att = att.first()
        db_check.close()
        if att:
            attendant_id = att.id
        else:
            logger.warning("Atendente '%s' nao encontrado.", contexto_analisado)
    else:
        category = contexto_analisado

    db = SessionLocal()
    try:
        current = _sentiment_pct_for_period(db, di, df, instance_id, category=category, attendant_id=attendant_id)
        hist_start = di - timedelta(weeks=4)
        hist_end = df - timedelta(weeks=4)
        historic = _sentiment_pct_for_period(db, hist_start, hist_end, instance_id, category=category, attendant_id=attendant_id)

        user_content = SENTIMENT_USER_PROMPT_TEMPLATE.format(
            contexto_analisado=contexto_analisado,
            tipo_contexto=tipo_contexto,
            data_inicio=data_inicio[:10],
            data_fim=data_fim[:10],
            positivo_atual=current["positivo"],
            neutro_atual=current["neutro"],
            negativo_atual=current["negativo"],
            positivo_historico=historic["positivo"],
            neutro_historico=historic["neutro"],
            negativo_historico=historic["negativo"],
        )
        raw = _call_llm(SENTIMENT_SYSTEM_PROMPT, user_content)
        data = _parse_json(raw)
        return {
            "anomalias_sentimento": data.get("anomalias_sentimento", []),
            "periodo": {"inicio": data_inicio, "fim": data_fim},
            "contexto": contexto_analisado,
            "tipo_contexto": tipo_contexto,
            "distribuicao_atual": current,
            "distribuicao_historica": historic,
        }
    except json.JSONDecodeError as e:
        logger.error("Erro ao parsear JSON de anomalias de sentimento: %s", e)
        return None
    except Exception as e:
        logger.error("Erro ao analisar anomalias de sentimento: %s", e)
        return None
    finally:
        db.close()
