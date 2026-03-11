"""Worker: consume message.outbound.requested, call provider.send_text, update status, publish sent/failed."""
import asyncio
import logging
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.infrastructure.kafka import consume
from app.infrastructure.logging import setup_logging
from app.modules.events.bus import (
    TOPIC_OUTBOUND_REQUESTED,
    publish_outbound_sent,
    publish_outbound_failed,
)
from app.modules.providers.wppconnect import WppConnectProvider
from app.models.instance import Instance
from app.models.message import Message

setup_logging(service="sender-worker")

logger = logging.getLogger(__name__)

engine = create_engine(settings.DATABASE_URL)
Session = sessionmaker(bind=engine)


async def run():
    bootstrap = getattr(settings, "KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
    async for topic, partition, offset, value in consume(
        [TOPIC_OUTBOUND_REQUESTED],
        group_id="sender-worker",
        bootstrap_servers=bootstrap,
    ):
        try:
            msg_id = value.get("message_id")
            tenant_id = value.get("tenant_id", "1")
            connection_id = value.get("connection_id", "")
            phone = value.get("phone_number", "")
            text = value.get("text", "")
            if not msg_id or not connection_id or not phone:
                logger.warning("Invalid outbound.requested payload: %s", value)
                continue
            db = Session()
            try:
                msg = db.query(Message).filter(Message.id == msg_id).first()
                if not msg:
                    logger.warning("Message not found message_id=%s", msg_id)
                    continue
                if getattr(msg, "message_status", None) == "sent":
                    logger.info("Message already sent (idempotent) message_id=%s", msg_id)
                    continue
                inst = db.query(Instance).filter(Instance.id == int(connection_id)).first()
                if not inst:
                    await publish_outbound_failed({
                        "message_id": msg_id,
                        "tenant_id": tenant_id,
                        "connection_id": connection_id,
                        "error": "Connection not found",
                        "failed_at": datetime.utcnow().isoformat() + "Z",
                    })
                    continue
                provider = WppConnectProvider(
                    base_url=inst.api_url or settings.WPPCONNECT_API_URL,
                    api_key=inst.api_key or settings.WPPCONNECT_API_KEY,
                )
                result = await provider.send_text(
                    connection_id=inst.instance_name,
                    phone=phone,
                    text=text,
                )
                if result["success"]:
                    msg.message_status = "sent"
                    if result.get("provider_message_id"):
                        msg.evolution_id = result["provider_message_id"]
                    db.commit()
                    await publish_outbound_sent({
                        "message_id": msg_id,
                        "tenant_id": tenant_id,
                        "connection_id": connection_id,
                        "provider_message_id": result.get("provider_message_id"),
                        "sent_at": datetime.utcnow().isoformat() + "Z",
                    })
                    logger.info("Sent message message_id=%s connection_id=%s", msg_id, connection_id)
                else:
                    msg.message_status = "failed"
                    db.commit()
                    await publish_outbound_failed({
                        "message_id": msg_id,
                        "tenant_id": tenant_id,
                        "connection_id": connection_id,
                        "error": result.get("error", "Unknown error"),
                        "failed_at": datetime.utcnow().isoformat() + "Z",
                    })
                    logger.warning("Send failed message_id=%s error=%s", msg_id, result.get("error"))
            finally:
                db.close()
        except Exception as e:
            logger.exception("sender_worker error: %s", e)


if __name__ == "__main__":
    asyncio.run(run())
