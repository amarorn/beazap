import json
import logging
from typing import Any

from sqlalchemy import func

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.conversation import Conversation
from app.models.instance import Instance
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

SYSTEM_PROMPT = """Você é um assistente especializado em atendimento ao cliente via WhatsApp da empresa {company_name}.
Gere sugestões de resposta curtas, naturais e no tom indicado.
Retorne APENAS um objeto JSON válido, sem markdown, sem explicações."""

USER_PROMPT_TEMPLATE = """PERFIL DO CLIENTE:
- Tipo: {customer_type}
- Histórico de interações: {interaction_count} atendimentos anteriores
- Sentimento detectado nesta conversa: {detected_sentiment}
- Satisfação média histórica: {avg_satisfaction}/5

TOM DE VOZ DA EMPRESA: {company_tone}

INSTRUÇÕES DE ADAPTAÇÃO:
- Se sentimento = "negativo" ou "frustrado": priorize empatia, reconheça o problema antes de oferecer solução
- Se customer_type = "cliente_premium": use linguagem mais personalizada e ofereça soluções prioritárias
- Se customer_type = "cliente_novo": seja mais explicativo e acolhedor, evite jargões técnicos
- Se avg_satisfaction < 3: adote postura proativa de recuperação de relacionamento

HISTÓRICO RECENTE DA CONVERSA (últimas 5 mensagens):
{conversation_history}

ÚLTIMA MENSAGEM DO CLIENTE:
{last_message}

TAREFA:
Gere entre 1 e 3 sugestões de resposta para o atendente. Cada sugestão deve:
1. Ser direta e objetiva (máximo 2 frases)
2. Estar adaptada ao perfil e sentimento detectado do cliente
3. Manter o tom de voz configurado da empresa

Responda EXCLUSIVAMENTE no seguinte formato JSON, sem texto adicional:
{{
  "suggestions": [
    {{"text": "...", "tone_used": "...", "adaptation_reason": "..."}},
    {{"text": "...", "tone_used": "...", "adaptation_reason": "..."}}
  ]
}}"""


def _build_conversation_text(messages: list) -> str:
    lines = []
    for m in messages:
        if not m.content:
            continue
        role = "Atendente" if m.direction == MessageDirection.outbound else "Cliente"
        lines.append(f"[{role}]: {m.content}")
    return "\n".join(lines)


def _infer_customer_type(interaction_count: int) -> str:
    if interaction_count <= 1:
        return "cliente_novo"
    if interaction_count >= 5:
        return "cliente_recorrente"
    return "cliente"


def _call_anthropic(prompt_vars: dict) -> str:
    import anthropic
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    system = SYSTEM_PROMPT.format(company_name=prompt_vars["company_name"])
    user_content = USER_PROMPT_TEMPLATE.format(**prompt_vars)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    )
    return response.content[0].text.strip()


def _call_openai(prompt_vars: dict) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    system = SYSTEM_PROMPT.format(company_name=prompt_vars["company_name"])
    user_content = USER_PROMPT_TEMPLATE.format(**prompt_vars)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=512,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
    )
    return response.choices[0].message.content.strip()


def _parse_suggestions(raw: str) -> list[dict]:
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    data = json.loads(raw.strip())
    suggestions = data.get("suggestions", [])
    result = []
    for s in suggestions[:3]:
        if isinstance(s, dict):
            text = s.get("text") or s.get("message", "")
            if text:
                result.append({
                    "text": str(text),
                    "tone_used": str(s.get("tone_used", "")),
                    "adaptation_reason": str(s.get("adaptation_reason", "")),
                })
        elif s:
            result.append({"text": str(s), "tone_used": "", "adaptation_reason": ""})
    return result


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


def generate_suggestions(conversation_id: int, company_tone: str = "") -> list[dict]:
    """Gera sugestões de resposta para uma conversa usando LLM. Retorna lista de dicts com text, tone_used, adaptation_reason."""
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
        conv = (
            db.query(Conversation)
            .filter(Conversation.id == conversation_id)
            .first()
        )
        if not conv:
            return []

        interaction_count = (
            db.query(func.count(Conversation.id))
            .filter(
                Conversation.contact_phone == conv.contact_phone,
                Conversation.instance_id == conv.instance_id,
            )
            .scalar()
            or 0
        )
        customer_type = _infer_customer_type(interaction_count)
        company_name = "Nossa empresa"
        if conv.instance_id:
            inst = db.query(Instance).filter(Instance.id == conv.instance_id).first()
            if inst and inst.name:
                company_name = inst.name

        messages = (
            db.query(Message)
            .filter(Message.conversation_id == conversation_id, Message.is_deleted == False)
            .order_by(Message.timestamp.asc())
            .limit(10)
            .all()
        )
        last_five = messages[-5:] if len(messages) > 5 else messages
        conversation_history = _build_conversation_text(last_five)
        last_inbound = next((m for m in reversed(messages) if m.direction == MessageDirection.inbound and m.content), None)
        last_message = (last_inbound.content or "").strip() if last_inbound else "(sem mensagem do cliente)"

        detected_sentiment = (conv.analysis_sentiment or "neutro").lower()
        avg_satisfaction = conv.analysis_satisfaction if conv.analysis_satisfaction is not None else 3
        avg_satisfaction = max(1, min(5, int(avg_satisfaction)))

        prompt_vars = {
            "company_name": company_name,
            "customer_type": customer_type,
            "interaction_count": interaction_count,
            "detected_sentiment": detected_sentiment,
            "avg_satisfaction": avg_satisfaction,
            "company_tone": company_tone or "profissional e cordial",
            "conversation_history": conversation_history or "(nenhuma mensagem ainda)",
            "last_message": last_message,
        }

        if provider == "openai":
            raw = _call_openai(prompt_vars)
        else:
            raw = _call_anthropic(prompt_vars)

        return _parse_suggestions(raw)

    except json.JSONDecodeError as e:
        logger.error(f"Erro ao parsear JSON das sugestões da conversa {conversation_id}: {e}")
        return []
    except Exception as e:
        logger.error(f"Erro ao gerar sugestões para conversa {conversation_id}: {e}")
        return []
    finally:
        db.close()
