from pydantic import BaseModel
from typing import Optional, Any, Dict


class WebhookMessageKey(BaseModel):
    remoteJid: str
    fromMe: bool
    id: str
    participant: Optional[str] = None


class WebhookMessageContent(BaseModel):
    conversation: Optional[str] = None
    imageMessage: Optional[Dict[str, Any]] = None
    videoMessage: Optional[Dict[str, Any]] = None
    audioMessage: Optional[Dict[str, Any]] = None
    documentMessage: Optional[Dict[str, Any]] = None
    stickerMessage: Optional[Dict[str, Any]] = None
    locationMessage: Optional[Dict[str, Any]] = None
    extendedTextMessage: Optional[Dict[str, Any]] = None


class WebhookMessageData(BaseModel):
    key: WebhookMessageKey
    message: Optional[WebhookMessageContent] = None
    messageTimestamp: Optional[int] = None
    pushName: Optional[str] = None
    status: Optional[str] = None


class WebhookPayload(BaseModel):
    event: str
    instance: str
    data: Any
    destination: Optional[str] = None
    date_time: Optional[str] = None
    sender: Optional[str] = None
    server_url: Optional[str] = None
    apikey: Optional[str] = None
