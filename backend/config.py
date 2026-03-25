import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://legaldb_user:PbSV8bfxQdta4ljBsDVtZEe74yjMG6l7uW3dSczT8Iaajm9MKX07wHqyf0xBTTMF@10.0.1.11:5432/taxconsult"
)
DBVNTAX_DATABASE_URL = os.getenv(
    "DBVNTAX_DATABASE_URL",
    "postgresql+asyncpg://legaldb_user:PbSV8bfxQdta4ljBsDVtZEe74yjMG6l7uW3dSczT8Iaajm9MKX07wHqyf0xBTTMF@10.0.1.11:5432/postgres"
)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDIBLE_BASE_URL = os.getenv("CLAUDIBLE_BASE_URL", "https://claudible.io/v1")
CLAUDIBLE_API_KEY = os.getenv("CLAUDIBLE_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY", "")

SECRET_KEY = os.getenv("SECRET_KEY", "changeme-32-char-secret-key-here!")
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "168"))
APP_PASSWORD = os.getenv("APP_PASSWORD", "admin123")
APP_PORT = int(os.getenv("APP_PORT", "8000"))

ALGORITHM = "HS256"

# Model tier mapping
MODEL_MAP = {
    "haiku": "claude-haiku-4-5-20251001",
    "fast":  "claude-sonnet-4-6",
    "strong": "claude-opus-4-6",
}

DEFAULT_SECTIONS = [
    {"id": "s1", "title": "Tổng quan về ngành / công ty", "enabled": True, "tax_aware": False,
     "sub": ["Quy mô thị trường", "Đặc điểm kinh doanh", "Mô hình doanh thu/chi phí"]},
    {"id": "s2", "title": "Đặc thù kinh doanh & tài sản", "enabled": True, "tax_aware": False,
     "sub": ["Chuỗi cung ứng", "Working capital cycle", "Đặc điểm tài sản cố định"]},
    {"id": "s3", "title": "Khung pháp lý & các văn bản thuế áp dụng", "enabled": True, "tax_aware": True,
     "sub": ["Luật, Nghị định, Thông tư hiện hành", "Ngày hiệu lực", "Văn bản thay thế/sửa đổi"]},
    {"id": "s4", "title": "Phân tích các sắc thuế áp dụng", "enabled": True, "tax_aware": True,
     "sub": ["Thuế TNDN", "Thuế GTGT", "Thuế Nhà thầu", "Thuế TTĐB (nếu có)", "Thuế XNK (nếu có)"]},
    {"id": "s5", "title": "Các vấn đề thuế đặc thù của ngành", "enabled": True, "tax_aware": True,
     "sub": ["Rủi ro doanh thu/chi phí", "Chuyển giá", "Ưu đãi thuế",
             "Hóa đơn đặc thù", "Tranh chấp thuế & án lệ",
             "Công văn/hướng dẫn đặc thù Tổng cục Thuế"]},
    {"id": "s6", "title": "Thay đổi chính sách thuế gần đây & tác động", "enabled": True, "tax_aware": True,
     "sub": ["Văn bản mới (2024-2026)", "So sánh trước/sau thay đổi", "Tác động thực tế"]},
    {"id": "s7", "title": "Thuế quốc tế & chuyển giá", "enabled": False, "tax_aware": False,
     "sub": ["BEPS/Pillar 2", "Chuyển giá quốc tế", "So sánh khu vực", "Hiệp định thuế"]},
]
