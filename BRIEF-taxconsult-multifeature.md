# BRIEF: taxconsult — Multi-feature Update
**Date:** 2026-03-31
**Author:** Thanh AI
**Target:** Claude Code implement, push GitHub → Thanh deploy Coolify

---

## 0. Context & Repo Structure

```
taxconsult/
├── backend/
│   ├── ai_provider.py        # AI abstraction layer
│   ├── config.py             # Env vars + MODEL_MAP
│   ├── doc_context.py        # Anchor docs từ dbvntax DB
│   ├── models.py             # SQLAlchemy models
│   ├── routes/
│   │   ├── research.py       # /api/research/quick
│   │   ├── reports.py        # /api/reports/full
│   │   └── priority_docs.py  # /api/admin/priority-docs
│   └── ...
└── frontend/src/pages/
    ├── QuickResearch.jsx
    ├── FullReport.jsx
    └── Settings.jsx
```

**DB connections:**
- `taxconsult` DB: app data (priority_docs, reports, users)
- `dbvntax` DB (same PostgreSQL cluster): `documents` + `cong_van` tables (nguồn anchor docs)

---

## 1. Theme Color: #028a39 → #78BE20

### `frontend/tailwind.config.js`
```js
colors: {
  brand: {
    DEFAULT: '#78BE20',
    dark:    '#5A9A12',
    light:   '#94D43A',
  },
},
```

### `frontend/src/index.css`
Tìm tất cả `#028a39` → đổi thành `#78BE20`.

---

## 2. AI Provider Overhaul — Align với dbvntax

### Vấn đề hiện tại
- `ai_provider.py` dùng Anthropic SDK + Claudible `/messages` endpoint (Anthropic format) — **sai**
- Claudible thực tế dùng **OpenAI-completions format**: `POST /v1/chat/completions` với Bearer token
- Cần thêm **DeepSeek Reasoner** (OpenAI-compatible)

### `backend/config.py` — Sửa lại hoàn toàn

```python
import os
from dotenv import load_dotenv
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://legaldb_user:PbSV8bfxQdta4ljBsDVtZEe74yjMG6l7uW3dSczT8Iaajm9MKX07wHqyf0xBTTMF@10.0.1.11:5432/taxconsult")
DBVNTAX_DATABASE_URL = os.getenv("DBVNTAX_DATABASE_URL", "postgresql+asyncpg://legaldb_user:PbSV8bfxQdta4ljBsDVtZEe74yjMG6l7uW3dSczT8Iaajm9MKX07wHqyf0xBTTMF@10.0.1.11:5432/postgres")

# Claudible — OpenAI-completions format (POST /v1/chat/completions, Bearer token)
# ⚠️ base URL KHÔNG có /v1 ở cuối — code sẽ append /v1/chat/completions
_raw_claudible_base = os.getenv("ANTHROPIC_BASE_URL", "https://claudible.io")
CLAUDIBLE_BASE_URL = _raw_claudible_base.rstrip("/").removesuffix("/v1")
CLAUDIBLE_API_KEY  = os.getenv("ANTHROPIC_AUTH_TOKEN", "")  # Bearer token

# DeepSeek — OpenAI-compatible, endpoint: https://api.deepseek.com
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")

# Anthropic direct (paid, fallback)
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# OpenAI (last resort)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# Perplexity
PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY", "")

SECRET_KEY = os.getenv("SECRET_KEY", "changeme-32-char-secret-key-here!")
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "168"))
APP_PASSWORD = os.getenv("APP_PASSWORD", "admin123")
APP_PORT = int(os.getenv("APP_PORT", "8000"))
ALGORITHM = "HS256"

# Model tier → model name mapping
# Claudible models: claude-haiku-4.5, claude-sonnet-4.6 (dấu chấm, KHÔNG dùng gạch ngang)
MODEL_MAP = {
    "haiku":     "claude-haiku-4.5",     # Claudible Haiku — fast, free
    "fast":      "claude-sonnet-4.6",    # Claudible Sonnet — balanced, free
    "strong":    "claude-sonnet-4.6",    # fallback to Sonnet (Opus not available on Claudible)
    "deepseek":  "deepseek-reasoner",    # DeepSeek V3.2 thinking mode
}
DEFAULT_MODEL_TIER = "deepseek"  # Default: DeepSeek Reasoner
```

### `backend/ai_provider.py` — Viết lại hoàn toàn

```python
"""AI provider abstraction — Claudible (primary, free) + DeepSeek + Anthropic + OpenAI."""
import httpx
import json
from typing import AsyncGenerator, Optional
from backend.config import (
    CLAUDIBLE_BASE_URL, CLAUDIBLE_API_KEY,
    DEEPSEEK_API_KEY,
    ANTHROPIC_API_KEY, OPENAI_API_KEY,
    MODEL_MAP, DEFAULT_MODEL_TIER,
)


def resolve_model(model_tier: str) -> str:
    return MODEL_MAP.get(model_tier, MODEL_MAP[DEFAULT_MODEL_TIER])


async def call_ai(
    messages: list,
    system: str = "",
    model_tier: str = None,
    max_tokens: int = 8000,
) -> dict:
    """Non-streaming AI call. Returns dict: content, model_used, provider_used."""
    tier = model_tier or DEFAULT_MODEL_TIER
    model = resolve_model(tier)

    # Route: DeepSeek tiers
    if tier == "deepseek" or "deepseek" in model:
        result = await _call_deepseek(messages, system, model, max_tokens)
        if result:
            return result

    # Route: Claudible (Haiku / Sonnet)
    if CLAUDIBLE_API_KEY:
        result = await _call_claudible(messages, system, model, max_tokens)
        if result:
            return result

    # Fallback: Anthropic direct
    if ANTHROPIC_API_KEY:
        result = await _call_anthropic(messages, system, model, max_tokens)
        if result:
            return result

    # Last resort: OpenAI
    if OPENAI_API_KEY:
        return await _call_openai(messages, system, max_tokens)

    raise RuntimeError("No AI provider configured or all providers failed")


async def stream_ai(
    messages: list,
    system: str = "",
    model_tier: str = None,
    max_tokens: int = 8000,
) -> AsyncGenerator[str, None]:
    """Streaming AI call, yields text chunks."""
    tier = model_tier or DEFAULT_MODEL_TIER
    model = resolve_model(tier)

    if tier == "deepseek" or "deepseek" in model:
        if DEEPSEEK_API_KEY:
            async for chunk in _stream_deepseek(messages, system, model, max_tokens):
                yield chunk
            return

    if CLAUDIBLE_API_KEY:
        async for chunk in _stream_claudible(messages, system, model, max_tokens):
            yield chunk
        return

    if ANTHROPIC_API_KEY:
        async for chunk in _stream_anthropic(messages, system, model, max_tokens):
            yield chunk
        return

    raise RuntimeError("No streaming AI provider configured")


# ── Claudible (OpenAI-completions format) ─────────────────────────
async def _call_claudible(messages, system, model, max_tokens) -> Optional[dict]:
    if not CLAUDIBLE_API_KEY:
        return None
    oai_messages = []
    if system:
        oai_messages.append({"role": "system", "content": system})
    oai_messages.extend(messages)
    timeout = 180 if "sonnet" in model or "opus" in model else 120
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(
                f"{CLAUDIBLE_BASE_URL}/v1/chat/completions",
                headers={"Authorization": f"Bearer {CLAUDIBLE_API_KEY}",
                         "Content-Type": "application/json"},
                json={"model": model, "max_tokens": max_tokens, "messages": oai_messages},
            )
            r.raise_for_status()
            data = r.json()
            return {
                "content": data["choices"][0]["message"]["content"],
                "model_used": model,
                "provider_used": "claudible",
                "prompt_tokens": data.get("usage", {}).get("prompt_tokens", 0),
                "completion_tokens": data.get("usage", {}).get("completion_tokens", 0),
            }
    except Exception as e:
        print(f"Claudible {model} error: {e}")
        return None


async def _stream_claudible(messages, system, model, max_tokens) -> AsyncGenerator[str, None]:
    if not CLAUDIBLE_API_KEY:
        return
    oai_messages = []
    if system:
        oai_messages.append({"role": "system", "content": system})
    oai_messages.extend(messages)
    try:
        async with httpx.AsyncClient(timeout=600) as client:
            async with client.stream(
                "POST",
                f"{CLAUDIBLE_BASE_URL}/v1/chat/completions",
                headers={"Authorization": f"Bearer {CLAUDIBLE_API_KEY}",
                         "Content-Type": "application/json"},
                json={"model": model, "max_tokens": max_tokens,
                      "messages": oai_messages, "stream": True},
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data:"):
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            delta = data["choices"][0]["delta"].get("content", "")
                            if delta:
                                yield delta
                        except Exception:
                            pass
    except Exception as e:
        print(f"Claudible stream {model} error: {e}")


# ── DeepSeek (OpenAI-compatible) ──────────────────────────────────
async def _call_deepseek(messages, system, model, max_tokens) -> Optional[dict]:
    if not DEEPSEEK_API_KEY:
        return None
    oai_messages = []
    if system:
        oai_messages.append({"role": "system", "content": system})
    oai_messages.extend(messages)
    try:
        async with httpx.AsyncClient(timeout=300) as client:
            r = await client.post(
                "https://api.deepseek.com/chat/completions",
                headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                         "Content-Type": "application/json"},
                json={"model": model, "max_tokens": max_tokens, "messages": oai_messages},
            )
            r.raise_for_status()
            data = r.json()
            return {
                "content": data["choices"][0]["message"]["content"],
                "model_used": model,
                "provider_used": "deepseek",
                "prompt_tokens": data.get("usage", {}).get("prompt_tokens", 0),
                "completion_tokens": data.get("usage", {}).get("completion_tokens", 0),
            }
    except Exception as e:
        print(f"DeepSeek {model} error: {e}")
        return None


async def _stream_deepseek(messages, system, model, max_tokens) -> AsyncGenerator[str, None]:
    if not DEEPSEEK_API_KEY:
        return
    oai_messages = []
    if system:
        oai_messages.append({"role": "system", "content": system})
    oai_messages.extend(messages)
    try:
        async with httpx.AsyncClient(timeout=600) as client:
            async with client.stream(
                "POST",
                "https://api.deepseek.com/chat/completions",
                headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                         "Content-Type": "application/json"},
                json={"model": model, "max_tokens": max_tokens,
                      "messages": oai_messages, "stream": True},
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data:"):
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            delta = data["choices"][0]["delta"].get("content", "")
                            if delta:
                                yield delta
                        except Exception:
                            pass
    except Exception as e:
        print(f"DeepSeek stream {model} error: {e}")


# ── Anthropic direct (fallback, paid) ─────────────────────────────
async def _call_anthropic(messages, system, model, max_tokens) -> Optional[dict]:
    if not ANTHROPIC_API_KEY:
        return None
    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        kwargs = {"model": model, "max_tokens": max_tokens, "messages": messages}
        if system:
            kwargs["system"] = system
        resp = await client.messages.create(**kwargs)
        return {
            "content": resp.content[0].text,
            "model_used": model,
            "provider_used": "anthropic",
            "prompt_tokens": resp.usage.input_tokens,
            "completion_tokens": resp.usage.output_tokens,
        }
    except Exception as e:
        print(f"Anthropic direct {model} error: {e}")
        return None


async def _stream_anthropic(messages, system, model, max_tokens) -> AsyncGenerator[str, None]:
    if not ANTHROPIC_API_KEY:
        return
    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        kwargs = {"model": model, "max_tokens": max_tokens, "messages": messages, "stream": True}
        if system:
            kwargs["system"] = system
        async with client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text
    except Exception as e:
        print(f"Anthropic stream {model} error: {e}")


# ── OpenAI (last resort) ──────────────────────────────────────────
async def _call_openai(messages, system, max_tokens) -> dict:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    oai_messages = []
    if system:
        oai_messages.append({"role": "system", "content": system})
    oai_messages.extend(messages)
    resp = await client.chat.completions.create(
        model="gpt-4o-mini", max_tokens=max_tokens, messages=oai_messages
    )
    return {
        "content": resp.choices[0].message.content,
        "model_used": "gpt-4o-mini",
        "provider_used": "openai",
        "prompt_tokens": resp.usage.prompt_tokens,
        "completion_tokens": resp.usage.completion_tokens,
    }
```

---

## 3. DB Migration — anchor_from / anchor_to

Chạy migration SQL trên cả 2 DB (`taxconsult` và `postgres`/dbvntax):

### File: `backend/migrations/add_anchor_period.sql`
```sql
-- taxconsult DB: thêm anchor_from, anchor_to vào priority_docs
ALTER TABLE priority_docs
  ADD COLUMN IF NOT EXISTS anchor_from DATE,
  ADD COLUMN IF NOT EXISTS anchor_to   DATE;

COMMENT ON COLUMN priority_docs.anchor_from IS 'Anchor có hiệu lực từ ngày (NULL = không giới hạn)';
COMMENT ON COLUMN priority_docs.anchor_to   IS 'Anchor hết hiệu lực ngày (NULL = đang có hiệu lực)';
```

### File: `backend/migrations/add_anchor_period_dbvntax.sql`
```sql
-- dbvntax DB (postgres): thêm anchor_from, anchor_to vào documents
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS anchor_from DATE,
  ADD COLUMN IF NOT EXISTS anchor_to   DATE;

COMMENT ON COLUMN documents.anchor_from IS 'Anchor có hiệu lực từ ngày (NULL = không giới hạn)';
COMMENT ON COLUMN documents.anchor_to   IS 'Anchor hết hiệu lực ngày (NULL = đang có hiệu lực)';
```

### `backend/models.py` — Thêm fields vào `PriorityDoc`
```python
from sqlalchemy import Date
# Trong class PriorityDoc:
anchor_from = Column(Date, nullable=True)   # Anchor có hiệu lực từ ngày
anchor_to   = Column(Date, nullable=True)   # Anchor hết hiệu lực (NULL = đang dùng)
```

---

## 4. QuickResearch — Max 3 sắc thuế + anchor docs

### `frontend/src/pages/QuickResearch.jsx`

**Thay đổi:**

1. **Cap 3 sắc thuế** — tương tự dbvntax:
```jsx
function toggleTax(t) {
  setTaxTypes((prev) => {
    if (prev.includes(t)) return prev.filter((x) => x !== t)
    if (prev.length >= 3) return prev  // cap 3
    return [...prev, t]
  })
}
// Hiển thị hint: "Chọn tối đa 3 sắc thuế (sắc thuế đầu tiên = chính)"
```

2. **Model selector** — thêm DeepSeek, đổi default:
```jsx
const MODELS = [
  { value: 'deepseek', label: '🧠 DeepSeek Reasoner', desc: 'Phân tích sâu (mặc định)' },
  { value: 'haiku',    label: '⚡ Claude Haiku',      desc: 'Nhanh, tiết kiệm' },
  { value: 'fast',     label: '🎯 Claude Sonnet',     desc: 'Cân bằng' },
]
const [model, setModel] = useState('deepseek')  // default DeepSeek
```

3. **Period selector** — đổi thành radio + input (xem mục 5 bên dưới)

---

## 5. Period Selector — Radio "trước/sau/khoảng" (dùng ở cả 2 trang)

Tạo component dùng chung: `frontend/src/components/PeriodSelector.jsx`

```jsx
/**
 * PeriodSelector — chọn giai đoạn thuế
 * Props: value (string), onChange (fn)
 * Trả về string dạng: "hiện_nay" | "truoc:2020" | "sau:2022" | "khoang:2020:2024"
 */
export default function PeriodSelector({ value, onChange }) {
  const [mode, setMode] = useState('hiện_nay')  // hiện_nay | trước | sau | khoảng
  const [year1, setYear1] = useState('2020')
  const [year2, setYear2] = useState('2024')

  function emit(m, y1, y2) {
    if (m === 'hiện_nay') onChange('hiện_nay')
    else if (m === 'trước') onChange(`truoc:${y1}`)
    else if (m === 'sau')   onChange(`sau:${y1}`)
    else                    onChange(`khoang:${y1}:${y2}`)
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-600 mb-1">Giai đoạn</label>
      <div className="flex flex-wrap gap-3 text-sm">
        {['hiện_nay','trước','sau','khoảng'].map(m => (
          <label key={m} className="flex items-center gap-1 cursor-pointer">
            <input type="radio" name="period_mode" value={m}
              checked={mode === m}
              onChange={() => { setMode(m); emit(m, year1, year2) }}
              className="accent-brand"
            />
            <span className="capitalize">{m === 'hiện_nay' ? '📅 Hiện nay' : m === 'trước' ? 'Trước năm' : m === 'sau' ? 'Sau năm' : 'Khoảng'}</span>
          </label>
        ))}
      </div>

      {/* Year inputs — hiện khi không phải hiện_nay */}
      {mode !== 'hiện_nay' && (
        <div className="flex items-center gap-2 mt-1">
          <input type="number" min="2000" max="2030" value={year1}
            onChange={e => { setYear1(e.target.value); emit(mode, e.target.value, year2) }}
            className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
          />
          {mode === 'khoảng' && (
            <>
              <span className="text-gray-500">–</span>
              <input type="number" min="2000" max="2030" value={year2}
                onChange={e => { setYear2(e.target.value); emit(mode, year1, e.target.value) }}
                className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

**Parse ở backend** — trong `backend/time_period.py` thêm hàm:
```python
def parse_period_string(period: str):
    """
    Parse period string từ frontend:
      "hiện_nay"         → (start=None, end=None)  # dùng anchor_to IS NULL
      "truoc:2020"       → (start=None, end="2020-01-01")
      "sau:2022"         → (start="2022-01-01", end=None)
      "khoang:2020:2024" → (start="2020-01-01", end="2024-12-31")
    Returns (time_period_start, time_period_end, use_current_only)
    """
    if not period or period == "hiện_nay":
        return None, None, True  # use_current_only=True → filter anchor_to IS NULL
    parts = period.split(":")
    if parts[0] == "truoc" and len(parts) == 2:
        return None, f"{parts[1]}-12-31", False
    if parts[0] == "sau" and len(parts) == 2:
        return f"{parts[1]}-01-01", None, False
    if parts[0] == "khoang" and len(parts) == 3:
        return f"{parts[1]}-01-01", f"{parts[2]}-12-31", False
    return None, None, True
```

**`doc_context.py`** — Khi `use_current_only=True`, filter thêm `anchor_to IS NULL` cho priority_docs.

---

## 6. FullReport — Không limit sắc thuế + model selector

### `frontend/src/pages/FullReport.jsx`

1. **Bỏ cap 3** — taxTypes có thể chọn tất cả 8 sắc thuế
2. **Thêm model selector** (DeepSeek mặc định):
```jsx
const MODELS = [
  { value: 'deepseek', label: '🧠 DeepSeek Reasoner', desc: 'Phân tích sâu (mặc định)' },
  { value: 'haiku',    label: '⚡ Claude Haiku',      desc: 'Nhanh, tiết kiệm' },
  { value: 'fast',     label: '🎯 Claude Sonnet',     desc: 'Cân bằng' },
]
const [model, setModel] = useState('deepseek')
```
3. **Period selector** — thay dropdown text bằng `<PeriodSelector>` component
4. **Truyền `model_tier` vào API call** — đã có sẵn trong payload

---

## 7. AI Suggest Topics — FullReport

### Backend: `POST /api/reports/suggest-topics`

```python
@router.post("/suggest-topics")
async def suggest_topics(
    subject: str = Body(...),
    mode: str = Body("ngành"),
    tax_types: list = Body([]),
    current_user = Depends(get_current_user),
):
    """Dùng Claudible Haiku để gợi ý sections và sub-topics."""
    system = "Bạn là chuyên gia tư vấn thuế Việt Nam. Trả lời bằng JSON."
    prompt = f"""Tôi cần viết báo cáo phân tích thuế cho: "{subject}" (loại: {mode}).
Các sắc thuế quan tâm: {', '.join(tax_types) or 'tổng quát'}.

Hãy gợi ý danh sách sections và sub-topics phù hợp nhất cho báo cáo này.
Trả về JSON với format:
{{
  "sections": [
    {{"id": "s1", "title": "Tên section", "enabled": true, "sub": ["sub-topic 1", "sub-topic 2"]}},
    ...
  ]
}}
Tối đa 8 sections, mỗi section tối đa 5 sub-topics. Ưu tiên các vấn đề thuế đặc thù của ngành/chủ đề."""

    result = await call_ai(
        messages=[{"role": "user", "content": prompt}],
        system=system,
        model_tier="haiku",
        max_tokens=2000,
    )
    # Parse JSON từ response
    import json, re
    content = result["content"]
    json_match = re.search(r'\{.*\}', content, re.DOTALL)
    if json_match:
        data = json.loads(json_match.group())
        return data
    return {"sections": []}
```

### Frontend: Button trong `FullReport.jsx`

```jsx
const [suggesting, setSuggesting] = useState(false)

async function handleSuggestTopics() {
  if (!subject.trim()) {
    alert('Nhập chủ đề trước nhé!')
    return
  }
  setSuggesting(true)
  try {
    const data = await api.suggestTopics({ subject, mode, tax_types: taxTypes })
    if (data.sections?.length) {
      setSections(data.sections)
    }
  } catch (e) {
    console.error(e)
  } finally {
    setSuggesting(false)
  }
}

// Button đặt cạnh label "Sections":
<button
  type="button"
  onClick={handleSuggestTopics}
  disabled={suggesting || !subject.trim()}
  className="text-xs px-2 py-1 rounded bg-brand/10 text-brand hover:bg-brand/20 disabled:opacity-50 flex items-center gap-1"
>
  {suggesting ? '⏳ Đang gợi ý...' : '✨ AI gợi ý topics'}
</button>
```

### `frontend/src/api.js` — Thêm:
```js
suggestTopics: (data) => post('/api/reports/suggest-topics', data),
```

---

## 8. Env Vars cần thêm trên Coolify (taxconsult app)

| Env Var | Giá trị | Ghi chú |
|---------|---------|---------|
| `ANTHROPIC_BASE_URL` | `https://claudible.io` | Claudible base URL |
| `ANTHROPIC_AUTH_TOKEN` | `sk-f4923924973df1dd54c6392395d56c589b796a3412ac95edb1b964d6cce3402e` | Claudible Bearer token |
| `DEEPSEEK_API_KEY` | _(key của anh)_ | DeepSeek API |
| `PERPLEXITY_API_KEY` | `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` | Đã có chưa? Nếu chưa thêm vào |

**Xoá các env cũ nếu có:**
- `CLAUDIBLE_BASE_URL` (thay bằng `ANTHROPIC_BASE_URL`)
- `CLAUDIBLE_API_KEY` (thay bằng `ANTHROPIC_AUTH_TOKEN`)

---

## 9. Migration Script — Chạy một lần

Claude Code tạo file `backend/migrations/run_migrations.py`:
```python
"""Chạy một lần để alter tables. python3 -m backend.migrations.run_migrations"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from backend.config import DATABASE_URL, DBVNTAX_DATABASE_URL

TAXCONSULT_SQL = """
ALTER TABLE priority_docs
  ADD COLUMN IF NOT EXISTS anchor_from DATE,
  ADD COLUMN IF NOT EXISTS anchor_to   DATE;
"""

DBVNTAX_SQL = """
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS anchor_from DATE,
  ADD COLUMN IF NOT EXISTS anchor_to   DATE;
"""

async def main():
    # taxconsult DB
    engine1 = create_async_engine(DATABASE_URL)
    async with engine1.begin() as conn:
        await conn.execute(text(TAXCONSULT_SQL))
    print("✅ taxconsult DB migrated")

    # dbvntax DB
    engine2 = create_async_engine(DBVNTAX_DATABASE_URL)
    async with engine2.begin() as conn:
        await conn.execute(text(DBVNTAX_SQL))
    print("✅ dbvntax DB migrated")

asyncio.run(main())
```

---

## 10. Checklist cho Claude Code

- [ ] `tailwind.config.js` + `index.css`: đổi màu → #78BE20
- [ ] `config.py`: viết lại theo spec mục 2
- [ ] `ai_provider.py`: viết lại hoàn toàn theo spec mục 2
- [ ] `backend/migrations/run_migrations.py`: tạo + chạy migration
- [ ] `models.py`: thêm `anchor_from`, `anchor_to` vào `PriorityDoc`
- [ ] `frontend/src/components/PeriodSelector.jsx`: tạo mới
- [ ] `QuickResearch.jsx`: cap 3 sắc thuế, model selector (default deepseek), dùng PeriodSelector
- [ ] `FullReport.jsx`: model selector (default deepseek), không cap sắc thuế, dùng PeriodSelector, button AI suggest
- [ ] `routes/reports.py`: thêm endpoint `/suggest-topics`
- [ ] `api.js`: thêm `suggestTopics`
- [ ] Xoá file `BRIEF-ui-improvements.md` cũ
- [ ] Push GitHub, KHÔNG tự deploy

**Sau khi push:** nhắn Thanh "taxconsult push xong" → Thanh sẽ chạy migration + deploy.
