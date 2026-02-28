from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class Instance(Base):
    __tablename__ = "instances"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    instance_name = Column(String(100), unique=True, nullable=False)
    api_url = Column(String(255), nullable=False)
    api_key = Column(String(255), nullable=False)
    active = Column(Boolean, default=True)
    phone_number = Column(String(30), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    attendants = relationship("Attendant", back_populates="instance")
    conversations = relationship("Conversation", back_populates="instance")
