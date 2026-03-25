# CLAUDE-BRIEF.md — taxconsult v1

**Date:** 2026-03-25  
**Repo:** github.com/phanvuhoang/taxconsult  
**Domain:** taxconsult.gpt4vn.com  
**Goal:** AI tax consulting platform — viết báo cáo phân tích thuế thực chiến chuẩn Big 4, cite đúng điều khoản, đúng giai đoạn thời gian.

---

## Tech Stack

- **Backend:** Python FastAPI, async (asyncpg + SQLAlchemy async)
- **Frontend:** React (Vite + Tailwind CSS) — same stack as examsgen
- **DB (taxconsult):** PostgreSQL tại `10.0.1.11:5432`, database `taxconsult`, user `legaldb_user`, password `PbSV8bfxQdta4ljBsDVtZEe74yjMG6l7uW3dSczT8Iaajm9MKX07wHqyf0xBTTMF`
- **DB (dbvntax):** PostgreSQL tại `10.0.1.11:5432`, database `postgres` (same cluster, same user) — read-only access để lookup văn bản + công văn
- **AI:** Anthropic (Haiku/Sonnet/Opus) + fallback Claudible + OpenAI
- **Research:** Perplexity API (`sonar` / `sonar-pro`)
- **Deploy:** Coolify, Dockerfile, Port 8000
- **Structure:** Multi-file (không single-file như taxsector cũ)

---

## Project Structure

```
taxconsult/
├── backend/
│   ├── __init__.py
│   ├── config.py              # env vars, constants
│   ├── database.py            # SQLAlchemy async engine, both DBs
│   ├── models.py              # ORM models (taxconsult DB)
│   ├── auth.py                # JWT auth helpers
│   ├── ai_provider.py         # AI call abstraction (Anthropic/Claudible/OpenAI)
│   ├── perplexity.py          # Perplexity search helper
│   ├── doc_context.py         # Pull + format context from dbvntax DB
│   ├── html_to_text.py        # Strip HTML from TVPL noi_dung → plain text
│   ├── report_generator.py    # Full Report generation logic (streaming SSE)
│   ├── quick_research.py      # Quick Research logic (non-streaming)
│   └── routes/
│       ├── __init__.py
│       ├── auth.py            # /api/auth/*
│       ├── reports.py         # /api/reports/*
│       ├── tax_docs.py        # /api/tax-docs/*
│       ├── research.py        # /api/research/* (quick + full)
│       └── admin.py           # /api/admin/*
├── frontend/
│   ├── index.html
│   ├── package.json           # Vite + React + Tailwind
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api.js
│       ├── index.css
│       ├── components/
│       │   └── Layout.jsx     # Sidebar + layout (collapsible, same pattern as examsgen)
│       └── pages/
│           ├── Login.jsx
│           ├── Dashboard.jsx
│           ├── QuickResearch.jsx
│           ├── FullReport.jsx
│           ├── Reports.jsx    # Saved reports list
│           ├── TaxDocs.jsx    # Tax Docs KB manager
│           └── Settings.jsx
├── main.py                    # FastAPI app entry, mount frontend
├── requirements.txt
├── Dockerfile
└── .env.example
```

---

## Database Schema — `taxconsult` DB

### Table: `users`
```sql
CREATE TABLE users (
    id          SERIAL PRIMARY KEY,
    email       VARCHAR(200) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name   VARCHAR(200),
    role        VARCHAR(20) DEFAULT 'user',  -- 'user' | 'admin'
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMP DEFAULT now()
);
```

### Table: `reports`
```sql
CREATE TABLE reports (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id),
    title       VARCHAR(500) NOT NULL,          -- e.g. "Phân tích thuế ngành BĐS"
    subject     TEXT NOT NULL,                  -- user input: topic / company / sector
    report_type VARCHAR(20) NOT NULL,           -- 'quick' | 'full'
    tax_types   TEXT[],                         -- e.g. ['TNDN', 'GTGT']
    time_period VARCHAR(100),                   -- e.g. "2025-2026" | "trước 10/2025"
    content_html TEXT,                          -- rendered HTML output
    content_json JSONB,                         -- structured sections
    citations   JSONB DEFAULT '[]',             -- list of {url, title, source}
    model_used  VARCHAR(100),
    provider_used VARCHAR(50),
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    duration_ms INTEGER,
    created_at  TIMESTAMP DEFAULT now(),
    updated_at  TIMESTAMP DEFAULT now()
);
```

### Table: `tax_docs`
```sql
CREATE TABLE tax_docs (
    id          SERIAL PRIMARY KEY,
    so_hieu     VARCHAR(200),                   -- e.g. "320/2025/NĐ-CP"
    ten         TEXT NOT NULL,                  -- full name
    loai        VARCHAR(20),                    -- Luat|ND|TT|VBHN|CV
    co_quan     VARCHAR(100),
    ngay_ban_hanh DATE,
    hieu_luc_tu DATE,
    het_hieu_luc_tu DATE,                       -- NULL = still active
    tinh_trang  VARCHAR(50) DEFAULT 'con_hieu_luc',
    replaced_by VARCHAR(200),                   -- số hiệu VB thay thế
    replaced_date DATE,                         -- ngày VB mới có hiệu lực
    tax_types   TEXT[],                         -- ['TNDN', 'GTGT', ...]
    content_text TEXT,                          -- PLAIN TEXT (stripped from HTML)
    content_html TEXT,                          -- original HTML
    source      VARCHAR(50) DEFAULT 'upload',   -- 'upload' | 'dbvntax'
    dbvntax_id  INTEGER,                        -- ref to dbvntax documents.id
    link_tvpl   TEXT,
    created_at  TIMESTAMP DEFAULT now()
);
```

### Table: `research_sessions` (Quick Research cache / history)
```sql
CREATE TABLE research_sessions (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id),
    question    TEXT NOT NULL,                  -- user question
    tax_types   TEXT[],
    time_period VARCHAR(100),
    answer_html TEXT,
    citations   JSONB DEFAULT '[]',
    model_used  VARCHAR(100),
    duration_ms INTEGER,
    created_at  TIMESTAMP DEFAULT now()
);
```

---

## Environment Variables

```env
# taxconsult DB
DATABASE_URL=postgresql+asyncpg://legaldb_user:PbSV8bfxQdta4ljBsDVtZEe74yjMG6l7uW3dSczT8Iaajm9MKX07wHqyf0xBTTMF@10.0.1.11:5432/taxconsult

# dbvntax DB (read-only, same cluster)
DBVNTAX_DATABASE_URL=postgresql+asyncpg://legaldb_user:PbSV8bfxQdta4ljBsDVtZEe74yjMG6l7uW3dSczT8Iaajm9MKX07wHqyf0xBTTMF@10.0.1.11:5432/postgres

# AI
ANTHROPIC_API_KEY=
CLAUDIBLE_BASE_URL=https://claudible.io/v1
CLAUDIBLE_API_KEY=
OPENAI_API_KEY=

# Research
PERPLEXITY_API_KEY=

# Auth
SECRET_KEY=                   # random 32-char string for JWT signing
ACCESS_TOKEN_EXPIRE_HOURS=168 # 7 days

# App
APP_PASSWORD=                 # initial admin password
APP_PORT=8000
```

---

## Core Feature: `doc_context.py` — Pull Context from dbvntax

This is the most critical module. It queries the dbvntax `postgres` DB to pull relevant documents and cong_van, strips HTML, and formats them for AI injection.

```python
"""
doc_context.py — Pull and format tax document context from dbvntax DB
for injection into AI prompts.
"""
from bs4 import BeautifulSoup
import re

SAC_THUE_MAP = {
    "TNDN": ["TNDN"],
    "GTGT": ["GTGT"],
    "TNCN": ["TNCN"],
    "TTDB": ["TTDB"],
    "FCT": ["FCT", "NHA_THAU"],
    "TP": ["CHUYEN_GIA"],
    "HKD": ["HKD"],
    "QLT": ["QLT"],
    "XNK": ["XNK"],
}

MAX_DOC_CHARS = 15000    # max chars per document injected
MAX_CV_CHARS  = 6000     # max chars per cong_van injected
MAX_DOCS      = 5        # max văn bản per query
MAX_CVS       = 8        # max công văn per query

def strip_html_tvpl(html: str) -> str:
    """Strip TVPL HTML → clean plain text for AI injection."""
    if not html:
        return ""
    soup = BeautifulSoup(html, "html.parser")
    # Remove noise elements
    for tag in soup.find_all(["script", "style", "ins", "iframe", "noscript"]):
        tag.decompose()
    for tag in soup.find_all(id=["hdsdcondau", "NoiDungChiaSe", "GgADS"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)
    # Collapse multiple blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def format_doc_for_context(doc: dict, include_content: bool = True) -> str:
    """Format a document record as context block for AI prompt."""
    lines = [
        f"=== VĂN BẢN: {doc.get('so_hieu', 'N/A')} ===",
        f"Tên: {doc.get('ten', '')}",
        f"Loại: {doc.get('loai', '')} | Cơ quan: {doc.get('co_quan', '')}",
        f"Ban hành: {doc.get('ngay_ban_hanh', '')} | Hiệu lực từ: {doc.get('hieu_luc_tu', '')}",
    ]
    if doc.get("het_hieu_luc_tu"):
        lines.append(f"⚠️ HẾT HIỆU LỰC từ: {doc['het_hieu_luc_tu']}")
    elif doc.get("tinh_trang") == "con_hieu_luc":
        lines.append("✅ Trạng thái: Còn hiệu lực")
    
    # Add amendment/replacement chain from hieu_luc_index JSONB
    hli = doc.get("hieu_luc_index") or {}
    if isinstance(hli, str):
        import json
        try: hli = json.loads(hli)
        except: hli = {}
    
    replaced_by = hli.get("van_ban_thay_the", [])
    amended_by  = hli.get("van_ban_sua_doi", [])
    if replaced_by:
        lines.append(f"🔄 Thay thế bởi: {', '.join(replaced_by)}")
    if amended_by:
        lines.append(f"✏️ Sửa đổi bởi: {', '.join(amended_by)}")
    if hli.get("tom_tat_hieu_luc"):
        lines.append(f"📋 Tóm tắt hiệu lực: {hli['tom_tat_hieu_luc']}")
    
    if include_content and doc.get("noi_dung"):
        content = strip_html_tvpl(doc["noi_dung"])
        if len(content) > MAX_DOC_CHARS:
            content = content[:MAX_DOC_CHARS] + "\n...[nội dung tiếp theo, đã cắt bớt]"
        lines.append(f"\nNỘI DUNG:\n{content}")
    
    lines.append("=" * 50)
    return "\n".join(lines)

def format_cv_for_context(cv: dict) -> str:
    """Format a cong_van record as context block."""
    lines = [
        f"=== CÔNG VĂN: {cv.get('so_hieu', 'N/A')} ===",
        f"Tiêu đề: {cv.get('ten', '')}",
        f"Cơ quan: {cv.get('co_quan', '')} | Ngày: {cv.get('ngay_ban_hanh', '')}",
    ]
    if cv.get("noi_dung_day_du"):
        content = strip_html_tvpl(cv["noi_dung_day_du"])
        if len(content) > MAX_CV_CHARS:
            content = content[:MAX_CV_CHARS] + "\n...[cắt bớt]"
        lines.append(f"\nNỘI DUNG:\n{content}")
    lines.append("=" * 50)
    return "\n".join(lines)

async def get_relevant_docs(
    dbvntax_db,           # AsyncSession connected to dbvntax postgres DB
    tax_types: list,      # e.g. ['TNDN', 'GTGT']
    keywords: list = None, # additional keyword filter
    time_period_end: str = None,  # ISO date — only include docs effective ON or BEFORE this date
    include_expired: bool = False  # include het_hieu_luc docs for historical research
) -> str:
    """
    Query dbvntax for relevant documents and format as context string.
    
    Args:
        tax_types: list of sac_thue codes to filter by
        keywords: optional text search terms
        time_period_end: if set, only include docs where hieu_luc_tu <= this date
        include_expired: if True, include expired docs (for historical period research)
    
    Returns:
        Formatted context string ready for AI prompt injection.
    """
    from sqlalchemy import text
    
    # Build sac_thue filter using PostgreSQL array overlap operator &&
    sac_thue_values = []
    for tt in tax_types:
        sac_thue_values.extend(SAC_THUE_MAP.get(tt, [tt]))
    
    conditions = ["d.sac_thue && ARRAY[:sac_thue]::varchar[]"]
    params = {"sac_thue": sac_thue_values, "limit": MAX_DOCS}
    
    if not include_expired:
        conditions.append("(d.het_hieu_luc_tu IS NULL OR d.het_hieu_luc_tu > now())")
    
    if time_period_end:
        conditions.append("(d.hieu_luc_tu IS NULL OR d.hieu_luc_tu <= :period_end)")
        params["period_end"] = time_period_end
    
    if keywords:
        # Full-text search using existing idx_doc_fts index
        kw_query = " & ".join(keywords)
        conditions.append("to_tsvector('simple', COALESCE(d.ten,'') || ' ' || COALESCE(d.noi_dung,'')) @@ plainto_tsquery('simple', :keywords)")
        params["keywords"] = " ".join(keywords)
    
    where_clause = " AND ".join(conditions)
    
    sql = f"""
        SELECT d.id, d.so_hieu, d.ten, d.loai, d.co_quan,
               d.ngay_ban_hanh::text, d.hieu_luc_tu::text, d.het_hieu_luc_tu::text,
               d.tinh_trang, d.noi_dung, d.hieu_luc_index, d.link_tvpl
        FROM documents d
        WHERE {where_clause}
        ORDER BY d.importance ASC, d.ngay_ban_hanh DESC
        LIMIT :limit
    """
    
    result = await dbvntax_db.execute(text(sql), params)
    rows = result.mappings().all()
    
    if not rows:
        return ""
    
    parts = ["## VĂN BẢN PHÁP LUẬT LIÊN QUAN (nguồn: dbvntax)\n"]
    for row in rows:
        parts.append(format_doc_for_context(dict(row)))
    
    return "\n".join(parts)

async def get_relevant_congvan(
    dbvntax_db,
    tax_types: list,
    keywords: list = None,
    limit: int = MAX_CVS
) -> str:
    """Query dbvntax for relevant công văn and format as context string."""
    from sqlalchemy import text
    
    sac_thue_values = []
    for tt in tax_types:
        sac_thue_values.extend(SAC_THUE_MAP.get(tt, [tt]))
    
    conditions = ["cv.sac_thue && ARRAY[:sac_thue]::varchar[]"]
    params = {"sac_thue": sac_thue_values, "limit": limit}
    
    if keywords:
        conditions.append("to_tsvector('simple', COALESCE(cv.ten,'') || ' ' || COALESCE(cv.noi_dung_day_du,'')) @@ plainto_tsquery('simple', :keywords)")
        params["keywords"] = " ".join(keywords)
    
    where_clause = " AND ".join(conditions)
    
    sql = f"""
        SELECT cv.id, cv.so_hieu, cv.ten, cv.co_quan,
               cv.ngay_ban_hanh::text, cv.noi_dung_day_du, cv.link_nguon
        FROM cong_van cv
        WHERE {where_clause}
        ORDER BY cv.ngay_ban_hanh DESC NULLS LAST
        LIMIT :limit
    """
    
    result = await dbvntax_db.execute(text(sql), params)
    rows = result.mappings().all()
    
    if not rows:
        return ""
    
    parts = ["## CÔNG VĂN HƯỚNG DẪN LIÊN QUAN (nguồn: dbvntax)\n"]
    for row in rows:
        parts.append(format_cv_for_context(dict(row)))
    
    return "\n".join(parts)
```

---

## Core Feature: Quick Research

**Endpoint:** `POST /api/research/quick`  
**Model:** Haiku (default) or Sonnet  
**Time:** ~20-45 seconds  
**Use case:** Câu hỏi thuế cụ thể, cần trả lời nhanh có dẫn chứng văn bản

### Request body:
```json
{
  "question": "Chi phí trang phục tiền mặt cho nhân viên được trừ tối đa bao nhiêu?",
  "tax_types": ["TNDN"],
  "time_period": "2025",         // optional: "2025" | "trước 10/2025" | "2020-2024"
  "model_tier": "haiku"          // "haiku" | "fast" (sonnet) | "strong" (opus)
}
```

### Logic:
1. Parse `time_period` → determine `period_end_date` (ISO date)
2. Call `get_relevant_docs(tax_types, keywords_from_question, period_end_date)` → doc context
3. Call `get_relevant_congvan(tax_types, keywords_from_question)` → cv context
4. Build prompt → call AI → return structured answer

### Prompt template (Quick Research):
```
Bạn là chuyên gia thuế Big 4 Việt Nam (30 năm kinh nghiệm), trả lời câu hỏi thuế thực chiến.

CÂU HỎI: {question}

GIAI ĐOẠN ÁP DỤNG: {time_period_description}
(Chỉ trích dẫn quy định có hiệu lực trong giai đoạn này)

{doc_context}

{cv_context}

YÊU CẦU TRẢ LỜI:
1. Output HTML thuần túy — KHÔNG markdown
2. Mở đầu bằng: tóm tắt câu trả lời 1-2 câu (in đậm)
3. Trích dẫn ĐIỀU KHOẢN CỤ THỂ: "theo điểm d, khoản 4, Điều 9, NĐ 320/2025/NĐ-CP..."
   — KHÔNG viết chung chung "theo quy định hiện hành"
4. Nếu quy định THAY ĐỔI theo thời gian → dùng bảng so sánh:
   | Giai đoạn | Quy định | Văn bản áp dụng |
5. Dẫn công văn hướng dẫn nếu có trong dữ liệu
6. Ví dụ số cụ thể khi cần thiết
7. Hồ sơ chứng từ cần thiết (nếu liên quan)
8. Tối đa 800 từ — súc tích, đúng trọng tâm
9. TUYỆT ĐỐI không bịa số hiệu văn bản — chỉ dùng số hiệu có trong dữ liệu
```

### Response:
```json
{
  "id": 1,
  "question": "...",
  "answer_html": "<p>...</p>",
  "tax_docs_used": [{"so_hieu": "320/2025/NĐ-CP", "ten": "..."}],
  "congvan_used": [{"so_hieu": "21071/CT-HTr", "ten": "..."}],
  "model_used": "claude-haiku-4-5",
  "duration_ms": 3200
}
```

---

## Core Feature: Full Report (SSE Streaming)

**Endpoint:** `POST /api/research/full` → returns job_id  
**Endpoint:** `GET /api/research/full/{job_id}/stream` → SSE stream  
**Model:** Sonnet (default) or Opus  
**Time:** 5-12 minutes  
**Use case:** Báo cáo phân tích thuế theo ngành/công ty, comprehensive, multi-section

### Report Sections (default — user can toggle on/off):
```python
DEFAULT_SECTIONS = [
    {"id": "s1", "title": "Tổng quan về ngành / công ty", "enabled": True,
     "sub": ["Quy mô thị trường", "Đặc điểm kinh doanh", "Mô hình doanh thu/chi phí"]},
    
    {"id": "s2", "title": "Đặc thù kinh doanh & tài sản", "enabled": True,
     "sub": ["Chuỗi cung ứng", "Working capital cycle", "Đặc điểm tài sản cố định"]},
    
    {"id": "s3", "title": "Khung pháp lý & các văn bản thuế áp dụng", "enabled": True,
     "tax_aware": True,  # inject tax docs context
     "sub": ["Luật, Nghị định, Thông tư hiện hành", "Ngày hiệu lực", "Văn bản thay thế/sửa đổi"]},
    
    {"id": "s4", "title": "Phân tích các sắc thuế áp dụng", "enabled": True,
     "tax_aware": True,
     "sub": ["Thuế TNDN", "Thuế GTGT", "Thuế Nhà thầu", "Thuế TTĐB (nếu có)", "Thuế XNK (nếu có)"]},
    
    {"id": "s5", "title": "Các vấn đề thuế đặc thù của ngành", "enabled": True,
     "tax_aware": True,
     "sub": ["Rủi ro doanh thu/chi phí", "Chuyển giá", "Ưu đãi thuế", 
             "Hóa đơn đặc thù", "Tranh chấp thuế & án lệ",
             "Công văn/hướng dẫn đặc thù Tổng cục Thuế"]},
    
    {"id": "s6", "title": "Thay đổi chính sách thuế gần đây & tác động", "enabled": True,
     "tax_aware": True,
     "sub": ["Văn bản mới (2024-2026)", "So sánh trước/sau thay đổi", "Tác động thực tế"]},
    
    {"id": "s7", "title": "Thuế quốc tế & chuyển giá", "enabled": False,
     "sub": ["BEPS/Pillar 2", "Chuyển giá quốc tế", "So sánh khu vực", "Hiệp định thuế"]},
]
```

### Generation Logic (for each section):
1. **Phase 1 (parallel):** For each section:
   - Run `perplexity_search(query)` — internet research
   - If `tax_aware`: run `get_relevant_docs()` + `get_relevant_congvan()` from dbvntax
2. **Phase 2 (sequential):** For each section:
   - Merge context: `[Tax Docs] + [Công văn] + [Perplexity results]`
   - Call `claude_stream_section()` — stream HTML output

### Section Prompt (for tax-aware sections):
```
Bạn là chuyên gia thuế Big 4 Việt Nam (Deloitte/PwC/EY/KPMG) viết báo cáo phân tích thuế 
chuyên nghiệp bằng tiếng Việt.

Viết PHẦN: "{section_title}"
Chủ đề phân tích: {subject} ({mode}: ngành / công ty)
Giai đoạn áp dụng: {time_period}

=== VĂN BẢN PHÁP LUẬT TỪ DATABASE (ưu tiên sử dụng) ===
{tax_docs_context}

=== CÔNG VĂN HƯỚNG DẪN TỪ DATABASE ===
{congvan_context}

=== DỮ LIỆU NGHIÊN CỨU TỪ PERPLEXITY ===
{perplexity_context}

YÊU CẦU TUYỆT ĐỐI:
1. Output HTML thuần túy — bắt đầu bằng <h2>N. {section_title}</h2>
2. ƯU TIÊN DỮ LIỆU TỪ DATABASE hơn Perplexity
3. Trích dẫn ĐIỀU KHOẢN CỤ THỂ: "theo điểm X, khoản Y, Điều Z, NĐ/TT số..."
4. Nếu quy định thay đổi theo thời gian → bảng so sánh Before/After:
   <table><tr><th>Giai đoạn</th><th>Quy định</th><th>Văn bản</th></tr>...</table>
5. Dẫn công văn cụ thể khi có (số hiệu + nội dung ngắn)
6. KHÔNG trích dẫn văn bản đã hết hiệu lực (trừ khi phân tích lịch sử)
7. KHÔNG bịa số hiệu văn bản
8. Tối thiểu 700 từ
9. Trích dẫn nguồn sau mỗi câu có số liệu: <a href="..." target="_blank">[N]</a>
```

---

## Feature: Time Period Parsing

Parse user's `time_period` input to determine which documents to pull:

```python
def parse_time_period(time_period: str) -> dict:
    """
    Parse time_period string → structured period info.
    
    Examples:
      "2025"         → {start: 2025-01-01, end: 2025-12-31, label: "năm 2025"}
      "trước 10/2025"→ {start: None, end: 2025-09-30, label: "trước tháng 10/2025"}
      "2020-2024"    → {start: 2020-01-01, end: 2024-12-31, label: "2020-2024"}
      "hiện tại"     → {start: None, end: today, label: "hiện tại (2026)"}
      None           → {start: None, end: today, label: "hiện tại"}
    
    Returns:
      {
        "start_date": "2025-01-01" | None,
        "end_date": "2025-12-31",
        "label": "năm 2025",
        "include_expired": bool  # True if historical period
      }
    """
    # Implementation: use regex to extract dates, months, years
    # Key cases:
    # - "trước MM/YYYY" → end = last day of month before MM/YYYY
    # - "sau MM/YYYY"   → start = first day of MM/YYYY
    # - "YYYY"          → full year
    # - "YYYY-YYYY"     → year range
    # - None/"hiện tại" → end = today
    pass
```

This `time_period` is used in:
- `get_relevant_docs(time_period_end=period["end_date"], include_expired=period["include_expired"])`
- Prompt injection: "Giai đoạn áp dụng: {period['label']}"

---

## Feature: Legal Reference Verification

After generating content, verify cited references against dbvntax DB (faster + more accurate than TVPL scraping):

```python
async def verify_legal_refs_db(html: str, dbvntax_db) -> str:
    """
    Find all legal ref numbers in HTML, check against dbvntax documents table.
    Mark expired ones with ⚠️, add hiệu lực info as tooltip.
    """
    from sqlalchemy import text
    import re
    
    LEGAL_REF_PATTERN = re.compile(
        r'\b(\d{1,3}/\d{4}/(?:QH\d*|NĐ-CP|TT-BTC|TT|NQ|QĐ|CT|PL|UBTVQH)\w*)\b'
    )
    refs = list(set(LEGAL_REF_PATTERN.findall(html)))
    if not refs:
        return html
    
    # Batch query dbvntax
    sql = """
        SELECT so_hieu, tinh_trang, het_hieu_luc_tu, hieu_luc_index
        FROM documents
        WHERE so_hieu = ANY(:refs)
    """
    result = await dbvntax_db.execute(text(sql), {"refs": refs})
    db_docs = {row["so_hieu"]: row for row in result.mappings()}
    
    for ref in refs:
        doc = db_docs.get(ref)
        if doc and doc["tinh_trang"] not in ("con_hieu_luc",):
            # Expired → warn
            html = html.replace(
                ref,
                f'<span title="⚠️ Văn bản này đã hết hiệu lực" '
                f'style="background:#fff3cd;border-bottom:2px solid #f59e0b;cursor:help">'
                f'⚠️ {ref}</span>'
            )
        elif not doc:
            # Not in our DB → soft warn
            html = html.replace(
                ref,
                f'<span title="Chưa xác minh được trong database" '
                f'style="border-bottom:1px dashed #9ca3af;cursor:help">'
                f'{ref}</span>'
            )
    
    return html
```

---

## Feature: Tax Docs KB (Upload & Manage)

- **Upload:** Admin can upload DOCX/PDF văn bản (tiếng Việt) → extracted as plain text → stored in `tax_docs` table
- **Import from dbvntax:** Admin can import a document from dbvntax by ID → pulls `noi_dung` HTML → strip to text → store in `tax_docs` with `source='dbvntax'`, `dbvntax_id=X`
- **Search:** Full-text search within uploaded docs
- **Use in prompts:** For Quick Research and Full Report, optionally query `tax_docs` table IN ADDITION to dbvntax (for custom-uploaded docs not in dbvntax)

### Upload endpoint: `POST /api/tax-docs/upload`
- Accept: `.docx`, `.pdf`, `.txt`
- Extract text using `python-docx` (for .docx) or `pdfminer` (for .pdf)
- Store in `tax_docs.content_text`
- Parse `so_hieu`, `ten`, `loai`, `ngay_ban_hanh` from filename or first page

### Import from dbvntax: `POST /api/tax-docs/import-from-dbvntax`
```json
{"dbvntax_id": 123}
```
→ Pull document from dbvntax DB → strip HTML → store in `tax_docs`

---

## Auth System (JWT)

Same pattern as examsgen. Use `python-jose` + `passlib[bcrypt]`.

```python
# JWT payload
{"sub": user_email, "role": "user"|"admin", "exp": timestamp}

# Protected routes use: user = Depends(get_current_user)
# Admin routes use:     user = Depends(require_admin)
```

**Initial setup:** On first run, if no users exist, create admin user with:
- Email: `admin@taxconsult.local`
- Password: `APP_PASSWORD` env var

---

## Frontend Pages

### Login.jsx
Standard email + password form. Store JWT in localStorage.

### Dashboard.jsx
- Recent reports (last 5)
- Quick stats: total reports, docs in KB
- Shortcuts: "Quick Research" button, "New Full Report" button

### QuickResearch.jsx
```
┌─────────────────────────────────────────────────────┐
│  🔍 Quick Research                                   │
│                                                     │
│  Câu hỏi thuế của bạn:                              │
│  [textarea — large, placeholder: "Ví dụ: Chi phí   │
│   trang phục tiền mặt cho nhân viên được trừ tối   │
│   đa bao nhiêu theo quy định 2025?"]               │
│                                                     │
│  Sắc thuế: [TNDN] [GTGT] [TNCN] [FCT] [TP] [HKD]  │
│  Giai đoạn: [2026 ▾] [Tùy chỉnh...]               │
│  Model: [Haiku ⭐] [Sonnet] [Opus]                  │
│                                                     │
│  [🔍 Tìm hiểu ngay]  (~20-45 giây)                 │
└─────────────────────────────────────────────────────┘

Results panel:
- Answer HTML rendered
- "Văn bản đã dùng" section (badges with so_hieu)
- "Công văn đã dùng" section
- Save to history button
- Copy to clipboard button
```

### FullReport.jsx
```
┌─────────────────────────────────────────────────────┐
│  📊 Báo cáo Phân tích Thuế Ngành / Công ty          │
│                                                     │
│  Chủ đề:  [input: "Ngành bất động sản"]             │
│  Loại:    [● Ngành ○ Công ty cụ thể]                │
│  Giai đoạn: [2025-2026 ▾]                           │
│  Sắc thuế: [✓TNDN] [✓GTGT] [FCT] [TTDB] [XNK]     │
│  Model:   [Sonnet ⭐] [Opus]                         │
│  Sonar:   [● Sonar ○ Sonar Pro]                     │
│                                                     │
│  Sections (click to toggle):                        │
│  [✓ Tổng quan] [✓ Đặc thù KD] [✓ Khung pháp lý]   │
│  [✓ Phân tích thuế] [✓ Vấn đề đặc thù] [✓ Thay đổi]│
│  [  Thuế quốc tế]                                   │
│                                                     │
│  [📊 Tạo báo cáo]  (~5-10 phút)                    │
└─────────────────────────────────────────────────────┘

Report viewer:
- SSE progress bar (section by section)
- Rendered HTML report
- Export Word button
- Save report button
```

### Reports.jsx
- List all saved reports (user's own + admin sees all)
- Filter by type (quick/full), tax type, date
- Click to view, download DOCX, delete

### TaxDocs.jsx
- List uploaded tax docs
- Upload button (drag & drop)
- Import from dbvntax button (search by số hiệu)
- List with: số hiệu, tên, hiệu lực, status badges
- Admin only

### Settings.jsx
- Change password
- Admin: manage users (list, activate/deactivate)

---

## Sidebar Navigation

Same collapsible pattern as examsgen. Colors: green (`#028a39`) brand.

Nav items:
- 🏠 Dashboard
- 🔍 Quick Research
- 📊 Full Report
- 📁 Reports (History)
- 📚 Tax Docs (admin only)
- ⚙️ Settings

---

## Dockerfile

```dockerfile
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY main.py .
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## requirements.txt

```
fastapi==0.115.0
uvicorn[standard]==0.32.0
sqlalchemy[asyncio]==2.0.36
asyncpg==0.30.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.12
httpx==0.28.1
anthropic==0.49.0
openai==1.58.1
beautifulsoup4==4.12.3
lxml==5.3.0
python-docx==1.1.2
pdfminer.six==20231228
```

---

## Implementation Notes

### Database connections (database.py)
Two separate engines:
```python
# taxconsult DB (read-write)
engine = create_async_engine(DATABASE_URL)
AsyncSessionLocal = async_sessionmaker(engine)

# dbvntax DB (read-only)
dbvntax_engine = create_async_engine(DBVNTAX_DATABASE_URL)
DbvntaxSession = async_sessionmaker(dbvntax_engine)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

async def get_dbvntax_db():
    async with DbvntaxSession() as session:
        yield session
```

### On startup (lifespan):
```python
async with engine.begin() as conn:
    await conn.run_sync(Base.metadata.create_all)
# Create admin user if not exists
```

### AI Provider priority:
1. Anthropic (primary)
2. Claudible (fallback — same API format as Anthropic)
3. OpenAI (last resort)

Model tier mapping:
- `haiku`  → `claude-haiku-4-5` (fast, cheap — default for Quick Research)
- `fast`   → `claude-sonnet-4-5` (balanced — default for Full Report)
- `strong` → `claude-opus-4-6` (best — for complex reports)

### DOCX export:
Same pattern as taxsector — use `python-docx`, parse HTML with BeautifulSoup, render h2/h3/p/li/table.

---

## After Implementation

1. `python -m py_compile backend/**/*.py main.py && echo OK`
2. `git add -A && git commit -m "feat: taxconsult v1 — multi-user tax consulting platform"`
3. `git push origin main`

Coolify setup by human:
- New Resource → GitHub `phanvuhoang/taxconsult`
- Build: Dockerfile, Port: 8000
- Domain: `taxconsult.gpt4vn.com`
- Env vars: (see Environment Variables section above — fill in API keys)

---

*Brief written by Thanh (AI agent) — 2026-03-25*
*Target: ~600-800 lines of Python backend, ~400 lines React frontend*
