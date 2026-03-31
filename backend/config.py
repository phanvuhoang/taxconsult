import os
from dotenv import load_dotenv
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://legaldb_user:PbSV8bfxQdta4ljBsDVtZEe74yjMG6l7uW3dSczT8Iaajm9MKX07wHqyf0xBTTMF@10.0.1.11:5432/taxconsult")
DBVNTAX_DATABASE_URL = os.getenv("DBVNTAX_DATABASE_URL", "postgresql+asyncpg://legaldb_user:PbSV8bfxQdta4ljBsDVtZEe74yjMG6l7uW3dSczT8Iaajm9MKX07wHqyf0xBTTMF@10.0.1.11:5432/postgres")

# Claudible — OpenAI-completions format (POST /v1/chat/completions, Bearer token)
# ⚠️ base URL KHÔNG có /v1 ở cuối — code sẽ append /v1/chat/completions
_raw_claudible_base = os.getenv("ANTHROPIC_BASE_URL", "https://claudible.io")
CLAUDIBLE_BASE_URL = _raw_claudible_base.rstrip("/").removesuffix("/v1")
CLAUDIBLE_API_KEY  = os.getenv("ANTHROPIC_AUTH_TOKEN", "")  # Bearer token

# DeepSeek — OpenAI-compatible, endpoint: https://api.deepseek.com
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")

# Anthropic direct (paid, fallback)
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# OpenAI (last resort)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# Perplexity
PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY", "")

SECRET_KEY = os.getenv("SECRET_KEY", "changeme-32-char-secret-key-here!")
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "168"))
APP_PASSWORD = os.getenv("APP_PASSWORD", "admin123")
APP_PORT = int(os.getenv("APP_PORT", "8000"))
ALGORITHM = "HS256"

# Model tier → model name mapping
# Claudible models: claude-haiku-4.5, claude-sonnet-4.6 (dấu chấm, KHÔNG dùng gạch ngang)
MODEL_MAP = {
    "haiku":    "claude-haiku-4.5",     # Claudible Haiku — fast, free
    "fast":     "claude-sonnet-4.6",    # Claudible Sonnet — balanced, free
    "strong":   "claude-sonnet-4.6",    # fallback to Sonnet (Opus not available on Claudible)
    "deepseek": "deepseek-reasoner",    # DeepSeek V3.2 thinking mode
}
DEFAULT_MODEL_TIER = "deepseek"  # Default: DeepSeek Reasoner

DEFAULT_SECTIONS = [
    {"id": "s1", "title": "Tổng quan về ngành/doanh nghiệp", "enabled": True, "tax_aware": False,
     "sub": ["Quy mô thị trường", "Đặc điểm kinh doanh", "Mô hình doanh thu/chi phí"]},
    {"id": "s2", "title": "Đặc thù kinh doanh", "enabled": True, "tax_aware": False,
     "sub": ["Chuỗi cung ứng", "Working capital cycle", "Đặc điểm tài sản"]},
    {"id": "s3", "title": "Các quy định pháp lý", "enabled": True, "tax_aware": True,
     "sub": ["Luật chuyên ngành", "Điều kiện kinh doanh", "Hạn chế FDI"]},
    {"id": "s4", "title": "Phân tích các loại thuế áp dụng", "enabled": True, "tax_aware": True,
     "sub": ["Thuế TNDN", "Thuế GTGT", "Thuế Nhà thầu", "Thuế TTĐB", "Thuế XNK"]},
    {"id": "s5", "title": "Các vấn đề thuế đặc thù", "enabled": True, "tax_aware": True,
     "sub": ["Rủi ro doanh thu/chi phí", "Chuyển giá", "Ưu đãi thuế",
             "Hóa đơn đặc thù", "Tranh chấp thuế", "Công văn hướng dẫn đặc thù"]},
    {"id": "s6", "title": "Thông lệ thuế quốc tế", "enabled": True, "tax_aware": True,
     "sub": ["BEPS", "Chuyển giá quốc tế", "So sánh khu vực", "Hiệp định thuế"]},
    {"id": "s7", "title": "Khuyến nghị & Kết luận", "enabled": True, "tax_aware": True,
     "sub": ["Tối ưu hóa thuế", "Tuân thủ", "Cơ hội ưu đãi", "Rủi ro cần theo dõi"]},
]
