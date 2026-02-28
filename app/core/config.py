from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    APP_NAME: str = "BeaZap"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    DATABASE_URL: str = "sqlite:///./beazap.db"

    SECRET_KEY: str = "change-this-in-production"

    EVOLUTION_API_URL: str = ""
    EVOLUTION_API_KEY: str = ""

    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    LLM_PROVIDER: str = "openai"  # "anthropic" ou "openai"

    WEBHOOK_SECRET: str = ""

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
