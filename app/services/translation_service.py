"""Traducao em tempo real com LLM: deteccao de idioma e traducao bidirecional."""
import json
import logging
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

INCOMING_SYSTEM_PROMPT = """Voce e um especialista em deteccao de idiomas e traducao. Sua tarefa e identificar o idioma de um texto e, se ele nao for o idioma de destino, traduzi-lo. Mantenha a traducao o mais fiel possivel ao original, preservando o tom e a intencao. Retorne APENAS um objeto JSON valido, sem markdown, sem explicacoes."""

INCOMING_USER_TEMPLATE = """Analise a seguinte mensagem de texto. O idioma de destino para a traducao e **{idioma_destino}**.

**Texto Original:**
{texto_original}

Primeiro, identifique o idioma do texto original (codigo ISO 639-1, ex: "en" para ingles, "es" para espanhol). Se o idioma detectado for diferente de **{idioma_destino_iso}**, traduza o texto para **{idioma_destino}**. Se o idioma ja for o de destino, o campo texto_traduzido deve ser null.

Retorne APENAS este JSON:
{{
  "idioma_detectado": "codigo ISO 639-1",
  "texto_traduzido": "Traducao do texto para o idioma de destino" ou null
}}"""

OUTGOING_SYSTEM_PROMPT = """Voce e um especialista em traducao. Sua tarefa e traduzir um texto de um idioma de origem para um idioma de destino, garantindo que a traducao seja precisa, natural e mantenha o tom profissional do atendimento ao cliente. Retorne APENAS um objeto JSON valido, sem markdown, sem explicacoes."""

OUTGOING_USER_TEMPLATE = """Traduza o seguinte texto do **{idioma_origem}** para o **{idioma_destino}**.

**Texto Original:**
{texto_original}

Retorne APENAS este JSON:
{{
  "texto_traduzido": "Traducao do texto para o idioma de destino"
}}"""

IDIOMA_NOMES: dict[str, str] = {
    "pt": "Portugues do Brasil",
    "en": "Ingles",
    "es": "Espanhol",
    "fr": "Frances",
    "de": "Alemao",
    "it": "Italiano",
    "ja": "Japones",
    "zh": "Chines",
    "ar": "Arabe",
}


def _call_llm(system_prompt: str, user_content: str) -> str:
    provider = settings.LLM_PROVIDER.lower()
    if provider == "anthropic":
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        )
        return resp.content[0].text.strip()
    from openai import OpenAI
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=512,
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


def _check_provider() -> bool:
    provider = settings.LLM_PROVIDER.lower()
    if provider not in ("anthropic", "openai"):
        logger.warning("LLM_PROVIDER invalido para traducao.")
        return False
    if provider == "openai" and not settings.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY nao configurada.")
        return False
    if provider == "anthropic" and not settings.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY nao configurada.")
        return False
    return True


def detect_and_translate_incoming(
    texto_original: str,
    idioma_destino: str = "Portugues do Brasil",
    idioma_destino_iso: str = "pt",
) -> Optional[dict[str, Any]]:
    """Detecta o idioma da mensagem do cliente e traduz para o idioma do atendente se necessario."""
    if not _check_provider():
        return None
    if not texto_original or not texto_original.strip():
        return {"idioma_detectado": idioma_destino_iso, "texto_traduzido": None}

    try:
        content = INCOMING_USER_TEMPLATE.format(
            idioma_destino=idioma_destino,
            idioma_destino_iso=idioma_destino_iso,
            texto_original=texto_original.strip(),
        )
        raw = _call_llm(INCOMING_SYSTEM_PROMPT, content)
        data = _parse_json(raw)
        return {
            "idioma_detectado": str(data.get("idioma_detectado", idioma_destino_iso)),
            "texto_traduzido": data.get("texto_traduzido"),
        }
    except (json.JSONDecodeError, Exception) as e:
        logger.error("Erro ao detectar/traduzir mensagem recebida: %s", e)
        return None


def translate_outgoing(
    texto_original: str,
    idioma_origem: str = "Portugues do Brasil",
    idioma_destino: str = "Ingles",
) -> Optional[dict[str, Any]]:
    """Traduz a resposta do atendente para o idioma do cliente."""
    if not _check_provider():
        return None
    if not texto_original or not texto_original.strip():
        return None

    try:
        content = OUTGOING_USER_TEMPLATE.format(
            idioma_origem=idioma_origem,
            idioma_destino=idioma_destino,
            texto_original=texto_original.strip(),
        )
        raw = _call_llm(OUTGOING_SYSTEM_PROMPT, content)
        data = _parse_json(raw)
        traduzido = data.get("texto_traduzido")
        if not traduzido:
            return None
        return {"texto_traduzido": traduzido}
    except (json.JSONDecodeError, Exception) as e:
        logger.error("Erro ao traduzir mensagem de saida: %s", e)
        return None


def idioma_iso_para_nome(codigo: str) -> str:
    """Retorna o nome do idioma a partir do codigo ISO 639-1."""
    return IDIOMA_NOMES.get(codigo.lower(), codigo)
