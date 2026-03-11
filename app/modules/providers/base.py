"""Provider interface for WhatsApp channels."""
from abc import ABC, abstractmethod
from typing import TypedDict


class ConnectResult(TypedDict):
    status: str
    qr_code: str | None
    error: str | None


class SendResult(TypedDict):
    success: bool
    provider_message_id: str | None
    error: str | None


class ChannelProvider(ABC):
    """Interface para provedores de canal WhatsApp."""

    @abstractmethod
    async def connect(self, connection_id: str) -> ConnectResult:
        """Inicia/valida sessao. Retorna status, qr_code se necessario."""
        ...

    @abstractmethod
    async def send_text(self, connection_id: str, phone: str, text: str) -> SendResult:
        """Envia mensagem de texto."""
        ...

    @abstractmethod
    async def disconnect(self, connection_id: str) -> dict:
        """Desconecta sessao."""
        ...
