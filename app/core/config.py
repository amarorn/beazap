from pydantic import Extra
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    APP_NAME: str = "BeaZap"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    DATABASE_URL: str = "postgresql://beazap:beazap@localhost:5432/beazap"

    SECRET_KEY: str = "change-this-in-production"

    # open-wa Easy API (configuracao global, pode ser sobrescrita por instancia)
    OPENWA_API_URL: str = "http://localhost:8002"
    OPENWA_API_KEY: str = ""

    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    LLM_PROVIDER: str = "openai"  # "anthropic" ou "openai"

    WEBHOOK_SECRET: str = ""

    CORS_ORIGINS: str = ""  # Origens extras separadas por virgula (ex: https://app.ngrok.io)

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""

    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9092"
    WPPCONNECT_API_URL: str = "http://localhost:21465"
    WPPCONNECT_API_KEY: str = ""
    WPPCONNECT_SECRET: str = "THISISMYSECURETOKEN"
    DEFAULT_TENANT_ID: str = "1"

    class Config:
        env_file = ".env"
        extra = Extra.ignore


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
