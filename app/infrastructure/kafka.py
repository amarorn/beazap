"""Kafka/Redpanda producer and consumer wrapper."""
import json
import logging
from typing import Any, AsyncIterator, Callable, Optional

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from aiokafka.errors import KafkaError

logger = logging.getLogger(__name__)

KAFKA_BOOTSTRAP = "localhost:9092"


async def get_producer(bootstrap_servers: str = KAFKA_BOOTSTRAP) -> AIOKafkaProducer:
    return AIOKafkaProducer(
        bootstrap_servers=bootstrap_servers,
        value_serializer=lambda v: json.dumps(v, default=str).encode("utf-8"),
    )


async def produce(
    producer: AIOKafkaProducer,
    topic: str,
    value: dict[str, Any],
    key: Optional[bytes] = None,
    partition: Optional[int] = None,
) -> None:
    try:
        await producer.send(topic, value=value, key=key, partition=partition)
    except KafkaError as e:
        logger.exception("Kafka produce failed topic=%s: %s", topic, e)
        raise


async def consume(
    topics: list[str],
    group_id: str,
    bootstrap_servers: str = KAFKA_BOOTSTRAP,
) -> AsyncIterator[tuple[str, int, int, dict[str, Any]]]:
    consumer = AIOKafkaConsumer(
        *topics,
        bootstrap_servers=bootstrap_servers,
        group_id=group_id,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")) if v else {},
        auto_offset_reset="earliest",
    )
    await consumer.start()
    try:
        async for msg in consumer:
            yield msg.topic, msg.partition, msg.offset, msg.value or {}
    finally:
        await consumer.stop()
