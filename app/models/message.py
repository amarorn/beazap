from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base


class MessageDirection(str, enum.Enum):
    inbound = "inbound"
    outbound = "outbound"


class MessageType(str, enum.Enum):
    text = "text"
    image = "image"
    video = "video"
    audio = "audio"
    document = "document"
    sticker = "sticker"
    location = "location"
    call = "call"
    other = "other"


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    evolution_id = Column(String(100), unique=True, nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    direction = Column(Enum(MessageDirection), nullable=False)
    msg_type = Column(Enum(MessageType), default=MessageType.text)
    content = Column(Text, nullable=True)
    media_url = Column(String(500), nullable=True)
    timestamp = Column(DateTime, nullable=False)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Para mensagens de grupo: quem enviou
    sender_phone = Column(String(30), nullable=True)
    sender_name = Column(String(150), nullable=True)

    # Para mensagens de ligação (callLogMessage)
    call_outcome = Column(String(50), nullable=True)
    call_duration_secs = Column(Integer, nullable=True)
    is_video_call = Column(Boolean, nullable=True)

    conversation = relationship("Conversation", back_populates="messages")
