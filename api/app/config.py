"""Runtime settings, read once from environment variables."""
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    anthropic_api_key: str = os.environ.get("ANTHROPIC_API_KEY", "")
    anthropic_base_url: str | None = os.environ.get("ANTHROPIC_BASE_URL") or None
    model: str = os.environ.get("CLAUDE_MODEL", "claude-haiku-5-5")
    database_url: str = os.environ.get("DATABASE_URL", "postgresql://rag:rag@db:5432/rag")
    admin_token: str = os.environ.get("ADMIN_TOKEN", "")
    lead_webhook_url: str = os.environ.get("LEAD_WEBHOOK_URL", "")
    business_name: str = os.environ.get("BUSINESS_NAME", "Lumina Dental Studio")
    embed_model: str = os.environ.get("EMBED_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
    embed_dim: int = int(os.environ.get("EMBED_DIM", "384"))
    knowledge_dir: str = os.environ.get("KNOWLEDGE_DIR", "/app/knowledge")
    top_k: int = int(os.environ.get("TOP_K", "5"))
    max_upload_mb: int = int(os.environ.get("MAX_UPLOAD_MB", "10"))


settings = Settings()
