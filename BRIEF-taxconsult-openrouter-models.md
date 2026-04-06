# BRIEF: taxconsult — Thêm OPENROUTER_MODEL3 & OPENROUTER_MODEL4

**Repo:** github.com/phanvuhoang/taxconsult  
**Ngày:** 2026-04-06  
**Mục tiêu:** Hỗ trợ tối đa 4 OpenRouter model slots (MODEL1→MODEL4). Mỗi slot chỉ hiện trong UI nếu env var có giá trị. Không thay đổi behavior hiện tại của MODEL1 và MODEL2.

---

## Tổng quan thay đổi

Pattern hiện tại:
- `OPENROUTER_MODEL` → tier `"qwen"` → hiện trong dropdown nếu có giá trị
- `OPENROUTER_MODEL2` → tier `"qwen2"` → hiện trong dropdown nếu có giá trị

Cần thêm tương tự:
- `OPENROUTER_MODEL3` → tier `"qwen3"` (tên tier nội bộ, không liên quan đến Qwen3 model)
- `OPENROUTER_MODEL4` → tier `"qwen4"`

> **Lưu ý tên tier:** Giữ tên `qwen`, `qwen2`, `qwen3`, `qwen4` cho nhất quán với code hiện tại — dù thực tế model có thể là Gemini, DeepSeek, hay bất kỳ model OpenRouter nào.

---

## File 1: `backend/config.py`

### Hiện tại:
```python
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL   = os.getenv("OPENROUTER_MODEL", "qwen/qwen3.6-plus:free")

MODEL_MAP = {
    "haiku":    "claude-haiku-4.5",
    "fast":     "claude-sonnet-4.6",
    "strong":   "claude-sonnet-4.6",
    "deepseek": "deepseek-reasoner",
    "qwen":     OPENROUTER_MODEL,
}
```

### Sửa thành:
```python
OPENROUTER_API_KEY  = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL    = os.getenv("OPENROUTER_MODEL", "qwen/qwen3.6-plus:free")
OPENROUTER_MODEL2   = os.getenv("OPENROUTER_MODEL2", "")
OPENROUTER_MODEL3   = os.getenv("OPENROUTER_MODEL3", "")
OPENROUTER_MODEL4   = os.getenv("OPENROUTER_MODEL4", "")

MODEL_MAP = {
    "haiku":    "claude-haiku-4.5",
    "fast":     "claude-sonnet-4.6",
    "strong":   "claude-sonnet-4.6",
    "deepseek": "deepseek-reasoner",
    "qwen":     OPENROUTER_MODEL,
    **({"qwen2": OPENROUTER_MODEL2} if OPENROUTER_MODEL2 else {}),
    **({"qwen3": OPENROUTER_MODEL3} if OPENROUTER_MODEL3 else {}),
    **({"qwen4": OPENROUTER_MODEL4} if OPENROUTER_MODEL4 else {}),
}
```

---

## File 2: `backend/routes/reports.py`

### Hiện tại (import + endpoint `/model-info`):
```python
from backend.config import ..., OPENROUTER_MODEL, OPENROUTER_API_KEY

@router.get("/model-info")
async def get_model_info(user: User = Depends(get_current_user)):
    return {
        "openrouter_model": OPENROUTER_MODEL if OPENROUTER_API_KEY else None,
    }
```

### Sửa thành:
```python
from backend.config import ..., OPENROUTER_MODEL, OPENROUTER_MODEL2, OPENROUTER_MODEL3, OPENROUTER_MODEL4, OPENROUTER_API_KEY

@router.get("/model-info")
async def get_model_info(user: User = Depends(get_current_user)):
    """Trả về thông tin model động từ env vars — frontend dùng để hiển thị tên."""
    result = {}
    if OPENROUTER_API_KEY:
        if OPENROUTER_MODEL:
            result["openrouter_model"] = OPENROUTER_MODEL
        if OPENROUTER_MODEL2:
            result["openrouter_model2"] = OPENROUTER_MODEL2
        if OPENROUTER_MODEL3:
            result["openrouter_model3"] = OPENROUTER_MODEL3
        if OPENROUTER_MODEL4:
            result["openrouter_model4"] = OPENROUTER_MODEL4
    return result
```

---

## File 3: `backend/ai_provider.py`

### Tìm đoạn routing OpenRouter (hiện tại):
```python
if tier == "qwen" or "openrouter" in model or (model and model.startswith("qwen/")):
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY chưa được cấu hình")
    result = await _call_openrouter(messages, system, model, max_tokens)
    ...
```

Và đoạn tương tự trong `stream_ai()`:
```python
if tier == "qwen" or (model and model.startswith("qwen/")):
    ...
```

### Sửa cả 2 chỗ — thêm `qwen2`, `qwen3`, `qwen4` vào condition:

**Trong `call_ai()`:**
```python
if tier in ("qwen", "qwen2", "qwen3", "qwen4") or "openrouter" in model or (model and model.startswith(("qwen/", "google/", "meta-llama/", "mistralai/"))):
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY chưa được cấu hình")
    result = await _call_openrouter(messages, system, model, max_tokens)
    if result:
        return result
    raise RuntimeError(f"OpenRouter gọi thất bại cho model {model}")
```

**Trong `stream_ai()`:**
```python
if tier in ("qwen", "qwen2", "qwen3", "qwen4") or (model and model.startswith(("qwen/", "google/", "meta-llama/", "mistralai/"))):
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY chưa được cấu hình")
    async for chunk in _stream_openrouter(messages, system, model, max_tokens):
        yield chunk
    return
```

### Fix thêm trong `_call_openrouter()` và `_stream_openrouter()`:

Hiện tại có `extra_body` enable reasoning chỉ cho qwen3 models:
```python
"extra_body": {"reasoning": {"enabled": True}} if "qwen3" in model.lower() else {},
```

Giữ nguyên logic này — nó check tên model thực (VD `qwen/qwen3-235b...`), không bị ảnh hưởng bởi tên tier.

---

## File 4: Helper function `_model_display_name()` — tạo trong frontend

Trong mỗi trang frontend có đoạn lặp đi lặp lại để format tên model từ OpenRouter ID:
```js
const shortName = raw
  .replace(/^[^/]+\//, '')
  .replace(/:free$/, ' (free)')
  .replace(/:(\w+)$/, ' ($1)')
  .replace(/[-_]/g, ' ')
  .replace(/\b\w/g, c => c.toUpperCase())
```

### Tạo hàm helper trong `frontend/src/utils/modelDisplay.js` (file mới):
```js
/**
 * Format OpenRouter model ID thành friendly display name.
 * VD: "qwen/qwen3-235b-a22b-2507" → "Qwen3 235B A22B 2507"
 *     "google/gemini-3-flash-preview" → "Gemini 3 Flash Preview"
 *     "qwen/qwen3.6-plus:free" → "Qwen3.6 Plus (free)"
 */
export function modelDisplayName(raw) {
  return raw
    .replace(/^[^/]+\//, '')          // strip provider prefix: "qwen/" "google/"
    .replace(/:free$/, ' (free)')      // ":free" → " (free)"
    .replace(/:(\w+)$/, ' ($1)')       // other suffixes
    .replace(/[-_]/g, ' ')             // dashes/underscores → spaces
    .replace(/\b\w/g, c => c.toUpperCase())  // Title Case
}

/**
 * Trả về emoji icon phù hợp với provider từ model ID.
 */
export function modelIcon(raw) {
  if (raw.startsWith('google/'))      return '✨'
  if (raw.startsWith('qwen/'))        return '🌟'
  if (raw.startsWith('meta-llama/'))  return '🦙'
  if (raw.startsWith('mistralai/'))   return '🌬️'
  if (raw.startsWith('deepseek/'))    return '🧠'
  return '🤖'
}
```

---

## File 5–7: Frontend pages — `ContentPage.jsx`, `QuickResearch.jsx`, `FullReport.jsx`

### Pattern hiện tại (mỗi trang đang có):
```js
useEffect(() => {
  api.getModelInfo().then((info) => {
    if (info?.openrouter_model) {
      const raw = info.openrouter_model
      const shortName = raw
        .replace(/^[^/]+\//, '')
        .replace(/:free$/, ' (free)')
        .replace(/:(\w+)$/, ' ($1)')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
      setModels([
        ...MODELS_STATIC,
        { value: 'qwen', label: `🌟 ${shortName}`, desc: `OpenRouter: ${raw}` },
      ])
    }
  }).catch(() => {})
}, [...])
```

### Sửa thành (áp dụng cho CẢ 3 trang, logic giống nhau):
```js
import { modelDisplayName, modelIcon } from '../utils/modelDisplay'

// Trong useEffect:
api.getModelInfo().then((info) => {
  const extra = []
  const slots = [
    { key: 'openrouter_model',  tier: 'qwen'  },
    { key: 'openrouter_model2', tier: 'qwen2' },
    { key: 'openrouter_model3', tier: 'qwen3' },
    { key: 'openrouter_model4', tier: 'qwen4' },
  ]
  for (const { key, tier } of slots) {
    if (info?.[key]) {
      const raw = info[key]
      extra.push({
        value: tier,
        label: `${modelIcon(raw)} ${modelDisplayName(raw)}`,
        desc: `OpenRouter: ${raw}`,
      })
    }
  }
  if (extra.length > 0) {
    setModels([...MODELS_STATIC, ...extra])
  }
}).catch(() => {})
```

> **Quan trọng:** Sửa cả 3 file — `ContentPage.jsx`, `QuickResearch.jsx`, `FullReport.jsx`. Logic giống hệt nhau.

---

## Checklist sau khi implement

- [ ] `config.py`: 4 env vars, MODEL_MAP chỉ add entry nếu value không rỗng
- [ ] `reports.py`: `/model-info` endpoint trả đúng 4 fields (chỉ field nào có giá trị)
- [ ] `ai_provider.py`: routing check `tier in ("qwen", "qwen2", "qwen3", "qwen4")`
- [ ] `utils/modelDisplay.js`: file mới, export `modelDisplayName` + `modelIcon`
- [ ] `ContentPage.jsx`: loop 4 slots thay vì hardcode 1
- [ ] `QuickResearch.jsx`: loop 4 slots
- [ ] `FullReport.jsx`: loop 4 slots
- [ ] Test: khi `OPENROUTER_MODEL2/3/4` rỗng → dropdown KHÔNG hiện slot đó
- [ ] Test: khi có giá trị → hiện đúng tên model + icon phù hợp provider
- [ ] Commit, push, báo deploy

---

## Env vars anh cần set trong Coolify sau khi deploy

```
OPENROUTER_MODEL=qwen/qwen3-235b-a22b-2507      # hoặc model khác
OPENROUTER_MODEL2=google/gemini-3-flash-preview  # ví dụ
OPENROUTER_MODEL3=                               # để trống = không hiện
OPENROUTER_MODEL4=                               # để trống = không hiện
```

Slots nào để trống sẽ tự động không xuất hiện trong UI.
