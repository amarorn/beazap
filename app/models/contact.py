from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(Integer, ForeignKey("instances.id", ondelete="CASCADE"), nullable=False, index=True)
    contact_phone = Column(String(30), nullable=False, index=True)
    contact_jid = Column(String(80), nullable=True)
    contact_send_jid = Column(String(80), nullable=True)
    contact_name = Column(String(150), nullable=True)
    contact_avatar_url = Column(String(500), nullable=True)
    first_seen_at = Column(DateTime, nullable=True)
    last_seen_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    instance = relationship("Instance", backref="contacts")
