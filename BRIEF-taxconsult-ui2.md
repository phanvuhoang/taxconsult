# BRIEF: taxconsult — UI/UX Refinements Round 2
**Date:** 2026-03-31
**Author:** Thanh AI

---

## 1. Topics/Sections riêng cho Ngành vs Công ty

### `backend/config.py` — Thêm `COMPANY_SECTIONS`

```python
COMPANY_SECTIONS = [
    {"id": "c1", "title": "Giới thiệu công ty", "enabled": True, "tax_aware": False,
     "sub": ["Lịch sử hình thành", "Cơ cấu sở hữu & cổ đông", "Ngành nghề kinh doanh chính",
             "Quy mô: doanh thu, nhân sự, tài sản"]},
    {"id": "c2", "title": "Mô hình kinh doanh & chuỗi giá trị", "enabled": True, "tax_aware": False,
     "sub": ["Sản phẩm/dịch vụ chính", "Khách hàng mục tiêu", "Nhà cung cấp & đối tác",
             "Chuỗi giá trị nội bộ"]},
    {"id": "c3", "title": "Cấu trúc pháp lý & giao dịch liên kết", "enabled": True, "tax_aware": True,
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
    {"id": "c6", "title": "Tuân thủ & quản trị thuế", "enabled": True, "tax_aware": True,
     "sub": ["Quy trình kê khai nội bộ", "Kiểm soát nội bộ về thuế",
             "Rủi ro xử phạt chậm nộp", "Nhân sự & năng lực thuế"]},
    {"id": "c7", "title": "Khuyến nghị chiến lược thuế", "enabled": True, "tax_aware": True,
     "sub": ["Tối ưu hóa cấu trúc thuế", "Cơ hội ưu đãi chưa tận dụng",
             "Rủi ro cần theo dõi ngay", "Lộ trình cải thiện tuân thủ"]},
]
```

**Đổi tên `DEFAULT_SECTIONS` → `SECTOR_SECTIONS`** (tránh nhầm):
```python
SECTOR_SECTIONS = [
    # ... nội dung hiện tại của DEFAULT_SECTIONS, giữ nguyên ...
]
# Backward compat alias
DEFAULT_SECTIONS = SECTOR_SECTIONS
```

### `backend/routes/reports.py` — Endpoint suggest-sections

```python
from backend.config import SECTOR_SECTIONS, COMPANY_SECTIONS

@router.get("/default-sections")
async def get_default_sections(mode: str = "ngành", user=Depends(get_current_user)):
    return COMPANY_SECTIONS if mode == "công ty" else SECTOR_SECTIONS
```

### `frontend/src/pages/FullReport.jsx`

Khi user đổi mode (ngành ↔ công ty) → load lại default sections:
```jsx
// Khi mode thay đổi → load sections phù hợp
async function handleModeChange(newMode) {
  setMode(newMode)
  const data = await api.getDefaultSections(newMode)
  setSections(data)
}

// Reset sections về default
async function resetSections() {
  const data = await api.getDefaultSections(mode)
  setSections(data)
}
```

Button reset: `<button onClick={resetSections}>↺ Reset mặc định</button>`

`api.js`:
```js
getDefaultSections: (mode = 'ngành') => get(`/api/reports/default-sections?mode=${encodeURIComponent(mode)}`),
```

---

## 2. Drag-and-drop Sections

### Dùng `@dnd-kit/core` + `@dnd-kit/sortable` (nhẹ, không cần jQuery)

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### `frontend/src/pages/FullReport.jsx`

```jsx
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Trong SectionCard — thêm drag handle
function SortableSectionCard({ section, ...props }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <SectionCard
        section={section}
        dragHandle={
          <span {...attributes} {...listeners}
            className="cursor-grab text-gray-300 hover:text-gray-500 px-1 touch-none"
            title="Kéo để sắp xếp">
            ⠿
          </span>
        }
        {...props}
      />
    </div>
  )
}

// Trong FullReport — wrap sections list
function handleDragEnd(event) {
  const { active, over } = event
  if (active.id !== over?.id) {
    setSections(prev => {
      const oldIdx = prev.findIndex(s => s.id === active.id)
      const newIdx = prev.findIndex(s => s.id === over.id)
      return arrayMove(prev, oldIdx, newIdx)
    })
  }
}

// JSX
<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
  <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
    {sections.map(section => (
      <SortableSectionCard key={section.id} section={section} ... />
    ))}
  </SortableContext>
</DndContext>
```

---

## 3. `tax_aware` Toggle per Section

### Hiện tại
`tax_aware` được hardcode trong config, user không đổi được.

### Fix: Thêm toggle trong SectionCard

```jsx
// Trong SectionCard header row, sau badge "📚 anchor":
<button
  onClick={() => onToggleTaxAware(section.id)}
  title={section.tax_aware ? "Đang dùng anchor docs — click để tắt" : "Click để bật anchor docs"}
  className={`text-xs px-1.5 py-0.5 rounded border transition ${
    section.tax_aware
      ? 'bg-green-100 border-green-200 text-green-700'
      : 'bg-gray-100 border-gray-200 text-gray-400'
  }`}>
  📚 {section.tax_aware ? 'anchor on' : 'anchor off'}
</button>
```

Handler:
```jsx
function toggleTaxAware(id) {
  setSections(prev => prev.map(s => s.id === id ? {...s, tax_aware: !s.tax_aware} : s))
}
```

**Default cho sections pháp lý không phải thuế:**
- `s3` "Khung pháp lý" → `tax_aware: false` (mặc định off — luật chuyên ngành, không phải thuế)
- `s4`, `s5`, `s6` → `tax_aware: true` (luôn on)
- `c3` "Cấu trúc pháp lý" → `tax_aware: false` mặc định
- `c4`, `c5`, `c6`, `c7` → `tax_aware: true`

---

## 4. Defaults: Gamma on (20 slides) + Sonar Pro

### `frontend/src/pages/FullReport.jsx`

```jsx
// Đổi default states:
const [createGamma, setCreateGamma] = useState(true)   // mặc định ON
const [numSlides, setNumSlides]     = useState(20)
const [sonarModel, setSonarModel]   = useState('sonar-pro')  // mặc định Sonar Pro
```

Trong Sonar model selector — đổi default checked:
```jsx
{ v: 'sonar', l: 'Sonar' },
{ v: 'sonar-pro', l: 'Sonar Pro ⭐' },  // ⭐ đổi sang đây
```

---

## 5. Dark / Light Mode Toggle

### `frontend/src/components/Layout.jsx`

```jsx
import { useState, useEffect } from 'react'

export function useTheme() {
  const [dark, setDark] = useState(() => {
    return localStorage.getItem('theme') === 'dark'
  })

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [dark])

  return [dark, setDark]
}
```

**Button trong header (Layout.jsx hoặc App.jsx):**
```jsx
const [dark, setDark] = useTheme()

<button
  onClick={() => setDark(!dark)}
  className="p-2 rounded-lg btn-gray text-xl"
  title="Đổi giao diện sáng/tối">
  {dark ? '☀️' : '🌙'}
</button>
```

### `frontend/tailwind.config.js` — Bật dark mode class-based:
```js
module.exports = {
  darkMode: 'class',  // ← thêm dòng này
  // ...
}
```

### `frontend/src/index.css` — Thêm dark mode vars:
```css
.dark {
  --bg: #0f172a;
  --surface: #1e293b;
  --border: #334155;
  --text: #e2e8f0;
  --muted: #94a3b8;
}
.dark #report-content tr:nth-child(even) td { background: #162032; }
.dark .sub-chip { background: #064e3b; border-color: #065f46; }
```

---

## 6 & 7. Tab Văn bản — Redesign: "Ưu tiên" + "VB Quan trọng"

### Tổng quan kiến trúc mới

```
Tab Văn bản:
├── Tab "📌 Ưu tiên"      → priority_docs (taxconsult DB) — admin set mức 1-5
└── Tab "📚 VB Quan trọng" → documents (dbvntax DB) — anchor list theo sắc thuế
```

**Bỏ tab "Import"** (import đã được thực hiện qua tab VB Quan trọng → thêm vào Ưu tiên).

---

### 6a. Tab "📌 Ưu tiên" — Thêm `priority_level` (1-5)

#### DB Migration — Thêm column

```sql
-- Chạy trong run_migrations.py
ALTER TABLE priority_docs ADD COLUMN IF NOT EXISTS priority_level INTEGER DEFAULT 3;
COMMENT ON COLUMN priority_docs.priority_level IS '1=cao nhất, 5=thấp nhất';
```

#### `backend/models.py`
```python
class PriorityDoc(Base):
    # ... existing fields ...
    priority_level = Column(Integer, default=3)  # 1-5, 1=cao nhất
```

#### `backend/routes/priority_docs.py`
- `_serialize()`: thêm `"priority_level": d.priority_level`
- `UpdatePriorityDocRequest`: thêm `priority_level: Optional[int] = None`
- `update_priority_doc()`: handle `priority_level`
- `list_priority_docs()`: order by `priority_level ASC, sort_order ASC`

#### `backend/doc_context.py` — `get_priority_docs_context()`

```python
# Sửa query để sort theo priority_level
q = select(PriorityDoc).order_by(
    PriorityDoc.priority_level.asc(),   # 1 trước
    PriorityDoc.sort_order.asc(),
    PriorityDoc.id.asc()
)
# Trong context string — ghi rõ mức ưu tiên:
for pd in priority_docs:
    level_label = {1: "⭐⭐⭐ MỨC 1", 2: "⭐⭐ MỨC 2", 3: "⭐ MỨC 3",
                   4: "MỨC 4", 5: "MỨC 5"}.get(pd.priority_level, "MỨC 3")
    ctx_parts.append(f"=== [{level_label}] VĂN BẢN: {pd.so_hieu} ===\n{content}")
```

#### `frontend/src/pages/TaxDocs.jsx` — Tab "Ưu tiên"

Priority level selector per doc (inline):
```jsx
// Trong mỗi priority doc row:
<select
  value={doc.priority_level || 3}
  onChange={e => updatePriorityLevel(doc.id, Number(e.target.value))}
  className="text-xs border rounded px-1 py-0.5"
  title="Mức ưu tiên (1=cao nhất)">
  {[1,2,3,4,5].map(n => (
    <option key={n} value={n}>
      {'⭐'.repeat(Math.max(0, 3-n+1)) || '·'} Mức {n}
    </option>
  ))}
</select>
```

Group by priority level cho dễ đọc:
```jsx
{[1,2,3,4,5].map(level => {
  const docsAtLevel = priorityDocs.filter(d => (d.priority_level || 3) === level)
  if (!docsAtLevel.length) return null
  return (
    <div key={level} className="mb-4">
      <h4 className="text-xs font-semibold text-gray-500 mb-1">
        {'⭐'.repeat(Math.max(0,3-level+1)) || '·'} Mức {level} ({docsAtLevel.length} văn bản)
      </h4>
      {docsAtLevel.map(doc => <PriorityDocRow key={doc.id} doc={doc} ... />)}
    </div>
  )
})}
```

---

### 6b. Tab "📚 VB Quan trọng" — Anchor list từ dbvntax

#### `backend/routes/tax_docs.py` — Thêm endpoint

```python
from sqlalchemy import text as sql_text
from backend.database import get_dbvntax_db

@router.get("/dbvntax")
async def list_dbvntax_docs(
    sac_thue: str = None,
    loai: str = None,
    search: str = None,
    page: int = 1,
    limit: int = 50,
    user=Depends(get_current_user),
    dbvntax_db: AsyncSession = Depends(get_dbvntax_db),
):
    """List văn bản từ dbvntax — grouped by sắc thuế."""
    filters = ["1=1"]
    params = {}
    if sac_thue:
        filters.append(":sac_thue = ANY(sac_thue)")
        params["sac_thue"] = sac_thue
    if loai:
        filters.append("doc_type = :loai")
        params["loai"] = loai
    if search:
        filters.append("(ten ILIKE :search OR so_hieu ILIKE :search)")
        params["search"] = f"%{search}%"
    where = " AND ".join(filters)
    params["offset"] = (page-1)*limit
    params["limit"] = limit

    rows = await dbvntax_db.execute(sql_text(f"""
        SELECT id, so_hieu, ten, doc_type, sac_thue,
               ngay_ban_hanh::text, importance, tinh_trang
        FROM documents
        WHERE {where}
        ORDER BY importance ASC, ngay_ban_hanh DESC
        OFFSET :offset LIMIT :limit
    """), params)
    docs = [dict(r) for r in rows.mappings()]

    # Count total
    cnt = await dbvntax_db.execute(sql_text(f"""
        SELECT COUNT(*) FROM documents WHERE {where}
    """), {k:v for k,v in params.items() if k not in ('offset','limit')})
    total = cnt.scalar()

    return {"docs": docs, "total": total, "page": page}
```

#### `frontend/src/pages/TaxDocs.jsx` — Redesign

```jsx
const [activeTab, setActiveTab] = useState('priority')  // 'priority' | 'anchor'

// Tab bar
<div className="flex gap-2 border-b mb-4">
  <TabBtn id="priority" label="📌 Ưu tiên" active={activeTab} onClick={setActiveTab} />
  <TabBtn id="anchor"   label="📚 VB Quan trọng" active={activeTab} onClick={setActiveTab} />
</div>

{activeTab === 'priority' && <PriorityDocsPanel ... />}
{activeTab === 'anchor'   && <AnchorDocsPanel ... />}
```

**`AnchorDocsPanel`:**
```jsx
function AnchorDocsPanel() {
  // Filter controls: sắc thuế, loại VB, search
  // Group documents by sac_thue
  // Mỗi row: so_hieu | ten (truncated) | loai | ngay_ban_hanh | importance badge
  // Button "📌 Thêm vào Ưu tiên" → mở AddPriorityModal (đã có)
}
```

**Importance badge:**
```jsx
const IMPORTANCE_LABEL = {1: '⭐⭐ Rất quan trọng', 2: '⭐ Quan trọng', 3: 'Tham khảo', 4: 'Công văn', 5: '·'}
```

`api.js`:
```js
getDbvntaxDocs: (params) => get(`/api/tax-docs/dbvntax?${new URLSearchParams(params)}`),
```

---

## 8. Context injection theo priority_level

### `backend/doc_context.py` — `get_priority_docs_context()`

Limit docs theo priority level để không overflow context:
```python
# Max docs per level (tổng ≤ 10 docs để giữ context ngắn)
MAX_PER_LEVEL = {1: 5, 2: 3, 3: 2, 4: 1, 5: 0}

# Sort: level 1 trước, level 1 content đầy đủ hơn
for pd in sorted(priority_docs, key=lambda x: x.priority_level or 3):
    level = pd.priority_level or 3
    max_chars = {1: 3000, 2: 2000, 3: 1500, 4: 800, 5: 0}.get(level, 1500)
    if max_chars == 0:
        continue
    # Truncate content theo level
    content_snippet = content[:max_chars]
    level_label = {1:"⭐⭐⭐ ƯU TIÊN CAO NHẤT", 2:"⭐⭐ ƯU TIÊN CAO", 3:"⭐ THAM KHẢO",
                   4:"THẤP", 5:"BỎ QUA"}.get(level, "THAM KHẢO")
    ctx_parts.append(f"=== [{level_label}] {pd.so_hieu} — {pd.ten} ===\n{content_snippet}")
```

### `backend/quick_research.py` — `QUICK_PROMPT`

Thêm hướng dẫn dùng priority:
```
=== VĂN BẢN ƯU TIÊN (đã được admin xếp hạng — MỨC 1 = cao nhất) ===
{priority_ctx}

⚠️ QUAN TRỌNG: Ưu tiên dẫn chiếu văn bản MỨC 1 trước, rồi mới đến MỨC 2, MỨC 3.
Chỉ dùng văn bản thấp hơn khi văn bản cao hơn không đủ.
```

---

## Migration bổ sung

Thêm vào `backend/migrations/run_migrations.py`:

```python
PRIORITY_LEVEL_SQL = """
ALTER TABLE priority_docs ADD COLUMN IF NOT EXISTS priority_level INTEGER DEFAULT 3;
"""
# Chạy với taxconsult engine
```

---

## Checklist cho Claude Code

**Config & defaults:**
- [ ] `config.py`: thêm `COMPANY_SECTIONS`, đổi `DEFAULT_SECTIONS` → `SECTOR_SECTIONS` (giữ alias)
- [ ] `routes/reports.py`: `GET /default-sections?mode=` trả về đúng SECTOR hoặc COMPANY
- [ ] `FullReport.jsx`: `handleModeChange()` load sections theo mode + button Reset
- [ ] `FullReport.jsx`: defaults `createGamma=true`, `numSlides=20`, `sonarModel='sonar-pro'`

**Drag-and-drop:**
- [ ] `package.json`: thêm `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- [ ] `FullReport.jsx`: wrap sections với `DndContext` + `SortableContext`, handle `onDragEnd`
- [ ] `SectionCard`: thêm drag handle `⠿`

**tax_aware toggle:**
- [ ] `SectionCard`: button toggle 📚 anchor on/off
- [ ] `FullReport.jsx`: handler `toggleTaxAware(id)`
- [ ] `config.py`: điều chỉnh default `tax_aware` (s3/c3 = false, tax sections = true)

**Dark mode:**
- [ ] `tailwind.config.js`: `darkMode: 'class'`
- [ ] `Layout.jsx`: `useTheme()` hook + button 🌙/☀️ trong header, persist `localStorage`
- [ ] `index.css`: `.dark` vars

**Tab Văn bản:**
- [ ] `run_migrations.py`: thêm `priority_level` column
- [ ] `models.py`: thêm `priority_level` field
- [ ] `routes/priority_docs.py`: serialize + update `priority_level`, sort by it
- [ ] `routes/tax_docs.py`: thêm `GET /api/tax-docs/dbvntax`
- [ ] `doc_context.py`: sort + truncate theo `priority_level`
- [ ] `TaxDocs.jsx`: redesign 2 tabs (Ưu tiên + VB Quan trọng), bỏ tab Import
- [ ] `quick_research.py` `QUICK_PROMPT`: thêm hướng dẫn dùng priority level

**Sau khi push:**
- [ ] Xoá brief file này
- [ ] Nhắn Thanh "taxconsult push xong" → Thanh chạy migration + deploy
