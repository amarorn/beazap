import json
import logging
from typing import Any, Optional

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.attendant import Attendant
from app.models.conversation import Conversation, ConversationStatus
from app.models.message import Message, MessageDirection

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Você é um sistema especialista em classificação de intenções para atendimento ao cliente."""

USER_PROMPT_TEMPLATE = """ATENDENTES DISPONÍVEIS E ESPECIALIDADES:
{agents_availability}

CONVERSA ATUAL:
{conversation_history}

ÚLTIMA MENSAGEM DO CLIENTE:
{last_message}

METADADOS DO CLIENTE:
- Histórico de produtos contratados: {customer_products}
- Valor do contrato: {contract_value}
- Tempo como cliente: {customer_since}

INTENÇÕES POSSÍVEIS (hierarquia de prioridade):
1. CRÍTICO: cancelamento_iminente, ameaca_legal, escalacao_urgente
2. ALTO: reclamacao_grave, problema_tecnico_bloqueante, renovacao_contrato
3. MÉDIO: suporte_tecnico, duvida_financeira, solicitacao_informacao
4. BAIXO: elogio, feedback, curiosidade

TAREFA:
Analise a conversa e determine:
1. A intenção primária e secundária do cliente
2. O nível de prioridade
3. O atendente mais adequado com base nas especialidades e disponibilidade
4. Se o caso pode ser resolvido por automação (sem atendente humano)

Responda EXCLUSIVAMENTE no seguinte formato JSON:
{{
  "primary_intent": "...",
  "secondary_intent": "...",
  "priority_level": "CRÍTICO|ALTO|MÉDIO|BAIXO",
  "recommended_agent_id": "...",
  "routing_reason": "...",
  "can_automate": true/false,
  "automation_confidence": 0.0,
  "escalation_flags": ["..."],
  "estimated_resolution_time_minutes": N
}}"""


def _build_conversation_text(messages: list) -> str:
    lines = []
    for m in messages:
        if not m.content:
            continue
        role = "Atendente" if m.direction == MessageDirection.outbound else "Cliente"
        lines.append(f"[{role}]: {m.content}")
    return "\n".join(lines)


def _build_agents_availability(db, instance_id: int) -> str:
    attendants = (
        db.query(Attendant)
        .filter(Attendant.instance_id == instance_id, Attendant.active == True)
        .all()
    )
    items = []
    for att in attendants:
        open_count = (
            db.query(Conversation)
            .filter(Conversation.attendant_id == att.id, Conversation.status == ConversationStatus.open)
            .count()
        )
        team_keywords = []
        if att.team_id and att.team:
            team_keywords = (att.team.keywords or "").split(",") if att.team.keywords else []
            team_keywords = [k.strip() for k in team_keywords if k.strip()]
        specialties = team_keywords if team_keywords else ["atendimento_geral"]
        items.append(
            {
                "agent_id": str(att.id),
                "name": att.name,
                "specialties": specialties,
                "current_load": open_count,
                "available": att.active,
            }
        )
    return json.dumps(items, ensure_ascii=False, indent=2)


def _parse_result(raw: str) -> dict[str, Any]:
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    data = json.loads(raw.strip())
    return {
        "primary_intent": data.get("primary_intent", ""),
        "secondary_intent": data.get("secondary_intent", ""),
        "priority_level": data.get("priority_level", "MÉDIO"),
        "recommended_agent_id": str(data.get("recommended_agent_id", "")),
        "routing_reason": data.get("routing_reason", ""),
        "can_automate": bool(data.get("can_automate", False)),
        "automation_confidence": float(data.get("automation_confidence", 0.0)),
        "escalation_flags": data.get("escalation_flags", []) or [],
        "estimated_resolution_time_minutes": int(data.get("estimated_resolution_time_minutes", 0)),
    }


def _call_anthropic(prompt: str) -> str:
    import anthropic
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text.strip()


def _call_openai(prompt: str) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=1024,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
    )
    return response.choices[0].message.content.strip()


def classify_intent(
    conversation_id: int,
    customer_products: str = "",
    contract_value: str = "",
    customer_since: str = "",
) -> Optional[dict[str, Any]]:
    """Classifica a intenção da conversa e sugere roteamento."""
    provider = settings.LLM_PROVIDER.lower()
    if provider == "openai" and not settings.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY não configurada — classificação ignorada.")
        return None
    if provider == "anthropic" and not settings.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY não configurada — classificação ignorada.")
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
            .limit(30)
            .all()
        )
        conversation_history = _build_conversation_text(messages)
        if not conversation_history.strip():
            return None

        last_inbound = next(
            (m for m in reversed(messages) if m.direction == MessageDirection.inbound and m.content),
            None,
        )
        last_message = last_inbound.content if last_inbound else ""

        agents_availability = _build_agents_availability(db, conv.instance_id)

        prompt = USER_PROMPT_TEMPLATE.format(
            agents_availability=agents_availability,
            conversation_history=conversation_history,
            last_message=last_message or "(Sem última mensagem)",
            customer_products=customer_products or "Não informado",
            contract_value=contract_value or "Não informado",
            customer_since=customer_since or "Não informado",
        )

        if provider == "openai":
            raw = _call_openai(prompt)
        else:
            raw = _call_anthropic(prompt)

        return _parse_result(raw)

    except json.JSONDecodeError as e:
        logger.error(f"Erro ao parsear JSON da classificação conversa {conversation_id}: {e}")
        return None
    except Exception as e:
        logger.error(f"Erro ao classificar intenção da conversa {conversation_id}: {e}")
        return None
    finally:
        db.close()
