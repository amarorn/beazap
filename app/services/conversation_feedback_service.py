"""Feedback estruturado por conversa usando LLM para avaliacao da performance do atendente."""
import json
import logging
from typing import Any, Optional

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.conversation import Conversation, ConversationStatus
from app.models.message import Message, MessageDirection

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Voce e um coach de qualidade de atendimento ao cliente. Sua tarefa e analisar a transcricao de uma conversa e fornecer um feedback construtivo e detalhado sobre a performance do atendente. Avalie a interacao com base em criterios como clareza, empatia, eficiencia e tom de voz. Seja objetivo, justo e forneca exemplos especificos da conversa para ilustrar seus pontos. Retorne APENAS um objeto JSON valido, sem markdown, sem explicacoes."""

USER_PROMPT_TEMPLATE = """Analise a seguinte transcricao de conversa entre um cliente e um atendente. Com base nos criterios de avaliacao, forneca um feedback estruturado.

**Transcricao da Conversa:**
{transcricao_conversa}

**Contexto da Conversa:**
- Categoria: {categoria_conversa}
- Sentimento Inicial do Cliente: {sentimento_inicial}
- Resultado Final: {resultado_final}

**Criterios de Avaliacao:**
1. Clareza e Comunicacao: A comunicacao do atendente foi clara, objetiva e facil de entender?
2. Empatia e Tom de Voz: O atendente demonstrou empatia e manteve um tom de voz profissional e adequado?
3. Eficiencia na Resolucao: O atendente foi eficiente em identificar o problema e conduzir a conversa para uma solucao?
4. Conhecimento e Precisao: As informacoes fornecidas pelo atendente estavam corretas e completas?

Para cada criterio, atribua uma nota de 1 a 5 (1=Muito Ruim, 5=Excelente). Identifique um ponto forte principal e uma area de melhoria principal, com exemplos especificos da conversa. Finalmente, forneca uma sugestao pratica e acionavel para o atendente aplicar em futuras interacoes.

Retorne APENAS este JSON:
{{
  "conversa_id": "{conversa_id}",
  "avaliacao_geral": {{
    "clareza_comunicacao": {{
      "nota": <int 1-5>,
      "justificativa": "Justificativa para a nota."
    }},
    "empatia_tom_de_voz": {{
      "nota": <int 1-5>,
      "justificativa": "Justificativa para a nota."
    }},
    "eficiencia_resolucao": {{
      "nota": <int 1-5>,
      "justificativa": "Justificativa para a nota."
    }},
    "conhecimento_precisao": {{
      "nota": <int 1-5>,
      "justificativa": "Justificativa para a nota."
    }}
  }},
  "ponto_forte": {{
    "descricao": "Descricao do principal ponto forte observado na conversa.",
    "exemplo_conversa": "[Trecho da conversa que ilustra o ponto forte]"
  }},
  "area_melhoria": {{
    "descricao": "Descricao da principal area de melhoria identificada.",
    "exemplo_conversa": "[Trecho da conversa que ilustra a area de melhoria]"
  }},
  "sugestao_acionavel": "Sugestao pratica e especifica para o atendente aplicar no futuro."
}}"""


def _call_llm(system_prompt: str, user_content: str) -> str:
    provider = settings.LLM_PROVIDER.lower()
    if provider == "anthropic":
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        )
        return resp.content[0].text.strip()
    from openai import OpenAI
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=2048,
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


def _build_transcription(messages: list) -> str:
    lines = []
    for m in messages:
        if not m.content:
            continue
        role = "Atendente" if m.direction == MessageDirection.outbound else "Cliente"
        lines.append(f"[{role}]: {m.content}")
    return "\n".join(lines)


def _resultado_final(status: ConversationStatus) -> str:
    m = {ConversationStatus.resolved: "Resolvido", ConversationStatus.abandoned: "Abandonado"}
    return m.get(status, "Em aberto")


def generate_conversation_feedback(conversation_id: int) -> Optional[dict[str, Any]]:
    """Analisa conversa e gera feedback estruturado sobre a performance do atendente."""
    provider = settings.LLM_PROVIDER.lower()
    if provider not in ("anthropic", "openai"):
        logger.warning("LLM_PROVIDER invalido para feedback.")
        return None
    if provider == "openai" and not settings.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY nao configurada.")
        return None
    if provider == "anthropic" and not settings.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY nao configurada.")
        return None

    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conv:
            return None

        if conv.is_group:
            logger.info("Feedback para conversa em grupo nao suportado.")
            return None

        messages = (
            db.query(Message)
            .filter(Message.conversation_id == conversation_id, Message.is_deleted == False)
            .order_by(Message.timestamp.asc())
            .all()
        )
        transcricao = _build_transcription(messages)
        if not transcricao.strip():
            logger.warning("Conversa %s sem texto.", conversation_id)
            return None

        categoria = conv.analysis_category or "outro"
        sentimento = conv.analysis_sentiment or "nao informado"
        resultado = _resultado_final(conv.status)

        user_content = USER_PROMPT_TEMPLATE.format(
            transcricao_conversa=transcricao,
            categoria_conversa=categoria,
            sentimento_inicial=sentimento,
            resultado_final=resultado,
            conversa_id=str(conversation_id),
        )

        raw = _call_llm(SYSTEM_PROMPT, user_content)
        data = _parse_json(raw)

        data["conversa_id"] = str(conversation_id)
        return data

    except (json.JSONDecodeError, Exception) as e:
        logger.error("Erro ao gerar feedback da conversa %s: %s", conversation_id, e)
        return None
    finally:
        db.close()
