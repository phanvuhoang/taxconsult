import { useState, useEffect } from 'react'
import { api } from '../api.js'
import PeriodSelector from '../components/PeriodSelector.jsx'

const TAX_TYPES = ['TNDN', 'GTGT', 'TNCN', 'FCT', 'TTDB', 'XNK', 'TP', 'HKD']
const MODELS_STATIC = [
  { value: 'deepseek', label: '🧠 DeepSeek Reasoner', desc: 'Phân tích sâu (mặc định)' },
  { value: 'haiku',    label: '⚡ Claude Haiku',      desc: 'Nhanh, tiết kiệm' },
  { value: 'fast',     label: '🎯 Claude Sonnet',     desc: 'Cân bằng' },
]

export default function QuickResearch() {
  const [question, setQuestion] = useState('')
  const [taxTypes, setTaxTypes] = useState(['TNDN'])
  const [period, setPeriod] = useState('hiện_nay')
  const [model, setModel] = useState('deepseek')
  const [models, setModels] = useState(MODELS_STATIC)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    loadHistory()
    // Fetch dynamic model info (OpenRouter model từ env)
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
  }, [])

  async function loadHistory() {
    try {
      const data = await api.getResearchHistory()
      setHistory(data)
    } catch (_) {}
  }

  async function loadResearch(id) {
    try {
      const data = await api.getResearchById(id)
      setResult({
        answer_html: data.answer_html,
        model_used: data.model_used || '',
        duration_ms: data.duration_ms || 0,
        tax_docs_used: [],
        congvan_used: [],
      })
      setQuestion(data.question)
      setTaxTypes(data.tax_types || [])
      setShowHistory(false)
    } catch (e) {
      setError('Không thể tải: ' + e.message)
    }
  }

  async function deleteResearch(id, e) {
    e.stopPropagation()
    try {
      await api.deleteResearch(id)
      setHistory(h => h.filter(x => x.id !== id))
    } catch (err) {
      alert('Lỗi xoá: ' + err.message)
    }
  }

  function toggleTax(t) {
    setTaxTypes((prev) => {
      if (prev.includes(t)) return prev.filter((x) => x !== t)
      if (prev.length >= 3) return prev
      return [...prev, t]
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!question.trim()) return
    setError('')
    setResult(null)
    setLoading(true)
    try {
      const data = await api.quickResearch({
        question,
        tax_types: taxTypes,
        time_period: period,
        model_tier: model,
      })
      setResult(data)
      loadHistory()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">🔍 Quick Research</h1>

      {/* History panel */}
      <div className="mb-4">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
        >
          📂 Lịch sử ({history.length})
        </button>
        {showHistory && (
          <div className="mt-2 border border-gray-200 rounded-lg divide-y max-h-64 overflow-y-auto bg-white shadow-sm">
            {history.length === 0 && (
              <div className="p-3 text-gray-400 text-center text-sm">Chưa có lịch sử</div>
            )}
            {history.map((h) => (
              <div key={h.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-sm">
                <span
                  className="flex-1 truncate cursor-pointer text-brand hover:underline"
                  onClick={() => loadResearch(h.id)}
                >
                  {h.question}
                </span>
                <span className="text-gray-400 text-xs shrink-0">{h.created_at_display}</span>
                <button
                  onClick={(e) => deleteResearch(h.id, e)}
                  className="text-gray-300 hover:text-red-400 text-xs px-1 shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Câu hỏi thuế của bạn
          </label>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={4}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
            placeholder="Ví dụ: Chi phí trang phục tiền mặt cho nhân viên được trừ tối đa bao nhiêu theo quy định 2025?"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Tax types */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Sắc thuế <span className="text-gray-400">(tối đa 3, đầu tiên = chính)</span>
            </label>
            <div className="flex flex-wrap gap-1">
              {TAX_TYPES.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => toggleTax(t)}
                  className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                    taxTypes.includes(t)
                      ? 'bg-brand text-white border-brand'
                      : taxTypes.length >= 3
                      ? 'bg-white text-gray-300 border-gray-200 cursor-not-allowed'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-brand'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Period */}
          <div>
            <PeriodSelector value={period} onChange={setPeriod} />
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Model</label>
            <div className="space-y-1">
              {models.map((m) => (
                <label key={m.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="model"
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

        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || !question.trim() || taxTypes.length === 0}
            className="bg-brand hover:bg-brand-dark text-white font-medium px-6 py-2 rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {loading ? (
              <><span className="animate-spin inline-block">⏳</span> Đang tra cứu...</>
            ) : (
              '🔍 Tìm hiểu ngay'
            )}
          </button>
          <span className="text-xs text-gray-400">(~20-45 giây)</span>
        </div>
      </form>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>
      )}

      {result && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Kết quả</h2>
            <div className="flex gap-2 items-center">
              {result.model_used && (
                <span className="text-xs text-gray-400">
                  {result.model_used} · {(result.duration_ms / 1000).toFixed(1)}s
                </span>
              )}
              <button
                onClick={() => navigator.clipboard.writeText(result.answer_html)}
                className="text-xs text-brand hover:underline"
              >
                Copy HTML
              </button>
            </div>
          </div>

          <div
            className="p-5 report-content"
            dangerouslySetInnerHTML={{ __html: result.answer_html }}
          />

          {(result.tax_docs_used?.length > 0 || result.congvan_used?.length > 0) && (
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
              {result.tax_docs_used?.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs font-medium text-gray-600">Văn bản đã dùng: </span>
                  {result.tax_docs_used.map((d) => (
                    <span key={d.so_hieu} className="inline-block bg-brand text-white text-xs px-2 py-0.5 rounded mr-1">
                      {d.so_hieu}
                    </span>
                  ))}
                </div>
              )}
              {result.congvan_used?.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-gray-600">Công văn đã dùng: </span>
                  {result.congvan_used.map((d) => (
                    <span key={d.so_hieu} className="inline-block bg-blue-500 text-white text-xs px-2 py-0.5 rounded mr-1">
                      {d.so_hieu}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
