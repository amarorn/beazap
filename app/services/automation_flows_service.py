"""Fluxos automaticos de automacao com LLM: classificacao de intencao, resposta e confirmacao."""
import json
import logging
from typing import Any, Optional

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.message import Message, MessageDirection

logger = logging.getLogger(__name__)

CLASSIFY_SYSTEM_PROMPT = """Voce e um assistente de roteamento de atendimento ao cliente. Sua tarefa e analisar a mensagem do cliente e o historico da conversa para identificar a intencao principal e determinar se a solicitacao pode ser tratada por um fluxo automatizado ou se precisa ser escalada para um atendente humano. Retorne APENAS um objeto JSON valido, sem markdown, sem explicacoes."""

CLASSIFY_USER_PROMPT_TEMPLATE = """Analise a seguinte mensagem do cliente e o historico recente da conversa para identificar a intencao principal. Com base nas intencoes pre-definidas e nos fluxos de automacao disponiveis, determine o tipo de tratamento adequado.

**Mensagem do Cliente:**
{mensagem_cliente}

**Historico Recente da Conversa (se houver):**
{historico_conversa}

**Intencoes e Fluxos de Automacao Disponiveis:**
- status_pedido: Cliente quer saber o status de um pedido. Requer numero do pedido. (Automacao)
- segunda_via_boleto: Cliente precisa da segunda via de um boleto. Requer CPF/CNPJ. (Automacao)
- suporte_tecnico: Cliente reporta um problema tecnico. (Atendente Humano)
- reclamacao_geral: Cliente expressa insatisfacao geral. (Atendente Humano)
- informacao_produto: Cliente busca informacoes sobre um produto/servico. (Automacao ou Atendente, dependendo da complexidade)
- outra_intencao: Qualquer outra intencao nao listada. (Atendente Humano)

Determine a intencao_detectada e o tipo_tratamento (automacao ou humano). Se for automacao, indique os parametros_necessarios para o fluxo. Se for humano, forneca uma justificativa_escalonamento.

Retorne APENAS este JSON:
{{
  "intencao_detectada": "status_pedido" ou "segunda_via_boleto" ou "suporte_tecnico" ou "reclamacao_geral" ou "informacao_produto" ou "outra_intencao",
  "tipo_tratamento": "automacao" ou "humano",
  "parametros_necessarios": {{
    "numero_pedido": "valor extraido" ou null,
    "cpf_cnpj": "valor extraido" ou null
  }} ou null,
  "justificativa_escalonamento": "Motivo para escalar" ou null
}}"""

RESPONSE_SYSTEM_PROMPT = """Voce e um assistente de atendimento ao cliente. Sua tarefa e gerar uma resposta concisa e amigavel para o cliente, confirmando a intencao detectada e, se necessario, solicitando informacoes adicionais para prosseguir com a automacao. Alem disso, extraia quaisquer entidades relevantes da mensagem do cliente. Retorne APENAS um objeto JSON valido, sem markdown, sem explicacoes."""

RESPONSE_USER_PROMPT_TEMPLATE = """Com base na intencao_detectada e na mensagem_cliente, gere uma resposta_automatica para o cliente. Se a automacao requer parametros_pendentes, solicite-os de forma clara. Extraia tambem quaisquer entidades_extraidas da mensagem do cliente que sejam relevantes para a intencao.

**Intencao Detectada:** {intencao_detectada}
**Mensagem do Cliente:** {mensagem_cliente}
**Parametros Pendentes (se houver):** {parametros_pendentes}

Retorne APENAS este JSON:
{{
  "resposta_automatica": "Texto da resposta para o cliente",
  "entidades_extraidas": {{
    "numero_pedido": "valor extraido" ou null,
    "cpf_cnpj": "valor extraido" ou null,
    "data_solicitacao": "valor extraido" ou null
  }}
}}"""

CONFIRMATION_SYSTEM_PROMPT = """Voce e um assistente de atendimento ao cliente. Sua tarefa e confirmar a acao que sera executada com o cliente e, apos a execucao, informar o resultado da automacao de forma clara e concisa. Retorne APENAS um objeto JSON valido, sem markdown, sem explicacoes."""

CONFIRMATION_USER_PROMPT_TEMPLATE = """Com base na intencao_detectada, entidades_coletadas e no status_execucao_acao, gere uma mensagem_final para o cliente. Se a acao foi bem-sucedida, forneca o resultado_acao. Se houve falha, explique o motivo_falha e sugira proximos_passos.

**Intencao Detectada:** {intencao_detectada}
**Entidades Coletadas:** {entidades_coletadas}
**Status da Execucao da Acao:** {status_execucao_acao}
**Resultado da Acao (se sucesso):** {resultado_acao}
**Motivo da Falha (se falha):** {motivo_falha}
**Proximos Passos (se falha):** {proximos_passos}

Retorne APENAS este JSON:
{{
  "mensagem_final": "Texto da mensagem final para o cliente",
  "acao_concluida": true ou false
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


def _build_conversation_history(messages: list) -> str:
    lines = []
    for m in messages:
        if not m.content:
            continue
        role = "Atendente" if m.direction == MessageDirection.outbound else "Cliente"
        lines.append(f"{role}: {m.content}")
    return "\n".join(lines) if lines else "(Nenhuma mensagem anterior)"


def classify_intent_routing(
    mensagem_cliente: str,
    historico_conversa: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Classifica intencao e determina roteamento (automacao ou humano)."""
    provider = settings.LLM_PROVIDER.lower()
    if provider not in ("anthropic", "openai"):
        logger.warning("LLM_PROVIDER invalido para fluxos automaticos.")
        return None
    if provider == "openai" and not settings.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY nao configurada.")
        return None
    if provider == "anthropic" and not settings.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY nao configurada.")
        return None

    try:
        historico = historico_conversa if historico_conversa else "(Sem historico)"
        content = CLASSIFY_USER_PROMPT_TEMPLATE.format(
            mensagem_cliente=mensagem_cliente,
            historico_conversa=historico,
        )
        raw = _call_llm(CLASSIFY_SYSTEM_PROMPT, content)
        data = _parse_json(raw)
        return {
            "intencao_detectada": data.get("intencao_detectada", "outra_intencao"),
            "tipo_tratamento": data.get("tipo_tratamento", "humano"),
            "parametros_necessarios": data.get("parametros_necessarios"),
            "justificativa_escalonamento": data.get("justificativa_escalonamento"),
        }
    except (json.JSONDecodeError, Exception) as e:
        logger.error("Erro ao classificar intencao e roteamento: %s", e)
        return None


def classify_intent_routing_from_conversation(
    conversation_id: int,
    mensagem_cliente: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Classifica intencao usando historico da conversa do banco."""
    db = SessionLocal()
    try:
        messages = (
            db.query(Message)
            .filter(Message.conversation_id == conversation_id, Message.is_deleted == False)
            .order_by(Message.timestamp.asc())
            .limit(20)
            .all()
        )
        historico = _build_conversation_history(messages)
        last_inbound = next(
            (m for m in reversed(messages) if m.direction == MessageDirection.inbound and m.content),
            None,
        )
        msg = mensagem_cliente or (last_inbound.content if last_inbound else "")
        if not msg.strip():
            logger.warning("Nenhuma mensagem do cliente para classificar.")
            return None
        return classify_intent_routing(mensagem_cliente=msg, historico_conversa=historico)
    finally:
        db.close()


def generate_automated_response(
    intencao_detectada: str,
    mensagem_cliente: str,
    parametros_pendentes: Optional[list[str]] = None,
) -> Optional[dict[str, Any]]:
    """Gera resposta automatica e extrai entidades da mensagem."""
    provider = settings.LLM_PROVIDER.lower()
    if provider not in ("anthropic", "openai"):
        return None
    if provider == "openai" and not settings.OPENAI_API_KEY:
        return None
    if provider == "anthropic" and not settings.ANTHROPIC_API_KEY:
        return None

    try:
        pendentes = ", ".join(parametros_pendentes) if parametros_pendentes else "nenhum"
        content = RESPONSE_USER_PROMPT_TEMPLATE.format(
            intencao_detectada=intencao_detectada,
            mensagem_cliente=mensagem_cliente,
            parametros_pendentes=pendentes,
        )
        raw = _call_llm(RESPONSE_SYSTEM_PROMPT, content)
        data = _parse_json(raw)
        return {
            "resposta_automatica": data.get("resposta_automatica", ""),
            "entidades_extraidas": data.get("entidades_extraidas", {}),
        }
    except (json.JSONDecodeError, Exception) as e:
        logger.error("Erro ao gerar resposta automatica: %s", e)
        return None


def generate_confirmation_message(
    intencao_detectada: str,
    entidades_coletadas: dict[str, Any],
    status_execucao_acao: str,
    resultado_acao: Optional[str] = None,
    motivo_falha: Optional[str] = None,
    proximos_passos: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Gera mensagem final apos execucao da acao (sucesso ou falha)."""
    provider = settings.LLM_PROVIDER.lower()
    if provider not in ("anthropic", "openai"):
        return None
    if provider == "openai" and not settings.OPENAI_API_KEY:
        return None
    if provider == "anthropic" and not settings.ANTHROPIC_API_KEY:
        return None

    try:
        content = CONFIRMATION_USER_PROMPT_TEMPLATE.format(
            intencao_detectada=intencao_detectada,
            entidades_coletadas=json.dumps(entidades_coletadas, ensure_ascii=False),
            status_execucao_acao=status_execucao_acao,
            resultado_acao=resultado_acao or "",
            motivo_falha=motivo_falha or "",
            proximos_passos=proximos_passos or "",
        )
        raw = _call_llm(CONFIRMATION_SYSTEM_PROMPT, content)
        data = _parse_json(raw)
        return {
            "mensagem_final": data.get("mensagem_final", ""),
            "acao_concluida": bool(data.get("acao_concluida", False)),
        }
    except (json.JSONDecodeError, Exception) as e:
        logger.error("Erro ao gerar mensagem de confirmacao: %s", e)
        return None
