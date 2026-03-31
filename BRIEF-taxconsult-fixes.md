# BRIEF: taxconsult — Bug Fixes + Feature Parity với taxsector
**Date:** 2026-03-31
**Author:** Thanh AI

---

## Tổng quan

8 vấn đề cần fix/implement. Hầu hết có thể copy/adapt từ taxsector.

---

## 1. Quick Research — Lưu và xem lại kết quả

### Tình trạng
- Backend ĐÃ có: `run_quick_research()` tự save vào `ResearchSession` table, trả về `id`
- Frontend CHƯA có: UI để list/load lịch sử research

### Fix trong `frontend/src/pages/QuickResearch.jsx`

**Thêm panel lịch sử bên trái hoặc trên form:**
```jsx
// State
const [history, setHistory] = useState([])
const [showHistory, setShowHistory] = useState(false)

// Load lịch sử từ API
async function loadHistory() {
  const data = await api.getResearchHistory()  // GET /api/research/history
  setHistory(data)
}
useEffect(() => { loadHistory() }, [])

// Load lại 1 research cũ
async function loadResearch(id) {
  const data = await api.getResearchById(id)  // GET /api/research/{id}
  setAnswer(data.answer_html)
  setQuestion(data.question)
  setTaxTypes(data.tax_types || [])
}

// Delete
async function deleteResearch(id) {
  await api.deleteResearch(id)  // DELETE /api/research/{id}
  loadHistory()
}
```

**UI:**
```jsx
{/* Nút toggle history */}
<button onClick={() => { setShowHistory(!showHistory); loadHistory() }}
  className="btn btn-gray text-sm">
  📂 Lịch sử ({history.length})
</button>

{showHistory && (
  <div className="mt-2 border rounded-lg divide-y max-h-64 overflow-y-auto text-sm">
    {history.map(h => (
      <div key={h.id} className="flex items-center gap-2 p-2 hover:bg-gray-50">
        <span className="flex-1 truncate cursor-pointer text-brand"
          onClick={() => loadResearch(h.id)}>
          {h.question}
        </span>
        <span className="text-gray-400 text-xs shrink-0">{h.created_at_display}</span>
        <button onClick={() => deleteResearch(h.id)}
          className="text-gray-300 hover:text-red-400 text-xs px-1">✕</button>
      </div>
    ))}
    {history.length === 0 && (
      <div className="p-3 text-gray-400 text-center">Chưa có lịch sử</div>
    )}
  </div>
)}
```

### Backend: Thêm 3 endpoints vào `routes/research.py`

```python
@router.get("/history")
async def get_history(limit: int = 20, user=Depends(get_current_user), db=Depends(get_db)):
    from sqlalchemy import select, desc
    from backend.models import ResearchSession
    q = select(ResearchSession).where(ResearchSession.user_id == user.id)\
        .order_by(desc(ResearchSession.created_at)).limit(limit)
    result = await db.execute(q)
    sessions = result.scalars().all()
    return [{"id": s.id, "question": s.question, "tax_types": s.tax_types,
             "model_used": s.model_used, "created_at_display": s.created_at.strftime("%d/%m %H:%M")
             } for s in sessions]

@router.get("/{session_id}")
async def get_research(session_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    from backend.models import ResearchSession
    s = await db.get(ResearchSession, session_id)
    if not s or s.user_id != user.id:
        raise HTTPException(404)
    return {"id": s.id, "question": s.question, "answer_html": s.answer_html,
            "tax_types": s.tax_types, "time_period": s.time_period}

@router.delete("/{session_id}")
async def delete_research(session_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    from backend.models import ResearchSession
    s = await db.get(ResearchSession, session_id)
    if not s or s.user_id != user.id:
        raise HTTPException(404)
    await db.delete(s)
    await db.commit()
    return {"ok": True}
```

### `frontend/src/api.js` — Thêm:
```js
getResearchHistory: () => get('/api/research/history'),
getResearchById: (id) => get(`/api/research/${id}`),
deleteResearch: (id) => del(`/api/research/${id}`),
```
(Đảm bảo có hàm `del` tương tự `get`/`post`)

---

## 2. Tab Văn bản (TaxDocs) — Thay bằng list từ dbvntax

### Tình trạng hiện tại
- `TaxDocs.jsx` đang show dữ liệu cũ từ `taxconsult` DB (bảng local, cũ)
- Cần thay bằng list từ **dbvntax `documents` table** (PostgreSQL db = `postgres`)

### Redesign `TaxDocs.jsx` → 2 tabs:

#### Tab 1: "📌 Văn bản ưu tiên" (priority_docs)
- Đây là các văn bản admin đã mark là quan trọng trong taxconsult
- Hiển thị danh sách priority_docs với metadata: sắc thuế, giai đoạn hiệu lực
- Cho phép: thêm mới (chọn từ dbvntax), xoá, set sort_order
- **Đã có endpoint**: `GET/POST/DELETE /api/admin/priority-docs`

#### Tab 2: "📚 Tất cả văn bản (dbvntax)"
- List toàn bộ `documents` từ dbvntax qua backend endpoint
- Filter: sắc thuế (multi-select), loại VB (Luật/NĐ/TT/VBHN), search text
- Mỗi row: checkbox "Thêm vào ưu tiên" → mở modal nhập metadata

### Backend: Thêm endpoint `GET /api/tax-docs/dbvntax` trong `routes/tax_docs.py`

```python
@router.get("/dbvntax")
async def list_dbvntax_docs(
    sac_thue: str = None,
    loai: str = None,
    search: str = None,
    page: int = 1,
    limit: int = 30,
    user=Depends(get_current_user),
    dbvntax_db: AsyncSession = Depends(DbvntaxSession),
):
    """List documents từ dbvntax DB."""
    q = select(DbvntaxDocument).order_by(
        DbvntaxDocument.importance.asc(),
        DbvntaxDocument.ngay_ban_hanh.desc()
    )
    if sac_thue:
        q = q.where(DbvntaxDocument.sac_thue == sac_thue)
    if loai:
        q = q.where(DbvntaxDocument.doc_type == loai)
    if search:
        q = q.where(DbvntaxDocument.ten.ilike(f'%{search}%'))
    q = q.offset((page-1)*limit).limit(limit)
    result = await dbvntax_db.execute(q)
    docs = result.scalars().all()
    return [{"id": d.id, "so_hieu": d.so_hieu, "ten": d.ten, "doc_type": d.doc_type,
             "sac_thue": d.sac_thue, "ngay_ban_hanh": str(d.ngay_ban_hanh or ''),
             "importance": d.importance} for d in docs]
```

---

## 3. Full Report — Anchor docs injection (đảm bảo đang chạy đúng)

### Tình trạng
- `report_generator.py` ĐÃ có `SECTION_PROMPT_TAX` với `{priority_context}` + `{tax_docs_context}` + `{congvan_context}`
- **Nhưng:** chỉ inject vào sections có `"tax_aware": True`
- Default sections trong `config.py` cần check — các section về thuế phải có `"tax_aware": True`

### Fix trong `backend/config.py` — Ensure tax sections có `tax_aware: True`

```python
DEFAULT_SECTIONS = [
    {"id": "s1", "title": "Tổng quan về ngành/doanh nghiệp",
     "sub": ["Quy mô thị trường", "Đặc điểm kinh doanh", "Mô hình doanh thu/chi phí"],
     "enabled": True, "tax_aware": False},
    {"id": "s2", "title": "Đặc thù kinh doanh",
     "sub": ["Chuỗi cung ứng", "Working capital cycle", "Đặc điểm tài sản"],
     "enabled": True, "tax_aware": False},
    {"id": "s3", "title": "Các quy định pháp lý",
     "sub": ["Luật chuyên ngành", "Điều kiện kinh doanh", "Hạn chế FDI"],
     "enabled": True, "tax_aware": True},   # ← tax_aware
    {"id": "s4", "title": "Phân tích các loại thuế áp dụng",
     "sub": ["Thuế TNDN", "Thuế GTGT", "Thuế Nhà thầu", "Thuế TTĐB", "Thuế XNK"],
     "enabled": True, "tax_aware": True},   # ← tax_aware
    {"id": "s5", "title": "Các vấn đề thuế đặc thù",
     "sub": ["Rủi ro doanh thu/chi phí", "Chuyển giá", "Ưu đãi thuế",
             "Hóa đơn đặc thù", "Tranh chấp thuế", "Công văn hướng dẫn đặc thù"],
     "enabled": True, "tax_aware": True},   # ← tax_aware
    {"id": "s6", "title": "Thông lệ thuế quốc tế",
     "sub": ["BEPS", "Chuyển giá quốc tế", "So sánh khu vực", "Hiệp định thuế"],
     "enabled": True, "tax_aware": True},   # ← tax_aware
    {"id": "s7", "title": "Khuyến nghị & Kết luận",
     "sub": ["Tối ưu hóa thuế", "Tuân thủ", "Cơ hội ưu đãi", "Rủi ro cần theo dõi"],
     "enabled": True, "tax_aware": True},   # ← tax_aware
]
```

### Frontend — Hiển thị `tax_aware` badge trên section card

Trong section card của `FullReport.jsx`, thêm badge nhỏ:
```jsx
{section.tax_aware && (
  <span className="text-xs bg-green-100 text-green-700 rounded px-1 py-0.5">
    📚 anchor
  </span>
)}
```

---

## 4. Export DOCX — Fix lỗi

### Tình trạng
- Backend `_html_to_docx()` ĐÃ có và đúng (copy từ taxsector)
- Lỗi 500 có thể do: `python-docx` chưa install, hoặc `BeautifulSoup` import fail

### Fix:
1. **`requirements.txt`** — Đảm bảo có:
```
python-docx>=1.1.0
python-pptx>=0.6.23
lxml>=5.0.0
beautifulsoup4>=4.12.0
```

2. **`_html_to_docx()` trong `routes/reports.py`** — Wrap import trong try/except và log lỗi:
```python
def _html_to_docx(html: str, title: str) -> bytes:
    try:
        from docx import Document
        from docx.shared import Pt, RGBColor
        from bs4 import BeautifulSoup
    except ImportError as e:
        raise HTTPException(500, f"Missing dependency: {e}")
    # ... rest of function (keep as-is, đã đúng)
```

3. **Frontend `FullReport.jsx`** — Check `html_content` trước khi gọi export:
```jsx
async function downloadDocx() {
  if (!reportHtml) {
    alert('Chưa có báo cáo để xuất')
    return
  }
  try {
    const blob = await api.exportDocx({ subject, html_content: reportHtml })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `BaoCaoThue_${subject}.docx`
    a.click()
  } catch (e) {
    alert('Lỗi xuất DOCX: ' + e.message)
  }
}
```

### Export Slides (PPTX) — Giữ lại, fix tương tự

Backend `_html_to_slides()` ĐÃ có. Fix tương tự: đảm bảo `python-pptx` installed + wrap import.

---

## 5. Gamma — Tạo slides tự động qua API

### Tham khảo taxsector
taxsector KHÔNG có Gamma API integration — chỉ có nút mở `gamma.app/create` thủ công.

**Gamma API** (public beta): `POST https://api.gamma.app/v1/presentations`
- Auth: `Bearer GAMMA_API_KEY`
- Body: `{text: "...", theme: "...", num_cards: 20}`
- Response: `{id, url}` — URL là link public đến presentation

### Implementation

**Backend: `POST /api/reports/gamma`**
```python
@router.post("/gamma")
async def create_gamma(
    body: GammaRequest,  # subject, html_content, num_cards=20
    user=Depends(get_current_user),
):
    """Tạo Gamma presentation từ report HTML."""
    gamma_key = os.getenv("GAMMA_API_KEY", "")
    if not gamma_key:
        raise HTTPException(400, "GAMMA_API_KEY not configured")

    # Convert HTML → plain text (đã có html_to_text.py)
    from backend.html_to_text import html_to_text
    text_content = html_to_text(body.html_content)

    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            "https://api.gamma.app/v1/presentations",
            headers={"Authorization": f"Bearer {gamma_key}",
                     "Content-Type": "application/json"},
            json={
                "title": f"Phân tích thuế: {body.subject}",
                "text": text_content[:8000],  # Gamma API có limit
                "num_cards": min(body.num_cards, 60),
                "theme": "professional",
                "language": "vi",
            }
        )
        r.raise_for_status()
        data = r.json()
        return {"url": data.get("url"), "id": data.get("id")}
```

**Frontend — Thêm vào setup form (trước nút Tạo báo cáo):**
```jsx
{/* Gamma options */}
<div className="border rounded-lg p-3 bg-purple-50/30">
  <div className="flex items-center justify-between">
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={createGamma} onChange={e => setCreateGamma(e.target.checked)}
        className="accent-brand" />
      <span className="text-sm font-medium">✨ Tự động tạo Gamma Slides</span>
    </label>
    {createGamma && (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Số slides:</span>
        <input type="number" min={5} max={60} value={numSlides}
          onChange={e => setNumSlides(Number(e.target.value))}
          className="w-16 border rounded px-2 py-1 text-sm" />
      </div>
    )}
  </div>
  {createGamma && !hasGammaKey && (
    <p className="text-xs text-orange-500 mt-1">
      ⚠️ Cần GAMMA_API_KEY trong Coolify để dùng tính năng này
    </p>
  )}
</div>
```

**Sau khi report done, nếu `createGamma=true`:**
```jsx
// Tự động gọi API tạo Gamma
const gammaResult = await api.createGamma({ subject, html_content: reportHtml, num_cards: numSlides })
setGammaUrl(gammaResult.url)
```

**Hiển thị link Gamma trong report:**
```jsx
{gammaUrl && (
  <div className="border rounded-lg p-3 bg-purple-50 flex items-center justify-between">
    <span className="text-sm">🎞️ Gamma Slides đã tạo:</span>
    <a href={gammaUrl} target="_blank" rel="noopener"
       className="text-brand font-medium text-sm hover:underline">
      Xem Slides →
    </a>
  </div>
)}
```

**Env var cần thêm Coolify:**
```
GAMMA_API_KEY = <key từ gamma.app/settings/api>
```

*(Nếu anh chưa có key, button Gamma vẫn hiện nhưng báo lỗi "Cần GAMMA_API_KEY")*

---

## 6. Mục lục — Fix đánh số 2 lần (1.1, 2.2, 3.3)

### Root cause
HTML từ AI đã có `<h2>1. Tên phần</h2>` (có số thứ tự trong text).
TOC builder lại đánh số thêm → thành "1. 1. Tên phần".

### Fix trong `FullReport.jsx`:
```js
function buildTOC(html) {
  const matches = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
  return matches.map((m, i) => ({
    index: i + 1,
    // Strip leading "N. " nếu AI đã tự đánh số
    text: m[1].replace(/<[^>]+>/g, '').replace(/^\d+\.\s*/, '').trim(),
    anchor: `section-${i + 1}`
  }))
}
```

**Và trong TOC render — KHÔNG thêm số nữa:**
```jsx
{toc.map((item) => (
  <li key={item.index}>
    <a href={`#${item.anchor}`} className="text-brand hover:underline">
      {item.index}. {item.text}  {/* chỉ dùng item.index để đánh số */}
    </a>
  </li>
))}
```

---

## 7. References — Expandable ở cuối báo cáo

### Lấy từ taxsector

Taxsector lưu `citations` (URL list từ Perplexity) và hiển thị cuối trang:

**Backend** — Trong `generate_full_report()`, collect citations từ Perplexity results:
```python
all_citations = []
for ctx in all_contexts:
    if isinstance(ctx, dict):
        all_citations.extend(ctx.get("citations", []))
```
Save citations vào `Report.citations` (đã có field này).

**Frontend** — Cuối report:
```jsx
{citations.length > 0 && (
  <div className="mt-8 border-t pt-4">
    <button onClick={() => setRefOpen(!refOpen)}
      className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-brand">
      📎 Nguồn tham khảo ({citations.length}) {refOpen ? '▲' : '▼'}
    </button>
    {refOpen && (
      <ol className="mt-2 space-y-1 text-xs text-gray-500">
        {citations.map((url, i) => (
          <li key={i}>
            <a href={url} target="_blank" rel="noopener"
               className="hover:text-brand hover:underline break-all">
              [{i+1}] {url}
            </a>
          </li>
        ))}
      </ol>
    )}
  </div>
)}
```

**Perplexity** (`backend/perplexity.py`) — Đảm bảo return `citations` trong response:
```python
return {
    "content": content,
    "citations": data.get("citations", [])
}
```

**Propagate citations qua SSE:**
Trong `generate_full_report()`, sau khi done:
```python
yield _sse({"type": "citations", "urls": all_citations})
yield _sse({"type": "done", "report_id": report_id})
```

Frontend xử lý `type === "citations"` → `setCitations(data.urls)`.

---

## 8. Topics/Sections — Sub-topics + Inline Edit (copy từ taxsector)

### Tình trạng hiện tại
- `FullReport.jsx` có sections list nhưng **không có sub-topics** và **không edit được inline**

### Copy y chang từ taxsector `makeCard()` logic, adapt sang React:

```jsx
function SectionCard({ section, onToggle, onUpdateTitle, onAddSub, onRemoveSub, onRemove, onSuggestSubs }) {
  return (
    <div className={`sec-card border rounded-lg p-3 mb-2 transition-opacity ${!section.enabled ? 'opacity-45' : ''}`}>
      {/* Header row */}
      <div className="flex items-center gap-2 mb-2">
        <input type="checkbox" checked={section.enabled}
          onChange={e => onToggle(section.id, e.target.checked)}
          className="accent-brand w-4 h-4 cursor-pointer" />
        <input
          type="text"
          defaultValue={section.title}
          onBlur={e => onUpdateTitle(section.id, e.target.value)}
          className="flex-1 text-sm font-medium border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-brand/30 rounded px-1"
        />
        {section.tax_aware && (
          <span className="text-xs bg-green-100 text-green-700 rounded px-1">📚</span>
        )}
        {/* AI suggest subs */}
        <button onClick={() => onSuggestSubs(section.id)}
          title="AI gợi ý chủ đề con"
          className="text-xs px-1.5 py-0.5 rounded border border-gray-200 hover:bg-gray-50 text-gray-400">
          ✨
        </button>
        {/* Remove section */}
        <button onClick={() => onRemove(section.id)}
          className="text-gray-300 hover:text-red-400 text-sm px-1">✕</button>
      </div>

      {/* Sub-topics chips */}
      <div className="flex flex-wrap gap-1 ml-6">
        {section.sub?.map((sub, j) => (
          <span key={j}
            className="inline-flex items-center gap-1 bg-green-50 border border-green-100 rounded-full px-2 py-0.5 text-xs">
            {sub}
            <button onClick={() => onRemoveSub(section.id, j)}
              className="text-gray-400 hover:text-red-400 leading-none">✕</button>
          </span>
        ))}
        {/* Add sub button */}
        <button
          onClick={() => {
            const name = prompt('Nhập tên chủ đề con:')
            if (name?.trim()) onAddSub(section.id, name.trim())
          }}
          className="text-xs px-2 py-0.5 rounded-full border border-dashed border-gray-300 hover:border-brand hover:text-brand transition text-gray-400">
          + thêm
        </button>
      </div>
    </div>
  )
}
```

**Handler functions trong `FullReport.jsx`:**
```jsx
function toggleSection(id, enabled) {
  setSections(prev => prev.map(s => s.id === id ? {...s, enabled} : s))
}
function updateTitle(id, title) {
  setSections(prev => prev.map(s => s.id === id ? {...s, title} : s))
}
function addSub(id, sub) {
  setSections(prev => prev.map(s => s.id === id ? {...s, sub: [...(s.sub||[]), sub]} : s))
}
function removeSub(id, idx) {
  setSections(prev => prev.map(s => s.id === id
    ? {...s, sub: s.sub.filter((_, i) => i !== idx)}
    : s))
}
function removeSection(id) {
  setSections(prev => prev.filter(s => s.id !== id))
}
function addSection() {
  const id = 's' + Date.now()
  setSections(prev => [...prev, {id, title: 'Phần mới', sub: [], enabled: true, tax_aware: false}])
}

async function suggestSubs(secId) {
  const sec = sections.find(s => s.id === secId)
  if (!sec || !subject.trim()) return
  try {
    const data = await api.suggestSubsections({ title: sec.title, subject })
    if (data.suggestions?.length) {
      const newSubs = data.suggestions.filter(sg => !sec.sub.includes(sg))
      setSections(prev => prev.map(s => s.id === secId
        ? {...s, sub: [...(s.sub||[]), ...newSubs]}
        : s))
    }
  } catch(e) { console.error(e) }
}
```

**Backend: `POST /api/reports/suggest-subsections`**
```python
@router.post("/suggest-subsections")
async def suggest_subsections(
    body: dict = Body(...),
    user=Depends(get_current_user),
):
    title   = body.get("title", "")
    subject = body.get("subject", "")
    prompt = (
        f'Đề xuất 4-5 chủ đề con cho phần "{title}" '
        f'trong báo cáo thuế về: {subject}.\n'
        f'Trả về JSON array. Chỉ trả về array, không giải thích.\n'
        f'Ví dụ: ["Chủ đề 1", "Chủ đề 2"]'
    )
    result = await call_ai(
        messages=[{"role": "user", "content": prompt}],
        model_tier="haiku",
        max_tokens=400,
    )
    import re, json
    match = re.search(r'\[.*?\]', result["content"], re.DOTALL)
    suggestions = json.loads(match.group()) if match else []
    return {"suggestions": suggestions}
```

**`api.js`** — Thêm:
```js
suggestSubsections: (data) => post('/api/reports/suggest-subsections', data),
```

---

## 9. Migration — `report_jobs` table

**Chạy SQL này trực tiếp (Thanh sẽ chạy sau khi push):**
```sql
CREATE TABLE IF NOT EXISTS report_jobs (
    id VARCHAR PRIMARY KEY,
    subject VARCHAR,
    user_id INTEGER,
    status VARCHAR DEFAULT 'pending',
    progress_step INTEGER DEFAULT 0,
    progress_total INTEGER DEFAULT 0,
    progress_label VARCHAR DEFAULT '',
    html_content TEXT DEFAULT '',
    error_msg VARCHAR,
    report_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

Thêm vào `backend/migrations/run_migrations.py` và chạy luôn khi start (idempotent với `IF NOT EXISTS`).

---

## 10. Checklist cho Claude Code

**Quick fixes (nhỏ):**
- [ ] **#6** `buildTOC()`: strip số đầu trong h2 text → fix "1.1, 2.2"
- [ ] **#3** `config.py`: set `tax_aware: True` cho sections thuế
- [ ] **#4** `requirements.txt`: confirm python-docx, python-pptx, lxml, bs4

**Medium:**
- [ ] **#1** Quick Research history: 3 backend endpoints + frontend panel
- [ ] **#7** Citations/References: propagate từ Perplexity → SSE `citations` event → expandable section
- [ ] **#8** SectionCard component: sub-topics chips + inline edit + ✨ AI suggest subs endpoint

**Large:**
- [ ] **#2** TaxDocs: redesign 2 tabs (priority_docs + dbvntax list)
- [ ] **#5** Gamma API: backend endpoint + frontend checkbox + num_slides input + show link

**Cuối cùng:**
- [ ] **#9** `run_migrations.py`: thêm `report_jobs` table (IF NOT EXISTS)
- [ ] Xoá brief file này sau khi xong
- [ ] **KHÔNG tự deploy — nhắn Thanh "taxconsult push xong"**

---

## Env vars cần thêm Coolify

| Var | Ghi chú |
|-----|---------|
| `GAMMA_API_KEY` | Lấy từ gamma.app/settings/api (tùy chọn) |

Các env var khác đã có từ trước.
