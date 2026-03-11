"""ProcessedEvent for idempotency - inbound events."""
from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from app.core.database import Base


class ProcessedEvent(Base):
    __tablename__ = "processed_events"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String(50), nullable=False, index=True)
    event_key = Column(String(255), nullable=False, index=True)
    processed_at = Column(DateTime, default=datetime.utcnow)
