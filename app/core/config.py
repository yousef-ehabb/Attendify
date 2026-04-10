from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from .env file."""

    SECRET_KEY: str
    DATABASE_URL: str = "sqlite:///./data/attendance.db"
    FACE_TOLERANCE: float = 0.5
    QR_TTL_SECONDS: int = 30
    ALLOWED_ORIGINS: str = "http://localhost:5173"

    @field_validator("SECRET_KEY")
    @classmethod
    def check_secret_key(cls, v: str) -> str:
        if v == "change-me-to-a-random-secret-key" or len(v) < 32:
            raise ValueError("SECRET_KEY must be properly set and be at least 32 characters long.")
        return v

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )


settings = Settings()
