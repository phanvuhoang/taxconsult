# BRIEF: taxconsult v3 — 7 Fixes & Features

**Repo:** github.com/phanvuhoang/taxconsult  
**Ngày:** 2026-04-04  
**Mục tiêu:** Fix 3 bugs + thêm 4 tính năng  
**Stack:** Python/FastAPI backend, React/Vite/JSX/Tailwind frontend (KHÔNG dùng TypeScript)

---

## FIX 1: Bullet points trong output HTML — không thành paragraph riêng

**Vấn đề:** AI trả về `<li>` hoặc `- text` nằm cùng dòng, không có `<p>` bao quanh, nên hiển thị dính nhau.

**Fix ở 2 nơi:**

### 1A. Prompt trong `backend/content_generator.py` → hàm `_build_prompt()`

Trong tất cả 4 content types (scenario, analysis, press, advice), thêm vào phần YÊU CẦU cuối mỗi prompt block:

```
HTML FORMATTING RULES (BẮT BUỘC tuân theo):
- Mỗi đoạn văn: bọc trong <p>...</p>
- Danh sách: dùng <ul><li>...</li></ul> hoặc <ol><li>...</li></ol>
- KHÔNG viết "- item" hay "• item" dạng plain text
- Mỗi <li> phải là câu/đoạn đầy đủ ý nghĩa, không dùng fragment
- Sau mỗi <h2> hoặc <h3> phải có <p> hoặc <ul> ngay
```

### 1B. CSS trong `frontend/src/index.css` (hoặc class `.report-content`)

Đảm bảo có styling cho `.report-content ul li` và `.report-content ol li`:

```css
.report-content ul {
  list-style-type: disc;
  padding-left: 1.5rem;
  margin: 0.75rem 0;
}
.report-content ol {
  list-style-type: decimal;
  padding-left: 1.5rem;
  margin: 0.75rem 0;
}
.report-content li {
  margin-bottom: 0.5rem;
  line-height: 1.65;
}
.report-content p {
  margin-bottom: 0.75rem;
  line-height: 1.65;
}
.report-content h2 {
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
}
.report-content h3 {
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
}
```

Kiểm tra file `index.css` xem `.report-content` đã có styles này chưa — nếu chưa thì thêm vào. Nếu đã có thì bổ sung phần còn thiếu.

---

## FIX 2: Gamma Slides báo lỗi

**Vấn đề:** Gamma API key không được cấu hình (`GAMMA_API_KEY` env trống). Backend trả 400 "GAMMA_API_KEY chưa cấu hình". Nhưng Gamma thực ra không cần API key trực tiếp — app dùng Gamma import flow qua link, không gọi Gamma API.

**Kiểm tra:** Xem `backend/routes/reports.py` hàm `create_gamma()` (endpoint `/api/reports/gamma`) — đây là endpoint Gamma đang hoạt động cho Full Report. Content jobs dùng endpoint khác ở `backend/routes/content.py` → `request_gamma()`.

**Fix:** Sửa `backend/routes/content.py` → hàm `request_gamma()` để dùng cùng logic với `/api/reports/gamma`:

```python
@router.post("/job/{job_id}/gamma")
async def request_gamma(
    job_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger Gamma slide creation — dùng cùng logic với reports/gamma."""
    job = await db.get(ContentJob, job_id)
    if not job or job.status != "done" or not job.content_html:
        raise HTTPException(status_code=400, detail="Job chưa hoàn thành")

    num_cards = body.get("num_slides", 10)

    # Import và gọi cùng hàm _create_gamma_presentation từ routes/reports.py
    from backend.routes.reports import _create_gamma_presentation
    try:
        gamma_url = await _create_gamma_presentation(
            title=job.subject[:100],
            html_content=job.content_html,
            num_cards=num_cards,
        )
        job.gamma_url = gamma_url
        job.gamma_status = "done"
        await db.commit()
        return {"gamma_url": gamma_url}
    except Exception as e:
        job.gamma_status = "error"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Gamma error: {str(e)}")
```

**Đồng thời** — trong `backend/routes/reports.py`, refactor logic Gamma thành hàm `_create_gamma_presentation()` có thể import:

```python
async def _create_gamma_presentation(title: str, html_content: str, num_cards: int = 10) -> str:
    """
    Tạo Gamma presentation và trả về URL.
    Xem logic hiện tại trong endpoint /gamma để copy vào đây.
    """
    # Copy toàn bộ logic từ endpoint create_gamma() hiện tại vào đây
    # Trả về gamma_url string
    ...
```

> **Lưu ý:** Đọc kỹ code `create_gamma()` hiện tại trong `reports.py` trước khi refactor, giữ nguyên logic, chỉ extract ra thành helper function.

---

## FIX 3: Lưu thông tin model đã dùng

**Vấn đề:** Sau khi tạo xong content/report, không biết dùng model nào.

### 3A. Backend — `backend/content_generator.py`

Trong `run_content_job()`, sau khi `call_ai()` trả về result, lưu `model_used` vào DB:

```python
result = await call_ai(...)
html = result.get("content", "")
model_used_str = result.get("model_used", model_tier)  # e.g. "deepseek-reasoner", "claude-sonnet-4.6"
provider_used_str = result.get("provider_used", "")    # e.g. "deepseek", "claudible"

# Trong _update call cuối:
await _update(3, 3, "Hoàn thành!", status="done", html=html, citations=citations,
              model_used=model_used_str, provider_used=provider_used_str)
```

Sửa hàm `_update()` để nhận thêm params `model_used` và `provider_used`:
```python
async def _update(step, total, label, status="running", html=None, error=None,
                  citations=None, model_used=None, provider_used=None):
    job = await db.get(ContentJob, job_id)
    if not job: return
    # ... existing code ...
    if model_used is not None:
        job.model_used = model_used
    if provider_used is not None:
        job.provider_used = provider_used
    await db.commit()
```

### 3B. Model — `backend/models.py` → class `ContentJob`

Thêm 2 fields vào `ContentJob`:
```python
model_used = Column(String(100))      # e.g. "deepseek-reasoner"
provider_used = Column(String(50))    # e.g. "deepseek", "claudible", "anthropic"
```

### 3C. API response — `backend/routes/content.py` → `get_content_job()`

Thêm vào return dict:
```python
return {
    ...,
    "model_used": job.model_used or "",
    "provider_used": job.provider_used or "",
}
```

Và trong `list_content_history()`:
```python
return [{
    ...,
    "model_used": j.model_used or "",
    "created_at": ...,
}, ...]
```

### 3D. Frontend — `frontend/src/pages/ContentPage.jsx`

Trong state, thêm:
```js
const [modelUsed, setModelUsed] = useState('')
```

Trong polling handler, khi status done:
```js
if (data.model_used) setModelUsed(data.model_used)
```

Trong Result toolbar, hiển thị badge model:
```jsx
{modelUsed && (
  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
    🤖 {modelUsed}
  </span>
)}
```

Trong history list, hiển thị model nhỏ bên cạnh date:
```jsx
<span className="text-gray-400 text-xs shrink-0">{h.created_at}</span>
{h.model_used && (
  <span className="text-gray-300 text-xs shrink-0">{h.model_used}</span>
)}
```

### 3E. Full Report — đã có `model_used` chưa?

Kiểm tra `backend/routes/reports.py` và `frontend/src/pages/FullReport.jsx`:
- Nếu `Report` model đã có `model_used` field → đảm bảo hiển thị ở kết quả báo cáo
- Nếu chưa hiển thị → thêm badge nhỏ tương tự ContentPage

---

## FEATURE 4: Tab "Bài tham khảo" — Reference Library

### 4.1 Tổng quan

Tính năng cho phép user lưu trữ các bài viết/tài liệu hay để tham khảo sau, tổ chức theo loại thuế + hình thức bài. Từ đó có thể tạo Gamma slides.

**3 cách thêm bài:**
1. **Nhập URL** → server crawl và extract text
2. **Paste nội dung** → lưu trực tiếp
3. **Upload file** (PDF, DOCX, TXT) → extract text

**Auto-classify:** Nếu user không chọn tax_types / form_type → AI tự classify dựa trên nội dung.

### 4.2 DB Model — `backend/models.py`

Thêm class mới:

```python
class ReferenceArticle(Base):
    __tablename__ = "reference_articles"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Metadata
    title = Column(String(500), nullable=False)
    source_url = Column(Text, nullable=True)        # URL nếu crawl từ web
    source_type = Column(String(20), nullable=False, default="paste")
    # source_type: "url" | "paste" | "upload"

    # Content
    content_text = Column(Text)     # plain text (dùng cho classify + search)
    content_html = Column(Text)     # HTML nếu có (hiển thị đẹp hơn)
    char_count = Column(Integer, default=0)

    # Classification
    tax_types = Column(ARRAY(Text), default=list)   # ['TNDN', 'GTGT', ...]
    form_type = Column(String(50))
    # form_type values: "quick_research" | "full_report" | "analysis" | "press" | "scenario" | "advice" | "other"
    tags = Column(ARRAY(Text), default=list)         # user-defined tags

    # Auto-classify flag
    auto_classified = Column(Boolean, default=False)

    # Gamma
    gamma_url = Column(Text, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
```

Migration SQL — thêm vào `backend/migrations/`:
```sql
CREATE TABLE IF NOT EXISTS reference_articles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    title VARCHAR(500) NOT NULL,
    source_url TEXT,
    source_type VARCHAR(20) NOT NULL DEFAULT 'paste',
    content_text TEXT,
    content_html TEXT,
    char_count INTEGER DEFAULT 0,
    tax_types TEXT[] DEFAULT '{}',
    form_type VARCHAR(50),
    tags TEXT[] DEFAULT '{}',
    auto_classified BOOLEAN DEFAULT FALSE,
    gamma_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_articles_user ON reference_articles(user_id);
CREATE INDEX IF NOT EXISTS idx_ref_articles_tax_types ON reference_articles USING GIN(tax_types);
CREATE INDEX IF NOT EXISTS idx_ref_articles_form_type ON reference_articles(form_type);
```

### 4.3 Backend — `backend/routes/references.py` (file mới)

```python
router = APIRouter(prefix="/api/references", tags=["references"])

FORM_TYPES = ["quick_research", "full_report", "analysis", "press", "scenario", "advice", "other"]
FORM_TYPE_LABELS = {
    "quick_research": "Quick Research",
    "full_report": "Full Report",
    "analysis": "Bài phân tích",
    "press": "Bài báo",
    "scenario": "Tình huống thuế",
    "advice": "Thư tư vấn",
    "other": "Khác",
}
```

**Endpoints:**

```python
# POST /api/references/add — Thêm bài mới
class AddReferenceRequest(BaseModel):
    source_type: str          # "url" | "paste" | "upload"
    url: Optional[str]        # khi source_type = "url"
    content: Optional[str]    # khi source_type = "paste" (plain text hoặc HTML)
    title: Optional[str]      # nếu user điền, dùng luôn; nếu không → extract từ content/crawl
    tax_types: Optional[List[str]] = []      # nếu rỗng → auto-classify
    form_type: Optional[str] = ""           # nếu rỗng → auto-classify
    tags: Optional[List[str]] = []

@router.post("/add")
async def add_reference(body: AddReferenceRequest, user, db):
    """
    Xử lý theo source_type:
    - "url": crawl URL, extract title + text
    - "paste": dùng content trực tiếp, extract title từ <h1> hoặc dòng đầu
    - "upload": handled by /upload endpoint
    
    Sau đó:
    1. Clean HTML nếu có (strip scripts, ads, nav)
    2. Nếu tax_types rỗng hoặc form_type rỗng → gọi _auto_classify()
    3. Lưu DB → trả về article
    """
    ...

# POST /api/references/upload — Upload file
@router.post("/upload")
async def upload_reference(
    file: UploadFile,
    tax_types: str = Form(""),         # JSON string: '["TNDN"]'
    form_type: str = Form(""),
    tags: str = Form(""),
    title: str = Form(""),
    user, db
):
    """
    Extract text từ PDF/DOCX/TXT → lưu DB.
    tax_types/form_type/title có thể rỗng → auto-classify.
    """
    content = await file.read()
    filename = file.filename or ""
    extracted_title = title or filename
    
    if filename.lower().endswith(".pdf"):
        import io
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(content))
        text = "\n".join(page.extract_text() or "" for page in reader.pages[:20])
    elif filename.lower().endswith((".docx", ".doc")):
        from docx import Document
        doc = Document(io.BytesIO(content))
        text = "\n".join(p.text for p in doc.paragraphs)
    else:
        text = content.decode("utf-8", errors="ignore")
    
    # Extract title từ dòng đầu nếu chưa có
    if not extracted_title.strip() or extracted_title == filename:
        first_line = text.strip().split("\n")[0][:200].strip()
        if first_line:
            extracted_title = first_line
    
    # Parse form fields
    import json as _json
    tax_list = _json.loads(tax_types) if tax_types else []
    tags_list = _json.loads(tags) if tags else []
    
    # Auto-classify nếu cần
    auto_classified = False
    if not tax_list or not form_type:
        classified = await _auto_classify(text[:3000], extracted_title)
        if not tax_list:
            tax_list = classified.get("tax_types", [])
        if not form_type:
            form_type = classified.get("form_type", "other")
        auto_classified = True
    
    article = ReferenceArticle(
        user_id=user.id,
        title=extracted_title[:500],
        source_type="upload",
        content_text=text[:50000],
        char_count=len(text),
        tax_types=tax_list,
        form_type=form_type or "other",
        tags=tags_list,
        auto_classified=auto_classified,
    )
    db.add(article)
    await db.commit()
    await db.refresh(article)
    return _article_dict(article)


# GET /api/references — List with filters
@router.get("")
async def list_references(
    tax_type: Optional[str] = None,
    form_type: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    user, db
):
    q = select(ReferenceArticle).where(ReferenceArticle.user_id == user.id)
    if tax_type:
        q = q.where(ReferenceArticle.tax_types.contains([tax_type]))
    if form_type:
        q = q.where(ReferenceArticle.form_type == form_type)
    if search:
        search_pct = f"%{search}%"
        from sqlalchemy import or_
        q = q.where(or_(
            ReferenceArticle.title.ilike(search_pct),
            ReferenceArticle.content_text.ilike(search_pct),
        ))
    q = q.order_by(ReferenceArticle.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(q)
    return [_article_dict(a) for a in result.scalars().all()]


# GET /api/references/{id} — Get one
@router.get("/{article_id}")
async def get_reference(article_id: int, user, db):
    ...

# PATCH /api/references/{id} — Update metadata
class UpdateReferenceRequest(BaseModel):
    title: Optional[str]
    tax_types: Optional[List[str]]
    form_type: Optional[str]
    tags: Optional[List[str]]

@router.patch("/{article_id}")
async def update_reference(article_id: int, body: UpdateReferenceRequest, user, db):
    ...

# DELETE /api/references/{id}
@router.delete("/{article_id}")
async def delete_reference(article_id: int, user, db):
    ...

# POST /api/references/{id}/gamma — Tạo Gamma từ bài tham khảo
@router.post("/{article_id}/gamma")
async def reference_gamma(article_id: int, body: dict, user, db):
    article = await db.get(ReferenceArticle, article_id)
    if not article or not article.content_text:
        raise HTTPException(status_code=404, detail="Not found")
    
    num_cards = body.get("num_slides", 10)
    from backend.routes.reports import _create_gamma_presentation
    try:
        gamma_url = await _create_gamma_presentation(
            title=article.title[:100],
            html_content=article.content_html or article.content_text,
            num_cards=num_cards,
        )
        article.gamma_url = gamma_url
        await db.commit()
        return {"gamma_url": gamma_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gamma error: {str(e)}")
```

**Helper functions:**

```python
async def _crawl_url(url: str) -> dict:
    """Crawl URL, extract title + text + html. Return {"title": str, "text": str, "html": str}."""
    import httpx
    from bs4 import BeautifulSoup
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True,
                                     headers={"User-Agent": "Mozilla/5.0"}) as client:
            r = await client.get(url)
            r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        # Extract title
        title = ""
        if soup.title:
            title = soup.title.get_text().strip()
        if not title and soup.find("h1"):
            title = soup.find("h1").get_text().strip()
        # Remove noise
        for tag in soup(["script", "style", "nav", "header", "footer", "aside", "ins", "iframe"]):
            tag.decompose()
        # Get content div (try common selectors)
        content_div = (
            soup.find("article") or
            soup.find(id="content") or
            soup.find(class_="content") or
            soup.find("main") or
            soup.body
        )
        html = str(content_div) if content_div else str(soup.body or soup)
        text = content_div.get_text(separator="\n", strip=True) if content_div else ""
        return {"title": title[:500], "text": text[:50000], "html": html[:100000]}
    except Exception as e:
        return {"title": "", "text": "", "html": "", "error": str(e)}


async def _auto_classify(text: str, title: str = "") -> dict:
    """
    Dùng AI (haiku, nhanh + rẻ) để classify tax_types và form_type.
    Trả về {"tax_types": [...], "form_type": "..."}
    """
    from backend.ai_provider import call_ai
    prompt = f"""Phân loại bài viết thuế sau:

Tiêu đề: {title}
Nội dung (đầu bài): {text[:1500]}

Trả về JSON (không markdown):
{{
  "tax_types": [...],  // list từ: TNDN, GTGT, TNCN, FCT, TTDB, XNK, TP, HKD, QLT, HOA_DON, THUE_QT
  "form_type": "..."   // một trong: quick_research, full_report, analysis, press, scenario, advice, other
}}

Chỉ trả JSON thuần, không giải thích."""
    
    try:
        result = await call_ai(
            messages=[{"role": "user", "content": prompt}],
            system="Bạn là classifier văn bản thuế. Chỉ trả JSON.",
            model_tier="haiku",  # Dùng haiku cho tốc độ
            max_tokens=200,
        )
        import json as _json, re
        content = result.get("content", "")
        # Strip markdown nếu có
        content = re.sub(r'^```json?\n?', '', content.strip())
        content = re.sub(r'\n?```$', '', content)
        data = _json.loads(content)
        return {
            "tax_types": [t for t in data.get("tax_types", []) if t in 
                         ["TNDN","GTGT","TNCN","FCT","TTDB","XNK","TP","HKD","QLT","HOA_DON","THUE_QT"]],
            "form_type": data.get("form_type", "other") if data.get("form_type") in
                        ["quick_research","full_report","analysis","press","scenario","advice","other"]
                        else "other",
        }
    except Exception:
        return {"tax_types": [], "form_type": "other"}


def _article_dict(a: ReferenceArticle) -> dict:
    return {
        "id": a.id,
        "title": a.title,
        "source_url": a.source_url,
        "source_type": a.source_type,
        "tax_types": a.tax_types or [],
        "form_type": a.form_type or "other",
        "tags": a.tags or [],
        "auto_classified": a.auto_classified,
        "char_count": a.char_count or 0,
        "gamma_url": a.gamma_url,
        "created_at": a.created_at.strftime("%d/%m/%Y %H:%M") if a.created_at else "",
        # Không trả content_text/html trong list để nhẹ — chỉ trả khi GET /{id}
    }
```

**Đăng ký router trong `main.py`:**
```python
from backend.routes.references import router as references_router
app.include_router(references_router)
```

**Thêm vào `requirements.txt`** (nếu chưa có):
```
pypdf>=3.0.0
python-docx>=0.8.11
```
(Đã có từ v2 brief — kiểm tra, chỉ thêm nếu thiếu.)

### 4.4 Frontend — `frontend/src/pages/References.jsx` (file mới)

**State:**
```js
const [articles, setArticles] = useState([])
const [selected, setSelected] = useState(null)
const [loading, setLoading] = useState(false)
const [addMode, setAddMode] = useState('url')   // 'url' | 'paste' | 'upload'
const [urlInput, setUrlInput] = useState('')
const [pasteInput, setPasteInput] = useState('')
const [pasteTitle, setPasteTitle] = useState('')
const [uploadFile, setUploadFile] = useState(null)
const [filterTax, setFilterTax] = useState('')
const [filterForm, setFilterForm] = useState('')
const [search, setSearch] = useState('')
const [adding, setAdding] = useState(false)
const [editMode, setEditMode] = useState(false)
const [numSlides, setNumSlides] = useState(10)
const [gammaLoading, setGammaLoading] = useState(false)
```

**Layout: 2-panel (list trái, detail phải)**

```jsx
<div className="p-6 max-w-6xl mx-auto">
  <div className="flex items-center justify-between mb-4">
    <h1>📎 Bài tham khảo</h1>
    <button onClick={() => setShowAdd(!showAdd)}>+ Thêm bài</button>
  </div>
  
  {/* Add panel */}
  {showAdd && <AddPanel ... />}
  
  {/* Filters */}
  <FilterBar filterTax={filterTax} filterForm={filterForm} search={search} ... />
  
  {/* 2-panel */}
  <div className="flex gap-4">
    <ArticleList articles={filtered} selected={selected} onSelect={setSelected} ... />
    <ArticleDetail article={selected} ... />
  </div>
</div>
```

**Add Panel** — tabs: URL / Paste / Upload:
```jsx
function AddPanel({ onAdd }) {
  // Tab: URL
  // - input URL + nút "Crawl & Lưu"
  // - Spinner khi đang crawl
  
  // Tab: Paste
  // - input Title (optional — placeholder "Để trống để tự detect")
  // - textarea nội dung
  // - tax_types pills (optional)
  // - form_type select (optional)
  // - nút Lưu
  
  // Tab: Upload
  // - drag-drop zone (hoặc file input — PDF/DOCX/TXT)
  // - title input (optional)
  // - tax_types + form_type (optional)
  // - nút Upload
  
  // Sau khi thêm thành công: hiện badge "auto-classified" nếu AI tự classify
}
```

**Filter Bar:**
```jsx
// Dropdown hoặc pills: Tất cả loại thuế | TNDN | GTGT | ...
// Dropdown: Tất cả hình thức | Quick Research | Full Report | ...
// Search input: tìm theo tiêu đề/nội dung
```

**Article List** — mỗi item:
```jsx
<div onClick={() => setSelected(article)}>
  <div className="font-medium text-sm truncate">{article.title}</div>
  <div className="flex gap-1 mt-1 flex-wrap">
    {article.tax_types.map(t => <span key={t} className="badge">{t}</span>)}
    <span className="badge-outline">{FORM_TYPE_LABELS[article.form_type]}</span>
    {article.auto_classified && <span className="text-xs text-gray-400">🤖 auto</span>}
  </div>
  <div className="text-xs text-gray-400">{article.created_at}</div>
</div>
```

**Article Detail** — panel phải:
```jsx
function ArticleDetail({ article, onDelete, onUpdate }) {
  // Header: title (editable), source_url link, badges
  // Edit button → inline edit tax_types + form_type + tags
  // Content: render content_html (nếu có) hoặc content_text dạng pre-wrap
  // Actions: 
  //   - 🗑️ Xoá
  //   - ✨ Tạo Gamma Slides (num_slides input + button)
  //   - Gamma URL link nếu đã tạo
}
```

### 4.5 API calls — thêm vào `frontend/src/api.js`

```js
// References
listReferences: (params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([,v]) => v)).toString()
  return request('GET', `/references${q ? '?' + q : ''}`)
},
addReference: (data) => request('POST', '/references/add', data),
uploadReference: async (file, meta = {}) => {
  const form = new FormData()
  form.append('file', file)
  form.append('tax_types', JSON.stringify(meta.tax_types || []))
  form.append('form_type', meta.form_type || '')
  form.append('tags', JSON.stringify(meta.tags || []))
  form.append('title', meta.title || '')
  const token = getToken()
  const res = await fetch(`${BASE}/references/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Upload failed')
  }
  return res.json()
},
getReference: (id) => request('GET', `/references/${id}`),
updateReference: (id, data) => request('PATCH', `/references/${id}`, data),
deleteReference: (id) => request('DELETE', `/references/${id}`),
referenceGamma: (id, numSlides) => request('POST', `/references/${id}/gamma`, { num_slides: numSlides }),
```

### 4.6 Routing & Nav

**`frontend/src/App.jsx`** — thêm route:
```jsx
import References from './pages/References.jsx'
// ...
<Route path="references" element={<References />} />
```

**`frontend/src/components/Layout.jsx`** — thêm nav item sau "Thư Tư vấn":
```js
{ to: '/references', label: 'Bài tham khảo', icon: '📎' },
```

---

## FEATURE 5: Filter & Search trong History của từng module

**Vấn đề:** Khi history nhiều bài, khó tìm lại.

### 5A. Backend — `backend/routes/content.py` → `list_content_history()`

Thêm query params:
```python
@router.get("/history")
async def list_content_history(
    content_type: Optional[str] = None,
    search: Optional[str] = None,
    tax_type: Optional[str] = None,
    limit: int = 50,
    user, db
):
    q = select(ContentJob).where(
        ContentJob.user_id == user.id,
        ContentJob.status == "done",
    ).order_by(ContentJob.created_at.desc()).limit(limit)
    
    if content_type:
        q = q.where(ContentJob.content_type == content_type)
    if search:
        q = q.where(ContentJob.subject.ilike(f"%{search}%"))
    if tax_type:
        q = q.where(ContentJob.tax_types.contains([tax_type]))
    
    result = await db.execute(q)
    # ...
```

### 5B. API call update — `frontend/src/api.js`

```js
getContentHistory: (contentType, params = {}) => {
  const q = new URLSearchParams({ content_type: contentType, ...params }).toString()
  return request('GET', `/content/history?${q}`)
},
```

### 5C. Frontend — `frontend/src/pages/ContentPage.jsx` → History section

Thay thế history dropdown hiện tại bằng panel có filter + search:

```jsx
{showHistory && (
  <div className="mt-2 border border-gray-200 rounded-lg bg-white shadow-sm">
    {/* Filter bar */}
    <div className="flex gap-2 p-2 border-b border-gray-100">
      <input
        type="text"
        value={historySearch}
        onChange={e => { setHistorySearch(e.target.value); debouncedLoadHistory() }}
        placeholder="Tìm theo chủ đề..."
        className="flex-1 border rounded px-2 py-1 text-xs"
      />
      <select
        value={historyTaxFilter}
        onChange={e => { setHistoryTaxFilter(e.target.value); loadHistory(e.target.value, historySearch) }}
        className="border rounded px-2 py-1 text-xs"
      >
        <option value="">Tất cả thuế</option>
        {TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    </div>
    
    {/* List */}
    <div className="max-h-72 overflow-y-auto divide-y">
      {history.map(h => (
        <div key={h.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
             onClick={() => loadFromHistory(h.id)}>
          <span className="flex-1 truncate">{h.subject}</span>
          {h.model_used && <span className="text-xs text-gray-300 shrink-0">{h.model_used}</span>}
          <span className="text-gray-400 text-xs shrink-0">{h.created_at}</span>
        </div>
      ))}
      {history.length === 0 && <div className="p-4 text-center text-gray-400 text-sm">Không tìm thấy</div>}
    </div>
  </div>
)}
```

Thêm state: `historySearch`, `historyTaxFilter`

Sửa `loadHistory()` để nhận search + taxFilter params:
```js
async function loadHistory(taxFilter = historyTaxFilter, searchTerm = historySearch) {
  try {
    const params = {}
    if (taxFilter) params.tax_type = taxFilter
    if (searchTerm) params.search = searchTerm
    const data = await api.getContentHistory(contentType, params)
    setHistory(data)
    // Auto-resume logic giữ nguyên
  } catch (_) {}
}
```

---

## FEATURE 6: Tab "Lịch sử" ở sidebar — xuống dưới cùng + Filter/Search nâng cao

### 6A. `frontend/src/components/Layout.jsx` — Di chuyển Lịch sử xuống cuối

Trong `const NAV = [...]`, di chuyển item `/reports` xuống dưới tất cả các nav item, trước `tax-docs` và `settings`:

```js
const NAV = [
  { to: '/', label: 'Dashboard', icon: '🏠', exact: true },
  { to: '/quick-research', label: 'Quick Research', icon: '🔍' },
  { to: '/full-report', label: 'Full Report', icon: '📊' },
  { to: '/scenario', label: 'Tình huống Thuế', icon: '🎯' },
  { to: '/analysis', label: 'Bài Phân tích', icon: '📝' },
  { to: '/press-article', label: 'Bài Viết Báo', icon: '📰' },
  { to: '/tax-advice', label: 'Thư Tư vấn', icon: '✉️' },
  { to: '/references', label: 'Bài tham khảo', icon: '📎' },   // Feature 4
  { to: '/tax-docs', label: 'Văn bản', icon: '📚', adminOnly: true },
  { to: '/settings', label: 'Cài đặt', icon: '⚙️' },
  { to: '/reports', label: 'Lịch sử', icon: '📁' },             // ← xuống dưới cùng
]
```

### 6B. `frontend/src/pages/Reports.jsx` — Nâng cấp filter + search

**State hiện tại:** chỉ có `filter` theo report_type.

**Nâng cấp:**
```js
const [filterType, setFilterType] = useState('')     // 'quick' | 'full' | 'scenario' | 'analysis' | 'press' | 'advice' | ''
const [filterTax, setFilterTax] = useState('')       // 'TNDN' | 'GTGT' | ...
const [search, setSearch] = useState('')             // search theo subject/title
const [dateFrom, setDateFrom] = useState('')
const [dateTo, setDateTo] = useState('')
```

**Backend — cập nhật `backend/routes/reports.py` → endpoint `GET /api/reports`:**

Thêm query params: `report_type`, `search`, `tax_type`, `date_from`, `date_to`, `limit`:
```python
@router.get("")
async def list_reports(
    report_type: Optional[str] = None,
    search: Optional[str] = None,
    tax_type: Optional[str] = None,
    date_from: Optional[str] = None,  # format: YYYY-MM-DD
    date_to: Optional[str] = None,
    limit: int = 50,
    user, db
):
    # Query reports + content jobs combined? Hoặc chỉ reports
    # Reports table lưu: quick research + full reports
    # ContentJobs lưu: scenario, analysis, press, advice
    # → Cần unified view
    ...
```

**Unified history — lấy từ cả 2 bảng:**

Backend trả về unified list (both `reports` table cho quick/full, và `content_jobs` table cho scenario/analysis/press/advice):

```python
@router.get("")
async def list_reports(
    report_type: Optional[str] = None,
    search: Optional[str] = None,
    tax_type: Optional[str] = None,
    limit: int = 50,
    user, db
):
    results = []
    
    # From reports table (quick research + full reports)
    if not report_type or report_type in ("quick", "full"):
        q = select(Report).where(Report.user_id == user.id)
        if report_type:
            q = q.where(Report.report_type == report_type)
        if search:
            q = q.where(Report.subject.ilike(f"%{search}%"))
        if tax_type:
            q = q.where(Report.tax_types.contains([tax_type]))
        q = q.order_by(Report.created_at.desc()).limit(limit)
        r = await db.execute(q)
        for row in r.scalars().all():
            results.append({
                "id": str(row.id),
                "source": "report",
                "report_type": row.report_type,
                "subject": row.subject[:100],
                "tax_types": row.tax_types or [],
                "model_used": row.model_used or "",
                "created_at": row.created_at.isoformat() if row.created_at else "",
                "created_at_fmt": row.created_at.strftime("%d/%m/%Y %H:%M") if row.created_at else "",
            })
    
    # From content_jobs table
    content_type_filter = None
    if report_type and report_type not in ("quick", "full"):
        content_type_filter = report_type
    
    if not report_type or report_type not in ("quick", "full"):
        q = select(ContentJob).where(
            ContentJob.user_id == user.id,
            ContentJob.status == "done",
        )
        if content_type_filter:
            q = q.where(ContentJob.content_type == content_type_filter)
        if search:
            q = q.where(ContentJob.subject.ilike(f"%{search}%"))
        if tax_type:
            q = q.where(ContentJob.tax_types.contains([tax_type]))
        q = q.order_by(ContentJob.created_at.desc()).limit(limit)
        r = await db.execute(q)
        for row in r.scalars().all():
            results.append({
                "id": row.id,
                "source": "content",
                "report_type": row.content_type,
                "subject": row.subject[:100],
                "tax_types": row.tax_types or [],
                "model_used": row.model_used or "",
                "created_at": row.created_at.isoformat() if row.created_at else "",
                "created_at_fmt": row.created_at.strftime("%d/%m/%Y %H:%M") if row.created_at else "",
            })
    
    # Sort by created_at desc
    results.sort(key=lambda x: x["created_at"], reverse=True)
    return results[:limit]
```

**Frontend `Reports.jsx` — giao diện mới:**

```jsx
export default function Reports() {
  // Filter bar trên cùng (horizontal)
  // - Search input (tìm theo chủ đề)
  // - Filter loại: Tất cả | Quick Research | Full Report | Tình huống | Bài phân tích | Bài báo | Thư tư vấn
  // - Filter thuế: Tất cả | TNDN | GTGT | ...
  
  // List bên trái, detail bên phải (giống Reports hiện tại)
  // Item hiển thị: subject, loại badge, tax_types badges, model, date
  
  // Khi click item:
  // - Nếu source = "report" → gọi api.getReport(id) → hiện content_html
  // - Nếu source = "content" → gọi api.getContentJob(id) → hiện content_html
  
  // Load item:
  async function viewItem(item) {
    try {
      let data
      if (item.source === 'report') {
        data = await api.getReport(Number(item.id))
        setSelected({ ...item, content_html: data.content_html })
      } else {
        data = await api.getContentJob(item.id)
        setSelected({ ...item, content_html: data.content_html })
      }
    } catch {}
  }
}
```

**Type labels map:**
```js
const TYPE_LABELS = {
  quick: '⚡ Quick Research',
  full: '📊 Full Report',
  scenario: '🎯 Tình huống',
  analysis: '📝 Phân tích',
  press: '📰 Bài báo',
  advice: '✉️ Tư vấn',
}
```

---

## FEATURE 7: Full Report — Chỉ auto anchor cho 2 sections mặc định

**Vấn đề hiện tại:** `SECTOR_SECTIONS` trong `backend/config.py` có `tax_aware: True` cho nhiều sections (s4, s5, s6, s7). User muốn chỉ s4 và s5 mặc định anchor ON, còn lại OFF.

Tương tự, khi user thêm section MỚI qua "+ Thêm mục" trong UI, mặc định phải là `tax_aware: false`.

### 7A. `backend/config.py` — Sửa SECTOR_SECTIONS

```python
SECTOR_SECTIONS = [
    {"id": "s1", "title": "Tổng quan về ngành/doanh nghiệp", "enabled": True, "tax_aware": False, ...},
    {"id": "s2", "title": "Đặc thù kinh doanh", "enabled": True, "tax_aware": False, ...},
    {"id": "s3", "title": "Các quy định pháp lý", "enabled": True, "tax_aware": False, ...},  # ← đổi False
    {"id": "s4", "title": "Phân tích các loại thuế áp dụng", "enabled": True, "tax_aware": True, ...},  # ← GIỮ True
    {"id": "s5", "title": "Các vấn đề thuế đặc thù", "enabled": True, "tax_aware": True, ...},  # ← GIỮ True
    {"id": "s6", "title": "Thông lệ thuế quốc tế", "enabled": True, "tax_aware": False, ...},  # ← đổi False
    {"id": "s7", "title": "Khuyến nghị & Kết luận", "enabled": True, "tax_aware": False, ...},  # ← đổi False
]
```

Tương tự cho `COMPANY_SECTIONS` (c4, c5 là tax-heavy → giữ True; các section khác → False):
```python
# c1, c2, c3 → tax_aware: False (đã đúng)
# c4 "Phân tích tài chính & gánh nặng thuế" → tax_aware: True  (giữ)
# c5 "Rủi ro thuế đặc thù" → tax_aware: True  (giữ)
# c6 "Tuân thủ & quản trị thuế" → tax_aware: False  (đổi)
# c7 "Khuyến nghị chiến lược thuế" → tax_aware: False  (đổi)
```

### 7B. `frontend/src/pages/FullReport.jsx` — DEFAULT_SECTIONS

Tìm `const DEFAULT_SECTIONS = [...]` và đồng bộ với config.py:
```js
const DEFAULT_SECTIONS = [
  { id: 's1', ..., tax_aware: false },
  { id: 's2', ..., tax_aware: false },
  { id: 's3', ..., tax_aware: false },  // ← đổi false
  { id: 's4', ..., tax_aware: true },   // ← GIỮ true
  { id: 's5', ..., tax_aware: true },   // ← GIỮ true
  { id: 's6', ..., tax_aware: false },  // ← đổi false
  { id: 's7', ..., tax_aware: false },  // ← đổi false
]
```

### 7C. Thêm section mới mặc định `tax_aware: false`

Tìm hàm `addSection()` trong `FullReport.jsx`:
```js
function addSection() {
  const newSec = {
    id: `custom_${Date.now()}`,
    title: 'Mục mới',
    enabled: true,
    tax_aware: false,   // ← MẶC ĐỊNH OFF
    sub: [],
  }
  setSections(prev => [...prev, newSec])
}
```

---

## TÓM TẮT FILES CẦN THAY ĐỔI

| File | Thay đổi |
|------|----------|
| `backend/config.py` | s3/s6/s7 → tax_aware: False; c6/c7 → tax_aware: False |
| `backend/models.py` | Thêm model_used/provider_used vào ContentJob; thêm class ReferenceArticle |
| `backend/content_generator.py` | Lưu model_used; thêm HTML formatting rules vào prompts |
| `backend/routes/content.py` | Fix Gamma (dùng _create_gamma_presentation); trả model_used; history filter |
| `backend/routes/reports.py` | Refactor Gamma thành _create_gamma_presentation(); unified list endpoint |
| `backend/routes/references.py` | File MỚI — 7 endpoints |
| `frontend/src/index.css` | Thêm CSS cho .report-content ul/ol/li/p |
| `frontend/src/pages/ContentPage.jsx` | Hiển thị model_used; history search/filter |
| `frontend/src/pages/FullReport.jsx` | DEFAULT_SECTIONS fix; addSection mặc định tax_aware:false |
| `frontend/src/pages/Reports.jsx` | Unified history + filter nâng cao |
| `frontend/src/pages/References.jsx` | File MỚI |
| `frontend/src/App.jsx` | Thêm route /references |
| `frontend/src/components/Layout.jsx` | Reorder NAV; thêm /references |
| `frontend/src/api.js` | Thêm reference APIs; update history APIs |

---

## CHECKLIST SAU KHI IMPLEMENT

- [ ] Bullet points trong Tình huống Thuế hiển thị đúng (có spacing, không dính nhau)
- [ ] CSS .report-content áp dụng cho ContentPage, FullReport, QuickResearch
- [ ] Gamma hoạt động cho content jobs (không báo lỗi GAMMA_API_KEY)
- [ ] Badge model hiển thị sau khi tạo xong
- [ ] Tab References: URL crawl OK, Paste OK, Upload PDF/DOCX OK
- [ ] References: auto-classify hiển thị badge "🤖 auto"
- [ ] References: filter theo loại thuế + hình thức
- [ ] References: Gamma button hoạt động
- [ ] History trong module: search + tax filter
- [ ] Tab Lịch sử trong sidebar: xuống dưới cùng
- [ ] Lịch sử unified: hiện cả quick/full reports lẫn content jobs
- [ ] Lịch sử: filter theo loại + thuế + search
- [ ] Full Report: chỉ s4/s5 (và c4/c5) mặc định anchor ON
- [ ] Section mới thêm: mặc định anchor OFF
- [ ] Migration SQL cho reference_articles đã tạo file

---

## GHI CHÚ QUAN TRỌNG

1. **Gamma fix** — Đọc kỹ code `create_gamma()` hiện tại trong `reports.py` trước khi refactor. Mục tiêu là extract thành `_create_gamma_presentation()` để có thể tái sử dụng, không phải viết lại.

2. **Migration** — Chỉ tạo file SQL trong `backend/migrations/` (như các file trước), KHÔNG tự chạy. Để admin chạy thủ công khi deploy.

3. **Unified Reports list** — Reports.jsx hiện tại chỉ list từ `reports` table. Cần thêm ContentJob vào. Tuy nhiên nếu load lại item thì dùng `api.getContentJob()` cho source=content và `api.getReport()` cho source=report.

4. **pypdf/python-docx** — Kiểm tra requirements.txt xem đã có chưa trước khi thêm.

5. **Sau khi implement xong:** commit, push, báo deploy.
