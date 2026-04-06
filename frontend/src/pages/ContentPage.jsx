import { useState, useEffect, useRef } from 'react'
import { api, downloadBlob } from '../api.js'
import { modelDisplayName, modelIcon } from '../utils/modelDisplay.js'

const TAX_TYPES = ['TNDN', 'GTGT', 'TNCN', 'FCT', 'TTDB', 'XNK', 'TP', 'HKD', 'QLT', 'HOA_DON', 'THUE_QT']
const MODELS_STATIC = [
  { value: 'deepseek', label: '🧠 DeepSeek Reasoner', desc: 'Phân tích sâu (mặc định)' },
  { value: 'haiku',    label: '⚡ Claude Haiku',      desc: 'Nhanh, tiết kiệm' },
  { value: 'fast',     label: '🎯 Claude Sonnet',     desc: 'Cân bằng' },
]
const POLL_INTERVAL = 3000

export default function ContentPage({
  contentType,
  title,
  description,
  placeholder,
  defaultSlides,
  showClientFields,
  showStyleRefs,
}) {
  const [subject, setSubject] = useState('')
  const [taxTypes, setTaxTypes] = useState(['TNDN'])
  const [model, setModel] = useState('deepseek')
  const [models, setModels] = useState(MODELS_STATIC)
  const [clientName, setClientName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [styleRefs, setStyleRefs] = useState([])
  const [styleInput, setStyleInput] = useState('')
  const [numSlides, setNumSlides] = useState(defaultSlides)

  const [status, setStatus] = useState('idle')
  const [jobId, setJobId] = useState(null)
  const [progress, setProgress] = useState({ step: 0, total: 3, label: '' })
  const [contentHtml, setContentHtml] = useState('')
  const [error, setError] = useState('')
  const [gammaUrl, setGammaUrl] = useState('')
  const [gammaLoading, setGammaLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [modelUsed, setModelUsed] = useState('')

  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [historyTaxFilter, setHistoryTaxFilter] = useState('')

  const pollRef = useRef(null)
  const searchDebounceRef = useRef(null)

  useEffect(() => {
    loadHistory()
    api.getModelInfo().then((info) => {
      const extra = []
      const slots = [
        { key: 'openrouter_model',  tier: 'qwen'  },
        { key: 'openrouter_model2', tier: 'qwen2' },
        { key: 'openrouter_model3', tier: 'qwen3' },
        { key: 'openrouter_model4', tier: 'qwen4' },
        { key: 'openrouter_model5', tier: 'qwen5' },
        { key: 'openrouter_model6', tier: 'qwen6' },
      ]
      for (const { key, tier } of slots) {
        if (info?.[key]) {
          const raw = info[key]
          extra.push({ value: tier, label: `${modelIcon(raw)} ${modelDisplayName(raw)}`, desc: `OpenRouter: ${raw}` })
        }
      }
      if (extra.length > 0) {
        setModels([...MODELS_STATIC, ...extra])
      }
    }).catch(() => {})
  }, [contentType])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [])

  async function loadHistory(taxFilter = historyTaxFilter, searchTerm = historySearch) {
    try {
      const params = {}
      if (taxFilter) params.tax_type = taxFilter
      if (searchTerm) params.search = searchTerm
      const data = await api.getContentHistory(contentType, params)
      setHistory(data)
      const running = data.find(j => j.status === 'running' || j.status === 'pending')
      if (running && status === 'idle') {
        startPolling(running.id)
      }
    } catch (_) {}
  }

  function onSearchChange(val) {
    setHistorySearch(val)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => loadHistory(historyTaxFilter, val), 400)
  }

  function onTaxFilterChange(val) {
    setHistoryTaxFilter(val)
    loadHistory(val, historySearch)
  }

  function startPolling(id) {
    if (pollRef.current) clearInterval(pollRef.current)
    setJobId(id)
    setStatus('polling')
    pollRef.current = setInterval(async () => {
      try {
        const data = await api.getContentJob(id)
        setProgress({ step: data.progress_step, total: data.progress_total, label: data.progress_label || '' })
        if (data.content_html) setContentHtml(data.content_html)
        if (data.gamma_url) setGammaUrl(data.gamma_url)
        if (data.status === 'done') {
          clearInterval(pollRef.current)
          pollRef.current = null
          if (data.model_used) setModelUsed(data.model_used)
          setStatus('done')
          loadHistory()
        } else if (data.status === 'error') {
          clearInterval(pollRef.current)
          pollRef.current = null
          setError(data.error_msg || 'Đã xảy ra lỗi')
          setStatus('error')
        }
      } catch (_) {}
    }, POLL_INTERVAL)
  }

  function toggleTax(t) {
    setTaxTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  function addStyleRef() {
    const url = styleInput.trim()
    if (!url.startsWith('http') || styleRefs.length >= 5) return
    setStyleRefs(prev => [...prev, url])
    setStyleInput('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!subject.trim()) return
    setError('')
    setContentHtml('')
    setGammaUrl('')
    setModelUsed('')
    setStatus('loading')

    try {
      const { job_id } = await api.startContent({
        content_type: contentType,
        subject,
        tax_types: taxTypes,
        model_tier: model,
        client_name: clientName,
        company_name: companyName,
        style_refs: styleRefs,
      })
      startPolling(job_id)
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  async function handleCancel() {
    if (!jobId) return
    try {
      await api.cancelContentJob(jobId)
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
      setStatus('error')
      setError('Đã huỷ')
    } catch (_) {}
  }

  async function handleGamma() {
    if (!jobId) return
    setGammaLoading(true)
    try {
      const data = await api.requestContentGamma(jobId, numSlides)
      if (data.gamma_url) setGammaUrl(data.gamma_url)
    } catch (err) {
      alert('Lỗi Gamma: ' + err.message)
    } finally {
      setGammaLoading(false)
    }
  }

  async function handleExportDocx() {
    if (!jobId) return
    setExporting(true)
    try {
      const result = await api.exportContentDocx(jobId)
      downloadBlob(result)
    } catch (err) {
      alert('Lỗi xuất DOCX: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  async function loadFromHistory(id) {
    try {
      const data = await api.getContentJob(id)
      setContentHtml(data.content_html || '')
      setGammaUrl(data.gamma_url || '')
      setModelUsed(data.model_used || '')
      setJobId(id)
      setStatus('done')
      setShowHistory(false)
    } catch (err) {
      alert('Không thể tải: ' + err.message)
    }
  }

  const progressPct = progress.total > 0
    ? Math.round((progress.step / progress.total) * 100)
    : 0

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{title}</h1>
      {description && <p className="text-sm text-gray-500 mb-5">{description}</p>}

      {/* History */}
      <div className="mb-4">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
        >
          📂 Lịch sử ({history.length})
        </button>
        {showHistory && (
          <div className="mt-2 border border-gray-200 rounded-lg bg-white shadow-sm">
            {/* Filter bar */}
            <div className="flex gap-2 p-2 border-b border-gray-100">
              <input
                type="text"
                value={historySearch}
                onChange={e => onSearchChange(e.target.value)}
                placeholder="Tìm theo chủ đề..."
                className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <select
                value={historyTaxFilter}
                onChange={e => onTaxFilterChange(e.target.value)}
                className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none"
              >
                <option value="">Tất cả thuế</option>
                {TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y">
              {history.length === 0 && (
                <div className="p-4 text-center text-gray-400 text-sm">Không tìm thấy</div>
              )}
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                  onClick={() => loadFromHistory(h.id)}
                >
                  <span className="flex-1 truncate text-brand">{h.subject}</span>
                  {h.model_used && (
                    <span className="text-gray-300 text-xs shrink-0">{h.model_used}</span>
                  )}
                  <span className="text-gray-400 text-xs shrink-0">{h.created_at}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nội dung / Chủ đề</label>
          <textarea
            value={subject}
            onChange={e => setSubject(e.target.value)}
            rows={4}
            required
            placeholder={placeholder}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
          />
        </div>

        {showClientFields && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tên khách hàng</label>
              <input
                type="text"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="VD: Ông Nguyễn Văn A"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tên công ty</label>
              <input
                type="text"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="VD: Công ty TNHH XYZ"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Tax types */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sắc thuế</label>
            <div className="flex flex-wrap gap-1">
              {TAX_TYPES.map(t => (
                <button
                  type="button"
                  key={t}
                  onClick={() => toggleTax(t)}
                  className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                    taxTypes.includes(t)
                      ? 'bg-brand text-white border-brand'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-brand'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Model AI</label>
            <div className="space-y-1">
              {models.map(m => (
                <label key={m.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="content-model"
                    value={m.value}
                    checked={model === m.value}
                    onChange={() => setModel(m.value)}
                    className="accent-brand"
                  />
                  <span className="text-sm">{m.label}</span>
                  <span className="text-xs text-gray-400">{m.desc}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {showStyleRefs && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Bài mẫu tham khảo phong cách (tối đa 5 URLs)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="url"
                value={styleInput}
                onChange={e => setStyleInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addStyleRef())}
                placeholder="https://..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <button
                type="button"
                onClick={addStyleRef}
                disabled={styleRefs.length >= 5 || !styleInput.startsWith('http')}
                className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-300 disabled:opacity-50"
              >
                + Thêm
              </button>
            </div>
            {styleRefs.length > 0 && (
              <div className="space-y-1">
                {styleRefs.map((url, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="flex-1 truncate">{url}</span>
                    <button
                      type="button"
                      onClick={() => setStyleRefs(prev => prev.filter((_, j) => j !== i))}
                      className="text-gray-400 hover:text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={status === 'loading' || status === 'polling' || !subject.trim()}
            className="bg-brand hover:bg-brand-dark text-white font-medium px-6 py-2 rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {status === 'loading' ? (
              <><span className="animate-spin inline-block">⏳</span> Đang khởi tạo...</>
            ) : (
              '▶ Tạo nội dung'
            )}
          </button>
          <span className="text-xs text-gray-400">(~30-60 giây)</span>
        </div>
      </form>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>
      )}

      {/* Progress */}
      {status === 'polling' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-gray-600">{progress.label || 'Đang xử lý...'}</span>
            <span className="text-brand font-medium">{progressPct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-brand rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <button
            onClick={handleCancel}
            className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 rounded px-2 py-1"
          >
            ✕ Huỷ
          </button>
        </div>
      )}

      {/* Result */}
      {status === 'done' && contentHtml && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Toolbar */}
          <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <span className="text-green-600 font-medium text-sm">✅ Hoàn thành</span>
            {modelUsed && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                🤖 {modelUsed}
              </span>
            )}
            <div className="flex gap-2 flex-wrap ml-auto">
              <button
                onClick={() => navigator.clipboard.writeText(contentHtml)}
                className="text-xs text-brand hover:underline px-2"
              >
                Copy HTML
              </button>
              <button
                onClick={handleExportDocx}
                disabled={exporting}
                className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-60"
              >
                {exporting ? '⏳' : '📄'} Tải DOCX
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGamma}
                  disabled={gammaLoading}
                  className="text-sm px-3 py-1.5 rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60"
                >
                  {gammaLoading ? '⏳ Đang tạo...' : `✨ Tạo Gamma (${numSlides} slides)`}
                </button>
                <input
                  type="number"
                  min={3}
                  max={60}
                  value={numSlides}
                  onChange={e => setNumSlides(Number(e.target.value))}
                  className="w-14 border rounded px-2 py-1 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Gamma result */}
          {gammaUrl && (
            <div className="px-5 py-3 border-b border-gray-100 bg-purple-50/30 flex items-center justify-between">
              <span className="text-sm text-purple-700">🎞️ Gamma Slides đã tạo:</span>
              <a href={gammaUrl} target="_blank" rel="noopener noreferrer"
                className="text-brand font-medium text-sm hover:underline">
                Xem Slides →
              </a>
            </div>
          )}

          {/* Content */}
          <div
            className="p-6 report-content"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
        </div>
      )}
    </div>
  )
}
