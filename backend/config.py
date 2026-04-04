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

# OpenRouter
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL   = os.getenv("OPENROUTER_MODEL", "qwen/qwen3.6-plus:free")
OPENROUTER_MODEL2  = os.getenv("OPENROUTER_MODEL2", "")   # Optional second OpenRouter model

# Model tier → model name mapping
# Claudible models: claude-haiku-4.5, claude-sonnet-4.6 (dấu chấm, KHÔNG dùng gạch ngang)
MODEL_MAP = {
    "haiku":    "claude-haiku-4.5",              # Claudible Haiku — fast, free
    "fast":     "claude-sonnet-4.6",             # Claudible Sonnet — balanced, free
    "strong":   "claude-sonnet-4.6",             # fallback to Sonnet (Opus not available on Claudible)
    "deepseek": "deepseek-reasoner",             # DeepSeek V3.2 thinking mode
    "qwen":     OPENROUTER_MODEL,                # OpenRouter model 1 — env OPENROUTER_MODEL
    "qwen2":    OPENROUTER_MODEL2 or OPENROUTER_MODEL,  # OpenRouter model 2 — env OPENROUTER_MODEL2
}
DEFAULT_MODEL_TIER = "deepseek"  # Default: DeepSeek Reasoner

SECTOR_SECTIONS = [
    {"id": "s1", "title": "Tổng quan về ngành/doanh nghiệp", "enabled": True, "tax_aware": False,
     "sub": ["Quy mô thị trường", "Đặc điểm kinh doanh", "Mô hình doanh thu/chi phí"]},
    {"id": "s2", "title": "Đặc thù kinh doanh", "enabled": True, "tax_aware": False,
     "sub": ["Chuỗi cung ứng", "Working capital cycle", "Đặc điểm tài sản"]},
    {"id": "s3", "title": "Các quy định pháp lý", "enabled": True, "tax_aware": False,
     "sub": ["Luật chuyên ngành", "Điều kiện kinh doanh", "Hạn chế FDI"]},
    {"id": "s4", "title": "Phân tích các loại thuế áp dụng", "enabled": True, "tax_aware": True,
     "sub": ["Thuế TNDN", "Thuế GTGT", "Thuế Nhà thầu", "Thuế TTĐB", "Thuế XNK"]},
    {"id": "s5", "title": "Các vấn đề thuế đặc thù", "enabled": True, "tax_aware": True,
     "sub": ["Rủi ro doanh thu/chi phí", "Chuyển giá", "Ưu đãi thuế",
             "Hóa đơn đặc thù", "Tranh chấp thuế", "Công văn hướng dẫn đặc thù"]},
    {"id": "s6", "title": "Thông lệ thuế quốc tế", "enabled": True, "tax_aware": False,
     "sub": ["BEPS", "Chuyển giá quốc tế", "So sánh khu vực", "Hiệp định thuế"]},
    {"id": "s7", "title": "Khuyến nghị & Kết luận", "enabled": True, "tax_aware": False,
     "sub": ["Tối ưu hóa thuế", "Tuân thủ", "Cơ hội ưu đãi", "Rủi ro cần theo dõi"]},
]

COMPANY_SECTIONS = [
    {"id": "c1", "title": "Giới thiệu công ty", "enabled": True, "tax_aware": False,
     "sub": ["Lịch sử hình thành", "Cơ cấu sở hữu & cổ đông", "Ngành nghề kinh doanh chính",
             "Quy mô: doanh thu, nhân sự, tài sản"]},
    {"id": "c2", "title": "Mô hình kinh doanh & chuỗi giá trị", "enabled": True, "tax_aware": False,
     "sub": ["Sản phẩm/dịch vụ chính", "Khách hàng mục tiêu", "Nhà cung cấp & đối tác",
             "Chuỗi giá trị nội bộ"]},
    {"id": "c3", "title": "Cấu trúc pháp lý & giao dịch liên kết", "enabled": True, "tax_aware": False,
     "sub": ["Sơ đồ tổ chức pháp nhân", "Các bên liên kết (Điều 5 NĐ 132/2020)",
             "Giao dịch liên kết phát sinh", "Nghĩa vụ kê khai Form 01"]},
    {"id": "c4", "title": "Phân tích tài chính & gánh nặng thuế", "enabled": True, "tax_aware": True,
     "sub": ["Doanh thu & lợi nhuận 3-5 năm", "Tỷ lệ thuế TNDN hiệu quả (ETR)",
             "So sánh ETR với trung bình ngành", "Các khoản không được khấu trừ lớn"]},
    {"id": "c5", "title": "Rủi ro thuế đặc thù", "enabled": True, "tax_aware": True,
     "sub": ["Rủi ro thanh tra thuế (lịch sử)", "Chuyển giá & arm's length",
             "Ưu đãi thuế đang áp dụng", "Hóa đơn đặc thù",
             "Tranh chấp thuế & án lệ liên quan",
             "Công văn/ruling đặc thù áp dụng cho công ty"]},
    {"id": "c6", "title": "Tuân thủ & quản trị thuế", "enabled": True, "tax_aware": False,
     "sub": ["Quy trình kê khai nội bộ", "Kiểm soát nội bộ về thuế",
             "Rủi ro xử phạt chậm nộp", "Nhân sự & năng lực thuế"]},
    {"id": "c7", "title": "Khuyến nghị chiến lược thuế", "enabled": True, "tax_aware": False,
     "sub": ["Tối ưu hóa cấu trúc thuế", "Cơ hội ưu đãi chưa tận dụng",
             "Rủi ro cần theo dõi ngay", "Lộ trình cải thiện tuân thủ"]},
]

# Backward compat alias
DEFAULT_SECTIONS = SECTOR_SECTIONS
