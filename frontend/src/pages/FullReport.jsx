import { useState, useRef } from 'react'
import { api, streamFullReport } from '../api.js'
import PeriodSelector from '../components/PeriodSelector.jsx'

const TAX_TYPES = ['TNDN', 'GTGT', 'TNCN', 'FCT', 'TTDB', 'XNK', 'TP', 'HKD']
const MODELS = [
  { value: 'deepseek', label: '🧠 DeepSeek Reasoner', desc: 'Phân tích sâu (mặc định)' },
  { value: 'haiku',    label: '⚡ Claude Haiku',      desc: 'Nhanh, tiết kiệm' },
  { value: 'fast',     label: '🎯 Claude Sonnet',     desc: 'Cân bằng' },
]
const DEFAULT_SECTIONS = [
  { id: 's1', title: 'Tổng quan về ngành / công ty', enabled: true },
  { id: 's2', title: 'Đặc thù kinh doanh & tài sản', enabled: true },
  { id: 's3', title: 'Khung pháp lý & các văn bản thuế áp dụng', enabled: true },
  { id: 's4', title: 'Phân tích các sắc thuế áp dụng', enabled: true },
  { id: 's5', title: 'Các vấn đề thuế đặc thù của ngành', enabled: true },
  { id: 's6', title: 'Thay đổi chính sách thuế gần đây & tác động', enabled: true },
  { id: 's7', title: 'Thuế quốc tế & chuyển giá', enabled: false },
]

export default function FullReport() {
  const [subject, setSubject] = useState('')
  const [mode, setMode] = useState('ngành')
  const [taxTypes, setTaxTypes] = useState(['TNDN', 'GTGT'])
  const [period, setPeriod] = useState('hiện_nay')
  const [model, setModel] = useState('deepseek')
  const [sonar, setSonar] = useState('sonar')
  const [sections, setSections] = useState(DEFAULT_SECTIONS)
  const [suggesting, setSuggesting] = useState(false)

  const [status, setStatus] = useState('idle') // idle|loading|streaming|done|error
  const [progress, setProgress] = useState({ current: 0, total: 0, section: '' })
  const [reportHtml, setReportHtml] = useState('')
  const [reportId, setReportId] = useState(null)
  const [error, setError] = useState('')
  const stopRef = useRef(null)

  function toggleTax(t) {
    setTaxTypes((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))
  }

  function toggleSection(id) {
    setSections((p) => p.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)))
  }

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

  async function handleSubmit(e) {
    e.preventDefault()
    if (!subject.trim()) return
    setError('')
    setReportHtml('')
    setReportId(null)
    setStatus('loading')

    try {
      const { job_id } = await api.startFullReport({
        subject,
        mode,
        tax_types: taxTypes,
        time_period: period,
        model_tier: model,
        sonar_model: sonar,
        sections,
      })

      setStatus('streaming')
      let html = ''

      const stop = streamFullReport(
        job_id,
        (event) => {
          if (event.type === 'start') {
            setProgress({ current: 0, total: event.total_sections, section: '' })
          } else if (event.type === 'section_start') {
            setProgress((p) => ({
              ...p,
              current: event.index,
              section: event.section_title,
            }))
          } else if (event.type === 'chunk') {
            html += event.text
            setReportHtml(html)
          } else if (event.type === 'done') {
            setReportId(event.report_id)
            setStatus('done')
          }
        },
        (err) => {
          setError(err.message)
          setStatus('error')
        },
        () => {}
      )
      stopRef.current = stop
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  function handleStop() {
    if (stopRef.current) stopRef.current()
    setStatus('idle')
  }

  const progressPct =
    progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">📊 Báo cáo Phân tích Thuế</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chủ đề phân tích</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Ngành bất động sản / Công ty ABC"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Loại</label>
            <div className="flex gap-4 mt-1">
              {['ngành', 'công ty'].map((m) => (
                <label key={m} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="mode"
                    value={m}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    className="accent-brand"
                  />
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
            <PeriodSelector value={period} onChange={setPeriod} />
          </div>

          {/* Model + Sonar */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Model AI</label>
            <div className="space-y-1 mb-2">
              {MODELS.map((m) => (
                <label key={m.value} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="model"
                    value={m.value}
                    checked={model === m.value}
                    onChange={() => setModel(m.value)}
                    className="accent-brand"
                  />
                  <span>{m.label}</span>
                  <span className="text-xs text-gray-400">{m.desc}</span>
                </label>
              ))}
            </div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Perplexity</label>
            <div className="flex gap-3 text-sm">
              {[
                { v: 'sonar', l: 'Sonar ⭐' },
                { v: 'sonar-pro', l: 'Sonar Pro' },
              ].map((m) => (
                <label key={m.v} className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="sonar"
                    value={m.v}
                    checked={sonar === m.v}
                    onChange={() => setSonar(m.v)}
                    className="accent-brand"
                  />
                  {m.l}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Sections */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs font-medium text-gray-600">
              Chọn phần (click để bật/tắt)
            </label>
            <button
              type="button"
              onClick={handleSuggestTopics}
              disabled={suggesting || !subject.trim()}
              className="text-xs px-2 py-1 rounded bg-brand/10 text-brand hover:bg-brand/20 disabled:opacity-50 flex items-center gap-1"
            >
              {suggesting ? '⏳ Đang gợi ý...' : '✨ AI gợi ý topics'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {sections.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => toggleSection(s.id)}
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                  s.enabled
                    ? 'bg-brand text-white border-brand'
                    : 'bg-white text-gray-400 border-gray-300'
                }`}
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {status === 'streaming' ? (
            <button
              type="button"
              onClick={handleStop}
              className="bg-red-500 hover:bg-red-600 text-white font-medium px-6 py-2 rounded-lg transition-colors"
            >
              Dừng
            </button>
          ) : (
            <button
              type="submit"
              disabled={status === 'loading' || !subject.trim() || taxTypes.length === 0}
              className="bg-brand hover:bg-brand-dark text-white font-medium px-6 py-2 rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {status === 'loading' ? (
                <><span className="animate-spin">⏳</span> Đang khởi tạo...</>
              ) : (
                '📊 Tạo báo cáo'
              )}
            </button>
          )}
          <span className="text-xs text-gray-400">(~5-10 phút)</span>
        </div>
      </form>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>
      )}

      {(status === 'streaming' || status === 'done') && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Progress */}
          {status === 'streaming' && (
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-600">
                  Phần {progress.current}/{progress.total}: {progress.section}
                </span>
                <span className="text-brand font-medium">{progressPct}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {status === 'done' && (
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-green-600 font-medium">✅ Hoàn thành</span>
              <div className="flex gap-3">
                {reportId && (
                  <a
                    href={`/api/reports/${reportId}/export-docx`}
                    className="text-sm bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-lg transition-colors"
                    download
                  >
                    Export Word
                  </a>
                )}
                <button
                  onClick={() => navigator.clipboard.writeText(reportHtml)}
                  className="text-sm text-brand hover:underline"
                >
                  Copy HTML
                </button>
              </div>
            </div>
          )}

          <div className="p-6 report-content" dangerouslySetInnerHTML={{ __html: reportHtml }} />
        </div>
      )}
    </div>
  )
}
