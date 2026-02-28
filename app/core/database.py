from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {},
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
    from app.models import instance, attendant, conversation, message  # noqa
    Base.metadata.create_all(bind=engine)


def run_migrations():
    """Adiciona colunas novas sem apagar dados existentes."""
    migrations = [
        "ALTER TABLE conversations ADD COLUMN is_group BOOLEAN DEFAULT FALSE",
        "ALTER TABLE messages ADD COLUMN sender_phone VARCHAR(30)",
        "ALTER TABLE messages ADD COLUMN sender_name VARCHAR(150)",
        "ALTER TABLE conversations ADD COLUMN analysis_category VARCHAR(30)",
        "ALTER TABLE conversations ADD COLUMN analysis_sentiment VARCHAR(20)",
        "ALTER TABLE conversations ADD COLUMN analysis_satisfaction INTEGER",
        "ALTER TABLE conversations ADD COLUMN analysis_summary TEXT",
        "ALTER TABLE conversations ADD COLUMN analysis_analyzed_at DATETIME",
        "ALTER TABLE conversations ADD COLUMN responsible_id INTEGER REFERENCES attendants(id)",
        "ALTER TABLE conversations ADD COLUMN manager_id INTEGER REFERENCES attendants(id)",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass  # coluna já existe
