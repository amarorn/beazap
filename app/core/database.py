from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    pool_pre_ping=not _is_sqlite,  # reconnect automaticamente no PostgreSQL
    pool_size=5 if not _is_sqlite else 1,
    max_overflow=10 if not _is_sqlite else 0,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    from app.models import instance, attendant, conversation, message, team  # noqa
    from app.models import quick_reply, conversation_note, report  # noqa
    Base.metadata.create_all(bind=engine)


def run_migrations():
    """Adiciona colunas novas sem apagar dados existentes.

    Usa ADD COLUMN IF NOT EXISTS (PostgreSQL >= 9.6 e SQLite >= 3.35).
    Para bancos mais antigos, o try/except garante compatibilidade.
    """
    # Sintaxe IF NOT EXISTS funciona no PostgreSQL e SQLite moderno
    if_not_exists = "IF NOT EXISTS" if not _is_sqlite else "IF NOT EXISTS"

    migrations = [
        f"ALTER TABLE conversations ADD COLUMN {if_not_exists} is_group BOOLEAN DEFAULT FALSE",
        f"ALTER TABLE messages ADD COLUMN {if_not_exists} sender_phone VARCHAR(30)",
        f"ALTER TABLE messages ADD COLUMN {if_not_exists} sender_name VARCHAR(150)",
        f"ALTER TABLE conversations ADD COLUMN {if_not_exists} analysis_category VARCHAR(30)",
        f"ALTER TABLE conversations ADD COLUMN {if_not_exists} analysis_sentiment VARCHAR(20)",
        f"ALTER TABLE conversations ADD COLUMN {if_not_exists} analysis_satisfaction INTEGER",
        f"ALTER TABLE conversations ADD COLUMN {if_not_exists} analysis_summary TEXT",
        f"ALTER TABLE conversations ADD COLUMN {if_not_exists} analysis_analyzed_at TIMESTAMP",
        f"ALTER TABLE conversations ADD COLUMN {if_not_exists} responsible_id INTEGER REFERENCES attendants(id)",
        f"ALTER TABLE conversations ADD COLUMN {if_not_exists} manager_id INTEGER REFERENCES attendants(id)",
        f"ALTER TABLE conversations ADD COLUMN {if_not_exists} contact_avatar_url VARCHAR(500)",
        f"ALTER TABLE conversations ADD COLUMN {if_not_exists} group_tags VARCHAR(200)",
        f"ALTER TABLE messages ADD COLUMN {if_not_exists} call_outcome VARCHAR(50)",
        f"ALTER TABLE messages ADD COLUMN {if_not_exists} call_duration_secs INTEGER",
        f"ALTER TABLE messages ADD COLUMN {if_not_exists} is_video_call BOOLEAN",
        f"ALTER TABLE conversations ADD COLUMN {if_not_exists} team_id INTEGER REFERENCES teams(id)",
        f"ALTER TABLE attendants ADD COLUMN {if_not_exists} team_id INTEGER REFERENCES teams(id)",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                conn.rollback()  # necessário no PostgreSQL após erro em transação
