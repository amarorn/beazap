import json
import logging
from typing import Any

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.conversation import Conversation
from app.models.message import Message, MessageDirection

logger = logging.getLogger(__name__)

DRAFT_SYSTEM_PROMPT = """Você é um especialista em atendimento ao cliente da empresa {company_name}.

BASE DE CONHECIMENTO DISPONÍVEL:
{knowledge_base_context}

PERFIL DA EMPRESA:
- Tom de voz: {company_tone}
- Políticas relevantes: {relevant_policies}"""

DRAFT_USER_PROMPT_TEMPLATE = """CONVERSA COMPLETA:
{full_conversation}

ÚLTIMA MENSAGEM DO CLIENTE:
{last_message}

CLASSIFICAÇÃO DETECTADA: {detected_category}

TAREFA:
Gere um rascunho de resposta COMPLETO para o atendente enviar ao cliente.

O rascunho deve:
1. Resolver ou endereçar diretamente o problema/solicitação identificado
2. Usar informações da base de conhecimento quando relevante (cite a fonte internamente com [KB])
3. Incluir próximos passos claros quando aplicável
4. Ter no máximo 4 frases
5. Manter o tom de voz da empresa

Responda EXCLUSIVAMENTE no seguinte formato JSON:
{{
  "draft": "...",
  "confidence_score": 0.0,
  "knowledge_sources_used": ["..."],
  "requires_human_review": true/false,
  "review_reason": "..."
}}

REGRA: Se confidence_score < 0.7, defina requires_human_review = true."""

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


def _parse_draft(raw: str) -> dict[str, Any]:
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    data = json.loads(raw.strip())
    return {
        "draft": data.get("draft", ""),
        "confidence_score": float(data.get("confidence_score", 0.0)),
        "knowledge_sources_used": data.get("knowledge_sources_used", []),
        "requires_human_review": data.get("requires_human_review", True),
        "review_reason": data.get("review_reason", ""),
    }


def _call_anthropic_draft(
    full_conversation: str,
    last_message: str,
    detected_category: str,
    company_name: str,
    company_tone: str,
    relevant_policies: str,
    knowledge_base_context: str,
) -> str:
    import anthropic
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    system = DRAFT_SYSTEM_PROMPT.format(
        company_name=company_name,
        knowledge_base_context=knowledge_base_context or "(Nenhuma base de conhecimento disponível)",
        company_tone=company_tone or "profissional e cordial",
        relevant_policies=relevant_policies or "Não especificadas",
    )
    user_content = DRAFT_USER_PROMPT_TEMPLATE.format(
        full_conversation=full_conversation,
        last_message=last_message or "(Sem última mensagem)",
        detected_category=detected_category or "outro",
    )
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    )
    return response.content[0].text.strip()


def _call_openai_draft(
    full_conversation: str,
    last_message: str,
    detected_category: str,
    company_name: str,
    company_tone: str,
    relevant_policies: str,
    knowledge_base_context: str,
) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    system = DRAFT_SYSTEM_PROMPT.format(
        company_name=company_name,
        knowledge_base_context=knowledge_base_context or "(Nenhuma base de conhecimento disponível)",
        company_tone=company_tone or "profissional e cordial",
        relevant_policies=relevant_policies or "Não especificadas",
    )
    user_content = DRAFT_USER_PROMPT_TEMPLATE.format(
        full_conversation=full_conversation,
        last_message=last_message or "(Sem última mensagem)",
        detected_category=detected_category or "outro",
    )
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=512,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
    )
    return response.choices[0].message.content.strip()


def generate_draft_response(
    conversation_id: int,
    company_name: str = "",
    company_tone: str = "",
    relevant_policies: str = "",
    knowledge_base_context: str = "",
) -> dict[str, Any] | None:
    """Gera rascunho completo de resposta com confidence e flags de revisão."""
    provider = settings.LLM_PROVIDER.lower()
    if provider == "openai" and not settings.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY não configurada — draft ignorado.")
        return None
    if provider == "anthropic" and not settings.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY não configurada — draft ignorado.")
        return None
    if provider not in ("anthropic", "openai"):
        logger.warning(f"LLM_PROVIDER inválido: '{provider}'.")
        return None

    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conv:
            return None

        messages = (
            db.query(Message)
            .filter(Message.conversation_id == conversation_id, Message.is_deleted == False)
            .order_by(Message.timestamp.asc())
            .limit(20)
            .all()
        )
        full_conversation = _build_conversation_text(messages)
        if not full_conversation.strip():
            return None

        last_inbound = next(
            (m for m in reversed(messages) if m.direction == MessageDirection.inbound and m.content),
            None,
        )
        last_message = last_inbound.content if last_inbound else ""
        detected_category = conv.analysis_category or "outro"

        if provider == "openai":
            raw = _call_openai_draft(
                full_conversation=full_conversation,
                last_message=last_message,
                detected_category=detected_category,
                company_name=company_name or "Empresa",
                company_tone=company_tone,
                relevant_policies=relevant_policies,
                knowledge_base_context=knowledge_base_context,
            )
        else:
            raw = _call_anthropic_draft(
                full_conversation=full_conversation,
                last_message=last_message,
                detected_category=detected_category,
                company_name=company_name or "Empresa",
                company_tone=company_tone,
                relevant_policies=relevant_policies,
                knowledge_base_context=knowledge_base_context,
            )

        return _parse_draft(raw)

    except json.JSONDecodeError as e:
        logger.error(f"Erro ao parsear JSON do draft da conversa {conversation_id}: {e}")
        return None
    except Exception as e:
        logger.error(f"Erro ao gerar draft para conversa {conversation_id}: {e}")
        return None
    finally:
        db.close()


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
