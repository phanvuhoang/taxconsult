import { useState } from 'react'
import { api } from '../api.js'

const TAX_TYPES = ['TNDN', 'GTGT', 'TNCN', 'FCT', 'TTDB', 'XNK', 'TP', 'HKD']
const PERIODS = ['2026', '2025', '2024', '2023', '2020-2024', '2025-2026', 'trước 10/2025']
const MODELS = [
  { value: 'haiku', label: 'Haiku ⭐', desc: 'Nhanh, tiết kiệm' },
  { value: 'fast', label: 'Sonnet', desc: 'Cân bằng' },
  { value: 'strong', label: 'Opus', desc: 'Tốt nhất' },
]

export default function QuickResearch() {
  const [question, setQuestion] = useState('')
  const [taxTypes, setTaxTypes] = useState(['TNDN'])
  const [period, setPeriod] = useState('2026')
  const [customPeriod, setCustomPeriod] = useState('')
  const [model, setModel] = useState('haiku')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function toggleTax(t) {
    setTaxTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    )
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
        time_period: customPeriod || period,
        model_tier: model,
      })
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">🔍 Quick Research</h1>

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
            <label className="block text-xs font-medium text-gray-600 mb-1">Sắc thuế</label>
            <div className="flex flex-wrap gap-1">
              {TAX_TYPES.map((t) => (
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

          {/* Period */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Giai đoạn</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
            >
              {PERIODS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <input
              type="text"
              value={customPeriod}
              onChange={(e) => setCustomPeriod(e.target.value)}
              placeholder="Hoặc nhập tùy chỉnh..."
              className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Model</label>
            <div className="space-y-1">
              {MODELS.map((m) => (
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
              <>
                <span className="animate-spin">⏳</span> Đang tra cứu...
              </>
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
              <span className="text-xs text-gray-400">
                {result.model_used} · {(result.duration_ms / 1000).toFixed(1)}s
              </span>
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
                    <span
                      key={d.so_hieu}
                      className="inline-block bg-brand text-white text-xs px-2 py-0.5 rounded mr-1"
                    >
                      {d.so_hieu}
                    </span>
                  ))}
                </div>
              )}
              {result.congvan_used?.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-gray-600">Công văn đã dùng: </span>
                  {result.congvan_used.map((d) => (
                    <span
                      key={d.so_hieu}
                      className="inline-block bg-blue-500 text-white text-xs px-2 py-0.5 rounded mr-1"
                    >
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
