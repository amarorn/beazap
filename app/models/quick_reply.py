from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from datetime import datetime
from app.core.database import Base


class QuickReply(Base):
    __tablename__ = "quick_replies"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(100), nullable=False)
    text = Column(Text, nullable=False)
    active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
