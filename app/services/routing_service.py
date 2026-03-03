import logging
from typing import Optional

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.conversation import Conversation
from app.models.message import Message, MessageDirection
from app.models.team import Team

logger = logging.getLogger(__name__)


def _build_routing_prompt(first_message: str, teams: list) -> str:
    teams_text = "\n".join(
        f"- {t.name}: {t.description or 'sem descrição'}"
        + (f" (palavras-chave: {t.keywords})" if t.keywords else "")
        for t in teams
    )
    return (
        f'Mensagem do cliente: "{first_message}"\n\n'
        f"Equipes disponíveis:\n{teams_text}\n\n"
        "Qual equipe deve atender este cliente? "
        "Responda apenas com o nome exato da equipe, sem pontuação ou explicação."
    )


def _call_anthropic(prompt: str) -> str:
    import anthropic
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=50,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text.strip()


def _call_openai(prompt: str) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=50,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content.strip()


def route_conversation(conversation_id: int) -> None:
    """Route a new conversation to the appropriate team using LLM.
    Designed to run in background (FastAPI BackgroundTasks).
    """
    provider = settings.LLM_PROVIDER.lower()

    if provider == "openai" and not settings.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY não configurada — roteamento ignorado.")
        return
    if provider == "anthropic" and not settings.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY não configurada — roteamento ignorado.")
        return
    if provider not in ("anthropic", "openai"):
        logger.warning(f"LLM_PROVIDER inválido: '{provider}'. Use 'anthropic' ou 'openai'.")
        return

    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conv or conv.team_id is not None:
            return  # already routed or not found

        teams = (
            db.query(Team)
            .filter(Team.instance_id == conv.instance_id, Team.active == True)
            .all()
        )
        if not teams:
            return  # no teams configured for this instance

        # Get first inbound messages for context (up to 3)
        messages = (
            db.query(Message)
            .filter(
                Message.conversation_id == conversation_id,
                Message.direction == MessageDirection.inbound,
                Message.content != None,
            )
            .order_by(Message.timestamp.asc())
            .limit(3)
            .all()
        )
        first_text = " ".join(m.content for m in messages if m.content).strip()
        if not first_text:
            return

        prompt = _build_routing_prompt(first_text, teams)

        if provider == "openai":
            raw = _call_openai(prompt)
        else:
            raw = _call_anthropic(prompt)

        raw_lower = raw.lower().strip()
        matched_team: Optional[Team] = None
        for t in teams:
            if t.name.lower() in raw_lower or raw_lower in t.name.lower():
                matched_team = t
                break

        if matched_team:
            conv.team_id = matched_team.id
            db.commit()
            logger.info(f"Conversa {conversation_id} roteada para equipe '{matched_team.name}'")
        else:
            logger.info(
                f"Conversa {conversation_id}: nenhuma equipe correspondeu ao resultado '{raw}'"
            )

    except Exception as e:
        logger.error(f"Erro ao rotear conversa {conversation_id}: {e}")
    finally:
        db.close()
