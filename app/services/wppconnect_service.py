"""Service layer for WPPConnect Server API integration.

Endpoints: GET/POST /api/{session}/...
Auth: secretkey via query ?key= ou Authorization Bearer
Docs: https://wppconnect.io/docs
"""

import asyncio
import base64
import io
import logging
import re
import time
import httpx
import qrcode
from typing import Optional

logger = logging.getLogger(__name__)

_qr_store: dict[str, dict] = {}
QR_TTL_SECONDS = 180


def store_qrcode(instance_name: str, qr_data: str) -> None:
    """Armazena QR recebido via webhook."""
    _qr_store[instance_name] = {"qr": normalize_qrcode_base64(qr_data), "ts": time.time()}
    logger.info("QR code stored for instance=%s", instance_name)


def get_stored_qrcode(instance_name: str) -> Optional[str]:
    """Retorna QR armazenado se existir e nao expirado."""
    entry = _qr_store.get(instance_name)
    if not entry:
        return None
    if time.time() - entry["ts"] > QR_TTL_SECONDS:
        del _qr_store[instance_name]
        return None
    return entry["qr"]


def generate_token(api_url: str, secret: str, session_name: str) -> Optional[str]:
    """Gera token de acesso via POST /api/{session}/{secret}/generate-token. Retorna 'full' (session:token)."""
    url = f"{api_url.rstrip('/')}/api/{session_name}/{secret}/generate-token"
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.post(url)
        if resp.status_code in (200, 201):
            data = resp.json()
            if data.get("status") == "success":
                return data.get("full") or data.get("token")
        return None
    except Exception as e:
        logger.warning(
            "generate_token failed session=%s api_url=%s: %s",
            session_name,
            api_url.rstrip("/") if api_url else "",
            e,
        )
        return None


def _bearer_value(api_key: str) -> str:
    """WPPConnect aceita Bearer so com o token (hash); full vem como sessao:token e da 401 se enviado inteiro."""
    s = (api_key or "").strip()
    if not s:
        return ""
    if ":" in s and "$2b$" in s:
        return s.split(":", 1)[1]
    return s


def _headers(api_key: str) -> dict:
    h = {"Content-Type": "application/json"}
    bearer = _bearer_value(api_key)
    if bearer:
        h["Authorization"] = f"Bearer {bearer}"
    return h


def _start_session_payload() -> dict:
    """waitForLogin false nao bloqueia; autoClose 0 evita fechar browser em 60s. createOptions para server que ignora flat."""
    return {
        "waitForLogin": False,
        "autoClose": 0,
        "createOptions": {"autoClose": 0},
    }


async def close_session(api_url: str, api_key: str, instance_name: str) -> None:
    """POST close-session. CUIDADO: wppconnect-server 2.8.x pode lançar req.client.close is not a function e deixar o browser preso no userDataDir. Preferir restart do container."""
    if not api_url or not api_key:
        return
    base = api_url.rstrip("/")
    close_url = f"{base}/api/{instance_name}/close-session"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            await client.post(close_url, headers=_headers(api_key))
        logger.info("close_session instance=%s (recreate na proxima start-session)", instance_name)
    except Exception as e:
        logger.debug("close_session instance=%s: %s", instance_name, e)


async def _post_start_session(
    client: httpx.AsyncClient, base: str, instance_name: str, api_key: str
) -> httpx.Response:
    start_url = f"{base}/api/{instance_name}/start-session"
    return await client.post(
        start_url, json=_start_session_payload(), headers=_headers(api_key)
    )


async def ensure_session_started(api_url: str, api_key: str, instance_name: str) -> bool:
    """POST start-session sem esperar login. Idempotente (409 = ja existe). Em 401 tenta regenerar token."""
    if not api_url:
        return False
    base = api_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            key = api_key or ""
            resp = await _post_start_session(client, base, instance_name, key)
            if resp.status_code == 401 and not key.strip():
                logger.warning(
                    "ensure_session_started instance=%s HTTP 401 sem api_key; "
                    "defina WPPCONNECT_SECRET igual ao SECRET_KEY do container e salve a instancia de novo.",
                    instance_name,
                )
                return False
            if resp.status_code == 401:
                from app.core.config import get_settings
                secret = getattr(get_settings(), "WPPCONNECT_SECRET", "") or ""
                new_token = generate_token(base, secret, instance_name) if secret else None
                if new_token and new_token != key:
                    logger.info("ensure_session_started instance=%s retentando com token regenerado", instance_name)
                    resp = await _post_start_session(client, base, instance_name, new_token)
            if resp.status_code in (200, 201, 409):
                logger.info("ensure_session_started ok instance=%s HTTP %s", instance_name, resp.status_code)
                return True
            logger.warning(
                "ensure_session_started instance=%s HTTP %s body=%s",
                instance_name, resp.status_code, (resp.text or "")[:200],
            )
    except Exception as e:
        logger.warning("ensure_session_started instance=%s: %s", instance_name, e)
    return False


async def warm_all_instances_sessions() -> None:
    """Em background: start-session para cada instancia ativa. Em 401 regenera token e persiste no banco."""
    await asyncio.sleep(2)
    from app.core.database import SessionLocal
    from app.core.config import get_settings
    from app.models.instance import Instance

    settings = get_settings()
    secret = getattr(settings, "WPPCONNECT_SECRET", "") or ""
    default_api_url = (getattr(settings, "WPPCONNECT_API_URL", None) or "").rstrip("/")
    db = SessionLocal()
    try:
        instances = db.query(Instance).filter(Instance.active == True).all()
        for inst in instances:
            if not inst.api_url:
                if default_api_url:
                    inst.api_url = default_api_url
                    db.commit()
                else:
                    continue
            base = inst.api_url.rstrip("/")
            if default_api_url and default_api_url != base:
                try:
                    with httpx.Client(timeout=3) as client:
                        client.get(f"{base}/", follow_redirects=True)
                except (httpx.ConnectError, OSError):
                    logger.info(
                        "warm instances: api_url inacessivel instance=%s %s -> usando WPPCONNECT_API_URL %s",
                        inst.instance_name,
                        base,
                        default_api_url,
                    )
                    inst.api_url = default_api_url
                    db.commit()
                    base = default_api_url

            api_key = (inst.api_key or "").strip()
            if not api_key and secret:
                token = generate_token(base, secret, inst.instance_name)
                if token:
                    inst.api_key = token
                    db.commit()
                    api_key = token
            if not api_key:
                continue
            ok = await ensure_session_started(inst.api_url, api_key, inst.instance_name)
            if not ok and secret:
                token = generate_token(base, secret, inst.instance_name)
                if token and token != inst.api_key:
                    inst.api_key = token
                    db.commit()
                    await ensure_session_started(inst.api_url, token, inst.instance_name)
    finally:
        db.close()


async def get_connection_state(api_url: str, api_key: str, session: str = "default") -> dict:
    """Verifica estado da conexao via GET /api/{session}/check-connection-session (WPPConnect Server 2.x)."""
    base = api_url.rstrip("/")
    url = f"{base}/api/{session}/check-connection-session"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers=_headers(api_key))
            if resp.status_code == 404:
                legacy_url = f"{base}/api/{session}/checkConnectionState"
                resp = await client.get(legacy_url, headers=_headers(api_key))
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") is True:
                return {"state": "open"}
            if data.get("status") is False:
                return {
                    "state": "close",
                    "error": data.get("message") or "Sessao desconectada",
                }
            raw = data.get("state") or data.get("status")
            state = (raw if isinstance(raw, str) else str(raw or "")).upper()
            if state in ("CONNECTED", "OPEN", "TRUE"):
                return {"state": "open"}
            if state in ("CONNECTING", "LOADING", "OPENING"):
                return {"state": "connecting"}
            return {"state": "close", "error": data.get("reason") or "Sessao desconectada"}
        if resp.status_code == 404:
            return {"state": "close", "error": "Sessao nao autenticada. Escaneie o QR code."}
        return {"state": "error", "error": f"HTTP {resp.status_code}"}
    except httpx.ConnectError:
        return {"state": "unreachable", "error": f"Nao foi possivel conectar em {api_url}"}
    except httpx.TimeoutException:
        return {"state": "timeout", "error": "WPPConnect nao respondeu em 10s"}
    except Exception as e:
        return {"state": "error", "error": str(e)}


async def get_qrcode(api_url: str, api_key: str, instance_name: str = "default") -> Optional[str]:
    """Retorna QR code via start-session + GET qrcode-session. Usa cache do webhook se existir."""
    stored = get_stored_qrcode(instance_name)
    if stored:
        return stored
    # Webhook global costuma postar em /webhook/default; sessao no WPPConnect pode ser outra.
    if instance_name != "default":
        stored_default = get_stored_qrcode("default")
        if stored_default:
            logger.info("get_qrcode using cached QR from default for instance=%s", instance_name)
            return stored_default
    base = api_url.rstrip("/")
    url = f"{base}/api/{instance_name}/qrcode-session"
    # Server 2.8.x ignora autoClose no body; fecha ~30-60s apos wapi injected. Poll rapido nos primeiros ~50s.
    fast_attempts = 25
    fast_interval = 2
    slow_attempts = 10
    slow_interval = 4
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            # Nao chamar close-session aqui: sessionController.closeSession quebra (req.client.close is not a function)
            # e o proximo start-session falha com "browser already running for userDataDir".
            start_url = f"{base}/api/{instance_name}/start-session"
            start_resp = await client.post(
                start_url, json=_start_session_payload(), headers=_headers(api_key)
            )
            if start_resp.status_code not in (200, 201) and start_resp.status_code != 409:
                logger.warning(
                    "get_qrcode start-session instance=%s HTTP %s body=%s",
                    instance_name, start_resp.status_code, (start_resp.text or "")[:300],
                )
            total_attempts = fast_attempts + slow_attempts
            last_body_snip = ""
            initializing_count = 0
            for attempt in range(total_attempts):
                if attempt > 0:
                    await asyncio.sleep(fast_interval if attempt < fast_attempts else slow_interval)
                resp = await client.get(url, headers=_headers(api_key))
                if resp.status_code != 200:
                    logger.warning(
                        "get_qrcode WPPConnect attempt=%d instance=%s HTTP %s body=%s",
                        attempt, instance_name, resp.status_code, (resp.text or "")[:200],
                    )
                    continue
                data = resp.json()
                qr = data.get("base64Image") or data.get("base64") or data.get("qr") or data.get("result")
                if not qr and isinstance(data.get("qrcode"), dict):
                    qr = data["qrcode"].get("base64") or data["qrcode"].get("base64Image") or data["qrcode"].get("data")
                if isinstance(qr, dict):
                    qr = qr.get("base64") or qr.get("base64Image") or qr.get("data")
                if qr:
                    return normalize_qrcode_base64(qr)
                st = (data.get("status") or "").upper()
                if st == "INITIALIZING" or "not available" in (data.get("message") or "").lower():
                    initializing_count += 1
                    last_body_snip = (resp.text or "")[:180]
                    logger.info(
                        "get_qrcode instance=%s aguardando QR (INITIALIZING) attempt=%d/%d",
                        instance_name, attempt + 1, total_attempts,
                    )
                    continue
                logger.warning(
                    "get_qrcode WPPConnect attempt=%d instance=%s HTTP 200 sem qr body=%s",
                    attempt, instance_name, (resp.text or "")[:200],
                )
    except httpx.ConnectError as e:
        logger.warning("get_qrcode WPPConnect unreachable instance=%s url=%s: %s", instance_name, url, e)
    except Exception as e:
        logger.warning("get_qrcode WPPConnect error instance=%s: %s", instance_name, e)
    cache_keys = list(_qr_store.keys())
    logger.warning(
        "get_qrcode deu None instance=%s inicializing_tentativas=%s ultimo_body=%s cache_keys=%s "
        "(webhook deve postar em /webhook/%s para popular cache antes do auto close)",
        instance_name,
        initializing_count,
        last_body_snip or "(sem 200 com INITIALIZING)",
        cache_keys,
        instance_name,
    )
    return None


def _normalize_chat_id(phone: str) -> str:
    """Normaliza numero: digits@c.us ou group@g.us."""
    number = str(phone).strip()
    if "@g.us" in number or "@c.us" in number or "@s.whatsapp.net" in number:
        return number
    number = re.sub(r"\D+", "", number) or number
    return f"{number}@c.us"


def send_text_message(api_url: str, api_key: str, session: str, phone: str, text: str) -> bool:
    """Envia mensagem de texto via POST /api/{session}/send-message."""
    url = f"{api_url.rstrip('/')}/api/{session}/send-message"
    chat_id = _normalize_chat_id(phone)
    is_group = "@g.us" in chat_id
    payload = {"phone": chat_id, "isGroup": is_group, "message": text}
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.post(url, json=payload, headers=_headers(api_key))
        if resp.status_code in (200, 201):
            return True
        logger.warning("send_text_message HTTP %s phone=%s: %s", resp.status_code, phone, resp.text[:300])
        return False
    except Exception as e:
        logger.warning("send_text_message failed for %s: %s", phone, e)
        return False


def normalize_qrcode_base64(raw: str) -> str:
    if not raw or not isinstance(raw, str):
        return ""
    s = raw.strip()
    if s.startswith("data:"):
        return s
    return f"data:image/png;base64,{s}"
