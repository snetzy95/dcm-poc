from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = "postgresql+asyncpg://dcm:dcmpassword@postgres:5432/dcmdb"
    orthanc_url: str = "http://orthanc:8042"
    orthanc_user: str = ""
    orthanc_pass: str = ""
    poll_interval_seconds: int = 5


settings = Settings()
