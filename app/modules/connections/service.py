"""Connection service - maps Instance to Connection domain."""
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.models.instance import Instance

logger = logging.getLogger(__name__)


def get_connection(db: Session, connection_id: str, tenant_id: Optional[str] = None) -> Optional[Instance]:
    """Resolve Connection by id. connection_id = instance_id for legacy mapping."""
    try:
        pk = int(connection_id)
    except (ValueError, TypeError):
        return None
    q = db.query(Instance).filter(Instance.id == pk, Instance.active == True)
    if tenant_id:
        if hasattr(Instance, "tenant_id"):
            q = q.filter(Instance.tenant_id == tenant_id)
    return q.first()


def get_connection_by_session(db: Session, session_name: str) -> Optional[Instance]:
    """Resolve Connection by instance_name (session_name)."""
    return db.query(Instance).filter(Instance.instance_name == session_name, Instance.active == True).first()
