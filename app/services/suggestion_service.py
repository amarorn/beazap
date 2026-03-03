import json
import logging

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.conversation import Conversation
from app.models.message import Message, MessageDirection

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Você é um assistente especializado em atendimento ao cliente via WhatsApp.
Gere sugestões de resposta curtas, naturais e no tom indicado.
Retorne APENAS um objeto JSON válido, sem markdown, sem explicações."""

USER_PROMPT_TEMPLATE = """Tom da empresa: {company_tone}

Conversa recente:
{conversa}

Gere de 1 a 3 sugestões de resposta para o atendente enviar ao cliente.
Cada sugestão deve ser curta (1-2 frases), direta e no tom indicado.

Retorne APENAS este JSON:
{{"suggestions": ["Sugestão 1", "Sugestão 2", "Sugestão 3"]}}"""


def _build_conversation_text(messages: list) -> str:
    lines = []
    for m in messages:
        if not m.content:
            continue
        role = "Atendente" if m.direction == MessageDirection.outbound else "Cliente"
        lines.append(f"[{role}]: {m.content}")
    return "\n".join(lines)


def _call_anthropic(conversation_text: str, company_tone: str) -> str:
    import anthropic
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": USER_PROMPT_TEMPLATE.format(
                    company_tone=company_tone or "profissional e cordial",
                    conversa=conversation_text,
                ),
            }
        ],
    )
    return response.content[0].text.strip()


def _call_openai(conversation_text: str, company_tone: str) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=512,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": USER_PROMPT_TEMPLATE.format(
                    company_tone=company_tone or "profissional e cordial",
                    conversa=conversation_text,
                ),
            },
        ],
    )
    return response.choices[0].message.content.strip()


def _parse_suggestions(raw: str) -> list[str]:
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    data = json.loads(raw.strip())
    suggestions = data.get("suggestions", [])
    return [str(s) for s in suggestions if s][:3]


def generate_suggestions(conversation_id: int, company_tone: str = "") -> list[str]:
    """Gera sugestões de resposta para uma conversa usando LLM."""
    provider = settings.LLM_PROVIDER.lower()

    if provider == "openai" and not settings.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY não configurada — sugestões ignoradas.")
        return []
    if provider == "anthropic" and not settings.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY não configurada — sugestões ignoradas.")
        return []
    if provider not in ("anthropic", "openai"):
        logger.warning(f"LLM_PROVIDER inválido: '{provider}'. Use 'anthropic' ou 'openai'.")
        return []

    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conv:
            return []

        messages = (
            db.query(Message)
            .filter(Message.conversation_id == conversation_id, Message.is_deleted == False)
            .order_by(Message.timestamp.asc())
            .limit(10)
            .all()
        )

        conversation_text = _build_conversation_text(messages[-10:])
        if not conversation_text.strip():
            return []

        if provider == "openai":
            raw = _call_openai(conversation_text, company_tone)
        else:
            raw = _call_anthropic(conversation_text, company_tone)

        return _parse_suggestions(raw)

    except json.JSONDecodeError as e:
        logger.error(f"Erro ao parsear JSON das sugestões da conversa {conversation_id}: {e}")
        return []
    except Exception as e:
        logger.error(f"Erro ao gerar sugestões para conversa {conversation_id}: {e}")
        return []
    finally:
        db.close()
