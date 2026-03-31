# BRIEF: taxconsult — Major Refactor (taxsector UI + Background Jobs + Anchor Docs)
**Date:** 2026-03-31
**Author:** Thanh AI
**Ref:** taxsector repo (single-file app, đã verified working)

---

## Tổng quan thay đổi

taxconsult cần được refactor để:
1. **Theme màu** đổi lại `#028a39` (xanh đậm chuẩn, bỏ `#78BE20`)
2. **Background job** cho Full Report — close tab không mất báo cáo
3. **Anchor docs từ dbvntax** được inject vào prompt khi viết thuế
4. **UI giống taxsector**: Mục lục, font size, nút load báo cáo cũ, nút slides, nút DOCX
5. **AI provider** đồng bộ (đã có từ brief trước, giữ nguyên)

---

## 1. Theme: Đổi lại `#78BE20` → `#028a39`

### `frontend/tailwind.config.js`
```js
colors: {
  brand: {
    DEFAULT: '#028a39',
    dark:    '#016b2d',
    light:   '#03ab46',
  },
},
```

### `frontend/src/index.css`
Tìm tất cả `#78BE20`, `#5A9A12`, `#94D43A` → đổi về `#028a39`, `#016b2d`, `#03ab46`.

---

## 2. Background Job — Full Report không bị ngắt khi close tab

### Vấn đề hiện tại
- `POST /api/reports/full` → SSE stream trực tiếp → close tab = mất hết

### Giải pháp: asyncio background task + DB polling

#### `backend/models.py` — Thêm model `ReportJob`
```python
class ReportJob(Base):
    __tablename__ = "report_jobs"
    id            = Column(String, primary_key=True)  # UUID
    subject       = Column(String)
    status        = Column(String, default="pending")  # pending|running|done|error
    progress_step = Column(Integer, default=0)
    progress_total= Column(Integer, default=0)
    progress_label= Column(String, default="")
    html_content  = Column(Text, default="")
    error_msg     = Column(String, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

#### DB Migration (chạy trong `run_migrations.py`)
```sql
CREATE TABLE IF NOT EXISTS report_jobs (
    id VARCHAR PRIMARY KEY,
    subject VARCHAR,
    status VARCHAR DEFAULT 'pending',
    progress_step INTEGER DEFAULT 0,
    progress_total INTEGER DEFAULT 0,
    progress_label VARCHAR DEFAULT '',
    html_content TEXT DEFAULT '',
    error_msg VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### `backend/routes/reports.py` — Refactor

**`POST /api/reports/start`** (thay thế `/api/reports/full`)
```python
@router.post("/start")
async def start_report(body: FullReportRequest, db=Depends(get_db), ...):
    """Tạo job, spawn background task, trả về job_id ngay."""
    import uuid
    job_id = str(uuid.uuid4())
    job = ReportJob(id=job_id, subject=body.subject, status="pending",
                    progress_total=len([s for s in body.sections if s.enabled]))
    db.add(job)
    await db.commit()

    # Fire and forget — không await
    asyncio.create_task(run_report_job(job_id, body))
    return {"job_id": job_id}
```

**`GET /api/reports/job/{job_id}`** — Poll status
```python
@router.get("/job/{job_id}")
async def get_job_status(job_id: str, db=Depends(get_db), ...):
    job = await db.get(ReportJob, job_id)
    if not job:
        raise HTTPException(404)
    return {
        "status": job.status,
        "progress_step": job.progress_step,
        "progress_total": job.progress_total,
        "progress_label": job.progress_label,
        "html_content": job.html_content,  # partial HTML as it builds
        "error_msg": job.error_msg,
    }
```

**`async def run_report_job(job_id, body)`** — Background worker
```python
async def run_report_job(job_id: str, body: FullReportRequest):
    """Chạy hoàn toàn background — không phụ thuộc client connection."""
    # Tạo DB session riêng (không dùng request session)
    async with AsyncSessionLocal() as db:
        job = await db.get(ReportJob, job_id)
        job.status = "running"
        await db.commit()

        try:
            enabled = [s for s in body.sections if s.enabled]
            job.progress_total = len(enabled)
            await db.commit()

            # Phase 1: Research (Perplexity)
            all_results = {}
            for i, section in enumerate(enabled):
                job.progress_step = i
                job.progress_label = f"Đang research: {section.title}"
                await db.commit()
                result = await perplexity_search(build_query(section, body.subject, body.mode))
                all_results[section.id] = result

            # Phase 2: Load anchor docs từ dbvntax (quan trọng!)
            anchor_context = await get_anchor_context(body.tax_types, body.time_period)

            # Phase 3: Write với AI
            full_html = ""
            for i, section in enumerate(enabled):
                job.progress_step = len(enabled) + i
                job.progress_label = f"AI đang viết: {section.title}"
                await db.commit()

                ctx = all_results.get(section.id, {}).get("content", "")
                # Inject anchor docs vào các section về thuế/pháp lý
                if is_tax_section(section) and anchor_context:
                    ctx = anchor_context + "\n\n---\n\n" + ctx

                sec_html = await write_section_with_ai(section, body.subject, ctx, body.model_tier)
                full_html += sec_html + "\n"

                # Update HTML realtime để frontend có thể poll partial content
                job.html_content = full_html
                await db.commit()

            job.status = "done"
            job.html_content = full_html
            job.progress_label = "Hoàn thành!"
            await db.commit()

        except Exception as e:
            job.status = "error"
            job.error_msg = str(e)
            await db.commit()
```

#### Frontend — Poll thay SSE

**`FullReport.jsx`** — Thay stream bằng polling:
```jsx
async function handleSubmit(e) {
  e.preventDefault()
  setStatus('loading')

  const { job_id } = await api.startReport({ subject, mode, tax_types, ... })
  setJobId(job_id)
  setStatus('polling')

  // Poll mỗi 3 giây
  const interval = setInterval(async () => {
    const data = await api.getJobStatus(job_id)
    setProgress({ step: data.progress_step, total: data.progress_total, label: data.progress_label })

    if (data.html_content) {
      setReportHtml(data.html_content)  // Show partial HTML realtime
    }

    if (data.status === 'done') {
      clearInterval(interval)
      setStatus('done')
    } else if (data.status === 'error') {
      clearInterval(interval)
      setError(data.error_msg)
      setStatus('error')
    }
  }, 3000)

  // Lưu interval để cleanup nếu unmount
  pollRef.current = interval
}
```

**Lợi ích:** Close tab → mở lại → vẫn poll được job đang chạy bằng `job_id`.

---

## 3. Anchor Docs Injection — Quan trọng nhất

### Vấn đề hiện tại
taxconsult có `doc_context.py` pull anchor docs từ dbvntax nhưng **KHÔNG inject vào prompt khi viết**. Chỉ inject Perplexity research.

### Fix: `get_anchor_context()` trong `backend/doc_context.py`

Hàm này đã có (`get_priority_docs_context`, `get_relevant_docs`, `get_relevant_congvan`). Cần **gọi chúng trong `run_report_job`** và inject vào prompt cho các section liên quan đến thuế:

```python
async def get_anchor_context(tax_types: list, time_period: str) -> str:
    """Lấy anchor docs từ dbvntax và format thành context string."""
    from backend.time_period import parse_period_string
    start, end, use_current = parse_period_string(time_period)

    async with AsyncDBVntaxSession() as dbvntax_db:
        async with AsyncTaxconsultSession() as tc_db:
            # 1. Priority docs (admin-curated, ưu tiên cao nhất)
            priority_ctx = await get_priority_docs_context(
                tc_db, dbvntax_db, tax_types,
                time_period_end=end, time_period_start=start
            )
            # 2. Relevant docs từ dbvntax (Luật, NĐ, TT)
            docs_ctx = await get_relevant_docs(dbvntax_db, tax_types, time_period_end=end)
            # 3. Công văn liên quan
            cv_ctx = await get_relevant_congvan(dbvntax_db, tax_types)

    parts = [p for p in [priority_ctx, docs_ctx, cv_ctx] if p]
    return "\n\n".join(parts)
```

### Prompt injection trong `build_section_prompt()`

Thêm vào đầu context (trước Perplexity research):
```python
if anchor_context and is_tax_or_legal_section(section):
    ctx = f"""## VĂN BẢN PHÁP LUẬT TỪ DATABASE (ưu tiên cao nhất — dẫn chiếu chính xác)
⚠️ QUAN TRỌNG: Ưu tiên dẫn chiếu các văn bản dưới đây. Đây là database pháp luật đã được kiểm duyệt.
Khi trích dẫn số hiệu văn bản → dùng đúng số hiệu và tên từ database này.

{anchor_context}

---
## RESEARCH (Perplexity — bổ sung thông tin thực tiễn)
{perplexity_research}"""
```

---

## 4. UI Features từ taxsector → taxconsult

### 4a. Mục lục (Table of Contents) — tự động từ h2

Trong `FullReport.jsx`, sau khi có `reportHtml`, generate TOC:
```jsx
function buildTOC(html) {
  const matches = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gi)]
  return matches.map((m, i) => ({
    index: i + 1,
    text: m[1].replace(/<[^>]+>/g, ''),
    anchor: `section-${i + 1}`
  }))
}
```

Hiển thị TOC collapsible ở đầu trang report:
```jsx
{toc.length > 0 && (
  <div className="border rounded-lg p-4 mb-4 bg-green-50/50">
    <button onClick={() => setTocOpen(!tocOpen)}
      className="flex items-center gap-2 font-semibold text-brand w-full">
      📋 Mục lục {tocOpen ? '▲' : '▼'}
    </button>
    {tocOpen && (
      <ol className="mt-2 space-y-1 text-sm">
        {toc.map(item => (
          <li key={item.index}>
            <a href={`#${item.anchor}`}
               className="text-brand hover:underline">
              {item.index}. {item.text}
            </a>
          </li>
        ))}
      </ol>
    )}
  </div>
)}
```

Khi render HTML, inject anchor IDs vào h2:
```js
function injectAnchors(html) {
  let count = 0
  return html.replace(/<h2/gi, () => `<h2 id="section-${++count}"`)
}
```

### 4b. Font Size Controls

Toolbar trong report view:
```jsx
<div className="flex items-center gap-2">
  <span className="text-xs text-gray-500">Cỡ chữ:</span>
  <button onClick={() => setFontSize(f => Math.max(12, f - 1))}
    className="w-7 h-7 rounded border text-sm">A-</button>
  <span className="text-sm w-8 text-center">{fontSize}</span>
  <button onClick={() => setFontSize(f => Math.min(22, f + 1))}
    className="w-7 h-7 rounded border text-sm">A+</button>
</div>
```

Apply vào report content:
```jsx
<div id="report-content"
  style={{ fontSize: `${fontSize}px` }}
  dangerouslySetInnerHTML={{ __html: injectAnchors(reportHtml) }}
/>
```

### 4c. Load Báo cáo Cũ

**Backend:** `GET /api/reports/list` đã có → hiển thị danh sách.

**Frontend:** Panel "Báo cáo đã lưu" trong FullReport:
```jsx
{savedReports.length > 0 && (
  <div className="mb-4">
    <button onClick={() => setShowReports(!showReports)}
      className="btn btn-gray text-sm">
      📂 Báo cáo đã lưu ({savedReports.length})
    </button>
    {showReports && (
      <div className="mt-2 border rounded-lg divide-y max-h-60 overflow-y-auto">
        {savedReports.map(r => (
          <div key={r.id} className="flex items-center justify-between p-2 hover:bg-gray-50 text-sm">
            <span className="truncate flex-1">{r.subject}</span>
            <span className="text-gray-400 text-xs mx-2">{r.date}</span>
            <button onClick={() => loadReport(r.id)}
              className="text-brand text-xs hover:underline">Xem</button>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

### 4d. Nút Export: PPTX Slides + DOCX

Copy y chang từ taxsector (đã tested):

**Backend `routes/reports.py`:**
- `POST /api/reports/docx` — export DOCX (copy từ taxsector `/docx`)
- `POST /api/reports/slides` — export PPTX (copy từ taxsector `/slides`)
- Brand color trong DOCX/PPTX = `#028a39`

**Frontend toolbar** (hiện sau khi report done):
```jsx
<div className="flex gap-2 flex-wrap">
  <button onClick={downloadDocx} className="btn btn-gray text-sm">
    📄 Tải DOCX
  </button>
  <button onClick={downloadSlides} className="btn btn-gray text-sm">
    🎞️ Tạo Slides
  </button>
  <button onClick={openGamma} className="btn btn-green text-sm">
    ✨ Mở Gamma
  </button>
</div>
```

**Gamma button:**
```jsx
function openGamma() {
  window.open('https://gamma.app/create', '_blank')
}
// Tooltip: "Copy nội dung → paste vào Gamma để tạo slides đẹp hơn"
```

### 4e. Reading Progress Bar

Thêm vào root `index.html` hoặc `Layout.jsx`:
```js
window.addEventListener('scroll', () => {
  const el = document.getElementById('report-content')
  if (!el) return
  const scrolled = window.scrollY
  const total = el.offsetHeight - window.innerHeight
  const pct = Math.min(100, total > 0 ? (scrolled / total) * 100 : 0)
  document.getElementById('reading-bar').style.width = pct + '%'
})
```

```jsx
// Trong Layout.jsx:
<div id="reading-bar"
  className="fixed top-0 left-0 h-1 bg-brand z-50 transition-all"
  style={{ width: '0%' }}
/>
```

---

## 5. requirements.txt — Thêm dependencies

```
python-pptx>=0.6.23
python-docx>=1.1.0
```
(Nếu chưa có)

---

## 6. Migration — Thêm `report_jobs` table

Cập nhật `backend/migrations/run_migrations.py` — thêm:
```python
REPORT_JOBS_SQL = """
CREATE TABLE IF NOT EXISTS report_jobs (
    id VARCHAR PRIMARY KEY,
    subject VARCHAR,
    status VARCHAR DEFAULT 'pending',
    progress_step INTEGER DEFAULT 0,
    progress_total INTEGER DEFAULT 0,
    progress_label VARCHAR DEFAULT '',
    html_content TEXT DEFAULT '',
    error_msg VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
"""
# Chạy trong main() với taxconsult engine
```

---

## 7. api.js — Cập nhật

```js
// Thay thế startFullReport + streamFullReport:
startReport: (data) => post('/api/reports/start', data),
getJobStatus: (jobId) => get(`/api/reports/job/${jobId}`),
getReportList: () => get('/api/reports/list'),
exportDocx: (data) => postBlob('/api/reports/docx', data),
exportSlides: (data) => postBlob('/api/reports/slides', data),
suggestTopics: (data) => post('/api/reports/suggest-topics', data),  // đã có từ brief trước
```

---

## 8. Checklist cho Claude Code

- [ ] `tailwind.config.js` + `index.css`: đổi màu về `#028a39`
- [ ] `backend/models.py`: thêm `ReportJob`
- [ ] `backend/migrations/run_migrations.py`: thêm `report_jobs` table migration
- [ ] `backend/routes/reports.py`:
  - [ ] `POST /start` → spawn background task, return `job_id`
  - [ ] `GET /job/{job_id}` → poll status + partial HTML
  - [ ] `POST /docx` → copy từ taxsector
  - [ ] `POST /slides` → copy từ taxsector
  - [ ] Background worker `run_report_job()` — inject anchor docs
- [ ] `backend/doc_context.py`: thêm `get_anchor_context()` wrapper
- [ ] `frontend/src/pages/FullReport.jsx`:
  - [ ] Đổi SSE → polling (`startReport` + `getJobStatus`)
  - [ ] TOC tự động
  - [ ] Font size controls
  - [ ] Load báo cáo cũ
  - [ ] Export buttons (DOCX, Slides, Gamma)
  - [ ] Reading progress bar
- [ ] `frontend/src/api.js`: cập nhật endpoints
- [ ] `requirements.txt`: thêm `python-pptx`, `python-docx` nếu chưa có
- [ ] Xoá file `BRIEF-taxconsult-multifeature.md` cũ
- [ ] **KHÔNG tự deploy — nhắn Thanh "taxconsult push xong"**

---

## 9. Env Vars cần trên Coolify (đã có từ trước, kiểm tra lại)

| Var | Giá trị |
|-----|---------|
| `ANTHROPIC_BASE_URL` | `https://claudible.io` |
| `ANTHROPIC_AUTH_TOKEN` | `sk-f4923...` (Claudible) |
| `DEEPSEEK_API_KEY` | key của anh |
| `PERPLEXITY_API_KEY` | `pplx-11dca3...` |
| `DATABASE_URL` | taxconsult DB |
| `DBVNTAX_DATABASE_URL` | dbvntax DB (postgres) |

---

## Lưu ý quan trọng

**Về anchor docs injection:**
- Perplexity làm **web research** (realtime, có citations) → tốt cho số liệu, tin tức mới
- Anchor docs làm **legal grounding** (văn bản pháp luật chính xác từ DB) → tốt cho dẫn chiếu luật
- Kết hợp 2 nguồn = báo cáo vừa có cơ sở pháp lý chính xác, vừa có thông tin thị trường cập nhật
- Ưu tiên: anchor docs trước, Perplexity sau trong context string

**Về background job:**
- Dùng `asyncio.create_task()` đơn giản — không cần Celery/Redis
- Job ID lưu trong `report_jobs` table → client poll mỗi 3s
- HTML partial được update sau mỗi section → user thấy report hiện dần ngay cả khi mở lại tab
