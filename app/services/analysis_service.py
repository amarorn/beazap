import json
import logging
from datetime import datetime

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.conversation import Conversation
from app.models.message import Message, MessageDirection

logger = logging.getLogger(__name__)

VALID_CATEGORIES = {
    "reclamacao", "problema_tecnico", "nova_contratacao",
    "suporte", "elogio", "informacao", "outro",
}
VALID_SENTIMENTS = {"positivo", "neutro", "negativo"}

SYSTEM_PROMPT = """Você é um assistente especialista em análise de conversas de atendimento ao cliente.
Analise a conversa fornecida e retorne APENAS um objeto JSON válido, sem markdown, sem explicações.
Não inclua nenhum texto fora do JSON."""

USER_PROMPT_TEMPLATE = """Analise a seguinte conversa de atendimento ao cliente no WhatsApp.

Retorne APENAS um JSON válido com os campos:
- "category": uma das opções exatas: reclamacao, problema_tecnico, nova_contratacao, suporte, elogio, informacao, outro
- "sentiment": "positivo", "neutro" ou "negativo"
- "satisfaction": inteiro de 1 a 5 (1=muito insatisfeito, 5=muito satisfeito). Se não há como avaliar, use 3.
- "summary": resumo em 1-2 frases em português descrevendo o atendimento e seu desfecho

Categorias:
- reclamacao: cliente reclamando de produto/serviço
- problema_tecnico: falha técnica, erro, bug
- nova_contratacao: interesse em contratar, comprar, assinar
- suporte: dúvida ou pedido de ajuda geral
- elogio: feedback positivo, agradecimento
- informacao: pedido de informações sem reclamação
- outro: não se encaixa nas anteriores

Conversa:
{conversa}"""


def _build_conversation_text(messages: list) -> str:
    lines = []
    for m in messages:
        if not m.content:
            continue
        role = "Atendente" if m.direction == MessageDirection.outbound else "Cliente"
        lines.append(f"[{role}]: {m.content}")
    return "\n".join(lines)


def _call_anthropic(conversation_text: str) -> str:
    import anthropic
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": USER_PROMPT_TEMPLATE.format(conversa=conversation_text),
            }
        ],
    )
    return response.content[0].text.strip()


def _call_openai(conversation_text: str) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=512,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": USER_PROMPT_TEMPLATE.format(conversa=conversation_text)},
        ],
    )
    return response.choices[0].message.content.strip()


def _parse_result(raw: str) -> dict:
    # Limpar possível markdown ```json ... ```
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw)


def analyze_conversation(conversation_id: int) -> None:
    """Analisa uma conversa com LLM e salva os resultados.
    Projetada para rodar em background (FastAPI BackgroundTasks).
    """
    provider = settings.LLM_PROVIDER.lower()

    if provider == "openai" and not settings.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY não configurada — análise ignorada.")
        return
    if provider == "anthropic" and not settings.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY não configurada — análise ignorada.")
        return
    if provider not in ("anthropic", "openai"):
        logger.warning(f"LLM_PROVIDER inválido: '{provider}'. Use 'anthropic' ou 'openai'.")
        return

    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conv:
            return

        messages = (
            db.query(Message)
            .filter(Message.conversation_id == conversation_id, Message.is_deleted == False)
            .order_by(Message.timestamp.asc())
            .all()
        )

        conversation_text = _build_conversation_text(messages)
        if not conversation_text.strip():
            logger.info(f"Conversa {conversation_id} sem texto — análise ignorada.")
            return

        if provider == "openai":
            raw = _call_openai(conversation_text)
        else:
            raw = _call_anthropic(conversation_text)

        data = _parse_result(raw)

        category = data.get("category", "outro")
        if category not in VALID_CATEGORIES:
            category = "outro"

        sentiment = data.get("sentiment", "neutro")
        if sentiment not in VALID_SENTIMENTS:
            sentiment = "neutro"

        satisfaction = data.get("satisfaction", 3)
        try:
            satisfaction = max(1, min(5, int(satisfaction)))
        except (ValueError, TypeError):
            satisfaction = 3

        summary = str(data.get("summary", ""))[:500]

        conv.analysis_category = category
        conv.analysis_sentiment = sentiment
        conv.analysis_satisfaction = satisfaction
        conv.analysis_summary = summary
        conv.analysis_analyzed_at = datetime.utcnow()
        db.commit()

        logger.info(
            f"Conversa {conversation_id} analisada via {provider}: "
            f"{category} / {sentiment} / {satisfaction}"
        )

    except json.JSONDecodeError as e:
        logger.error(f"Erro ao parsear JSON da análise da conversa {conversation_id}: {e}")
    except Exception as e:
        logger.error(f"Erro ao analisar conversa {conversation_id}: {e}")
    finally:
        db.close()
