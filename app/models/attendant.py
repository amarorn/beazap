from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base


class AttendantRole(str, enum.Enum):
    manager = "manager"
    agent = "agent"


class Attendant(Base):
    __tablename__ = "attendants"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    phone = Column(String(30), unique=True, nullable=False)
    email = Column(String(150), nullable=True)
    role = Column(Enum(AttendantRole), default=AttendantRole.agent)
    instance_id = Column(Integer, ForeignKey("instances.id"), nullable=False)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    instance = relationship("Instance", back_populates="attendants")
    conversations = relationship(
        "Conversation",
        foreign_keys="Conversation.attendant_id",
        back_populates="attendant",
        overlaps="group_manager,responsible",
    )
