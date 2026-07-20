from functools import lru_cache

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings for the match-flow API."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    api_title: str = "LittlePickle Match Flow API"
    algorithm_version: str = "coordinated-fairness-v2"
    supabase_url: AnyHttpUrl | None = Field(default=None, alias="SUPABASE_URL")
    supabase_anon_key: str | None = Field(default=None, alias="SUPABASE_ANON_KEY")
    supabase_service_role_key: str | None = Field(
        default=None,
        alias="SUPABASE_SERVICE_ROLE_KEY",
    )
    cors_allowed_origins: str = Field(default="*", alias="CORS_ALLOWED_ORIGINS")
    email_from: str = Field(default="support@joinlittlepickle.com", alias="EMAIL_FROM")
    email_sender_name: str = Field(default="LittlePickle", alias="EMAIL_SENDER_NAME")
    smtp2go_api_key: str | None = Field(default=None, alias="SMTP2GO_API_KEY")
    smtp2go_api_url: str = Field(
        default="https://api.smtp2go.com/v3/email/send",
        alias="SMTP2GO_API_URL",
    )
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
        return bool(self.smtp_host and self.sender_email)

    @property
    def smtp2go_configured(self) -> bool:
        return bool(self.smtp2go_api_key and self.sender_email)

    @property
    def email_configured(self) -> bool:
        return self.smtp2go_configured or self.smtp_configured

    @property
    def sender_email(self) -> str:
        return (self.smtp_sender or self.email_from).strip()


@lru_cache
def get_settings() -> Settings:
    return Settings()
