from sqlalchemy.orm import Session
from sqlalchemy import func, and_, case
from datetime import datetime, timedelta
from typing import List, Optional

from app.models.conversation import Conversation, ConversationStatus
from app.models.message import Message, MessageDirection
from app.models.attendant import Attendant
from app.models.instance import Instance
from app.schemas.metrics import AttendantMetrics, OverviewMetrics, DailyVolume, ConversationDetail, AnalysisStats, CategoryCount


def get_overview_metrics(db: Session, instance_id: Optional[int] = None) -> OverviewMetrics:
    query = db.query(Conversation)
    if instance_id:
        query = query.filter(Conversation.instance_id == instance_id)

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    total = query.count()
    open_c = query.filter(Conversation.status == ConversationStatus.open).count()
    resolved_c = query.filter(Conversation.status == ConversationStatus.resolved).count()
    abandoned_c = query.filter(Conversation.status == ConversationStatus.abandoned).count()

    avg_response = (
        db.query(func.avg(Conversation.first_response_time_seconds))
        .filter(Conversation.first_response_time_seconds != None)
    )
    if instance_id:
        avg_response = avg_response.filter(Conversation.instance_id == instance_id)
    avg_response_val = avg_response.scalar()

    resolution_rate = (resolved_c / total * 100) if total > 0 else 0.0

    today_convs = query.filter(Conversation.opened_at >= today_start).count()

    msg_query = db.query(func.count(Message.id)).join(Conversation).filter(
        Message.timestamp >= today_start
    )
    if instance_id:
        msg_query = msg_query.filter(Conversation.instance_id == instance_id)
    today_messages = msg_query.scalar() or 0

    return OverviewMetrics(
        total_conversations=total,
        open_conversations=open_c,
        resolved_conversations=resolved_c,
        abandoned_conversations=abandoned_c,
        avg_first_response_seconds=avg_response_val,
        resolution_rate=round(resolution_rate, 1),
        total_messages_today=today_messages,
        total_conversations_today=today_convs,
    )


def get_attendant_metrics(db: Session, instance_id: Optional[int] = None) -> List[AttendantMetrics]:
    attendants_query = db.query(Attendant).filter(Attendant.active == True)
    if instance_id:
        attendants_query = attendants_query.filter(Attendant.instance_id == instance_id)

    attendants = attendants_query.all()
    result = []

    for att in attendants:
        convs = db.query(Conversation).filter(Conversation.attendant_id == att.id)
        total = convs.count()
        open_c = convs.filter(Conversation.status == ConversationStatus.open).count()
        resolved_c = convs.filter(Conversation.status == ConversationStatus.resolved).count()
        abandoned_c = convs.filter(Conversation.status == ConversationStatus.abandoned).count()

        avg_resp = db.query(func.avg(Conversation.first_response_time_seconds)).filter(
            Conversation.attendant_id == att.id,
            Conversation.first_response_time_seconds != None,
        ).scalar()

        msg_sent = (
            db.query(func.count(Message.id))
            .join(Conversation)
            .filter(
                Conversation.attendant_id == att.id,
                Message.direction == MessageDirection.outbound,
            )
            .scalar() or 0
        )
        msg_recv = (
            db.query(func.count(Message.id))
            .join(Conversation)
            .filter(
                Conversation.attendant_id == att.id,
                Message.direction == MessageDirection.inbound,
            )
            .scalar() or 0
        )

        resolution_rate = (resolved_c / total * 100) if total > 0 else 0.0

        result.append(
            AttendantMetrics(
                attendant_id=att.id,
                attendant_name=att.name,
                role=att.role.value,
                total_conversations=total,
                open_conversations=open_c,
                resolved_conversations=resolved_c,
                abandoned_conversations=abandoned_c,
                avg_first_response_seconds=avg_resp,
                total_messages_sent=msg_sent,
                total_messages_received=msg_recv,
                resolution_rate=round(resolution_rate, 1),
            )
        )

    return result


def get_daily_volume(
    db: Session,
    days: int = 7,
    instance_id: Optional[int] = None,
) -> List[DailyVolume]:
    result = []
    for i in range(days - 1, -1, -1):
        day_start = (datetime.utcnow() - timedelta(days=i)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        day_end = day_start + timedelta(days=1)

        conv_q = db.query(func.count(Conversation.id)).filter(
            Conversation.opened_at >= day_start,
            Conversation.opened_at < day_end,
        )
        msg_in_q = (
            db.query(func.count(Message.id))
            .join(Conversation)
            .filter(
                Message.timestamp >= day_start,
                Message.timestamp < day_end,
                Message.direction == MessageDirection.inbound,
            )
        )
        msg_out_q = (
            db.query(func.count(Message.id))
            .join(Conversation)
            .filter(
                Message.timestamp >= day_start,
                Message.timestamp < day_end,
                Message.direction == MessageDirection.outbound,
            )
        )

        if instance_id:
            conv_q = conv_q.filter(Conversation.instance_id == instance_id)
            msg_in_q = msg_in_q.filter(Conversation.instance_id == instance_id)
            msg_out_q = msg_out_q.filter(Conversation.instance_id == instance_id)

        result.append(
            DailyVolume(
                date=day_start.strftime("%d/%m"),
                inbound=msg_in_q.scalar() or 0,
                outbound=msg_out_q.scalar() or 0,
                conversations=conv_q.scalar() or 0,
            )
        )
    return result


def get_recent_conversations(
    db: Session,
    limit: int = 20,
    instance_id: Optional[int] = None,
    status: Optional[str] = None,
    attendant_id: Optional[int] = None,
) -> List[ConversationDetail]:
    query = db.query(Conversation).filter(Conversation.is_group == False)
    if instance_id:
        query = query.filter(Conversation.instance_id == instance_id)
    if status:
        query = query.filter(Conversation.status == status)
    if attendant_id:
        query = query.filter(Conversation.attendant_id == attendant_id)

    convs = query.order_by(Conversation.last_message_at.desc()).limit(limit).all()

    result = []
    for c in convs:
        result.append(_to_conversation_detail(c))
    return result


def _to_conversation_detail(c: Conversation) -> ConversationDetail:
    return ConversationDetail(
        id=c.id,
        contact_phone=c.contact_phone,
        contact_name=c.contact_name,
        attendant_name=c.attendant.name if c.attendant else None,
        status=c.status.value,
        opened_at=c.opened_at,
        resolved_at=c.resolved_at,
        first_response_time_seconds=c.first_response_time_seconds,
        inbound_count=c.inbound_count or 0,
        outbound_count=c.outbound_count or 0,
        analysis_category=c.analysis_category,
        analysis_sentiment=c.analysis_sentiment,
        analysis_satisfaction=c.analysis_satisfaction,
        analysis_summary=c.analysis_summary,
        analysis_analyzed_at=c.analysis_analyzed_at,
    )


def get_conversation_detail(db: Session, conversation_id: int):
    from fastapi import HTTPException
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    return _to_conversation_detail(conv)


def get_conversation_messages(db: Session, conversation_id: int):
    from fastapi import HTTPException
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id, Message.is_deleted == False)
        .order_by(Message.timestamp.asc())
        .all()
    )

    return [
        {
            "id": m.id,
            "direction": m.direction.value,
            "msg_type": m.msg_type.value,
            "content": m.content,
            "timestamp": m.timestamp.isoformat(),
            "sender_phone": m.sender_phone,
            "sender_name": m.sender_name,
        }
        for m in messages
    ]


def resolve_conversation(db: Session, conversation_id: int) -> bool:
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        return False
    conv.status = ConversationStatus.resolved
    conv.resolved_at = datetime.utcnow()
    db.commit()
    return True


def get_group_conversations(
    db: Session,
    instance_id: Optional[int] = None,
    limit: int = 50,
) -> List[ConversationDetail]:
    query = db.query(Conversation).filter(Conversation.is_group == True)
    if instance_id:
        query = query.filter(Conversation.instance_id == instance_id)

    convs = query.order_by(Conversation.last_message_at.desc()).limit(limit).all()

    result = []
    for c in convs:
        result.append(_to_conversation_detail(c))
    return result


CATEGORY_LABELS = {
    "reclamacao": "Reclamação",
    "problema_tecnico": "Prob. Técnico",
    "nova_contratacao": "Nova Contratação",
    "suporte": "Suporte",
    "elogio": "Elogio",
    "informacao": "Informação",
    "outro": "Outro",
}


def get_analysis_stats(db: Session, instance_id: Optional[int] = None) -> AnalysisStats:
    base = db.query(Conversation).filter(Conversation.analysis_category != None)
    if instance_id:
        base = base.filter(Conversation.instance_id == instance_id)

    total_analyzed = base.count()

    avg_sat = (
        db.query(func.avg(Conversation.analysis_satisfaction))
        .filter(Conversation.analysis_satisfaction != None)
    )
    if instance_id:
        avg_sat = avg_sat.filter(Conversation.instance_id == instance_id)
    avg_sat_val = avg_sat.scalar()

    cat_rows = (
        db.query(Conversation.analysis_category, func.count(Conversation.id))
        .filter(Conversation.analysis_category != None)
    )
    if instance_id:
        cat_rows = cat_rows.filter(Conversation.instance_id == instance_id)
    cat_rows = cat_rows.group_by(Conversation.analysis_category).all()

    categories = sorted(
        [
            CategoryCount(
                key=row[0],
                label=CATEGORY_LABELS.get(row[0], row[0]),
                count=row[1],
            )
            for row in cat_rows
        ],
        key=lambda x: x.count,
        reverse=True,
    )

    sent_rows = (
        db.query(Conversation.analysis_sentiment, func.count(Conversation.id))
        .filter(Conversation.analysis_sentiment != None)
    )
    if instance_id:
        sent_rows = sent_rows.filter(Conversation.instance_id == instance_id)
    sent_rows = sent_rows.group_by(Conversation.analysis_sentiment).all()

    sentiments = {row[0]: row[1] for row in sent_rows}

    return AnalysisStats(
        total_analyzed=total_analyzed,
        avg_satisfaction=round(avg_sat_val, 1) if avg_sat_val else None,
        categories=categories,
        sentiments=sentiments,
    )


def format_response_time(seconds: Optional[float]) -> str:
    if seconds is None:
        return "—"
    if seconds < 60:
        return f"{int(seconds)}s"
    if seconds < 3600:
        return f"{int(seconds // 60)}min {int(seconds % 60)}s"
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    return f"{hours}h {minutes}min"
