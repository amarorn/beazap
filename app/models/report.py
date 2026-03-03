from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Date, Text, UniqueConstraint
from app.core.database import Base


class AtendimentoRaw(Base):
    """Uma linha por conversa fechada — camada de dados brutos por atendimento."""
    __tablename__ = "atendimento_raw"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, unique=True, nullable=False, index=True)
    attendant_id = Column(Integer, nullable=True, index=True)
    attendant_name = Column(String(150), nullable=True)
    instance_id = Column(Integer, nullable=False, index=True)

    contact_phone = Column(String(30), nullable=False)
    contact_name = Column(String(150), nullable=True)

    status = Column(String(20), nullable=False)  # resolved | abandoned
    opened_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    first_response_seconds = Column(Float, nullable=True)
    resolution_seconds = Column(Float, nullable=True)

    inbound_count = Column(Integer, default=0)
    outbound_count = Column(Integer, default=0)

    analysis_category = Column(String(30), nullable=True)
    analysis_sentiment = Column(String(20), nullable=True)
    analysis_satisfaction = Column(Integer, nullable=True)

    period_week = Column(Date, nullable=True, index=True)  # segunda-feira da semana
    created_at = Column(DateTime, default=datetime.utcnow)


class ClienteAtendRaw(Base):
    """Uma linha por (cliente × atendente × semana) — agregação por par."""
    __tablename__ = "cliente_atend_raw"

    id = Column(Integer, primary_key=True, index=True)
    contact_phone = Column(String(30), nullable=False)
    attendant_id = Column(Integer, nullable=False, index=True)
    instance_id = Column(Integer, nullable=False)
    period_week = Column(Date, nullable=False, index=True)

    total_conversations = Column(Integer, default=0)
    resolved_conversations = Column(Integer, default=0)
    abandoned_conversations = Column(Integer, default=0)

    avg_response_seconds = Column(Float, nullable=True)
    avg_resolution_seconds = Column(Float, nullable=True)
    total_messages_in = Column(Integer, default=0)
    total_messages_out = Column(Integer, default=0)
    avg_satisfaction = Column(Float, nullable=True)

    dominant_category = Column(String(30), nullable=True)
    dominant_sentiment = Column(String(20), nullable=True)

    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("contact_phone", "attendant_id", "period_week", name="uq_cliente_atend_week"),
    )


class AtendentRaw(Base):
    """Uma linha por (atendente × semana) — snapshot semanal com resumo LLM."""
    __tablename__ = "atendente_raw"

    id = Column(Integer, primary_key=True, index=True)
    attendant_id = Column(Integer, nullable=False, index=True)
    attendant_name = Column(String(150), nullable=False)
    role = Column(String(20), nullable=True)
    instance_id = Column(Integer, nullable=False, index=True)
    period_week = Column(Date, nullable=False, index=True)

    total_conversations = Column(Integer, default=0)
    resolved_conversations = Column(Integer, default=0)
    abandoned_conversations = Column(Integer, default=0)
    resolution_rate = Column(Float, default=0.0)

    avg_first_response_seconds = Column(Float, nullable=True)
    avg_resolution_seconds = Column(Float, nullable=True)
    total_messages_sent = Column(Integer, default=0)
    total_messages_received = Column(Integer, default=0)
    avg_satisfaction = Column(Float, nullable=True)

    sla_5min_rate = Column(Float, default=0.0)
    sla_15min_rate = Column(Float, default=0.0)
    sla_30min_rate = Column(Float, default=0.0)

    top_categories = Column(Text, nullable=True)   # JSON string
    top_sentiments = Column(Text, nullable=True)   # JSON string

    llm_summary = Column(Text, nullable=True)
    generated_at = Column(DateTime, nullable=True)
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("attendant_id", "period_week", name="uq_atendente_week"),
    )
