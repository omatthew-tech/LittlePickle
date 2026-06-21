from functools import lru_cache

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings for the match-flow API."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    api_title: str = "LittlePickle Match Flow API"
    algorithm_version: str = "candidate-optimizer-v1"
    supabase_url: AnyHttpUrl | None = Field(default=None, alias="SUPABASE_URL")
    supabase_anon_key: str | None = Field(default=None, alias="SUPABASE_ANON_KEY")
    supabase_service_role_key: str | None = Field(
        default=None,
        alias="SUPABASE_SERVICE_ROLE_KEY",
    )
    cors_allowed_origins: str = Field(default="*", alias="CORS_ALLOWED_ORIGINS")
    smtp_host: str | None = Field(default=None, alias="SMTP_HOST")
    smtp_port: int = Field(default=587, alias="SMTP_PORT")
    smtp_username: str | None = Field(default=None, alias="SMTP_USERNAME")
    smtp_password: str | None = Field(default=None, alias="SMTP_PASSWORD")
    smtp_sender: str | None = Field(default=None, alias="SMTP_SENDER")
    smtp_use_tls: bool = Field(default=True, alias="SMTP_USE_TLS")

    @property
    def supabase_configured(self) -> bool:
        return bool(
            self.supabase_url
            and self.supabase_anon_key
            and self.supabase_service_role_key
        )

    @property
    def allowed_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_allowed_origins.split(",")
            if origin.strip()
        ]

    @property
    def allow_credentials(self) -> bool:
        return "*" not in self.allowed_origins

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_sender)


@lru_cache
def get_settings() -> Settings:
    return Settings()
