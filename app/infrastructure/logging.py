"""Structured JSON logging for event-driven services."""
import json
import logging
import sys
from datetime import datetime
from typing import Any, Optional


def _serialize(obj: Any) -> Any:
    if isinstance(obj, datetime):
        return obj.isoformat()
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if hasattr(obj, "__dict__"):
        return str(obj)
    return obj


class StructuredFormatter(logging.Formatter):
    """JSON log formatter with service, tenant_id, connection_id, event_type."""

    def __init__(self, service: str = "beazap"):
        super().__init__()
        self.service = service

    def format(self, record: logging.LogRecord) -> str:
        data: dict[str, Any] = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "service": self.service,
            "message": record.getMessage(),
        }
        if hasattr(record, "tenant_id") and record.tenant_id is not None:
            data["tenant_id"] = record.tenant_id
        if hasattr(record, "connection_id") and record.connection_id is not None:
            data["connection_id"] = record.connection_id
        if hasattr(record, "event_type") and record.event_type:
            data["event_type"] = record.event_type
        if hasattr(record, "message_id") and record.message_id is not None:
            data["message_id"] = record.message_id
        if hasattr(record, "status") and record.status is not None:
            data["status"] = record.status
        if hasattr(record, "latency_ms") and record.latency_ms is not None:
            data["latency_ms"] = record.latency_ms
        if record.exc_info:
            data["error"] = self.formatException(record.exc_info)
        extra = {k: v for k, v in record.__dict__.items() if k not in (
            "name", "msg", "args", "created", "filename", "funcName",
            "levelname", "levelno", "lineno", "module", "msecs",
            "pathname", "process", "processName", "relativeCreated",
            "stack_info", "exc_info", "exc_text", "thread", "threadName",
            "message", "taskName", "tenant_id", "connection_id", "event_type",
            "message_id", "status", "latency_ms"
        )}
        for k, v in extra.items():
            if v is not None and not k.startswith("_"):
                try:
                    data[k] = _serialize(v)
                except Exception:
                    data[k] = str(v)
        return json.dumps(data, default=str, ensure_ascii=False)


def setup_logging(service: str = "beazap", level: str = "INFO") -> None:
    """Configure root logger with structured JSON output."""
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    for h in root.handlers[:]:
        root.removeHandler(h)
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(StructuredFormatter(service=service))
    root.addHandler(h)


def get_logger(name: str, service: str = "beazap") -> logging.Logger:
    return logging.getLogger(name)


def log_event(
    logger: logging.Logger,
    level: int,
    message: str,
    *,
    tenant_id: Optional[str] = None,
    connection_id: Optional[str] = None,
    event_type: Optional[str] = None,
    message_id: Optional[str] = None,
    status: Optional[str] = None,
    latency_ms: Optional[float] = None,
    error: Optional[str] = None,
    **kwargs: Any,
) -> None:
    extra = {
        "tenant_id": tenant_id,
        "connection_id": connection_id,
        "event_type": event_type,
        "message_id": message_id,
        "status": status,
        "latency_ms": latency_ms,
        **kwargs,
    }
    if error:
        extra["error"] = error
    logger.log(level, message, extra=extra)
