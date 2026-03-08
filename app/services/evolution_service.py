import base64
import io
import logging
import httpx
import qrcode
from typing import Optional

logger = logging.getLogger(__name__)


async def create_evolution_instance(api_url: str, api_key: str, instance_name: str) -> dict:
    """Creates an instance in Evolution API. Returns the API response.
    If the instance already exists (4xx), returns an empty dict so the caller
    can fall through to get_qrcode() instead of raising.
    """
    url = f"{api_url.rstrip('/')}/instance/create"
    payload = {"instanceName": instance_name, "integration": "WHATSAPP-BAILEYS", "qrcode": True}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json=payload, headers={"apikey": api_key})
    except httpx.ConnectError as e:
        logger.warning("create_evolution_instance connect error api_url=%s: %s", api_url, e)
        raise
    if resp.status_code in (400, 403, 409):
        return {"_already_exists": True, "_status": resp.status_code, "_detail": resp.text}
    resp.raise_for_status()
    data = resp.json()
    # Evolution v2 pode retornar payload em "data"
    if isinstance(data.get("data"), dict):
        data = {**data, **data["data"]}
    return data


WEBHOOK_EVENTS_DEFAULT = [
    "MESSAGES_UPSERT",
    "MESSAGES_UPDATE",
    "GROUPS_UPSERT",
    "GROUP_UPDATE",
    "GROUP_PARTICIPANTS_UPDATE",
    "CALL",
]

WEBHOOK_EVENTS_ALL = [
    "APPLICATION_STARTUP",
    "CALL",
    "CHATS_DELETE",
    "CHATS_SET",
    "CHATS_UPDATE",
    "CHATS_UPSERT",
    "CONNECTION_UPDATE",
    "CONTACTS_SET",
    "CONTACTS_UPDATE",
    "CONTACTS_UPSERT",
    "GROUP_PARTICIPANTS_UPDATE",
    "GROUP_UPDATE",
    "GROUPS_UPSERT",
    "LABELS_ASSOCIATION",
    "LABELS_EDIT",
    "LOGOUT_INSTANCE",
    "MESSAGES_DELETE",
    "MESSAGES_SET",
    "MESSAGES_UPDATE",
    "MESSAGES_UPSERT",
    "PRESENCE_UPDATE",
    "QRCODE_UPDATED",
    "REMOVE_INSTANCE",
    "SEND_MESSAGE",
    "TYPEBOT_CHANGE_STATUS",
    "TYPEBOT_START",
]


async def configure_webhook(
    api_url: str,
    api_key: str,
    instance_name: str,
    webhook_url: str,
    *,
    webhook_by_events: bool = False,
    webhook_base64: bool = False,
    events: Optional[list[str]] = None,
) -> dict:
    """Sets the webhook URL and events on the Evolution API instance (v2 format)."""
    url = f"{api_url.rstrip('/')}/webhook/set/{instance_name}"
    evts = events if events is not None else WEBHOOK_EVENTS_DEFAULT
    payload = {
        "webhook": {
            "url": webhook_url,
            "enabled": True,
            "webhookByEvents": webhook_by_events,
            "webhookBase64": webhook_base64,
            "events": evts,
        }
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(url, json=payload, headers={"apikey": api_key})
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as e:
        body = e.response.text
        try:
            j = e.response.json()
            body = str(j)
        except Exception:
            pass
        msg = f"Evolution API {e.response.status_code}: {body}"
        logger.warning("configure_webhook failed: %s", msg)
        raise ValueError(msg) from e
    except httpx.ConnectError as e:
        msg = f"Não foi possível conectar à Evolution API ({api_url}): {e}"
        logger.warning("configure_webhook connect error: %s", msg)
        raise ValueError(msg) from e


async def get_webhook(api_url: str, api_key: str, instance_name: str) -> Optional[dict]:
    """Fetches current webhook configuration from Evolution API."""
    url = f"{api_url.rstrip('/')}/webhook/find/{instance_name}"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, headers={"apikey": api_key})
        if resp.status_code == 200:
            return resp.json()
    return None


def send_text_message(api_url: str, api_key: str, instance_name: str, phone: str, text: str) -> bool:
    """Sends a text message via Evolution API (synchronous). Returns True on success."""
    url = f"{api_url.rstrip('/')}/message/sendText/{instance_name}"
    payload = {"number": phone, "text": text}
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.post(url, json=payload, headers={"apikey": api_key})
            if resp.status_code in (200, 201):
                return True
            body = resp.text[:500] if resp.text else ""
            logger.warning(
                "send_text_message HTTP %s instance=%s phone=%s: %s",
                resp.status_code, instance_name, phone, body,
            )
            return False
    except Exception as e:
        logger.warning("send_text_message failed for %s → %s: %s", instance_name, phone, e)
        return False


def _qrcode_from_string(text: str) -> Optional[str]:
    """Gera imagem QR em base64 a partir do texto (code/pairingCode da Evolution)."""
    if not text or not isinstance(text, str) or len(text) < 4:
        return None
    try:
        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(text)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#198754", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return f"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"
    except Exception as e:
        logger.warning("qrcode_from_string failed: %s", e)
        return None


def normalize_qrcode_base64(raw: str) -> str:
    """Garante que o base64 retornado seja um data URL valido para <img src>."""
    if not raw or not isinstance(raw, str):
        return ""
    s = raw.strip()
    if s.startswith("data:"):
        return s
    return f"data:image/png;base64,{s}"


async def get_qrcode(api_url: str, api_key: str, instance_name: str) -> Optional[str]:
    """Fetches QR code base64 from Evolution API connect endpoint."""
    url = f"{api_url.rstrip('/')}/instance/connect/{instance_name}"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url, headers={"apikey": api_key})
    except httpx.ConnectError as e:
        logger.warning(
            "get_qrcode connect error instance=%s api_url=%s: %s",
            instance_name, api_url, e,
        )
        return None
    except Exception as e:
        logger.warning("get_qrcode error instance=%s: %s", instance_name, e)
        return None

    if resp.status_code != 200:
        logger.warning(
            "get_qrcode HTTP %s instance=%s body=%s",
            resp.status_code, instance_name, (resp.text or "")[:300],
        )
        return None

    try:
        data = resp.json()
    except Exception as e:
        logger.warning("get_qrcode invalid JSON instance=%s: %s", instance_name, e)
        return None

    # Evolution v2 pode enviar payload dentro de "data"
    if isinstance(data.get("data"), dict):
        data = {**data, **data["data"]}

    # base64 direto (v1 ou alguns v2)
    out = (
        data.get("base64")
        or (data.get("qrcode") or {}).get("base64")
    )
    if out:
        out = normalize_qrcode_base64(out)
        if out:
            return out

    # v2: pairingCode + code (string para gerar QR)
    code = data.get("code") or data.get("pairingCode")
    if code:
        out = _qrcode_from_string(code)
        if out:
            return out

    if data.get("count") == 0:
        logger.info(
            "get_qrcode instance=%s: Evolution retornou count=0 (sem pairingCode/code). "
            "Verifique SERVER_URL e CONFIG_SESSION_PHONE_* no docker-compose.",
            instance_name,
        )
    else:
        logger.warning(
            "get_qrcode instance=%s: resposta sem base64/code/pairingCode. keys=%s sample=%s",
            instance_name, list(data.keys())[:15], str(data)[:400],
        )
    return None
