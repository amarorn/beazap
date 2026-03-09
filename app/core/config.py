from pydantic import Extra
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    APP_NAME: str = "BeaZap"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    DATABASE_URL: str = "postgresql://beazap:beazap@localhost:5432/beazap"

    SECRET_KEY: str = "change-this-in-production"

    EVOLUTION_API_URL: str = ""
    EVOLUTION_API_KEY: str = ""
    # Opcional: URI do Postgres da Evolution (ex: postgresql://evolution:evolution123@localhost:5434/evolution)
    # para registro automático de contatos LID no cache e retry de envio
    EVOLUTION_DATABASE_URI: str = ""

    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = "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"
    LLM_PROVIDER: str = "openai"  # "anthropic" ou "openai"

    WEBHOOK_SECRET: str = ""

    CORS_ORIGINS: str = ""  # Origens extras separadas por virgula (ex: https://app.ngrok.io)

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""

    class Config:
        env_file = ".env"
        extra = Extra.ignore


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
