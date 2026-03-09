"""Gera resumo geral da conversa com LLM ao resolver; salva como nota para contexto e relatório."""
import logging
from datetime import datetime

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.conversation import Conversation
from app.models.conversation_note import ConversationNote
from app.models.message import Message, MessageDirection

logger = logging.getLogger(__name__)

RESUMO_SYSTEM = """Você é um assistente que resume conversas de atendimento ao cliente.
Produza um resumo objetivo em português em 2 a 4 frases: o que o cliente precisou, o que foi feito e o desfecho.
Retorne apenas o texto do resumo, sem título nem marcadores."""

RESUMO_USER_TEMPLATE = """Resuma esta conversa de atendimento:

{conversa}

Resumo:"""


def _build_conversation_text(messages: list) -> str:
    lines = []
    for m in messages:
        if not m.content:
            continue
        role = "Atendente" if m.direction == MessageDirection.outbound else "Cliente"
        lines.append(f"[{role}]: {m.content}")
    return "\n".join(lines)


def _call_llm(conversation_text: str) -> str:
    provider = settings.LLM_PROVIDER.lower()
    if provider == "anthropic":
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system=RESUMO_SYSTEM,
            messages=[{"role": "user", "content": RESUMO_USER_TEMPLATE.format(conversa=conversation_text)}],
        )
        return resp.content[0].text.strip()
    from openai import OpenAI
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=512,
        messages=[
            {"role": "system", "content": RESUMO_SYSTEM},
            {"role": "user", "content": RESUMO_USER_TEMPLATE.format(conversa=conversation_text)},
        ],
    )
    return resp.choices[0].message.content.strip()


def generate_and_save_resolution_summary(conversation_id: int) -> bool:
    """Gera resumo com LLM e salva como nota tipo resumo_llm. Retorna True se salvou."""
    provider = settings.LLM_PROVIDER.lower()
    if provider not in ("anthropic", "openai"):
        logger.warning("LLM_PROVIDER inválido para resumo ao resolver.")
        return False
    if provider == "openai" and not settings.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY não configurada — resumo ao resolver ignorado.")
        return False
    if provider == "anthropic" and not settings.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY não configurada — resumo ao resolver ignorado.")
        return False

    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conv:
            return False
        messages = (
            db.query(Message)
            .filter(Message.conversation_id == conversation_id, Message.is_deleted == False)
            .order_by(Message.timestamp.asc())
            .all()
        )
        conversation_text = _build_conversation_text(messages)
        if not conversation_text.strip():
            logger.info("Conversa %s sem texto — resumo ao resolver ignorado.", conversation_id)
            return False

        summary = _call_llm(conversation_text)
        if not summary or not summary.strip():
            return False

        note = ConversationNote(
            conversation_id=conversation_id,
            author_name="Resumo (IA)",
            content=summary.strip(),
            note_type="resumo_llm",
        )
        db.add(note)
        db.commit()
        logger.info("Resumo ao resolver salvo para conversa %s.", conversation_id)
        return True
    except Exception as e:
        logger.exception("Erro ao gerar resumo ao resolver conversa %s: %s", conversation_id, e)
        db.rollback()
        return False
    finally:
        db.close()
