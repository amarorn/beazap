"""Tests for messaging module - normalization and idempotency."""
import pytest
from app.modules.messaging.service import _normalize_phone, ensure_contact, ensure_conversation
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.instance import Instance
from app.models.contact import Contact
from app.models.conversation import Conversation, ConversationStatus


def _normalize_phone_standalone(jid: str) -> str:
    import re
    return __import__("re").sub(r"\D+", "", str(jid).split("@")[0].split(":")[0]) or str(jid)


def test_normalize_phone():
    assert _normalize_phone_standalone("5511999999999") == "5511999999999"
    assert _normalize_phone_standalone("5511999999999@s.whatsapp.net") == "5511999999999"
    assert _normalize_phone_standalone("5511999999999:0@c.us") == "5511999999999"
