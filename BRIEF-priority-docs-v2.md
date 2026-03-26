# BRIEF: Priority Docs + Tax Docs Viewer + Research Engine Upgrade
**Date:** 2026-03-26  
**For:** Claude Code  
**Repo:** phanvuhoang/taxconsult  
**Instruction:** Đọc brief này, implement đầy đủ tất cả các phần, xoá file này rồi push.

---

## Tổng quan

Nâng cấp 4 phần:
1. **Priority Docs** — danh sách văn bản ưu tiên do admin chọn (từ dbvntax), có metadata hiệu lực đầy đủ
2. **Tax Docs — Browse dbvntax** theo sắc thuế + view HTML on-demand (không import)
3. **Research Engine** — ưu tiên priority docs → dbvntax → Perplexity fallback
4. **Quick Research** — thêm Perplexity fallback khi dbvntax không đủ

---

## PHẦN 1: Backend — Model & Migration

### 1.1 Model mới: `PriorityDoc` (thêm vào `backend/models.py`)

```python
class PriorityDoc(Base):
    __tablename__ = "priority_docs"

    id = Column(Integer, primary_key=True)
    dbvntax_id = Column(Integer, nullable=False, unique=True)  # FK → dbvntax documents.id
    so_hieu = Column(String(200))
    ten = Column(Text, nullable=False)
    loai = Column(String(20))          # Luat | ND | TT | VBHN | CV
    co_quan = Column(String(100))
    sac_thue = Column(ARRAY(Text))     # ['TNDN', 'GTGT', ...]
    
    # Hiệu lực
    hieu_luc_tu = Column(Date)         # Ngày bắt đầu hiệu lực
    hieu_luc_den = Column(Date)        # Ngày hết hiệu lực (NULL = còn hiệu lực)
    
    # Thay thế
    thay_the_boi = Column(String(200)) # Số hiệu VB thay thế (vd: "NĐ 132/2020/NĐ-CP")
    pham_vi_het_hieu_luc = Column(String(20))  # "toan_bo" | "mot_phan" | NULL
    ghi_chu_hieu_luc = Column(Text)    # Ghi chú tự do: phần nào bị thay thế/sửa đổi
    
    # Link
    link_tvpl = Column(Text)
    
    # Sort
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
```

**Lưu ý:** SQLAlchemy async sẽ auto-create table qua `Base.metadata.create_all` trong lifespan — không cần Alembic migration.

---

## PHẦN 2: Backend — API Routes

### 2.1 Tạo file mới `backend/routes/priority_docs.py`

```python
router = APIRouter(prefix="/api/priority-docs", tags=["priority-docs"])
```

**Endpoints:**

#### `GET /api/priority-docs`
List tất cả priority docs. Query params: `sac_thue` (optional filter).
Response: array của priority doc objects (không bao gồm nội dung HTML).

#### `POST /api/priority-docs` (admin only)
Thêm VB vào priority list từ dbvntax.

Request body:
```json
{
  "dbvntax_id": 123,
  "hieu_luc_tu": "2021-01-01",        // optional, override từ dbvntax
  "hieu_luc_den": "2024-12-31",       // optional
  "thay_the_boi": "NĐ 132/2020/NĐ-CP", // optional
  "pham_vi_het_hieu_luc": "toan_bo",  // optional: "toan_bo" | "mot_phan"
  "ghi_chu_hieu_luc": "...",          // optional
  "sort_order": 0                     // optional
}
```

Logic:
1. Query dbvntax `documents` table với `id = dbvntax_id`
2. Copy metadata: `so_hieu`, `ten`, `loai`, `co_quan`, `sac_thue`, `link_tvpl`, `hieu_luc_tu` (nếu body không override)
3. Lưu vào `priority_docs`
4. Nếu `dbvntax_id` đã tồn tại → return 409

#### `PATCH /api/priority-docs/{id}` (admin only)
Cập nhật metadata hiệu lực. Body: bất kỳ field nào trong: `hieu_luc_tu`, `hieu_luc_den`, `thay_the_boi`, `pham_vi_het_hieu_luc`, `ghi_chu_hieu_luc`, `sort_order`.

#### `DELETE /api/priority-docs/{id}` (admin only)
Xoá khỏi priority list.

#### `GET /api/priority-docs/content/{dbvntax_id}`
Lấy `noi_dung` HTML của văn bản từ dbvntax (on-demand, không lưu local).
Response: `{ "so_hieu": "...", "ten": "...", "noi_dung_html": "..." }`

---

### 2.2 Cập nhật `backend/routes/tax_docs.py`

Thêm endpoint:

#### `GET /api/tax-docs/dbvntax-browse`
Browse dbvntax theo sắc thuế. Query params: `sac_thue` (required), `loai` (optional filter).

```python
@router.get("/dbvntax-browse")
async def browse_dbvntax(
    sac_thue: str = Query(...),  # e.g. "TNDN"
    loai: Optional[str] = Query(None),  # "Luat" | "ND" | "TT" | "VBHN"
    user: User = Depends(get_current_user),
    dbvntax_db: AsyncSession = Depends(get_dbvntax_db),
):
```

SQL:
```sql
SELECT id, so_hieu, ten, loai, co_quan, 
       ngay_ban_hanh::text, hieu_luc_tu::text, het_hieu_luc_tu::text,
       tinh_trang, link_tvpl, importance
FROM documents
WHERE sac_thue && ARRAY[:sac_thue]::varchar[]
  [AND loai = :loai]  -- nếu có filter
ORDER BY importance ASC, ngay_ban_hanh DESC
LIMIT 100
```

Response: array của doc objects (không có `noi_dung`).

#### `GET /api/tax-docs/dbvntax-content/{doc_id}`
Lấy HTML content từ dbvntax on-demand.
```python
@router.get("/dbvntax-content/{doc_id}")
async def get_dbvntax_content(
    doc_id: int,
    user: User = Depends(get_current_user),
    dbvntax_db: AsyncSession = Depends(get_dbvntax_db),
):
```
Response: `{ "id": ..., "so_hieu": "...", "ten": "...", "noi_dung_html": "..." }`

---

### 2.3 Cập nhật `backend/routes/admin.py`

Thêm endpoint để list tất cả sắc thuế có trong dbvntax:

#### `GET /api/admin/dbvntax-sac-thue`
```sql
SELECT DISTINCT unnest(sac_thue) as sac_thue, COUNT(*) as count
FROM documents
GROUP BY sac_thue
ORDER BY count DESC
```
Response: `[{ "sac_thue": "TNDN", "count": 8 }, ...]`

---

### 2.4 Cập nhật `backend/doc_context.py`

**Thêm hàm `get_priority_docs_context`:**

```python
async def get_priority_docs_context(
    db,           # taxconsult DB
    dbvntax_db,   # dbvntax DB
    tax_types: list,
    time_period_end: str = None,   # filter: VB phải có hiệu lực trong giai đoạn này
    time_period_start: str = None, # filter: VB phải bắt đầu trước giai đoạn này
    include_partial: bool = True,  # include VB hết hiệu lực một phần
) -> str:
```

Logic:
1. Query `priority_docs` từ taxconsult DB, filter theo `sac_thue` matching `tax_types`
2. Thêm filter time_period:
   - `hieu_luc_tu <= time_period_end` (VB phải có hiệu lực trước hoặc trong giai đoạn)
   - `hieu_luc_den IS NULL OR hieu_luc_den >= time_period_start` (VB chưa hết hạn trước giai đoạn)
3. Với mỗi priority doc → query `noi_dung` từ dbvntax theo `dbvntax_id`
4. Format thành context block:

```
=== [ƯU TIÊN] VĂN BẢN: {so_hieu} ===
Tên: {ten}
Loại: {loai} | Cơ quan: {co_quan}
Hiệu lực: {hieu_luc_tu} → {hieu_luc_den or "nay"}
{if thay_the_boi} ⚠️ Bị thay thế bởi: {thay_the_boi} ({pham_vi_het_hieu_luc})
{if ghi_chu_hieu_luc} 📋 Ghi chú: {ghi_chu_hieu_luc}
LINK: {link_tvpl}

NỘI DUNG:
{noi_dung stripped HTML, max 15000 chars}
==================================================
```

**Cập nhật `get_relevant_docs`:**
- Thêm param `exclude_dbvntax_ids: list = []` để tránh duplicate với priority docs
- SQL: `AND d.id NOT IN (:exclude_ids)`

---

### 2.5 Cập nhật `backend/quick_research.py`

Thêm Perplexity fallback:

```python
async def run_quick_research(...):
    # 1. Get priority docs context (NEW)
    priority_ctx = await get_priority_docs_context(db, dbvntax_db, tax_types, ...)
    priority_ids = _extract_dbvntax_ids(priority_ctx)
    
    # 2. Get dbvntax docs (exclude priority already fetched)
    doc_ctx = await get_relevant_docs(dbvntax_db, tax_types, ..., exclude_dbvntax_ids=priority_ids)
    cv_ctx = await get_relevant_congvan(dbvntax_db, tax_types, keywords=keywords)
    
    # 3. Perplexity fallback nếu cả 2 context đều rỗng
    perplexity_ctx = ""
    if not priority_ctx and not doc_ctx:
        from backend.perplexity import perplexity_search
        perplexity_ctx = await perplexity_search(
            f"Quy định thuế Việt Nam: {question} (giai đoạn {time_period})",
            model="sonar"
        )
    
    # Update QUICK_PROMPT để inject priority_ctx + perplexity_ctx
```

Cập nhật `QUICK_PROMPT` để có section:
```
=== VĂN BẢN ƯU TIÊN (admin đã chọn) ===
{priority_ctx}

=== VĂN BẢN TỪ DATABASE ===
{doc_context}

=== CÔNG VĂN HƯỚNG DẪN ===
{cv_context}

=== NGUỒN WEB (Perplexity) — dùng khi database không đủ ===
{perplexity_ctx}
```

---

### 2.6 Cập nhật `backend/report_generator.py`

Tương tự quick_research — cập nhật `generate_full_report`:
1. Fetch `priority_ctx` trước
2. Truyền vào `SECTION_PROMPT_TAX` với section mới `=== VĂN BẢN ƯU TIÊN ===`
3. Pass `exclude_dbvntax_ids` vào `get_relevant_docs`

---

### 2.7 Register router mới trong `main.py`

```python
from backend.routes import auth, reports, research, tax_docs, admin, priority_docs

app.include_router(priority_docs.router)
```

---

## PHẦN 3: Frontend

### 3.1 Trang `TaxDocs.jsx` — nâng cấp toàn diện

Layout mới: **2 panel**
- **Panel trái** (40%): danh sách văn bản + controls
- **Panel phải** (60%): HTML viewer khi click vào VB

#### Panel trái — 3 tab:
1. **"Văn bản ưu tiên"** — danh sách priority docs (từ `/api/priority-docs`)
2. **"Browse dbvntax"** — browse theo sắc thuế (từ `/api/tax-docs/dbvntax-browse`)
3. **"Đã import"** — tax_docs table hiện tại (giữ nguyên)

#### Tab "Văn bản ưu tiên":
- Dropdown filter: sắc thuế
- Danh sách VB với badge: loại VB (Luat/ND/TT...), hiệu lực (còn/hết), badge "⚠️ một phần" nếu `pham_vi_het_hieu_luc = "mot_phan"`
- Click → load HTML vào panel phải
- Nút "✏️ Sửa metadata" (admin) → inline form edit `hieu_luc_den`, `thay_the_boi`, `pham_vi_het_hieu_luc`, `ghi_chu_hieu_luc`
- Nút "🗑️ Xoá" (admin)

#### Tab "Browse dbvntax":
- **Dropdown sắc thuế** (load từ `/api/admin/dbvntax-sac-thue`): TNDN, GTGT, TNCN, TTDB, FCT, QLT, HDDT, HKD, XNK, THUE_QT, GDLK...
- **Dropdown loại VB** (optional filter): Tất cả / Luật / Nghị định / Thông tư / VBHN
- Danh sách VB có: số hiệu, tên, loại, ngày ban hành, trạng thái hiệu lực
- Click VB → load HTML vào panel phải (gọi `/api/tax-docs/dbvntax-content/{id}`)
- Nút **"+ Thêm vào ưu tiên"** (admin) → mở modal điền metadata hiệu lực → POST `/api/priority-docs`

#### Panel phải — HTML Viewer:
- Khi chưa chọn VB: placeholder "Chọn văn bản để xem nội dung"
- Khi đã chọn: hiển thị header (số hiệu, tên, metadata hiệu lực) + render `noi_dung_html`
- Style giống ContentPanel của dbvntax: font readable, padding, line-height thoải mái
- Nút "🔗 Mở TVPL" nếu có `link_tvpl`
- Scroll độc lập với panel trái

#### Modal "Thêm vào ưu tiên":
Fields:
- `hieu_luc_tu`: date picker (pre-filled từ dbvntax)
- `hieu_luc_den`: date picker (optional)
- `thay_the_boi`: text input (optional)
- `pham_vi_het_hieu_luc`: select "Còn hiệu lực" / "Hết hiệu lực toàn bộ" / "Hết hiệu lực một phần"
- `ghi_chu_hieu_luc`: textarea (optional)
- `sort_order`: number (default 0)

---

### 3.2 Cập nhật `src/api.js`

Thêm các API calls:
```js
// Priority Docs
listPriorityDocs: (sac_thue) => GET /api/priority-docs?sac_thue=...
addPriorityDoc: (body) => POST /api/priority-docs
updatePriorityDoc: (id, body) => PATCH /api/priority-docs/{id}
deletePriorityDoc: (id) => DELETE /api/priority-docs/{id}
getPriorityDocContent: (dbvntax_id) => GET /api/priority-docs/content/{dbvntax_id}

// Tax Docs
browseDbvntax: (sac_thue, loai) => GET /api/tax-docs/dbvntax-browse?sac_thue=...&loai=...
getDbvntaxContent: (id) => GET /api/tax-docs/dbvntax-content/{id}

// Admin
getDbvntaxSacThue: () => GET /api/admin/dbvntax-sac-thue
```

---

### 3.3 Cập nhật `Layout.jsx`

Đổi menu item "Tax Docs" → "📚 Văn bản" (nếu chưa đổi).

---

## PHẦN 4: Styling

- Primary color: `#028a39` (đã có trong tailwind config là `brand`)
- HTML viewer trong panel phải: thêm CSS để render đẹp:
  ```css
  .doc-html-viewer {
    font-size: 14px;
    line-height: 1.7;
    color: #1f2937;
  }
  .doc-html-viewer table { border-collapse: collapse; width: 100%; }
  .doc-html-viewer td, .doc-html-viewer th { border: 1px solid #e5e7eb; padding: 6px 10px; }
  .doc-html-viewer h1, h2, h3 { color: #028a39; margin: 12px 0 6px; }
  ```

---

## Checklist implement

- [ ] `backend/models.py` — thêm `PriorityDoc` model
- [ ] `backend/routes/priority_docs.py` — tạo mới, đầy đủ 5 endpoints
- [ ] `backend/routes/tax_docs.py` — thêm `/dbvntax-browse` và `/dbvntax-content/{id}`
- [ ] `backend/routes/admin.py` — thêm `/dbvntax-sac-thue`
- [ ] `backend/doc_context.py` — thêm `get_priority_docs_context()`, cập nhật `get_relevant_docs()`
- [ ] `backend/quick_research.py` — inject priority_ctx + Perplexity fallback
- [ ] `backend/report_generator.py` — inject priority_ctx + exclude_ids
- [ ] `main.py` — register `priority_docs.router`
- [ ] `frontend/src/api.js` — thêm API calls mới
- [ ] `frontend/src/pages/TaxDocs.jsx` — rewrite với 2-panel layout, 3 tabs, HTML viewer, modal
- [ ] Xoá file BRIEF này sau khi implement xong
- [ ] `git add -A && git commit -m "feat: priority docs + tax docs viewer + research engine upgrade" && git push`

---

## Notes cho Claude Code

- DB connections: `db` = taxconsult DB, `dbvntax_db` = dbvntax DB (read-only). Dùng đúng DB cho đúng table.
- `PriorityDoc` lưu trong taxconsult DB. Content HTML fetch on-demand từ dbvntax DB.
- `sac_thue` trong dbvntax là `varchar[]` (PostgreSQL array). Match bằng `&&` operator.
- Không dùng Alembic — SQLAlchemy auto-create via lifespan.
- Giữ nguyên tất cả tính năng hiện có, chỉ thêm mới.
- Primary color brand = `#028a39`.
