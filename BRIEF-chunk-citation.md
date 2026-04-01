# BRIEF: Chunk-level Citation với document_chunks

**Repo:** github.com/phanvuhoang/taxconsult  
**Ngày:** 2026-04-02  
**Mục tiêu:** Thay thế cơ chế inject toàn văn bản vào prompt bằng chunk-level semantic search, và hiển thị citation chính xác đến từng Điều/Khoản trong output.

---

## Bối cảnh kỹ thuật

### Cơ chế hiện tại (doc_context.py)
- `get_priority_docs_context()` → lấy toàn văn từng priority doc, truncate ở `MAX_CHARS_PER_LEVEL` (1500-3000 ký tự)
- `get_relevant_docs()` → lấy toàn văn, truncate ở `MAX_DOC_CHARS = 15000`
- Kết quả: AI nhận context kiểu "đây là toàn bộ NĐ 320, tự tìm điều khoản đi" → trích dẫn chung chung, hay bịa

### Bảng mới đã có sẵn trong DB (postgres DB, cùng server)
```sql
-- Bảng document_chunks (đã tạo, 606 chunks từ 24 anchor docs, tất cả có embedding vector(1536))
document_chunks:
  id, doc_id (FK → documents.id), so_hieu,
  chunk_index, dieu_so, dieu_ten, khoan_so,
  chunk_level ('dieu'|'khoan'|'intro'|'other'),
  header_path,     -- "NĐ 320/2025/NĐ-CP > Điều 9. Thu nhập miễn thuế"
  text_content,    -- plain text đã strip HTML
  char_count,
  embedding vector(1536)   -- OpenAI text-embedding-3-small, index ivfflat cosine
```

### Connection string dbvntax (đã có trong config/database.py)
App đã connect sẵn tới DB này qua `DbvntaxSession`. Chỉ cần thêm query vào `document_chunks`.

---

## Thay đổi cần làm

### 1. `backend/doc_context.py` — Thêm hàm `get_chunk_context()`

Thêm hàm mới **bên cạnh** các hàm hiện có (không xóa gì cũ):

```python
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
EMBED_MODEL = "text-embedding-3-small"
MAX_CHUNKS = 8       # số chunks trả về cho priority docs
MAX_CHUNKS_GENERAL = 5  # cho general docs

async def get_chunk_context(
    dbvntax_db,
    question_or_topic: str,
    tax_types: list,
    limit: int = MAX_CHUNKS,
    doc_ids: list = None,   # nếu có → chỉ search trong các doc này
) -> tuple[str, list[dict]]:
    """
    Semantic search trong document_chunks bằng embedding.
    Trả về (context_string, list_of_citation_dicts).
    
    citation_dict = {
        "so_hieu": "NĐ 320/2025/NĐ-CP",
        "dieu_so": "9",
        "dieu_ten": "Thu nhập miễn thuế",
        "khoan_so": "1",
        "header_path": "NĐ 320/2025/NĐ-CP > Điều 9. Thu nhập miễn thuế",
        "link_tvpl": "https://...",
        "score": 0.87,
    }
    """
    from sqlalchemy import text as sql_text
    import openai
    
    # 1. Embed query
    try:
        client = openai.OpenAI(api_key=OPENAI_API_KEY)
        resp = client.embeddings.create(model=EMBED_MODEL, input=[question_or_topic[:2000]])
        query_vec = resp.data[0].embedding
        vec_str = f"[{','.join(str(x) for x in query_vec)}]"
    except Exception:
        return "", []
    
    # 2. Build WHERE clause
    conditions = ["dc.embedding IS NOT NULL"]
    params = {"vec": vec_str, "limit": limit}
    
    if doc_ids:
        conditions.append("dc.doc_id = ANY(:doc_ids)")
        params["doc_ids"] = doc_ids
    
    # Filter theo sac_thue của document gốc
    if tax_types:
        from backend.doc_context import SAC_THUE_MAP
        sac_vals = []
        for t in tax_types:
            sac_vals.extend(SAC_THUE_MAP.get(t, [t]))
        conditions.append("d.sac_thue && ARRAY[:sac_thue]::varchar[]")
        params["sac_thue"] = sac_vals
    
    where = " AND ".join(conditions)
    
    sql = f"""
        SELECT 
            dc.id, dc.doc_id, dc.so_hieu,
            dc.dieu_so, dc.dieu_ten, dc.khoan_so,
            dc.chunk_level, dc.header_path,
            dc.text_content,
            d.link_tvpl,
            1 - (dc.embedding <=> :vec::vector) AS score
        FROM document_chunks dc
        JOIN documents d ON d.id = dc.doc_id
        WHERE {where}
        ORDER BY dc.embedding <=> :vec::vector
        LIMIT :limit
    """
    
    try:
        result = await dbvntax_db.execute(sql_text(sql), params)
        rows = result.mappings().all()
    except Exception:
        return "", []
    
    if not rows:
        return "", []
    
    # 3. Format context string
    parts = ["## ĐIỀU KHOẢN LIÊN QUAN (semantic search từ anchor docs)\n"]
    citations = []
    
    for i, row in enumerate(rows, 1):
        header = row["header_path"] or f"{row['so_hieu']} > Điều {row['dieu_so']}"
        ref_num = i  # số citation [1], [2]...
        
        parts.append(
            f"[{ref_num}] {header}\n"
            f"{row['text_content'][:1500]}\n"
            f"---"
        )
        
        citations.append({
            "ref_num": ref_num,
            "so_hieu": row["so_hieu"],
            "dieu_so": row["dieu_so"],
            "dieu_ten": row["dieu_ten"],
            "khoan_so": row["khoan_so"],
            "header_path": header,
            "link_tvpl": row["link_tvpl"],
            "score": float(row["score"]) if row["score"] else 0.0,
        })
    
    return "\n".join(parts), citations
```

---

### 2. `backend/quick_research.py` — Dùng chunk search

Sửa hàm `run_quick_research()`:

**Thêm import:**
```python
from backend.doc_context import get_chunk_context
```

**Trong phần gather context**, thêm task chunk search song song với các task hiện có:
```python
# Lấy priority doc_ids để search chunks của chúng trước
priority_ids_for_chunks = await get_priority_doc_ids(db, tax_types)

results = await asyncio.gather(
    get_priority_docs_context(...),      # giữ nguyên — header/metadata
    get_relevant_docs(...),              # giữ nguyên  
    get_relevant_congvan(...),           # giữ nguyên
    perplexity_search(...),              # giữ nguyên
    get_chunk_context(                   # MỚI: chunk semantic search
        dbvntax_db,
        question_or_topic=question,
        tax_types=tax_types,
        limit=8,
        doc_ids=priority_ids_for_chunks if priority_ids_for_chunks else None,
    ),
    return_exceptions=True,
)

priority_ctx = results[0] if not isinstance(results[0], Exception) else ""
doc_ctx      = results[1] if not isinstance(results[1], Exception) else ""
cv_ctx       = results[2] if not isinstance(results[2], Exception) else ""
perplexity_ctx = results[3] if not isinstance(results[3], Exception) else ""
chunk_ctx, chunk_citations = results[4] if not isinstance(results[4], Exception) else ("", [])
```

**Sửa QUICK_PROMPT** — thêm section chunks và hướng dẫn citation:
```python
QUICK_PROMPT = """CÂU HỎI: {question}
GIAI ĐOẠN ÁP DỤNG: {time_period_label}

=== ĐIỀU KHOẢN CỤ THỂ (semantic search — ĐÂY LÀ NGUỒN CHÍNH) ===
{chunk_ctx}

⚠️ QUAN TRỌNG: Trích dẫn bằng số [N] theo đúng thứ tự trong phần ĐIỀU KHOẢN CỤ THỂ trên.
Ví dụ: "Theo khoản 1 Điều 9 NĐ 320/2025/NĐ-CP [1], thu nhập miễn thuế bao gồm..."

=== VĂN BẢN ƯU TIÊN (metadata) ===
{priority_ctx}

=== VĂN BẢN TỪ DATABASE ===
{doc_context}

=== CÔNG VĂN HƯỚNG DẪN ===
{cv_context}

=== NGUỒN WEB (Perplexity) ===
{perplexity_ctx}

YÊU CẦU TRẢ LỜI:
1. Output HTML thuần túy — KHÔNG markdown
2. Mở đầu: tóm tắt 1-2 câu (<strong>)
3. Trích dẫn ĐIỀU KHOẢN CỤ THỂ bằng [N]: "theo khoản 1 Điều 9 NĐ 320/2025/NĐ-CP [1]..."
   — KHÔNG viết chung chung "theo quy định hiện hành"
4. Quy định thay đổi theo thời gian → bảng HTML Before/After
5. Ví dụ số cụ thể khi cần
6. Tối đa 800 từ
7. TUYỆT ĐỐI không bịa số hiệu văn bản
"""
```

**Sửa phần format prompt call:**
```python
prompt = QUICK_PROMPT.format(
    question=question,
    time_period_label=period["label"],
    chunk_ctx=chunk_ctx or "(Không tìm được điều khoản cụ thể)",
    priority_ctx=priority_ctx or "(Không có văn bản ưu tiên)",
    doc_context=doc_ctx or "(Không có văn bản liên quan)",
    cv_context=cv_ctx or "(Không có công văn)",
    perplexity_ctx=perplexity_ctx or "",
)
```

**Sửa return dict** — trả thêm citations:
```python
return {
    "id": session.id,
    "question": question,
    "answer_html": result["content"],
    "tax_docs_used": tax_docs_used,
    "congvan_used": congvan_used,
    "chunk_citations": chunk_citations,   # MỚI
    "model_used": result["model_used"],
    "provider_used": result["provider_used"],
    "duration_ms": duration_ms,
}
```

---

### 3. `backend/report_generator.py` — Dùng chunk search per section

Sửa `_gather_section_context()`:

**Thêm import:**
```python
from backend.doc_context import get_chunk_context
```

**Thêm chunk task vào gather:**
```python
async def _gather_section_context(section, subject, tax_types, period, dbvntax_db, sonar_model, exclude_dbvntax_ids=None, priority_doc_ids=None):
    keywords = _quick_keywords(subject)
    topic = f"{section['title']} {subject}"   # query cho chunk search
    perplexity_query = f"Phân tích {section['title']} cho {subject} Việt Nam {period['label']}"

    async def empty():
        return ""

    tasks = [perplexity_search(perplexity_query, sonar_model)]

    if section.get("tax_aware") and dbvntax_db:
        tasks.append(get_relevant_docs(...))      # giữ nguyên
        tasks.append(get_relevant_congvan(...))   # giữ nguyên
        tasks.append(get_chunk_context(           # MỚI
            dbvntax_db,
            question_or_topic=topic,
            tax_types=tax_types,
            limit=6,
            doc_ids=priority_doc_ids if priority_doc_ids else None,
        ))
    else:
        tasks.append(empty())
        tasks.append(empty())
        tasks.append(empty())  # placeholder cho chunk

    results = await asyncio.gather(*tasks, return_exceptions=True)

    perp_result = results[0] if not isinstance(results[0], Exception) else ""
    # ... parse perp_result như cũ ...
    doc_ctx = results[1] if not isinstance(results[1], Exception) else ""
    cv_ctx  = results[2] if not isinstance(results[2], Exception) else ""
    chunk_result = results[3] if not isinstance(results[3], Exception) else ("", [])
    chunk_ctx, chunk_citations = chunk_result if isinstance(chunk_result, tuple) else ("", [])

    return {
        "perplexity": perp_ctx,
        "docs": doc_ctx,
        "congvan": cv_ctx,
        "citations": citations,
        "chunks": chunk_ctx,          # MỚI
        "chunk_citations": chunk_citations,  # MỚI
    }
```

**Truyền `priority_doc_ids` vào `_gather_section_context()`** — sửa phần call trong `generate_full_report()`:
```python
# Sau khi lấy exclude_ids:
priority_ids_for_chunks = exclude_ids  # đây là list dbvntax_id của priority docs

context_tasks = [
    _gather_section_context(
        sec, subject, tax_types, period, dbvntax_db, sonar_model,
        exclude_dbvntax_ids=exclude_ids if exclude_ids else None,
        priority_doc_ids=priority_ids_for_chunks if priority_ids_for_chunks else None,
    )
    for sec in enabled_sections
]
```

**Sửa `SECTION_PROMPT_TAX`** — thêm chunks section:
```python
SECTION_PROMPT_TAX = """Viết PHẦN: "{section_title}"
Chủ đề phân tích: {subject} ({mode})
Giai đoạn áp dụng: {time_period}

=== ĐIỀU KHOẢN CỤ THỂ (semantic search — NGUỒN CHÍNH, ưu tiên cao nhất) ===
{chunk_context}

Trích dẫn các điều khoản trên bằng số [N] trong bài. Ví dụ:
"Theo khoản 2 Điều 14 Luật TNDN [3], doanh nghiệp được hưởng ưu đãi khi..."

=== VĂN BẢN ƯU TIÊN (metadata tổng quan) ===
{priority_context}

=== VĂN BẢN PHÁP LUẬT TỪ DATABASE ===
{tax_docs_context}

=== CÔNG VĂN HƯỚNG DẪN ===
{congvan_context}

=== DỮ LIỆU NGHIÊN CỨU TỪ PERPLEXITY ===
{perplexity_context}

YÊU CẦU TUYỆT ĐỐI:
1. Output HTML thuần túy — bắt đầu bằng <h2>{section_number}. {section_title}</h2>
2. Trích dẫn ĐIỀU KHOẢN CỤ THỂ bằng [N] — không viết chung chung
3. Quy định thay đổi → bảng HTML Before/After
4. Dẫn công văn khi có
5. KHÔNG trích dẫn văn bản đã hết hiệu lực (trừ phân tích lịch sử)
6. KHÔNG bịa số hiệu văn bản
7. Tối thiểu 700 từ
"""
```

**Sửa phần build prompt trong loop:**
```python
if section.get("tax_aware"):
    prompt = SECTION_PROMPT_TAX.format(
        section_title=section["title"],
        section_number=section_number,
        subject=subject,
        mode=report_type_mode,
        time_period=period["label"],
        chunk_context=ctx.get("chunks") or "(Không tìm được điều khoản cụ thể)",  # MỚI
        priority_context=priority_ctx or "(Không có văn bản ưu tiên)",
        tax_docs_context=ctx["docs"] or "(Không có dữ liệu)",
        congvan_context=ctx["congvan"] or "(Không có dữ liệu)",
        perplexity_context=ctx["perplexity"] or "(Không có dữ liệu)",
    )
```

---

### 4. `backend/routes/reports.py` — Trả chunk_citations trong API response

Tìm endpoint GET `/api/reports/{id}` hoặc response của quick research, thêm field `chunk_citations` vào response schema/dict nếu chưa có.

---

### 5. `frontend/src/pages/QuickResearch.jsx` — Hiển thị Citations panel

Sau phần hiển thị `tax_docs_used` và `congvan_used`, thêm panel citations mới:

```jsx
{result.chunk_citations?.length > 0 && (
  <div className="px-5 py-3 bg-blue-50 border-t border-blue-100">
    <div className="text-xs font-semibold text-blue-700 mb-2">
      📌 Điều khoản được trích dẫn
    </div>
    <div className="space-y-1">
      {result.chunk_citations.map((c) => (
        <div key={c.ref_num} className="flex items-start gap-2 text-xs">
          <span className="shrink-0 bg-blue-600 text-white rounded px-1 font-mono font-bold">
            [{c.ref_num}]
          </span>
          <span className="text-blue-800">
            {c.header_path}
            {c.link_tvpl && (
              <a
                href={c.link_tvpl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 text-blue-500 hover:underline"
              >
                ↗
              </a>
            )}
          </span>
          <span className="shrink-0 text-blue-400 ml-auto">
            {Math.round(c.score * 100)}%
          </span>
        </div>
      ))}
    </div>
  </div>
)}
```

---

### 6. `frontend/src/pages/FullReport.jsx` — Citations panel cuối báo cáo

Trong phần render report HTML, sau phần content chính, thêm citations panel tổng hợp từ tất cả sections. Backend cần trả về `all_chunk_citations` (gộp từ các section) trong job result.

**Backend** — trong `generate_full_report()`, gộp citations:
```python
all_chunk_citations = []
ref_offset = 0
for idx, (section, ctx) in enumerate(zip(enabled_sections, all_contexts)):
    if isinstance(ctx, Exception):
        ctx = {"perplexity": "", "docs": "", "congvan": "", "chunks": "", "chunk_citations": []}
    
    # Re-number citations với offset
    for cit in ctx.get("chunk_citations", []):
        cit["ref_num"] += ref_offset
        all_chunk_citations.append(cit)
    ref_offset += len(ctx.get("chunk_citations", []))
    # ... rest of section generation ...

# Trong SSE done event:
yield _sse({
    "type": "done",
    "report_id": report.id,
    "duration_ms": duration_ms,
    "chunk_citations": all_chunk_citations,   # MỚI
})
```

**Frontend** — trong `FullReport.jsx`, lưu `chunkCitations` state từ SSE done event và render panel:
```jsx
// Trong SSE handler:
if (event.type === 'done') {
  setChunkCitations(event.chunk_citations || [])
  // ... rest ...
}

// Render sau report content:
{chunkCitations.length > 0 && (
  <div className="mt-8 p-5 bg-gray-50 rounded-xl border border-gray-200">
    <h3 className="font-semibold text-gray-700 mb-3">📌 Tài liệu tham chiếu</h3>
    <div className="space-y-2">
      {chunkCitations.map((c) => (
        <div key={c.ref_num} className="flex items-start gap-3 text-sm">
          <span className="shrink-0 bg-gray-700 text-white rounded px-1.5 py-0.5 font-mono text-xs font-bold">
            [{c.ref_num}]
          </span>
          <div>
            <span className="text-gray-800 font-medium">{c.header_path}</span>
            {c.link_tvpl && (
              <a href={c.link_tvpl} target="_blank" rel="noopener noreferrer"
                className="ml-2 text-brand text-xs hover:underline">
                Xem tại TVPL ↗
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
)}
```

---

### 7. `backend/migrations/` — Không cần migration

Bảng `document_chunks` đã được tạo trực tiếp bằng script ngoài (không phải migration), nằm trong `postgres` DB (dbvntax DB) không phải `taxconsult` DB. **Không cần thêm migration.**

Chỉ cần đảm bảo `DbvntaxSession` trong `database.py` connect tới đúng `postgres` DB (đã đúng rồi).

---

### 8. `requirements.txt` — Thêm openai nếu chưa có

```
openai>=1.0.0
```

Check file hiện tại, nếu chưa có thì thêm vào.

---

## Tóm tắt files cần sửa

| File | Thay đổi |
|---|---|
| `backend/doc_context.py` | Thêm `get_chunk_context()` function |
| `backend/quick_research.py` | Gọi `get_chunk_context()`, thêm `chunk_ctx` vào prompt, trả `chunk_citations` |
| `backend/report_generator.py` | Gọi `get_chunk_context()` per section, trả `all_chunk_citations` trong SSE done |
| `backend/routes/reports.py` | Thêm `chunk_citations` vào response nếu cần |
| `frontend/src/pages/QuickResearch.jsx` | Hiển thị citations panel [N] |
| `frontend/src/pages/FullReport.jsx` | Lưu citations từ SSE done, render tài liệu tham chiếu cuối báo cáo |
| `requirements.txt` | Thêm `openai>=1.0.0` nếu chưa có |

**Sau khi implement xong:** commit, push, báo để deploy.

---

## Ghi chú quan trọng

- `OPENAI_API_KEY` env var phải có trong Coolify env của taxconsult (để embed query khi search)
- DB `document_chunks` nằm trong **postgres DB** (dbvntax), cùng server, connect qua `DbvntaxSession`
- Chunk search chỉ cover **24 anchor docs** hiện tại — nếu query về văn bản không phải anchor thì fallback về `get_relevant_docs()` như cũ (đã có sẵn trong flow)
- Score threshold: không cần filter — trả top-N và để AI tự đánh giá relevance
