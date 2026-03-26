# BRIEF: UI Improvements — Resizable Panel, AI-gen Priority Modal, Font Size
**Date:** 2026-03-26
**For:** Claude Code
**Repo:** phanvuhoang/taxconsult
**Instruction:** Implement đầy đủ tất cả phần bên dưới, xoá file này rồi push.

---

## PHẦN 1: Resizable panel + collapse trong TaxDocs

### Mô tả
Layout TaxDocs hiện tại: panel trái (danh sách) + panel phải (viewer) cố định tỉ lệ.
Cần: (a) kéo resize được, (b) nút collapse panel trái chỉ còn số hiệu.

### Implement trong `frontend/src/pages/TaxDocs.jsx`

#### 1a. Resizable divider
Thêm state và drag logic:
```js
const [panelWidth, setPanelWidth] = useState(380) // px, default
const [isDragging, setIsDragging] = useState(false)
const dragRef = useRef(null)

// Mouse events on divider
function onDividerMouseDown(e) {
  e.preventDefault()
  setIsDragging(true)
}
useEffect(() => {
  if (!isDragging) return
  function onMove(e) { setPanelWidth(Math.max(220, Math.min(600, e.clientX))) }
  function onUp() { setIsDragging(false) }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
}, [isDragging])
```

Layout:
```jsx
<div className="flex flex-1 overflow-hidden">
  {/* Left panel — fixed width */}
  <div style={{ width: collapsed ? 48 : panelWidth }} className="flex flex-col border-r border-gray-200 overflow-hidden transition-all duration-150">
    ...content...
  </div>

  {/* Divider — draggable */}
  <div
    onMouseDown={onDividerMouseDown}
    className={`w-1 bg-gray-200 hover:bg-brand cursor-col-resize shrink-0 transition-colors ${isDragging ? 'bg-brand' : ''}`}
  />

  {/* Right panel */}
  <div className="flex-1 flex flex-col overflow-hidden">
    ...viewer...
  </div>
</div>
```

#### 1b. Collapse toggle
Thêm state: `const [collapsed, setCollapsed] = useState(false)`

Khi `collapsed = true`: panel trái width = 48px, chỉ hiển thị danh sách icon + số hiệu theo chiều dọc (truncated). Nút toggle ở top của divider hoặc ở header panel trái.

Nút toggle:
```jsx
<button
  onClick={() => setCollapsed(c => !c)}
  className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
  title={collapsed ? "Mở rộng" : "Thu nhỏ"}
>
  {collapsed ? '»' : '«'}
</button>
```

Khi collapsed, mỗi item trong danh sách chỉ hiển thị:
```jsx
{collapsed ? (
  <div className="px-1 py-2 text-xs font-mono truncate writing-mode-vertical cursor-pointer hover:bg-gray-100"
    onClick={() => loadContent(d)}
    title={`${d.so_hieu} — ${d.ten}`}>
    {d.so_hieu || '—'}
  </div>
) : (
  // full item render như hiện tại
)}
```

---

## PHẦN 2: AI-gen trong modal "Thêm vào ưu tiên"

### Mô tả
Modal hiện tại có các field: hieu_luc_tu, hieu_luc_den, thay_the_boi, pham_vi_het_hieu_luc, ghi_chu_hieu_luc, sort_order.

Thêm nút **"✨ AI gợi ý"** — khi click, gọi backend để AI đọc `hieu_luc_index` từ dbvntax và pre-fill các field.

**Ưu tiên:** Dùng data từ `hieu_luc_index` (đã có trong dbvntax) trước. Nếu thiếu → AI phân tích nội dung văn bản.

### 2a. Backend — thêm endpoint vào `backend/routes/priority_docs.py`

```python
@router.get("/suggest/{dbvntax_id}")
async def suggest_priority_metadata(
    dbvntax_id: int,
    user: User = Depends(require_admin),
    dbvntax_db: AsyncSession = Depends(get_dbvntax_db),
):
    """
    Đọc hieu_luc_index từ dbvntax + AI phân tích → trả về suggested metadata.
    """
    from sqlalchemy import text
    result = await dbvntax_db.execute(
        text("""
            SELECT so_hieu, ten, loai, co_quan,
                   hieu_luc_tu::text, het_hieu_luc_tu::text,
                   tinh_trang, hieu_luc_index, noi_dung
            FROM documents WHERE id = :id
        """),
        {"id": dbvntax_id}
    )
    row = result.mappings().one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    row = dict(row)

    # Step 1: Parse hieu_luc_index (đã có, không cần AI)
    import json as _json
    hli = row.get("hieu_luc_index") or {}
    if isinstance(hli, str):
        try: hli = _json.loads(hli)
        except: hli = {}

    suggestion = {
        "hieu_luc_tu": row.get("hieu_luc_tu"),
        "hieu_luc_den": row.get("het_hieu_luc_tu"),
        "thay_the_boi": None,
        "pham_vi_het_hieu_luc": None,
        "ghi_chu_hieu_luc": None,
        "source": "hieu_luc_index",  # track where data came from
    }

    # Extract van_ban_thay_the
    thay_the = hli.get("van_ban_thay_the", [])
    if thay_the:
        suggestion["thay_the_boi"] = thay_the[0] if isinstance(thay_the[0], str) else str(thay_the[0])

    # Extract pham_vi from hieu_luc array
    hieu_luc_arr = hli.get("hieu_luc", [])
    if hieu_luc_arr:
        # Check if any entry has partial scope
        pham_vi_list = [h.get("pham_vi", "") for h in hieu_luc_arr if h.get("pham_vi")]
        if pham_vi_list:
            first_pv = pham_vi_list[0].lower()
            if "toàn bộ" in first_pv or "toàn bô" in first_pv:
                suggestion["pham_vi_het_hieu_luc"] = "toan_bo"
            elif any(kw in first_pv for kw in ["một phần", "khoản", "điều", "điểm"]):
                suggestion["pham_vi_het_hieu_luc"] = "mot_phan"

    # tom_tat_hieu_luc → ghi_chu
    if hli.get("tom_tat_hieu_luc"):
        suggestion["ghi_chu_hieu_luc"] = hli["tom_tat_hieu_luc"]

    # Step 2: Nếu hieu_luc_index không đủ → dùng AI phân tích nội dung
    needs_ai = not suggestion["hieu_luc_tu"] and not suggestion["hieu_luc_den"] and not suggestion["thay_the_boi"]
    if needs_ai and row.get("noi_dung"):
        from backend.doc_context import strip_html_tvpl
        from backend.ai_provider import call_ai
        content_text = strip_html_tvpl(row["noi_dung"])
        # Chỉ lấy 3000 chars cuối (phần hiệu lực thường ở cuối văn bản)
        content_tail = content_text[-3000:] if len(content_text) > 3000 else content_text

        ai_prompt = f"""Văn bản: {row['so_hieu']} — {row['ten']}
Trạng thái hiện tại: {row.get('tinh_trang', '')}

PHẦN CUỐI VĂN BẢN:
{content_tail}

Hãy trích xuất thông tin hiệu lực và trả về JSON (chỉ JSON, không giải thích):
{{
  "hieu_luc_tu": "YYYY-MM-DD hoặc null",
  "hieu_luc_den": "YYYY-MM-DD hoặc null (null nếu còn hiệu lực)",
  "thay_the_boi": "số hiệu văn bản thay thế hoặc null",
  "pham_vi_het_hieu_luc": "toan_bo hoặc mot_phan hoặc null",
  "ghi_chu_hieu_luc": "tóm tắt ngắn về hiệu lực (tối đa 200 ký tự)"
}}"""

        try:
            ai_result = await call_ai(
                messages=[{"role": "user", "content": ai_prompt}],
                system="Bạn là chuyên gia pháp lý, trích xuất thông tin chính xác từ văn bản luật Việt Nam.",
                model_tier="haiku",
                max_tokens=512,
            )
            import re
            json_match = re.search(r'\{.*\}', ai_result["content"], re.DOTALL)
            if json_match:
                ai_data = _json.loads(json_match.group())
                for k in ["hieu_luc_tu", "hieu_luc_den", "thay_the_boi", "pham_vi_het_hieu_luc", "ghi_chu_hieu_luc"]:
                    if ai_data.get(k) and not suggestion.get(k):
                        suggestion[k] = ai_data[k]
                suggestion["source"] = "ai"
        except Exception:
            pass

    return suggestion
```

### 2b. Frontend — cập nhật modal trong `TaxDocs.jsx`

Tìm component `AddPriorityModal` (hoặc inline modal state `addModalDoc`). Thêm:

```jsx
const [aiSuggestLoading, setAiSuggestLoading] = useState(false)

async function handleAiSuggest() {
  if (!addModalDoc) return
  setAiSuggestLoading(true)
  try {
    const suggestion = await api.suggestPriorityMeta(addModalDoc.id)
    // Pre-fill fields (chỉ điền nếu field đang trống)
    if (suggestion.hieu_luc_tu && !modalHieuLucTu) setModalHieuLucTu(suggestion.hieu_luc_tu)
    if (suggestion.hieu_luc_den && !modalHieuLucDen) setModalHieuLucDen(suggestion.hieu_luc_den)
    if (suggestion.thay_the_boi && !modalThayTheBoi) setModalThayTheBoi(suggestion.thay_the_boi)
    if (suggestion.pham_vi_het_hieu_luc && !modalPhamVi) setModalPhamVi(suggestion.pham_vi_het_hieu_luc)
    if (suggestion.ghi_chu_hieu_luc && !modalGhiChu) setModalGhiChu(suggestion.ghi_chu_hieu_luc)
  } catch (err) {
    alert('Không thể lấy gợi ý: ' + err.message)
  }
  setAiSuggestLoading(false)
}
```

Nút trong modal, đặt ngay dưới tiêu đề trước các input fields:
```jsx
<button
  type="button"
  onClick={handleAiSuggest}
  disabled={aiSuggestLoading}
  className="w-full flex items-center justify-center gap-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 mb-4"
>
  {aiSuggestLoading
    ? <><span className="animate-spin">⏳</span> Đang phân tích...</>
    : <><span>✨</span> AI gợi ý từ nội dung văn bản</>
  }
</button>
```

**Lưu ý quan trọng:**
- Sau khi AI pre-fill, tất cả fields vẫn **editable** — user chỉnh tay trước khi Save
- AI chỉ điền field **đang trống**, không ghi đè field đã có
- Nút Save hoạt động như cũ (POST `/api/priority-docs`)

### 2c. Thêm API call trong `frontend/src/api.js`
```js
suggestPriorityMeta: (dbvntax_id) => request('GET', `/priority-docs/suggest/${dbvntax_id}`),
```

### 2d. Xác nhận: Priority docs lưu vào DB
**Đã đúng rồi** — `PriorityDoc` lưu vào table `priority_docs` trong taxconsult DB → persistent, không cần chọn lại lần sau. Không cần thay đổi gì ở đây.

---

## PHẦN 3: Font size controls trong HTML Viewer

### Mô tả
Thêm nút **A+** và **A-** trong header của viewer panel (bên cạnh nút 🔗 TVPL).

### Implement trong `TaxDocs.jsx`

```jsx
const [fontSize, setFontSize] = useState(14) // px default

function increaseFontSize() { setFontSize(f => Math.min(f + 2, 24)) }
function decreaseFontSize() { setFontSize(f => Math.max(f - 2, 10)) }
```

Trong viewer header (cạnh nút TVPL):
```jsx
<div className="flex items-center gap-1 shrink-0">
  <button onClick={decreaseFontSize}
    className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded font-bold text-gray-600"
    title="Giảm cỡ chữ">A-</button>
  <span className="text-xs text-gray-400 w-8 text-center">{fontSize}px</span>
  <button onClick={increaseFontSize}
    className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded font-bold text-gray-600"
    title="Tăng cỡ chữ">A+</button>
  {viewer.link_tvpl && (
    <a href={viewer.link_tvpl} ...>🔗 TVPL</a>
  )}
</div>
```

Trong viewer content div:
```jsx
<div
  className="doc-html-viewer"
  style={{ fontSize: `${fontSize}px` }}
  dangerouslySetInnerHTML={{ __html: viewer.noi_dung_html }}
/>
```

---

## Checklist

- [ ] `frontend/src/pages/TaxDocs.jsx` — resizable divider + collapse toggle
- [ ] `frontend/src/pages/TaxDocs.jsx` — AI-gen button trong modal + state management
- [ ] `frontend/src/pages/TaxDocs.jsx` — fontSize state + A+/A- buttons trong viewer header
- [ ] `backend/routes/priority_docs.py` — thêm `GET /suggest/{dbvntax_id}`
- [ ] `frontend/src/api.js` — thêm `suggestPriorityMeta`
- [ ] Xoá file BRIEF này sau khi xong
- [ ] `git add -A && git commit -m "feat: resizable panel, AI-gen priority modal, font size controls" && git push`
