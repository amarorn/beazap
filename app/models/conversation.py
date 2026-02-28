from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum, Float, Boolean, Text
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base


class ConversationStatus(str, enum.Enum):
    open = "open"
    resolved = "resolved"
    abandoned = "abandoned"


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    contact_phone = Column(String(30), nullable=False, index=True)
    contact_name = Column(String(150), nullable=True)
    attendant_id = Column(Integer, ForeignKey("attendants.id"), nullable=True)
    instance_id = Column(Integer, ForeignKey("instances.id"), nullable=False)
    status = Column(Enum(ConversationStatus), default=ConversationStatus.open)

    opened_at = Column(DateTime, default=datetime.utcnow)
    first_response_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    last_message_at = Column(DateTime, nullable=True)

    # Tempo de primeira resposta em segundos
    first_response_time_seconds = Column(Float, nullable=True)

    # Total de mensagens
    inbound_count = Column(Integer, default=0)
    outbound_count = Column(Integer, default=0)

    # Indica se é um grupo do WhatsApp
    is_group = Column(Boolean, default=False)

    # Vínculos de grupo: responsável e gerente direto
    responsible_id = Column(Integer, ForeignKey("attendants.id"), nullable=True)
    manager_id = Column(Integer, ForeignKey("attendants.id"), nullable=True)

    # Análise LLM
    analysis_category = Column(String(30), nullable=True)    # reclamacao, problema_tecnico, nova_contratacao, suporte, elogio, informacao, outro
    analysis_sentiment = Column(String(20), nullable=True)   # positivo, neutro, negativo
    analysis_satisfaction = Column(Integer, nullable=True)   # 1-5
    analysis_summary = Column(Text, nullable=True)
    analysis_analyzed_at = Column(DateTime, nullable=True)

    attendant = relationship(
        "Attendant",
        foreign_keys=[attendant_id],
        back_populates="conversations",
        overlaps="group_manager,responsible",
    )
    responsible = relationship(
        "Attendant",
        foreign_keys=[responsible_id],
        overlaps="attendant,conversations,group_manager",
    )
    group_manager = relationship(
        "Attendant",
        foreign_keys=[manager_id],
        overlaps="attendant,conversations,responsible",
    )
    instance = relationship("Instance", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", order_by="Message.timestamp")
