# BRIEF: taxconsult v2 — New Tax Types + 4 New Content Features

**Mục tiêu:** Bổ sung 3 sắc thuế còn thiếu + thêm 4 tính năng tạo nội dung mới  
**Stack:** Python/FastAPI backend, React/Vite frontend (JSX, Tailwind, không dùng TypeScript)  
**Repo:** phanvuhoang/taxconsult  
**Reference:** phanvuhoang/taxadvice (TypeScript/Node — đọc để tham khảo prompts và logic)

---

## PHẦN 1: Bổ sung 3 sắc thuế còn thiếu

### 1.1 Backend — `backend/doc_context.py`

Trong dict `SAC_THUE_MAP`, thêm 2 entries còn thiếu:

```python
SAC_THUE_MAP = {
    ...existing entries...,
    "HOA_DON": ["HOA_DON"],
    "THUE_QT": ["THUE_QT"],
}
```

> Lưu ý: `QLT` đã có rồi, chỉ thêm `HOA_DON` và `THUE_QT`.

### 1.2 Frontend — Mọi nơi có `TAX_TYPES` constant

Tìm tất cả file có `const TAX_TYPES = [...]` và thêm 3 mục vào cuối:
- `frontend/src/pages/FullReport.jsx`
- `frontend/src/pages/QuickResearch.jsx`
- Các page mới (xem Phần 2 bên dưới)

```js
const TAX_TYPES = ['TNDN', 'GTGT', 'TNCN', 'FCT', 'TTDB', 'XNK', 'TP', 'HKD', 'QLT', 'HOA_DON', 'THUE_QT']
```

Tương ứng label hiển thị:
- `QLT` → "Quản lý Thuế"
- `HOA_DON` → "Hóa đơn"  
- `THUE_QT` → "Thuế Quốc tế"

---

## PHẦN 2: 4 Tính năng tạo nội dung mới

### 2.0 Kiến trúc chung — tất cả 4 tính năng đều dùng chung pattern

**Backend pattern** (giống Quick Research nhưng save vào bảng `content_outputs`):
- POST `/content/{feature_type}` → tạo job → background task → stream SSE → save DB
- GET `/content/history?type={feature_type}` → list history
- GET `/content/{id}` → load một output
- DELETE `/content/{id}` → xóa
- POST `/content/{id}/cancel` → huỷ job đang chạy
- POST `/content/{id}/gamma` → tạo Gamma slides

**Frontend pattern** — Mỗi tính năng là 1 page React, dùng chung component `ContentFeature.jsx`.

**UX giống Full Report:**
- Progress bar khi đang tạo
- Resume tự động khi vào lại trang (check job còn running không)
- Lưu tự động vào DB khi xong
- History panel: list các output cũ, click để load lại
- Khi xem output (vừa tạo hoặc load từ history): hiển thị nút **"✨ Tạo Gamma Slides"** + input số slides (mặc định riêng từng feature — xem bên dưới)

### 2.1 DB Schema — thêm bảng mới `content_outputs`

Thêm vào `backend/models.py`:

```python
class ContentOutput(Base):
    __tablename__ = "content_outputs"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    feature_type = Column(String(30), nullable=False)
    # 'scenario' | 'article' | 'press_article' | 'tax_advice'
    title = Column(String(500), nullable=False)
    input_data = Column(JSONB)        # lưu toàn bộ form input để resume/display
    content_html = Column(Text)
    citations = Column(JSONB, default=list)
    model_used = Column(String(100))
    duration_ms = Column(Integer)
    gamma_url = Column(Text, nullable=True)
    style_references = Column(ARRAY(Text), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
```

Thêm migration SQL vào `backend/migrations/`:
```sql
CREATE TABLE IF NOT EXISTS content_outputs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    feature_type VARCHAR(30) NOT NULL,
    title VARCHAR(500) NOT NULL,
    input_data JSONB,
    content_html TEXT,
    citations JSONB DEFAULT '[]',
    model_used VARCHAR(100),
    duration_ms INTEGER,
    gamma_url TEXT,
    style_references TEXT[],
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2.2 Backend — `backend/content_generator.py` (file mới)

Viết module chung xử lý cả 4 feature types:

```python
FEATURE_PROMPTS = {
    "scenario": get_scenario_prompt,    # Tình huống thuế
    "article": get_article_prompt,      # Bài phân tích chuyên sâu
    "press_article": get_press_article_prompt,  # Bài viết báo
    "tax_advice": get_tax_advice_prompt,        # Thư tư vấn
}
```

**Các prompt functions** — dịch từ taxadvice/server/ai.ts sang Python.  
Đặt trong `backend/content_prompts.py` (file mới):

#### `get_scenario_prompt(context, perplexity_ctx, style_ctx)`
Tham khảo `getScenarioPrompt()` trong taxadvice/server/ai.ts (đã đọc ở trên).  
Output format:
```
## Phân tích tình huống
## Căn cứ pháp lý (trích dẫn điều khoản cụ thể)
## Hướng xử lý
## Lưu ý
## Nguồn tham khảo
```

#### `get_article_prompt(context, perplexity_ctx, style_ctx)`
Bài phân tích chuyên sâu, 1500-3000 từ. Format:
```
# [Tiêu đề]
## I. Căn cứ pháp lý
## II. Nội dung phân tích (trích dẫn điều khoản)
## III. Ví dụ thực tế (số liệu, case study)
## IV. Lưu ý quan trọng
## V. Kết luận
## Nguồn tham khảo
```

#### `get_press_article_prompt(context, perplexity_ctx, style_ctx)`
Bài báo phong cách storytelling, 800-1500 từ. Mở đầu bằng tình huống/câu chuyện thực tế.

#### `get_tax_advice_prompt(context, perplexity_ctx, style_ctx, client_name, company_name)`
Thư tư vấn chuyên nghiệp (professional tax advice letter), 1-2 trang A4. Format:
```
# THƯ TƯ VẤN THUẾ
Kính gửi: [client_name] ([company_name])
V/v: [vấn đề]
Ngày: [hôm nay]
---
## I. Vấn đề được tư vấn
## II. Căn cứ pháp lý
## III. Ý kiến tư vấn
## IV. Khuyến nghị
## Nguồn tham khảo
```

**Lưu ý quan trọng cho TẤT CẢ prompts:**  
Copy y nguyên `SECTION_SYSTEM` từ `backend/report_generator.py` làm system prompt:
- Bắt buộc ưu tiên văn bản được cung cấp > training data
- Citation-First: trích dẫn điều khoản cụ thể (Điều X, Khoản Y, [Số hiệu VB])
- ⛔ Không bịa số hiệu văn bản không có trong danh sách

**Style references** — `fetch_style_content(url)` async function:
```python
async def fetch_style_content(url: str) -> str:
    """Fetch URL content và extract text (tối đa 3000 chars). Skip nếu lỗi."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"}, follow_redirects=True)
            r.raise_for_status()
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(r.text, "html.parser")
        for tag in soup(["script","style","nav","header","footer","aside"]):
            tag.decompose()
        return soup.get_text(separator="\n", strip=True)[:3000]
    except Exception:
        return ""

async def build_style_context(style_references: list[str]) -> str:
    """Build style context string từ list URLs/text."""
    if not style_references:
        return ""
    parts = []
    for ref in style_references[:5]:
        if ref.startswith("http://") or ref.startswith("https://"):
            content = await fetch_style_content(ref)
            if content:
                parts.append(f"--- Bài mẫu từ {ref} ---\n{content}")
        else:
            parts.append(f"--- Bài mẫu ---\n{ref[:3000]}")
    return "\n\n".join(parts)
```

**Main generate function:**
```python
async def generate_content(
    feature_type: str,
    main_input: str,          # scenario text / topic / etc.
    tax_types: list[str],
    model_tier: str,
    style_references: list[str],
    sonar_model: str,
    client_name: str = "",    # chỉ dùng cho tax_advice
    company_name: str = "",   # chỉ dùng cho tax_advice
    user_id: int = None,
    db = None,
    dbvntax_db = None,
) -> dict:
    """
    Generate content cho 1 trong 4 feature types.
    Returns: {"content_html": str, "citations": list, "model_used": str, "duration_ms": int}
    """
    import time
    start = time.time()
    
    # Step 1: Gather context (parallel) — dùng get_relevant_docs_semantic + perplexity_search_legal
    semantic_query = f"{main_input} {' '.join(tax_types)}"
    
    perp_task = perplexity_search_legal(
        f"{main_input} thuế Việt Nam 2024 2025 2026",
        sonar_model
    )
    docs_task = get_relevant_docs_semantic(
        dbvntax_db, query=semantic_query, tax_types=tax_types, top_k=5
    ) if dbvntax_db else asyncio.coroutine(lambda: "")()
    cv_task = get_relevant_congvan(
        dbvntax_db, tax_types, keywords=main_input.split()[:5]
    ) if dbvntax_db else asyncio.coroutine(lambda: "")()
    style_task = build_style_context(style_references)
    
    perp_result, docs_ctx, cv_ctx, style_ctx = await asyncio.gather(
        perp_task, docs_task, cv_task, style_task, return_exceptions=True
    )
    
    # Handle results
    if isinstance(perp_result, dict):
        perp_ctx = perp_result.get("content", "")
        citations = perp_result.get("citations", [])
    else:
        perp_ctx = ""
        citations = []
    docs_ctx = docs_ctx if isinstance(docs_ctx, str) else ""
    cv_ctx = cv_ctx if isinstance(cv_ctx, str) else ""
    style_ctx = style_ctx if isinstance(style_ctx, str) else ""
    
    # Step 2: Build context string
    context_parts = [p for p in [docs_ctx, cv_ctx] if p]
    full_context = "\n\n".join(context_parts) or "Không có văn bản cụ thể từ database."
    
    # Step 3: Get prompt
    prompt_fn = FEATURE_PROMPTS.get(feature_type)
    if not prompt_fn:
        raise ValueError(f"Unknown feature_type: {feature_type}")
    
    if feature_type == "tax_advice":
        prompt = prompt_fn(full_context, perp_ctx, style_ctx, client_name, company_name)
    else:
        prompt = prompt_fn(full_context, perp_ctx, style_ctx)
    
    # Step 4: Call AI (non-streaming for simplicity)
    result = await call_ai(
        messages=[{"role": "user", "content": main_input}],
        system=prompt,
        model_tier=model_tier,
        max_tokens=6000,
    )
    
    content_md = result.get("content", "")
    # Convert markdown to HTML
    import markdown
    content_html = markdown.markdown(
        content_md,
        extensions=["tables", "fenced_code", "nl2br"]
    )
    
    duration_ms = int((time.time() - start) * 1000)
    
    return {
        "content_html": content_html,
        "citations": citations,
        "model_used": result.get("model_used", ""),
        "duration_ms": duration_ms,
    }
```

### 2.3 Backend — `backend/routes/content.py` (file mới)

```python
router = APIRouter(prefix="/content", tags=["content"])

@router.post("/{feature_type}")
async def create_content(feature_type, body, user, db, dbvntax_db):
    """Tạo content job, chạy background, trả job_id."""
    # Validate feature_type in ["scenario","article","press_article","tax_advice"]
    # Tạo job record trong content_outputs (status pending)
    # Background task: generate_content() → update record
    # Return job_id ngay

@router.get("/job/{job_id}")
async def get_content_job(job_id, user, db):
    """Poll job status — tương tự /reports/job/{id}."""
    # Auto-timeout 20 phút
    # Return: {status, content_html, model_used, duration_ms, citations, output_id}

@router.post("/job/{job_id}/cancel")
async def cancel_content_job(job_id, user, db):
    """Huỷ job stuck."""

@router.get("/history")
async def list_content_history(feature_type, user, db):
    """List history cho 1 feature type, limit 20, order by created_at DESC."""
    
@router.get("/{output_id}")
async def get_content_output(output_id, user, db):
    """Load 1 output."""

@router.delete("/{output_id}")
async def delete_content_output(output_id, user, db):
    """Xoá output."""

@router.post("/{output_id}/gamma")
async def create_gamma(output_id, body, user, db):
    """Trigger tạo Gamma slides. Body: {num_cards: int}
    Dùng lại api.createGamma() đã có trong reports route."""
```

**Thêm router vào `backend/main.py`:**
```python
from backend.routes.content import router as content_router
app.include_router(content_router, prefix="/api")
```

**Cũng thêm job tracking** — dùng lại bảng `content_outputs` với thêm cột:
```python
# Thêm vào model ContentOutput:
job_status = Column(String(20), default="done")  # pending|running|done|error
job_error = Column(Text, nullable=True)
job_started_at = Column(DateTime, nullable=True)
```

### 2.4 Frontend — `frontend/src/components/ContentFeature.jsx` (component mới)

Component tái sử dụng cho cả 4 trang. Props:

```jsx
ContentFeature({
  featureType,      // "scenario"|"article"|"press_article"|"tax_advice"
  title,            // "🏛️ Tình huống Thuế"
  description,      // mô tả ngắn
  inputLabel,       // "Mô tả tình huống" / "Chủ đề bài viết" / v.v.
  inputField,       // tên field để submit ("scenario", "topic", v.v.)
  placeholder,      // placeholder text
  showClientFields, // true chỉ cho tax_advice (client_name, company_name)
  showStyleRefs,    // true cho article, press_article, tax_advice
  defaultGammaSlides, // số slides mặc định (khác nhau mỗi feature)
})
```

**State:**
```js
const [input, setInput] = useState('')
const [taxTypes, setTaxTypes] = useState([])
const [model, setModel] = useState('deepseek')
const [models, setModels] = useState(MODELS_STATIC)  // dynamic như FullReport
const [styleRefs, setStyleRefs] = useState([])         // URLs + uploaded docs
const [clientName, setClientName] = useState('')       // tax_advice only
const [companyName, setCompanyName] = useState('')     // tax_advice only
const [status, setStatus] = useState('idle')           // idle|loading|polling|done|error
const [jobId, setJobId] = useState(null)
const [progress, setProgress] = useState(0)            // fake progress (tăng dần khi polling)
const [outputHtml, setOutputHtml] = useState('')
const [outputId, setOutputId] = useState(null)
const [citations, setCitations] = useState([])
const [error, setError] = useState('')
const [history, setHistory] = useState([])
const [showHistory, setShowHistory] = useState(false)
const [gammaUrl, setGammaUrl] = useState('')
const [gammaLoading, setGammaLoading] = useState(false)
const [numSlides, setNumSlides] = useState(defaultGammaSlides)
const pollRef = useRef(null)
```

**Auto-resume khi load trang** — giống FullReport:
```js
useEffect(() => {
  api.getModelInfo().then(info => { /* thêm Qwen option */ }).catch(() => {})
  api.listContentHistory(featureType).then(setHistory).catch(() => {})
  // Check job đang chạy
  api.listContentJobs(featureType).then(jobs => {
    const running = jobs.find(j => j.status === 'running' || j.status === 'pending')
    if (running && status === 'idle') resumeJob(running.job_id)
  }).catch(() => {})
}, [])
```

**Fake progress bar** — tăng dần khi polling (không có real step count như Full Report):
```js
useEffect(() => {
  if (status === 'polling') {
    setProgress(5)
    const t = setInterval(() => {
      setProgress(p => p >= 85 ? 85 : p + Math.random() * 3)
    }, 1500)
    return () => clearInterval(t)
  }
  if (status === 'done') setProgress(100)
}, [status])
```

**Submit flow:**
```js
async function handleSubmit(e) {
  e.preventDefault()
  setStatus('loading')
  setOutputHtml('')
  setOutputId(null)
  setError('')
  setGammaUrl('')
  
  const body = {
    [inputField]: input,
    tax_types: taxTypes,
    model_tier: model,
    style_references: styleRefs,
  }
  if (showClientFields) {
    body.client_name = clientName
    body.company_name = companyName
  }
  
  const { job_id } = await api.createContent(featureType, body)
  setJobId(job_id)
  setStatus('polling')
  startPolling(job_id)
}
```

**Style References component** (React, giống taxadvice StyleReferences.tsx):
- Nhập URL → fetch và hiển thị domain (không hiển thị full URL)
- **Upload document** (PDF/DOCX): POST `/api/content/upload-style-ref` → server extract text → trả về text snippet → thêm vào styleRefs dưới dạng text (không lưu file)
- Max 5 items tổng (URLs + uploads)
- Chip list với nút xoá

```jsx
// Upload handler
async function handleUpload(file) {
  const form = new FormData()
  form.append('file', file)
  const r = await api.uploadStyleRef(form)
  // r = { text: "...", filename: "doc.pdf" }
  if (r.text) setStyleRefs(prev => [...prev, r.text.slice(0, 3000)])
}
```

**Gamma button** — chỉ hiển thị khi `status === 'done'` hoặc khi load output từ history:
```jsx
{(status === 'done' || outputId) && outputHtml && (
  <div className="mt-4 pt-3 border-t border-gray-100">
    <div className="flex items-center gap-2 flex-wrap">
      {!gammaUrl ? (
        <>
          <span className="text-xs text-gray-500">Số slides:</span>
          <input type="number" min={3} max={50} value={numSlides}
            onChange={e => setNumSlides(+e.target.value)}
            className="w-16 border rounded px-2 py-1 text-sm" />
          <button onClick={handleCreateGamma} disabled={gammaLoading}
            className="text-sm px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60">
            {gammaLoading ? '⏳ Đang tạo...' : '✨ Tạo Gamma Slides'}
          </button>
        </>
      ) : (
        <a href={gammaUrl} target="_blank" rel="noopener"
          className="text-sm px-3 py-1.5 rounded-lg border border-purple-300 text-purple-700 hover:bg-purple-50">
          🎞️ Xem Gamma Slides →
        </a>
      )}
    </div>
  </div>
)}
```

**Cancel job button** — hiển thị khi `status === 'polling'`:
```jsx
<button onClick={cancelJob} className="text-xs px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50">
  ✕ Huỷ
</button>
```

**Output display** — render HTML giống FullReport:
```jsx
<div className="p-5 report-content" dangerouslySetInnerHTML={{ __html: outputHtml }} />
```

### 2.5 Frontend — 4 page files mới

`frontend/src/pages/ScenarioPage.jsx`:
```jsx
import ContentFeature from '../components/ContentFeature.jsx'
export default function ScenarioPage() {
  return (
    <ContentFeature
      featureType="scenario"
      title="🏛️ Tình huống Thuế"
      description="Phân tích tình huống thuế cụ thể — căn cứ pháp lý, hướng xử lý"
      inputLabel="Mô tả tình huống"
      inputField="scenario"
      placeholder="Ví dụ: Công ty A ký hợp đồng thuê nhà với cá nhân B, giá 20tr/tháng. Hỏi: (1) Chứng từ khấu trừ chi phí? (2) Nghĩa vụ thuế TNCN và GTGT?"
      showClientFields={false}
      showStyleRefs={false}
      defaultGammaSlides={5}
    />
  )
}
```

`frontend/src/pages/ArticlePage.jsx`:
```jsx
<ContentFeature
  featureType="article"
  title="📝 Bài Phân tích Thuế"
  description="Viết bài phân tích chuyên sâu về một vấn đề thuế cụ thể"
  inputLabel="Chủ đề / vấn đề cần phân tích"
  inputField="topic"
  placeholder="Ví dụ: Quy định mới về chi phí lãi vay theo NĐ 132/2020 — tác động với doanh nghiệp FDI"
  showClientFields={false}
  showStyleRefs={true}
  defaultGammaSlides={10}
/>
```

`frontend/src/pages/PressArticlePage.jsx`:
```jsx
<ContentFeature
  featureType="press_article"
  title="📰 Bài Viết Báo"
  description="Viết bài báo phong cách storytelling về thuế — dành cho blog, newsletter"
  inputLabel="Chủ đề bài báo"
  inputField="topic"
  placeholder="Ví dụ: Bỏ thuế khoán 2026 — 5 triệu hộ kinh doanh phải chuẩn bị gì?"
  showClientFields={false}
  showStyleRefs={true}
  defaultGammaSlides={8}
/>
```

`frontend/src/pages/TaxAdvicePage.jsx`:
```jsx
<ContentFeature
  featureType="tax_advice"
  title="✉️ Thư Tư vấn Thuế"
  description="Tạo thư tư vấn thuế chuyên nghiệp (professional tax advice letter)"
  inputLabel="Tình huống cần tư vấn"
  inputField="scenario"
  placeholder="Ví dụ: Doanh nghiệp FDI ngành sản xuất muốn chuyển địa điểm kinh doanh sang tỉnh khác trong thời gian hưởng ưu đãi thuế. Hỏi: ưu đãi có bị ảnh hưởng không?"
  showClientFields={true}
  showStyleRefs={true}
  defaultGammaSlides={6}
/>
```

### 2.6 Frontend — Navigation & Routing

**`frontend/src/App.jsx`** — thêm 4 routes mới:
```jsx
import ScenarioPage from './pages/ScenarioPage.jsx'
import ArticlePage from './pages/ArticlePage.jsx'
import PressArticlePage from './pages/PressArticlePage.jsx'
import TaxAdvicePage from './pages/TaxAdvicePage.jsx'

// Trong <Routes>:
<Route path="/scenario" element={<ScenarioPage />} />
<Route path="/article" element={<ArticlePage />} />
<Route path="/press-article" element={<PressArticlePage />} />
<Route path="/tax-advice" element={<TaxAdvicePage />} />
```

**`frontend/src/components/Layout.jsx`** — thêm 4 mục vào sidebar/nav:
```
Tạo nội dung (group header)
├── 🏛️ Tình huống Thuế   → /scenario
├── 📝 Bài Phân tích      → /article
├── 📰 Bài Viết Báo       → /press-article
└── ✉️ Thư Tư vấn        → /tax-advice
```

### 2.7 Frontend — `frontend/src/api.js` — thêm API calls

```js
// Content features
createContent: (featureType, data) => request('POST', `/content/${featureType}`, data),
getContentJob: (jobId) => request('GET', `/content/job/${jobId}`),
cancelContentJob: (jobId) => request('POST', `/content/job/${jobId}/cancel`),
listContentHistory: (featureType) => request('GET', `/content/history?type=${featureType}`),
getContentOutput: (id) => request('GET', `/content/${id}`),
deleteContentOutput: (id) => request('DELETE', `/content/${id}`),
createContentGamma: (id, numCards) => request('POST', `/content/${id}/gamma`, { num_cards: numCards }),
uploadStyleRef: (formData) => requestForm('POST', '/content/upload-style-ref', formData),
```

Thêm `requestForm` helper (nếu chưa có):
```js
async function requestForm(method, path, formData) {
  const token = localStorage.getItem('token')
  const res = await fetch(`/api${path}`, {
    method,
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}
```

### 2.8 Backend — Upload style ref endpoint

Thêm vào `backend/routes/content.py`:
```python
@router.post("/upload-style-ref")
async def upload_style_ref(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """
    Upload PDF hoặc DOCX → extract text → trả về snippet.
    Không lưu file, chỉ extract text ngay và trả về.
    """
    content = await file.read()
    filename = file.filename or ""
    
    if filename.lower().endswith(".pdf"):
        import io
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(content))
        text = "\n".join(page.extract_text() or "" for page in reader.pages[:10])
    elif filename.lower().endswith((".docx", ".doc")):
        import io
        from docx import Document
        doc = Document(io.BytesIO(content))
        text = "\n".join(p.text for p in doc.paragraphs)
    else:
        text = content.decode("utf-8", errors="ignore")
    
    return {"text": text[:3000], "filename": filename}
```

**Dependencies cần thêm vào `requirements.txt`:**
```
pypdf>=3.0.0
python-docx>=0.8.11
markdown>=3.5.0
```

---

## PHẦN 3: Cấu trúc file sau khi hoàn thành

```
backend/
├── content_generator.py  ← MỚI: generate_content() function
├── content_prompts.py    ← MỚI: 4 prompt functions
├── models.py             ← THÊM: class ContentOutput
├── doc_context.py        ← SỬA: thêm HOA_DON, THUE_QT vào SAC_THUE_MAP
├── routes/
│   └── content.py        ← MỚI: 8 endpoints

frontend/src/
├── api.js                ← THÊM: 8 API calls mới
├── App.jsx               ← THÊM: 4 routes
├── components/
│   ├── Layout.jsx        ← THÊM: 4 nav items
│   └── ContentFeature.jsx ← MỚI: shared component
├── pages/
│   ├── ScenarioPage.jsx  ← MỚI
│   ├── ArticlePage.jsx   ← MỚI
│   ├── PressArticlePage.jsx ← MỚI
│   └── TaxAdvicePage.jsx ← MỚI
```

---

## PHẦN 4: Checklist sau khi implement

- [ ] SAC_THUE_MAP trong doc_context.py có đủ HOA_DON, THUE_QT
- [ ] TAX_TYPES array trong mọi page có đủ 11 mục (thêm QLT, HOA_DON, THUE_QT)
- [ ] Migration SQL tạo bảng content_outputs đã chạy (hoặc tự chạy khi startup)
- [ ] 4 prompt functions đã implement đúng Citation-First style (copy SECTION_SYSTEM từ report_generator.py)
- [ ] Style references: URL fetch + file upload đều hoạt động
- [ ] Auto-resume job khi vào lại trang
- [ ] Cancel job hoạt động
- [ ] History load + Gamma button hiển thị cả khi load từ history
- [ ] 4 nav items trong Layout
- [ ] Qwen model option dynamic (từ api.getModelInfo())

---

## GHI CHÚ QUAN TRỌNG

1. **Không cần streaming SSE** cho 4 features này — dùng job polling (giống Full Report) cho đơn giản. Content xong một lúc, không section-by-section.

2. **Fake progress** — vì không có step count thật, tăng fake từ 5% → 85% trong lúc polling, nhảy 100% khi done.

3. **Gamma integration** — dùng lại `api.createGamma()` đã có trong reports, chỉ wrap thành `api.createContentGamma()`. Backend gọi cùng Gamma service.

4. **Markdown → HTML** — output của AI là markdown, cần convert sang HTML trước khi lưu vào DB. Dùng thư viện `markdown` Python.

5. **Auto-timeout** — job chạy quá 20 phút → tự mark error (ngắn hơn Full Report vì content đơn giản hơn).

6. **Không tự chạy migration** — viết file SQL vào `backend/migrations/` và note trong code để admin chạy thủ công.
