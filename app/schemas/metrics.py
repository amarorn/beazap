from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class AttendantMetrics(BaseModel):
    attendant_id: int
    attendant_name: str
    role: str
    total_conversations: int
    open_conversations: int
    resolved_conversations: int
    abandoned_conversations: int
    avg_first_response_seconds: Optional[float]
    total_messages_sent: int
    total_messages_received: int
    resolution_rate: float


class DailyVolume(BaseModel):
    date: str
    inbound: int
    outbound: int
    conversations: int


class OverviewMetrics(BaseModel):
    total_conversations: int
    open_conversations: int
    resolved_conversations: int
    abandoned_conversations: int
    avg_first_response_seconds: Optional[float]
    resolution_rate: float
    total_messages_today: int
    total_conversations_today: int


class ConversationDetail(BaseModel):
    id: int
    contact_phone: str
    contact_name: Optional[str]
    attendant_name: Optional[str]
    status: str
    opened_at: datetime
    resolved_at: Optional[datetime]
    first_response_time_seconds: Optional[float]
    inbound_count: int
    outbound_count: int

    # Análise LLM
    analysis_category: Optional[str] = None
    analysis_sentiment: Optional[str] = None
    analysis_satisfaction: Optional[int] = None
    analysis_summary: Optional[str] = None
    analysis_analyzed_at: Optional[datetime] = None

    # Vínculos de grupo
    responsible_id: Optional[int] = None
    responsible_name: Optional[str] = None
    manager_id: Optional[int] = None
    manager_name: Optional[str] = None

    class Config:
        from_attributes = True


class CategoryCount(BaseModel):
    key: str
    label: str
    count: int


class AnalysisStats(BaseModel):
    total_analyzed: int
    avg_satisfaction: Optional[float]
    categories: List[CategoryCount]
    sentiments: dict


class InstanceCreate(BaseModel):
    name: str
    instance_name: str
    api_url: str
    api_key: str
    phone_number: Optional[str] = None


class AttendantCreate(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    role: str = "agent"
    instance_id: int
