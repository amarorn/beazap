from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, case
from datetime import datetime, timedelta
from typing import List, Optional

from app.models.conversation import Conversation, ConversationStatus
from app.models.message import Message, MessageDirection, MessageType
from app.models.attendant import Attendant
from app.models.instance import Instance
from app.schemas.metrics import (
    AttendantMetrics,
    OverviewMetrics,
    OverviewComparison,
    ExtendedMetrics,
    DailyExtendedMetrics,
    DailyVolume,
    DailySla,
    DailyStatus,
    HourlyVolume,
    ConversationDetail,
    AnalysisStats,
    CategoryCount,
    GroupOverviewMetrics,
)


def get_overview_metrics(db: Session, instance_id: Optional[int] = None) -> OverviewMetrics:
    query = db.query(Conversation)
    if instance_id:
        query = query.filter(Conversation.instance_id == instance_id)

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    total = query.count()
    open_c = query.filter(Conversation.status == ConversationStatus.open).count()
    resolved_c = query.filter(Conversation.status == ConversationStatus.resolved).count()
    abandoned_c = query.filter(Conversation.status == ConversationStatus.abandoned).count()

    open_base = db.query(Conversation).filter(Conversation.status == ConversationStatus.open)
    if instance_id:
        open_base = open_base.filter(Conversation.instance_id == instance_id)
    waiting_c = open_base.filter(Conversation.first_response_at.is_(None)).count()
    in_progress_c = open_base.filter(Conversation.first_response_at.isnot(None)).count()

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
        waiting_conversations=waiting_c,
        in_progress_conversations=in_progress_c,
        avg_first_response_seconds=avg_response_val,
        resolution_rate=round(resolution_rate, 1),
        total_messages_today=today_messages,
        total_conversations_today=today_convs,
    )


def get_overview_comparison(
    db: Session,
    days: int = 7,
    instance_id: Optional[int] = None,
) -> OverviewComparison:
    """Retorna métricas do período atual vs anterior para comparativo."""
    now = datetime.utcnow()
    current_start = (now - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
    previous_start = (now - timedelta(days=days * 2)).replace(hour=0, minute=0, second=0, microsecond=0)

    def _metrics_for_period(start: datetime, end: datetime) -> dict:
        base = db.query(Conversation)
        if instance_id:
            base = base.filter(Conversation.instance_id == instance_id)
        convs = base.filter(
            Conversation.opened_at >= start,
            Conversation.opened_at < end,
        )
        total = convs.count()
        resolved = convs.filter(Conversation.status == ConversationStatus.resolved).count()
        msgs = (
            db.query(func.count(Message.id))
            .join(Conversation)
            .filter(
                Message.timestamp >= start,
                Message.timestamp < end,
            )
        )
        if instance_id:
            msgs = msgs.filter(Conversation.instance_id == instance_id)
        msg_count = msgs.scalar() or 0
        rate = (resolved / total * 100) if total > 0 else 0
        return {"conversations": total, "messages": msg_count, "resolution_rate": rate}

    current = _metrics_for_period(current_start, now)
    previous = _metrics_for_period(previous_start, current_start)

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    today_convs = (
        db.query(func.count(Conversation.id))
        .filter(Conversation.opened_at >= today_start)
    )
    yesterday_convs = (
        db.query(func.count(Conversation.id))
        .filter(
            Conversation.opened_at >= yesterday_start,
            Conversation.opened_at < today_start,
        )
    )
    today_msgs = (
        db.query(func.count(Message.id))
        .join(Conversation)
        .filter(Message.timestamp >= today_start)
    )
    yesterday_msgs = (
        db.query(func.count(Message.id))
        .join(Conversation)
        .filter(
            Message.timestamp >= yesterday_start,
            Message.timestamp < today_start,
        )
    )
    if instance_id:
        today_convs = today_convs.filter(Conversation.instance_id == instance_id)
        yesterday_convs = yesterday_convs.filter(Conversation.instance_id == instance_id)
        today_msgs = today_msgs.filter(Conversation.instance_id == instance_id)
        yesterday_msgs = yesterday_msgs.filter(Conversation.instance_id == instance_id)

    tc = today_convs.scalar() or 0
    yc = yesterday_convs.scalar() or 0
    tm = today_msgs.scalar() or 0
    ym = yesterday_msgs.scalar() or 0

    def _pct_change(curr: float, prev: float) -> float:
        if prev == 0:
            return 100.0 if curr > 0 else 0.0
        return round(((curr - prev) / prev) * 100, 1)

    return OverviewComparison(
        overview=get_overview_metrics(db, instance_id),
        change_conversations_today=_pct_change(tc, yc),
        change_messages_today=_pct_change(tm, ym),
        change_resolution_rate=_pct_change(current["resolution_rate"], previous["resolution_rate"]),
    )


def get_extended_metrics(db: Session, instance_id: Optional[int] = None) -> ExtendedMetrics:
    """Métricas estendidas: tempo de resolução, SLA, abandono, conversas sem resposta."""
    now = datetime.utcnow()
    base = db.query(Conversation).filter(Conversation.is_group == False)
    if instance_id:
        base = base.filter(Conversation.instance_id == instance_id)

    total = base.count()
    abandoned = base.filter(Conversation.status == ConversationStatus.abandoned).count()
    abandonment_rate = round((abandoned / total * 100), 1) if total > 0 else 0.0

    resolved_with_times = base.filter(
        Conversation.status == ConversationStatus.resolved,
        Conversation.resolved_at.isnot(None),
        Conversation.opened_at.isnot(None),
    ).all()
    resolution_seconds = [
        (c.resolved_at - c.opened_at).total_seconds()
        for c in resolved_with_times
    ]
    avg_resolution = round(sum(resolution_seconds) / len(resolution_seconds), 1) if resolution_seconds else None

    with_first_response = base.filter(
        Conversation.first_response_time_seconds.isnot(None),
    )
    total_with_resp = with_first_response.count()
    sla_5 = with_first_response.filter(Conversation.first_response_time_seconds <= 300).count()
    sla_15 = with_first_response.filter(Conversation.first_response_time_seconds <= 900).count()
    sla_30 = with_first_response.filter(Conversation.first_response_time_seconds <= 1800).count()
    sla_5_rate = round((sla_5 / total_with_resp * 100), 1) if total_with_resp > 0 else 0.0
    sla_15_rate = round((sla_15 / total_with_resp * 100), 1) if total_with_resp > 0 else 0.0
    sla_30_rate = round((sla_30 / total_with_resp * 100), 1) if total_with_resp > 0 else 0.0

    open_no_resp = base.filter(
        Conversation.status == ConversationStatus.open,
        Conversation.first_response_at.is_(None),
    )
    threshold_1h = now - timedelta(hours=1)
    threshold_4h = now - timedelta(hours=4)
    no_resp_1h = open_no_resp.filter(Conversation.opened_at < threshold_1h).count()
    no_resp_4h = open_no_resp.filter(Conversation.opened_at < threshold_4h).count()

    return ExtendedMetrics(
        avg_resolution_time_seconds=avg_resolution,
        abandonment_rate=abandonment_rate,
        sla_5min_rate=sla_5_rate,
        sla_15min_rate=sla_15_rate,
        sla_30min_rate=sla_30_rate,
        conversations_no_response_1h=no_resp_1h,
        conversations_no_response_4h=no_resp_4h,
    )


def get_daily_extended_metrics(
    db: Session,
    days: int = 7,
    instance_id: Optional[int] = None,
) -> List[DailyExtendedMetrics]:
    """Métricas estendidas por dia para gráficos."""
    result = []
    for i in range(days - 1, -1, -1):
        day_start = (datetime.utcnow() - timedelta(days=i)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        day_end = day_start + timedelta(days=1)

        base = db.query(Conversation).filter(
            Conversation.is_group == False,
            Conversation.opened_at >= day_start,
            Conversation.opened_at < day_end,
        )
        if instance_id:
            base = base.filter(Conversation.instance_id == instance_id)

        total = base.count()
        abandoned = base.filter(Conversation.status == ConversationStatus.abandoned).count()
        abandonment_rate = round((abandoned / total * 100), 1) if total > 0 else 0.0

        resolved = base.filter(
            Conversation.status == ConversationStatus.resolved,
            Conversation.resolved_at.isnot(None),
            Conversation.opened_at.isnot(None),
        ).all()
        resolution_seconds = [(c.resolved_at - c.opened_at).total_seconds() for c in resolved]
        avg_resolution = round(sum(resolution_seconds) / len(resolution_seconds), 1) if resolution_seconds else None

        with_resp = base.filter(Conversation.first_response_time_seconds.isnot(None))
        total_resp = with_resp.count()
        sla_5 = with_resp.filter(Conversation.first_response_time_seconds <= 300).count()
        sla_15 = with_resp.filter(Conversation.first_response_time_seconds <= 900).count()
        sla_30 = with_resp.filter(Conversation.first_response_time_seconds <= 1800).count()
        sla_5_rate = round((sla_5 / total_resp * 100), 1) if total_resp > 0 else 0.0
        sla_15_rate = round((sla_15 / total_resp * 100), 1) if total_resp > 0 else 0.0
        sla_30_rate = round((sla_30 / total_resp * 100), 1) if total_resp > 0 else 0.0

        result.append(
            DailyExtendedMetrics(
                date=day_start.strftime("%d/%m"),
                avg_resolution_seconds=avg_resolution,
                abandonment_rate=abandonment_rate,
                sla_5min_rate=sla_5_rate,
                sla_15min_rate=sla_15_rate,
                sla_30min_rate=sla_30_rate,
            )
        )
    return result


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


def get_hourly_volume(
    db: Session,
    days: int = 7,
    instance_id: Optional[int] = None,
) -> List[HourlyVolume]:
    """Mensagens por hora do dia (0-23) nos últimos N dias."""
    start = datetime.utcnow() - timedelta(days=days)
    q = db.query(Message).join(Conversation).filter(Message.timestamp >= start)
    if instance_id:
        q = q.filter(Conversation.instance_id == instance_id)
    messages = q.all()
    by_hour = [0] * 24
    for m in messages:
        by_hour[m.timestamp.hour] += 1
    labels = [f"{h:02d}h" for h in range(24)]
    return [HourlyVolume(hour=h, count=c, label=labels[h]) for h, c in enumerate(by_hour)]


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


def get_daily_sla(
    db: Session,
    days: int = 7,
    instance_id: Optional[int] = None,
) -> List[DailySla]:
    result = []
    for i in range(days - 1, -1, -1):
        day_start = (datetime.utcnow() - timedelta(days=i)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        day_end = day_start + timedelta(days=1)

        q = (
            db.query(
                func.avg(Conversation.first_response_time_seconds).label("avg_sec"),
                func.count(Conversation.id).label("cnt"),
            )
            .filter(
                Conversation.first_response_time_seconds.isnot(None),
                Conversation.first_response_at >= day_start,
                Conversation.first_response_at < day_end,
            )
        )
        if instance_id:
            q = q.filter(Conversation.instance_id == instance_id)
        row = q.first()

        result.append(
            DailySla(
                date=day_start.strftime("%d/%m"),
                avg_response_seconds=round(row.avg_sec, 1) if row and row.avg_sec else None,
                count=row.cnt if row else 0,
            )
        )
    return result


def get_daily_status(
    db: Session,
    days: int = 7,
    instance_id: Optional[int] = None,
) -> List[DailyStatus]:
    result = []
    for i in range(days - 1, -1, -1):
        day_start = (datetime.utcnow() - timedelta(days=i)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        day_end = day_start + timedelta(days=1)

        base = db.query(Conversation).filter(Conversation.is_group == False)
        if instance_id:
            base = base.filter(Conversation.instance_id == instance_id)

        opened = base.filter(
            Conversation.opened_at >= day_start,
            Conversation.opened_at < day_end,
        ).count()

        in_progress = base.filter(
            Conversation.first_response_at >= day_start,
            Conversation.first_response_at < day_end,
        ).count()

        waiting = base.filter(
            Conversation.opened_at >= day_start,
            Conversation.opened_at < day_end,
        ).filter(
            or_(
                Conversation.first_response_at.is_(None),
                Conversation.first_response_at >= day_end,
            ),
        ).count()

        result.append(
            DailyStatus(
                date=day_start.strftime("%d/%m"),
                opened=opened,
                in_progress=in_progress,
                waiting=waiting,
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


def _parse_group_tags(tags_str: Optional[str]) -> Optional[List[str]]:
    if not tags_str or not tags_str.strip():
        return None
    return [t.strip() for t in tags_str.split(",") if t.strip()]


def _to_conversation_detail(c: Conversation) -> ConversationDetail:
    return ConversationDetail(
        id=c.id,
        contact_phone=c.contact_phone,
        contact_name=c.contact_name,
        contact_avatar_url=c.contact_avatar_url,
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
        responsible_id=c.responsible_id,
        responsible_name=c.responsible.name if c.responsible else None,
        manager_id=c.manager_id,
        manager_name=c.group_manager.name if c.group_manager else None,
        group_tags=_parse_group_tags(c.group_tags),
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


def get_calls(
    db: Session,
    instance_id: Optional[int] = None,
    limit: int = 50,
    direction: Optional[str] = None,
) -> List[dict]:
    query = (
        db.query(Message, Conversation)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .filter(
            Message.msg_type == MessageType.call,
            Message.is_deleted == False,
            Conversation.is_group == False,
        )
    )
    if instance_id:
        query = query.filter(Conversation.instance_id == instance_id)
    if direction:
        query = query.filter(Message.direction == direction)

    rows = query.order_by(Message.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": m.id,
            "conversation_id": m.conversation_id,
            "contact_phone": c.contact_phone,
            "contact_name": c.contact_name,
            "direction": m.direction.value,
            "content": m.content,
            "timestamp": m.timestamp.isoformat(),
            "call_outcome": m.call_outcome,
            "call_duration_secs": m.call_duration_secs,
            "is_video_call": m.is_video_call,
        }
        for m, c in rows
    ]


def resolve_conversation(db: Session, conversation_id: int) -> bool:
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        return False
    conv.status = ConversationStatus.resolved
    conv.resolved_at = datetime.utcnow()
    db.commit()
    return True


def get_group_overview_metrics(db: Session, instance_id: Optional[int] = None) -> GroupOverviewMetrics:
    query = db.query(Conversation).filter(Conversation.is_group == True)
    if instance_id:
        query = query.filter(Conversation.instance_id == instance_id)

    total = query.count()
    with_resp = query.filter(Conversation.responsible_id.isnot(None)).count()
    without_resp = total - with_resp

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    active_today = (
        db.query(func.count(Conversation.id))
        .filter(
            Conversation.is_group == True,
            Conversation.last_message_at >= today_start,
        )
    )
    if instance_id:
        active_today = active_today.filter(Conversation.instance_id == instance_id)
    active_today_val = active_today.scalar() or 0

    msg_query = (
        db.query(func.count(Message.id))
        .join(Conversation)
        .filter(
            Conversation.is_group == True,
            Message.timestamp >= today_start,
        )
    )
    if instance_id:
        msg_query = msg_query.filter(Conversation.instance_id == instance_id)
    messages_today = msg_query.scalar() or 0

    return GroupOverviewMetrics(
        total_groups=total,
        groups_with_responsible=with_resp,
        groups_without_responsible=without_resp,
        groups_active_today=active_today_val,
        messages_in_groups_today=messages_today,
    )


def get_group_conversations(
    db: Session,
    instance_id: Optional[int] = None,
    limit: int = 50,
    tag: Optional[str] = None,
) -> List[ConversationDetail]:
    query = db.query(Conversation).filter(Conversation.is_group == True)
    if instance_id:
        query = query.filter(Conversation.instance_id == instance_id)

    convs = query.order_by(Conversation.last_message_at.desc()).limit(limit * 2 if tag else limit).all()

    result = []
    for c in convs:
        if tag:
            tags_list = _parse_group_tags(c.group_tags)
            if not tags_list or tag.lower() not in [t.lower() for t in tags_list]:
                continue
        result.append(_to_conversation_detail(c))
        if tag and len(result) >= limit:
            break
    return result


def update_group_config(
    db: Session,
    group_id: int,
    responsible_id: Optional[int],
    manager_id: Optional[int],
    group_tags: Optional[List[str]] = None,
) -> bool:
    conv = db.query(Conversation).filter(
        Conversation.id == group_id,
        Conversation.is_group == True,
    ).first()
    if not conv:
        return False
    conv.responsible_id = responsible_id
    conv.manager_id = manager_id
    if group_tags is not None:
        conv.group_tags = ",".join(t.strip() for t in group_tags if t and t.strip()) or None
    db.commit()
    return True


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


def _normalize_group_id(group_id: str) -> str:
    return group_id.split("@")[0].split(":")[0]


def sync_group_names(db: Session, instance_id: int) -> dict:
    """Busca todos os grupos da Evolution API e atualiza nomes/imagens no banco."""
    import httpx
    import logging
    from datetime import datetime

    logger = logging.getLogger(__name__)
    instance = db.query(Instance).filter(Instance.id == instance_id).first()
    if not instance:
        return {"updated": 0, "error": "Instância não encontrada"}

    url = f"{instance.api_url.rstrip('/')}/group/fetchAllGroups/{instance.instance_name}?getParticipants=false"
    logger.info(f"Sync grupos: GET {url}")

    try:
        resp = httpx.get(url, headers={"apikey": instance.api_key}, timeout=60)
        logger.info(f"Sync grupos: status={resp.status_code} body={resp.text[:300]}")
        resp.raise_for_status()
        raw = resp.json()
    except httpx.ConnectError as e:
        return {"updated": 0, "error": f"Não foi possível conectar à Evolution API. Verifique a URL ({instance.api_url}) e se o servidor está online."}
    except httpx.ReadTimeout:
        return {"updated": 0, "error": "A Evolution API demorou para responder. Tente novamente."}
    except httpx.HTTPStatusError as e:
        try:
            body = e.response.json()
            msg = body.get("response", {}).get("message") or body.get("error") or e.response.text[:150]
        except Exception:
            msg = e.response.text[:150]
        if "Connection Closed" in str(msg) or "connection" in str(msg).lower():
            return {"updated": 0, "error": "A Evolution API perdeu a conexão com o WhatsApp. Reconecte a instância nas configurações da Evolution API e tente novamente."}
        return {"updated": 0, "error": f"Evolution API retornou erro {e.response.status_code}: {msg}"}
    except Exception as e:
        return {"updated": 0, "error": str(e)}

    groups_data = raw
    if isinstance(raw, dict):
        groups_data = raw.get("groups") or raw.get("data") or raw.get("group") or []
    if not isinstance(groups_data, list):
        return {"updated": 0, "error": f"Resposta inesperada: {str(raw)[:200]}"}

    now = datetime.utcnow()
    updated = 0
    created = 0
    for group in groups_data:
        group_id = group.get("id", "")
        if not group_id:
            continue
        contact_phone = _normalize_group_id(group_id)
        subject = group.get("subject") or group.get("name") or ""
        picture_url = group.get("pictureUrl") or group.get("picture") or None

        conv = (
            db.query(Conversation)
            .filter(
                Conversation.contact_phone == contact_phone,
                Conversation.instance_id == instance.id,
                Conversation.is_group == True,
            )
            .first()
        )
        if conv:
            if subject:
                conv.contact_name = subject
            if picture_url:
                conv.contact_avatar_url = picture_url
            updated += 1
        else:
            conv = Conversation(
                contact_phone=contact_phone,
                contact_name=subject or None,
                contact_avatar_url=picture_url,
                instance_id=instance.id,
                status=ConversationStatus.open,
                opened_at=now,
                last_message_at=now,
                is_group=True,
            )
            db.add(conv)
            created += 1

    db.commit()
    logger.info(f"Sync grupos: {updated} atualizado(s), {created} criado(s) de {len(groups_data)} na API")
    return {"updated": updated + created, "total_api": len(groups_data)}


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
