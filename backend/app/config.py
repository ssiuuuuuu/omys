from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "OMYS API"
    environment: str = "development"
    database_url: str = "sqlite:///./omys.db"
    cors_origins: str = "http://localhost:5173"
    places_provider: str = "mock"
    google_places_api_key: str = ""
    kakao_rest_api_key: str = ""
    tmap_api_key: str = ""
    admin_api_key: str = "change-me-before-production"
    navigation_admin_key: str = "1210"
    frontend_url: str = "http://localhost:5173"
    min_stay_minutes: int = 60
    search_cache_seconds: int = 180

    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
