"""WPPConnect Server provider implementation."""
import asyncio
import logging
import re
from typing import Optional

import httpx

from app.modules.providers.base import ChannelProvider, ConnectResult, SendResult

logger = logging.getLogger(__name__)


def _normalize_phone(phone: str) -> str:
    s = str(phone).strip()
    if "@g.us" in s or "@c.us" in s or "@s.whatsapp.net" in s:
        return s
    digits = re.sub(r"\D+", "", s) or s
    return f"{digits}@c.us"


class WppConnectProvider(ChannelProvider):
    """Implementacao usando WPPConnect Server API."""

    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    def _headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    async def connect(self, connection_id: str) -> ConnectResult:
        url = f"{self.base_url}/api/{connection_id}/checkConnectionState"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url, headers=self._headers())
            if resp.status_code == 200:
                data = resp.json()
                state = (data.get("state") or data.get("status") or "").upper()
                if state in ("CONNECTED", "OPEN", "true"):
                    return {"status": "connected", "qr_code": None, "error": None}
                if state in ("CONNECTING", "LOADING"):
                    return {"status": "connecting", "qr_code": None, "error": None}
            # Inicia a sessão (sem bloqueio) e aguarda o QR ficar disponível
            async with httpx.AsyncClient(timeout=15) as client:
                start_url = f"{self.base_url}/api/{connection_id}/start-session"
                await client.post(
                    start_url,
                    json={"waitForLogin": False, "autoClose": 0},
                    headers=self._headers(),
                )
                await asyncio.sleep(3)
                qr_url = f"{self.base_url}/api/{connection_id}/qrcode-session"
                qr_resp = await client.get(qr_url, headers=self._headers())
            if qr_resp.status_code == 200:
                qr_data = qr_resp.json()
                qr = qr_data.get("base64Image") or qr_data.get("qr") or qr_data.get("result")
                if not qr and isinstance(qr_data.get("qrcode"), dict):
                    qr = qr_data["qrcode"].get("base64Image") or qr_data["qrcode"].get("base64") or qr_data["qrcode"].get("data")
                if isinstance(qr, dict):
                    qr = qr.get("base64Image") or qr.get("base64") or qr.get("data")
                if qr:
                    return {
                        "status": "qr_pending",
                        "qr_code": qr if qr.startswith("data:") else f"data:image/png;base64,{qr}",
                        "error": None,
                    }
            return {"status": "disconnected", "qr_code": None, "error": "QR nao disponivel"}
        except httpx.ConnectError as e:
            return {"status": "error", "qr_code": None, "error": str(e)}
        except Exception as e:
            logger.exception("WPPConnect connect failed connection_id=%s", connection_id)
            return {"status": "error", "qr_code": None, "error": str(e)}

    async def send_text(self, connection_id: str, phone: str, text: str) -> SendResult:
        url = f"{self.base_url}/api/{connection_id}/send-message"
        chat_id = _normalize_phone(phone)
        payload = {"phone": chat_id, "isGroup": "@g.us" in chat_id, "message": text}
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(url, json=payload, headers=self._headers())
            if resp.status_code in (200, 201):
                data = resp.json()
                msg_id = data.get("id") or data.get("messageId") or data.get("result", {}).get("id")
                return {"success": True, "provider_message_id": str(msg_id) if msg_id else None, "error": None}
            return {
                "success": False,
                "provider_message_id": None,
                "error": f"HTTP {resp.status_code}: {resp.text[:200]}",
            }
        except Exception as e:
            logger.exception("WPPConnect send_text failed connection_id=%s phone=%s", connection_id, phone)
            return {"success": False, "provider_message_id": None, "error": str(e)}

    async def disconnect(self, connection_id: str) -> dict:
        # close-session no server 2.8.x dispara req.client.close is not a function e pode travar userDataDir
        return {
            "status": "error",
            "detail": "close-session indisponivel nesta versao do WPPConnect; reinicie o container wppconnect se precisar liberar a sessao.",
        }
