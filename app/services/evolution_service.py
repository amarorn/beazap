import logging
import httpx
from typing import Optional

logger = logging.getLogger(__name__)


async def create_evolution_instance(api_url: str, api_key: str, instance_name: str) -> dict:
    """Creates an instance in Evolution API. Returns the API response.
    If the instance already exists (4xx), returns an empty dict so the caller
    can fall through to get_qrcode() instead of raising.
    """
    url = f"{api_url.rstrip('/')}/instance/create"
    payload = {"instanceName": instance_name, "integration": "WHATSAPP-BAILEYS", "qrcode": True}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=payload, headers={"apikey": api_key})
        if resp.status_code in (400, 409):
            # Instance may already exist — caller will try get_qrcode() separately
            return {"_already_exists": True, "_status": resp.status_code, "_detail": resp.text}
        resp.raise_for_status()
        return resp.json()


WEBHOOK_EVENTS = [
    "MESSAGES_UPSERT",
    "MESSAGES_UPDATE",
    "GROUPS_UPSERT",
    "GROUP_UPDATE",
    "GROUP_PARTICIPANTS_UPDATE",
    "CALL",
]


async def configure_webhook(api_url: str, api_key: str, instance_name: str, webhook_url: str) -> dict:
    """Sets the webhook URL and events on the Evolution API instance (v2 format)."""
    url = f"{api_url.rstrip('/')}/webhook/set/{instance_name}"
    payload = {
        "webhook": {
            "url": webhook_url,
            "enabled": True,
            "webhookByEvents": False,
            "webhookBase64": False,
            "events": WEBHOOK_EVENTS,
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


async def get_qrcode(api_url: str, api_key: str, instance_name: str) -> Optional[str]:
    """Fetches QR code base64 from Evolution API connect endpoint."""
    url = f"{api_url.rstrip('/')}/instance/connect/{instance_name}"
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(url, headers={"apikey": api_key})
        if resp.status_code == 200:
            data = resp.json()
            # v2: {"base64": "data:image/png;base64,...", "code": "..."}
            # v1: {"qrcode": {"base64": "..."}}
            return (
                data.get("base64")
                or (data.get("qrcode") or {}).get("base64")
            )
    return None
