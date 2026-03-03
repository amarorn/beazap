from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    keywords = Column(Text, nullable=True)  # comma-separated, used as hints for LLM routing
    instance_id = Column(Integer, ForeignKey("instances.id"), nullable=False)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    instance = relationship("Instance")
    conversations = relationship("Conversation", back_populates="team")
