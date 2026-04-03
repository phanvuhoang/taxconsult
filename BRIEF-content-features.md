# BRIEF: Content Features + Tax Type Expansion
**Target:** Claude Code  
**Repo:** phanvuhoang/taxconsult  
**Stack:** Python/FastAPI backend, React/Vite/TailwindCSS frontend  
**Sau khi xong:** Xoá file này, commit + push lên GitHub

---

## 1. Thêm 3 sắc thuế còn thiếu

### 1a. Frontend — `frontend/src/pages/FullReport.jsx`

Tìm:
```js
const TAX_TYPES = ['TNDN', 'GTGT', 'TNCN', 'FCT', 'TTDB', 'XNK', 'TP', 'HKD']
```
Sửa thành:
```js
const TAX_TYPES = ['TNDN', 'GTGT', 'TNCN', 'FCT', 'TTDB', 'XNK', 'TP', 'HKD', 'QLT', 'HOA_DON', 'THUE_QT']
```

Làm tương tự trong `frontend/src/pages/QuickResearch.jsx` — file này cũng có `const TAX_TYPES`.

### 1b. Backend — `backend/doc_context.py`

Tìm `SAC_THUE_MAP` dict, thêm 2 entry còn thiếu:
```python
SAC_THUE_MAP = {
    ...
    "QLT": ["QLT"],          # đã có
    "HOA_DON": ["HOA_DON"],  # THÊM MỚI
    "THUE_QT": ["THUE_QT"],  # THÊM MỚI
    ...
}
```

---

## 2. Bốn Content Features mới

### 2a. DB Model — `backend/models.py`

Thêm model `ContentJob` vào cuối file (sau `ResearchSession`):

```python
class ContentJob(Base):
    __tablename__ = "content_jobs"

    id = Column(String(36), primary_key=True)  # UUID
    user_id = Column(Integer, ForeignKey("users.id"))
    content_type = Column(String(20), nullable=False)
    # content_type values: 'scenario' | 'analysis' | 'press' | 'advice'

    # Input fields
    subject = Column(Text, nullable=False)   # topic / scenario / question
    tax_types = Column(ARRAY(Text), default=list)
    time_period = Column(String(100))
    model_tier = Column(String(30), default="deepseek")
    client_name = Column(String(200))        # chỉ dùng cho 'advice'
    company_name = Column(String(200))       # chỉ dùng cho 'advice'
    style_refs = Column(JSONB, default=list) # list of URLs, max 5

    # Output
    status = Column(String(20), default="pending")
    # status: 'pending' | 'running' | 'done' | 'error'
    content_html = Column(Text)
    citations = Column(JSONB, default=list)
    error_msg = Column(Text)
    progress_step = Column(Integer, default=0)
    progress_total = Column(Integer, default=3)
    progress_label = Column(String(200))

    # Gamma
    gamma_url = Column(Text)
    gamma_status = Column(String(20))  # None | 'processing' | 'done' | 'error'

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User")
```

Thêm migration Alembic **hoặc** tạo bảng bằng `CREATE TABLE IF NOT EXISTS` trong `backend/database.py` (cùng pattern với các bảng khác hiện tại — xem cách app tạo bảng khi startup và làm tương tự).

### 2b. Content Generator — `backend/content_generator.py` (file MỚI)

Tạo file mới. Logic tương tự `quick_research.py` nhưng:
1. Fetch style references (URLs) bằng httpx — giới hạn 3000 chars/URL
2. Semantic search từ dbvntax (gọi `get_relevant_docs_semantic` từ `doc_context.py`) 
3. Perplexity search (gọi `perplexity_search_legal` nếu tax-aware, `perplexity_search` nếu không)
4. Build prompt theo `content_type`
5. Stream AI response, lưu vào DB khi xong

```python
"""content_generator.py — Generate content jobs (scenario/analysis/press/advice)."""
import asyncio
import uuid
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from backend.ai_provider import call_ai
from backend.doc_context import get_relevant_docs_semantic, get_relevant_congvan
from backend.perplexity import perplexity_search, perplexity_search_legal

SYSTEM = (
    "Bạn là chuyên gia thuế Big 4 Việt Nam với 30 năm kinh nghiệm. "
    "Viết bằng tiếng Việt, trích dẫn điều khoản cụ thể (số hiệu, điều, khoản). "
    "Chỉ dùng văn bản pháp luật được cung cấp, không bịa số hiệu văn bản."
)

async def _fetch_url_text(url: str) -> str:
    """Fetch URL content, return plain text max 3000 chars."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, follow_redirects=True,
                                 headers={"User-Agent": "Mozilla/5.0"})
            r.raise_for_status()
            # Strip HTML tags cơ bản
            import re
            text = re.sub(r'<[^>]+>', ' ', r.text)
            text = re.sub(r'\s+', ' ', text).strip()
            return text[:3000]
    except Exception:
        return ""


async def _build_style_context(style_refs: list) -> str:
    """Fetch up to 5 style reference URLs, return as context string."""
    if not style_refs:
        return ""
    parts = []
    tasks = [_fetch_url_text(url) for url in style_refs[:5] if url.startswith("http")]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for url, text in zip(style_refs[:5], results):
        if isinstance(text, str) and text:
            parts.append(f"--- Bài mẫu từ {url} ---\n{text}")
    return "\n\n".join(parts)


def _build_prompt(content_type: str, subject: str, doc_ctx: str, perp_ctx: str,
                  style_ctx: str, client_name: str = "", company_name: str = "") -> str:
    """Build prompt theo content_type."""

    base = f"""════════════════════════════════════════
VĂN BẢN PHÁP LUẬT (nguồn: dbvntax — ưu tiên cao nhất)
════════════════════════════════════════
{doc_ctx or "(không có văn bản liên quan)"}

════════════════════════════════════════
NGUỒN BỔ SUNG (Perplexity, internet)
════════════════════════════════════════
{perp_ctx or "(không có)"}
"""
    if style_ctx:
        base += f"""
════════════════════════════════════════
BÀI MẪU THAM KHẢO PHONG CÁCH
════════════════════════════════════════
{style_ctx}
"""

    if content_type == "scenario":
        return base + f"""
════════════════════════════════════════
YÊU CẦU: Phân tích tình huống thuế sau
════════════════════════════════════════
{subject}

Output HTML. Cấu trúc:
<h2>1. Phân tích tình huống</h2>
<h2>2. Căn cứ pháp lý</h2>
[trích dẫn cụ thể: "theo khoản X Điều Y <strong>Luật/NĐ/TT số ABC</strong>"]
<h2>3. Hướng xử lý</h2>
<h2>4. Lưu ý quan trọng</h2>
Tối thiểu 600 từ. Không bịa số hiệu văn bản.
"""
    elif content_type == "analysis":
        return base + f"""
════════════════════════════════════════
YÊU CẦU: Bài phân tích chuyên sâu về
════════════════════════════════════════
{subject}

Output HTML. Cấu trúc:
<h2>I. Căn cứ pháp lý</h2>
<h2>II. Phân tích chi tiết</h2>
[mỗi luận điểm có trích dẫn điều khoản cụ thể]
<h2>III. Ví dụ thực tế</h2>
<h2>IV. Lưu ý quan trọng</h2>
<h2>V. Kết luận</h2>
Tối thiểu 1200 từ.
"""
    elif content_type == "press":
        return base + f"""
════════════════════════════════════════
YÊU CẦU: Bài viết báo về chủ đề
════════════════════════════════════════
{subject}

Phong cách báo chí: storytelling, ngôn ngữ gần gũi, mở đầu bằng câu chuyện thực tế.
Output HTML. Cấu trúc:
<h2>[Lead — câu chuyện mở đầu]</h2>
<h2>[Phần 1 — quy định liên quan, giải thích đơn giản]</h2>
<h2>[Phần 2 — ví dụ, số liệu]</h2>
<h2>Kết luận & Khuyến nghị</h2>
800-1500 từ. Giọng thân thiện, không hàn lâm.
"""
    elif content_type == "advice":
        addressee = client_name or "Quý khách hàng"
        if company_name:
            addressee += f" — {company_name}"
        return base + f"""
════════════════════════════════════════
YÊU CẦU: Thư tư vấn thuế chuyên nghiệp
════════════════════════════════════════
Kính gửi: {addressee}
Nội dung tư vấn: {subject}

Output HTML. Cấu trúc:
<h2>I. Vấn đề được tư vấn</h2>
<h2>II. Căn cứ pháp lý</h2>
[trích dẫn điều khoản cụ thể]
<h2>III. Ý kiến tư vấn</h2>
<h2>IV. Khuyến nghị</h2>
<p><em>Lưu ý: Thư tư vấn dựa trên quy định pháp luật hiện hành...</em></p>
1-2 trang A4 (600-1000 từ), giọng văn chuyên nghiệp.
"""
    return base + f"\nYêu cầu: {subject}\nOutput HTML."


async def run_content_job(
    job_id: str,
    content_type: str,
    subject: str,
    tax_types: list,
    model_tier: str,
    style_refs: list,
    client_name: str,
    company_name: str,
    dbvntax_db: AsyncSession,
    db: AsyncSession,
):
    """Background task — generate content, update DB job record."""
    from backend.models import ContentJob

    async def _update(step, total, label, status="running", html=None, error=None, citations=None):
        job = await db.get(ContentJob, job_id)
        if not job:
            return
        job.progress_step = step
        job.progress_total = total
        job.progress_label = label
        job.status = status
        if html is not None:
            job.content_html = html
        if error is not None:
            job.error_msg = error
        if citations is not None:
            job.citations = citations
        await db.commit()

    try:
        await _update(1, 3, "Đang tìm kiếm văn bản pháp luật liên quan...")

        # Parallel: semantic search + perplexity + style fetch
        query = f"{subject} {' '.join(tax_types)}"
        tasks = [
            get_relevant_docs_semantic(dbvntax_db, query, tax_types, top_k=5),
            get_relevant_congvan(dbvntax_db, tax_types,
                                 keywords=[w for w in subject.lower().split() if len(w) > 2][:5]),
            perplexity_search_legal(f"{subject} Việt Nam 2024 2025 2026") if tax_types
                else perplexity_search(subject),
            _build_style_context(style_refs),
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        doc_ctx = results[0] if not isinstance(results[0], Exception) else ""
        cv_ctx = results[1] if not isinstance(results[1], Exception) else ""
        perp_result = results[2] if not isinstance(results[2], Exception) else {"content": "", "citations": []}
        style_ctx = results[3] if not isinstance(results[3], Exception) else ""

        perp_ctx = perp_result.get("content", "") if isinstance(perp_result, dict) else ""
        citations = perp_result.get("citations", []) if isinstance(perp_result, dict) else []

        full_doc_ctx = "\n\n".join(x for x in [doc_ctx, cv_ctx] if x)

        await _update(2, 3, "Đang tạo nội dung với AI...")

        prompt = _build_prompt(content_type, subject, full_doc_ctx, perp_ctx,
                               style_ctx, client_name, company_name)

        result = await call_ai(
            messages=[{"role": "user", "content": prompt}],
            system=SYSTEM,
            model_tier=model_tier,
            max_tokens=6000,
        )
        html = result.get("content", "")
        if not html.startswith("<"):
            import re
            html = re.sub(r'^```html?\n?', '', html)
            html = re.sub(r'\n?```$', '', html)

        await _update(3, 3, "Hoàn thành!", status="done", html=html, citations=citations)

    except Exception as e:
        await _update(0, 3, "", status="error", error=str(e))
```

### 2c. API Routes — `backend/routes/content.py` (file MỚI)

```python
"""routes/content.py — Content generation endpoints."""
import uuid
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
import datetime

from backend.database import get_db, get_dbvntax_db
from backend.models import User, ContentJob
from backend.auth import get_current_user
from backend.content_generator import run_content_job

router = APIRouter(prefix="/api/content", tags=["content"])


class ContentRequest(BaseModel):
    content_type: str   # 'scenario' | 'analysis' | 'press' | 'advice'
    subject: str
    tax_types: List[str] = []
    time_period: Optional[str] = None
    model_tier: str = "deepseek"
    client_name: Optional[str] = ""
    company_name: Optional[str] = ""
    style_refs: Optional[List[str]] = []


@router.post("/start")
async def start_content(
    body: ContentRequest,
    bg: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    dbvntax_db: AsyncSession = Depends(get_dbvntax_db),
):
    if not body.subject.strip():
        raise HTTPException(status_code=400, detail="Subject is required")
    valid_types = ("scenario", "analysis", "press", "advice")
    if body.content_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"content_type must be one of {valid_types}")

    job_id = str(uuid.uuid4())
    job = ContentJob(
        id=job_id,
        user_id=user.id,
        content_type=body.content_type,
        subject=body.subject,
        tax_types=body.tax_types,
        time_period=body.time_period,
        model_tier=body.model_tier,
        client_name=body.client_name or "",
        company_name=body.company_name or "",
        style_refs=body.style_refs or [],
        status="pending",
        progress_step=0,
        progress_total=3,
    )
    db.add(job)
    await db.commit()

    bg.add_task(
        run_content_job,
        job_id=job_id,
        content_type=body.content_type,
        subject=body.subject,
        tax_types=body.tax_types,
        model_tier=body.model_tier,
        style_refs=body.style_refs or [],
        client_name=body.client_name or "",
        company_name=body.company_name or "",
        dbvntax_db=dbvntax_db,
        db=db,
    )

    return {"job_id": job_id}


@router.get("/job/{job_id}")
async def get_content_job(
    job_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    job = await db.get(ContentJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # Auto-timeout >30 min
    if job.status in ("running", "pending") and job.created_at:
        age = (datetime.datetime.utcnow() - job.created_at).total_seconds() / 60
        if age > 30:
            job.status = "error"
            job.error_msg = "Timeout (>30 phút). Vui lòng thử lại."
            await db.commit()
    return {
        "status": job.status,
        "content_type": job.content_type,
        "subject": job.subject,
        "progress_step": job.progress_step,
        "progress_total": job.progress_total,
        "progress_label": job.progress_label,
        "content_html": job.content_html,
        "error_msg": job.error_msg,
        "citations": job.citations or [],
        "gamma_url": job.gamma_url,
        "gamma_status": job.gamma_status,
    }


@router.post("/job/{job_id}/cancel")
async def cancel_content_job(
    job_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    job = await db.get(ContentJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Not found")
    if job.status in ("done", "error"):
        return {"ok": True}
    job.status = "error"
    job.error_msg = "Huỷ bởi người dùng"
    await db.commit()
    return {"ok": True}


@router.get("/history")
async def list_content_history(
    content_type: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select
    q = select(ContentJob).where(
        ContentJob.user_id == user.id,
        ContentJob.status == "done",
    ).order_by(ContentJob.created_at.desc()).limit(30)
    if content_type:
        q = q.where(ContentJob.content_type == content_type)
    result = await db.execute(q)
    jobs = result.scalars().all()
    return [
        {
            "id": j.id,
            "content_type": j.content_type,
            "subject": j.subject[:100],
            "created_at": j.created_at.strftime("%d/%m/%Y %H:%M") if j.created_at else "",
            "gamma_url": j.gamma_url,
        }
        for j in jobs
    ]


@router.post("/job/{job_id}/gamma")
async def request_gamma(
    job_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger Gamma slide creation on demand (không auto)."""
    import os, httpx
    job = await db.get(ContentJob, job_id)
    if not job or job.status != "done" or not job.content_html:
        raise HTTPException(status_code=400, detail="Job chưa hoàn thành")

    gamma_key = os.getenv("GAMMA_API_KEY", "")
    if not gamma_key:
        raise HTTPException(status_code=400, detail="GAMMA_API_KEY chưa cấu hình")

    num_cards = body.get("num_slides", 10)
    job.gamma_status = "processing"
    await db.commit()

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                "https://api.gamma.app/v1/presentations",
                headers={"Authorization": f"Bearer {gamma_key}",
                         "Content-Type": "application/json"},
                json={"title": job.subject[:100],
                      "markdown": job.content_html[:50000],
                      "numCards": num_cards},
            )
            r.raise_for_status()
            data = r.json()
        job.gamma_url = data.get("url", "")
        job.gamma_status = "done"
        await db.commit()
        return {"gamma_url": job.gamma_url}
    except Exception as e:
        job.gamma_status = "error"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Gamma error: {e}")
```

### 2d. Register Router — `backend/main.py` hoặc `backend/app.py`

Tìm chỗ đăng ký các router khác (ví dụ `app.include_router(reports.router)`), thêm vào:
```python
from backend.routes import content
app.include_router(content.router)
```

### 2e. Frontend — `frontend/src/pages/ContentPage.jsx` (file MỚI)

Component tái sử dụng cho cả 4 loại content. Props: `contentType`, `title`, `description`, `placeholder`, `defaultSlides`, `showClientFields`, `showStyleRefs`.

**Cấu trúc UI:**
```
┌─────────────────────────────────────┐
│ [Lịch sử] button                    │
│ ─── History panel (nếu mở) ───      │
├─────────────────────────────────────┤
│ FORM                                │
│  [Textarea: nội dung/chủ đề]        │
│  (nếu showClientFields:)            │
│    [Tên KH] [Tên công ty]           │
│  [Sắc thuế chips multi-select]      │
│  [Model radio: deepseek/haiku/sonnet/qwen]  ← fetch dynamic như FullReport
│  (nếu showStyleRefs:)               │
│    [URL input] [+ Thêm] (max 5)     │
│    [list of added URLs]             │
│  [▶ Tạo nội dung] button            │
├─────────────────────────────────────┤
│ PROGRESS BAR (khi đang chạy)        │
│  + nút [✕ Huỷ]                      │
├─────────────────────────────────────┤
│ RESULT (khi done)                   │
│  toolbar: [Copy HTML] [Tải DOCX]    │
│           [✨ Tạo Gamma ({N} slides)]│
│  ─── content_html rendered ─────    │
│  (gamma section khi click tạo)      │
└─────────────────────────────────────┘
```

**Behaviour giống FullReport.jsx:**
- Khi load page → `api.getContentHistory(contentType)` lấy recent jobs
- Tự động resume nếu có job `running/pending` trong history (poll `/api/content/job/{id}`)
- Poll interval: 3000ms
- Auto-timeout: backend tự handle (>30 phút → error)
- Nút Huỷ: gọi `POST /api/content/job/{id}/cancel`
- Load lại từ history: click item → show content_html, enable Gamma button
- Gamma: **KHÔNG auto** — chỉ có nút "✨ Tạo Gamma" sau khi có result, click mới gọi API

**Gamma defaults theo loại:**
- `scenario` → 5 slides
- `analysis` → 15 slides  
- `press` → 8 slides
- `advice` → 6 slides

**Model list:** Fetch dynamic từ `/api/reports/model-info` (cùng endpoint như FullReport/QuickResearch) — nếu `OPENROUTER_MODEL` có → thêm Qwen option.

**api.js — thêm các methods:**
```js
// Content jobs
startContent: (data) => request('POST', '/content/start', data),
getContentJob: (jobId) => request('GET', `/content/job/${jobId}`),
cancelContentJob: (jobId) => request('POST', `/content/job/${jobId}/cancel`),
getContentHistory: (contentType) => request('GET', `/content/history?content_type=${contentType}`),
requestContentGamma: (jobId, numSlides) => request('POST', `/content/job/${jobId}/gamma`, { num_slides: numSlides }),
exportContentDocx: (jobId) => request('GET', `/content/job/${jobId}/export-docx`, null, 'blob'),
```

**Thêm DOCX export endpoint vào `backend/routes/content.py`:**
```python
@router.get("/job/{job_id}/export-docx")
async def export_content_docx(job_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    from backend.routes.reports import _html_to_docx  # reuse hàm đã có
    import io
    from fastapi.responses import StreamingResponse
    job = await db.get(ContentJob, job_id)
    if not job or not job.content_html:
        raise HTTPException(404, "Not found")
    docx_bytes = _html_to_docx(job.content_html, job.subject)
    return StreamingResponse(io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="content_{job_id}.docx"'})
```

### 2f. Bốn trang riêng — mỗi file là wrapper của ContentPage

**`frontend/src/pages/Scenario.jsx`** — Tình huống thuế:
```jsx
import ContentPage from './ContentPage'
export default function Scenario() {
  return <ContentPage
    contentType="scenario"
    title="🎯 Tình huống Thuế"
    description="Mô tả tình huống — nhận phân tích pháp lý + hướng xử lý"
    placeholder="VD: Công ty A ký HĐ thuê nhà với cá nhân B, 20tr/tháng. B không có đăng ký KD. Cần chứng từ gì để khấu trừ CP? Nghĩa vụ thuế TNCN và GTGT?"
    defaultSlides={5}
    showStyleRefs={false}
    showClientFields={false}
  />
}
```

**`frontend/src/pages/Analysis.jsx`** — Bài phân tích:
```jsx
import ContentPage from './ContentPage'
export default function Analysis() {
  return <ContentPage
    contentType="analysis"
    title="📝 Bài Phân tích Chuyên sâu"
    description="Phân tích chuyên sâu một vấn đề thuế cụ thể"
    placeholder="VD: Quy định về khấu trừ chi phí lãi vay theo Khoản 3 Điều 16 Luật CIT 2024 — phân tích tác động với doanh nghiệp FDI"
    defaultSlides={15}
    showStyleRefs={true}
    showClientFields={false}
  />
}
```

**`frontend/src/pages/PressArticle.jsx`** — Bài viết báo:
```jsx
import ContentPage from './ContentPage'
export default function PressArticle() {
  return <ContentPage
    contentType="press"
    title="📰 Bài Viết Báo"
    description="Bài báo về thuế theo phong cách storytelling, dễ hiểu"
    placeholder="VD: Bỏ thuế khoán 2026 — 5 triệu hộ kinh doanh phải làm gì?"
    defaultSlides={8}
    showStyleRefs={true}
    showClientFields={false}
  />
}
```

**`frontend/src/pages/TaxAdvice.jsx`** — Thư tư vấn:
```jsx
import ContentPage from './ContentPage'
export default function TaxAdvice() {
  return <ContentPage
    contentType="advice"
    title="✉️ Thư Tư vấn Thuế"
    description="Thư tư vấn chuyên nghiệp gửi khách hàng"
    placeholder="VD: Công ty XYZ muốn biết nghĩa vụ thuế khi nhận chuyển nhượng vốn từ công ty mẹ nước ngoài..."
    defaultSlides={6}
    showStyleRefs={true}
    showClientFields={true}
  />
}
```

### 2g. Routing — `frontend/src/App.jsx` (hoặc file router)

Tìm chỗ khai báo routes, thêm 4 routes mới:
```jsx
import Scenario from './pages/Scenario'
import Analysis from './pages/Analysis'
import PressArticle from './pages/PressArticle'
import TaxAdvice from './pages/TaxAdvice'

// Thêm vào routes:
{ path: '/scenario', element: <Scenario /> }
{ path: '/analysis', element: <Analysis /> }
{ path: '/press-article', element: <PressArticle /> }
{ path: '/tax-advice', element: <TaxAdvice /> }
```

### 2h. Navigation Sidebar — `frontend/src/components/Layout.jsx` (hoặc Sidebar component)

Tìm nav links hiện tại, thêm section "Tạo Nội dung":
```jsx
// Thêm vào sidebar sau Quick Research hoặc Full Report
{ to: '/scenario',     icon: '🎯', label: 'Tình huống Thuế' }
{ to: '/analysis',     icon: '📝', label: 'Bài Phân tích' }
{ to: '/press-article',icon: '📰', label: 'Bài Viết Báo' }
{ to: '/tax-advice',   icon: '✉️', label: 'Thư Tư vấn' }
```

---

## 3. Checklist sau khi implement

- [ ] `content_jobs` table được tạo khi app start (không cần manual migration)
- [ ] `POST /api/content/start` trả về `{ job_id }`
- [ ] `GET /api/content/job/{id}` trả đúng status + progress
- [ ] Poll frontend update đúng progress bar
- [ ] Resume tự động khi reload trang (tương tự FullReport)
- [ ] History load lại được content_html
- [ ] Gamma button chỉ xuất hiện sau khi có result, click mới gọi API
- [ ] Style refs fetch URLs thực sự (không để empty)
- [ ] 3 sắc thuế mới (QLT, HOA_DON, THUE_QT) xuất hiện đúng ở cả FullReport và QuickResearch
- [ ] DOCX export hoạt động
- [ ] Cancel button hoạt động, không bị stuck
- [ ] Model list động (kể cả Qwen nếu có OPENROUTER_API_KEY)

---

## Lưu ý kỹ thuật

- **DB session trong background task:** `run_content_job` nhận `db` và `dbvntax_db` từ route — FastAPI có thể close session trước khi task xong. Nếu lỗi, hãy tạo session mới bên trong background task bằng `AsyncSessionLocal()` và `DbvntaxSession()` (xem pattern trong `report_generator.py` hàm `generate_full_report` hiện tại)
- **`_html_to_docx` import:** Hàm này đang ở `backend/routes/reports.py` — nếu import circular, hãy move sang `backend/utils/docx.py` và import từ đó ở cả 2 routes
- **Không dùng streaming SSE cho content jobs** — dùng job polling (giống Full Report) thay vì SSE streaming (như Quick Research hiện tại). Lý do: dễ resume, dễ cancel
