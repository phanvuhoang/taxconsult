import { useState, useRef, useEffect } from 'react'
import { api, downloadBlob } from '../api.js'
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
const POLL_INTERVAL = 3000

function buildTOC(html) {
  const matches = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/gi)]
  return matches.map((m, i) => ({
    index: i + 1,
    text: m[1].replace(/<[^>]+>/g, ''),
    anchor: `section-${i + 1}`,
  }))
}

function injectAnchors(html) {
  let count = 0
  return html.replace(/<h2/gi, () => `<h2 id="section-${++count}"`)
}

export default function FullReport() {
  const [subject, setSubject] = useState('')
  const [mode, setMode] = useState('ngành')
  const [taxTypes, setTaxTypes] = useState(['TNDN', 'GTGT'])
  const [period, setPeriod] = useState('hiện_nay')
  const [model, setModel] = useState('deepseek')
  const [sonar, setSonar] = useState('sonar')
  const [sections, setSections] = useState(DEFAULT_SECTIONS)
  const [suggesting, setSuggesting] = useState(false)

  // Job/report state
  const [status, setStatus] = useState('idle') // idle|loading|polling|done|error
  const [jobId, setJobId] = useState(null)
  const [progress, setProgress] = useState({ step: 0, total: 0, label: '' })
  const [reportHtml, setReportHtml] = useState('')
  const [reportId, setReportId] = useState(null)
  const [error, setError] = useState('')
  const pollRef = useRef(null)

  // TOC
  const [toc, setToc] = useState([])
  const [tocOpen, setTocOpen] = useState(true)

  // Font size
  const [fontSize, setFontSize] = useState(15)

  // Saved reports panel
  const [savedReports, setSavedReports] = useState([])
  const [showReports, setShowReports] = useState(false)

  // Export state
  const [exporting, setExporting] = useState('')

  // Load saved reports on mount
  useEffect(() => {
    api.listReports({ report_type: 'full', limit: 20 })
      .then(setSavedReports)
      .catch(() => {})
  }, [])

  // Cleanup poll on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  // Rebuild TOC when reportHtml changes
  useEffect(() => {
    if (reportHtml) setToc(buildTOC(reportHtml))
  }, [reportHtml])

  function toggleTax(t) {
    setTaxTypes((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))
  }

  function toggleSection(id) {
    setSections((p) => p.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)))
  }

  async function handleSuggestTopics() {
    if (!subject.trim()) { alert('Nhập chủ đề trước nhé!'); return }
    setSuggesting(true)
    try {
      const data = await api.suggestTopics({ subject, mode, tax_types: taxTypes })
      if (data.sections?.length) setSections(data.sections)
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
    setToc([])
    setStatus('loading')

    try {
      const { job_id } = await api.startReport({
        subject, mode,
        tax_types: taxTypes,
        time_period: period,
        model_tier: model,
        sonar_model: sonar,
        sections,
      })
      setJobId(job_id)
      setStatus('polling')

      const interval = setInterval(async () => {
        try {
          const data = await api.getJobStatus(job_id)
          setProgress({ step: data.progress_step, total: data.progress_total, label: data.progress_label })

          if (data.html_content) setReportHtml(data.html_content)

          if (data.status === 'done') {
            clearInterval(interval)
            pollRef.current = null
            setReportId(data.report_id)
            setStatus('done')
            // Refresh saved reports list
            api.listReports({ report_type: 'full', limit: 20 }).then(setSavedReports).catch(() => {})
          } else if (data.status === 'error') {
            clearInterval(interval)
            pollRef.current = null
            setError(data.error_msg || 'Lỗi không xác định')
            setStatus('error')
          }
        } catch (err) {
          clearInterval(interval)
          pollRef.current = null
          setError(err.message)
          setStatus('error')
        }
      }, POLL_INTERVAL)

      pollRef.current = interval
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  async function loadReport(id) {
    try {
      const r = await api.getReport(id)
      setReportHtml(r.content_html || '')
      setReportId(r.id)
      setStatus('done')
      setShowReports(false)
    } catch (e) {
      alert('Không thể tải báo cáo: ' + e.message)
    }
  }

  async function handleDownloadDocx() {
    if (!reportHtml) return
    setExporting('docx')
    try {
      const result = await api.exportDocx({ subject: subject || 'Báo cáo thuế', html_content: reportHtml })
      downloadBlob(result)
    } catch (e) {
      alert('Lỗi xuất DOCX: ' + e.message)
    } finally {
      setExporting('')
    }
  }

  async function handleDownloadSlides() {
    if (!reportHtml) return
    setExporting('slides')
    try {
      const result = await api.exportSlides({ subject: subject || 'Báo cáo thuế', html_content: reportHtml })
      downloadBlob(result)
    } catch (e) {
      alert('Lỗi xuất Slides: ' + e.message)
    } finally {
      setExporting('')
    }
  }

  function openGamma() {
    window.open('https://gamma.app/create', '_blank')
  }

  const progressPct = progress.total > 0
    ? Math.round((progress.step / progress.total) * 100)
    : 0

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">📊 Báo cáo Phân tích Thuế</h1>

      {/* Saved reports panel */}
      {savedReports.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowReports(!showReports)}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
          >
            📂 Báo cáo đã lưu ({savedReports.length})
          </button>
          {showReports && (
            <div className="mt-2 border border-gray-200 rounded-lg divide-y max-h-60 overflow-y-auto bg-white shadow-sm">
              {savedReports.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-sm">
                  <span className="truncate flex-1 text-gray-800">{r.subject || r.title}</span>
                  <span className="text-gray-400 text-xs mx-3 whitespace-nowrap">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString('vi-VN') : ''}
                  </span>
                  <button
                    onClick={() => loadReport(r.id)}
                    className="text-brand text-xs hover:underline whitespace-nowrap"
                  >
                    Xem
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Form */}
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
                    type="radio" name="mode" value={m}
                    checked={mode === m} onChange={() => setMode(m)}
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
                <button type="button" key={t} onClick={() => toggleTax(t)}
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
                  <input type="radio" name="model" value={m.value}
                    checked={model === m.value} onChange={() => setModel(m.value)}
                    className="accent-brand"
                  />
                  <span>{m.label}</span>
                  <span className="text-xs text-gray-400">{m.desc}</span>
                </label>
              ))}
            </div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Perplexity</label>
            <div className="flex gap-3 text-sm">
              {[{ v: 'sonar', l: 'Sonar ⭐' }, { v: 'sonar-pro', l: 'Sonar Pro' }].map((m) => (
                <label key={m.v} className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="sonar" value={m.v}
                    checked={sonar === m.v} onChange={() => setSonar(m.v)}
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
            <label className="text-xs font-medium text-gray-600">Chọn phần (click để bật/tắt)</label>
            <button type="button" onClick={handleSuggestTopics}
              disabled={suggesting || !subject.trim()}
              className="text-xs px-2 py-1 rounded bg-brand/10 text-brand hover:bg-brand/20 disabled:opacity-50 flex items-center gap-1"
            >
              {suggesting ? '⏳ Đang gợi ý...' : '✨ AI gợi ý topics'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {sections.map((s) => (
              <button type="button" key={s.id} onClick={() => toggleSection(s.id)}
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
          <button
            type="submit"
            disabled={status === 'loading' || status === 'polling' || !subject.trim() || taxTypes.length === 0}
            className="bg-brand hover:bg-brand-dark text-white font-medium px-6 py-2 rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {status === 'loading' ? (
              <><span className="animate-spin inline-block">⏳</span> Đang khởi tạo...</>
            ) : (
              '📊 Tạo báo cáo'
            )}
          </button>
          <span className="text-xs text-gray-400">(~5-10 phút, có thể đóng tab)</span>
        </div>
      </form>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>
      )}

      {(status === 'polling' || status === 'done') && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Progress (polling) */}
          {status === 'polling' && (
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-600">{progress.label || 'Đang xử lý...'}</span>
                <span className="text-brand font-medium">{progressPct}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Có thể đóng tab, mở lại và paste job ID để tiếp tục: <code className="bg-gray-100 px-1 rounded">{jobId}</code>
              </p>
            </div>
          )}

          {/* Done toolbar */}
          {status === 'done' && (
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-green-600 font-medium text-sm">✅ Hoàn thành</span>

                {/* Font size controls */}
                <div className="flex items-center gap-1 ml-auto">
                  <span className="text-xs text-gray-500">Cỡ chữ:</span>
                  <button
                    onClick={() => setFontSize((f) => Math.max(12, f - 1))}
                    className="w-7 h-7 rounded border border-gray-300 text-sm hover:bg-gray-50"
                  >A-</button>
                  <span className="text-sm w-7 text-center">{fontSize}</span>
                  <button
                    onClick={() => setFontSize((f) => Math.min(22, f + 1))}
                    className="w-7 h-7 rounded border border-gray-300 text-sm hover:bg-gray-50"
                  >A+</button>
                </div>

                {/* Export buttons */}
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={handleDownloadDocx}
                    disabled={exporting === 'docx'}
                    className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-60"
                  >
                    {exporting === 'docx' ? '⏳' : '📄'} Tải DOCX
                  </button>
                  <button
                    onClick={handleDownloadSlides}
                    disabled={exporting === 'slides'}
                    className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-60"
                  >
                    {exporting === 'slides' ? '⏳' : '🎞️'} Tạo Slides
                  </button>
                  <button
                    onClick={openGamma}
                    title="Copy nội dung → paste vào Gamma để tạo slides đẹp hơn"
                    className="text-sm px-3 py-1.5 rounded-lg bg-brand text-white hover:bg-brand-dark"
                  >
                    ✨ Mở Gamma
                  </button>
                  <button
                    onClick={() => navigator.clipboard.writeText(reportHtml)}
                    className="text-sm text-brand hover:underline px-2"
                  >
                    Copy HTML
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TOC */}
          {toc.length > 0 && (
            <div className="border-b border-gray-100 px-5 py-3 bg-green-50/50">
              <button
                onClick={() => setTocOpen(!tocOpen)}
                className="flex items-center gap-2 font-semibold text-brand w-full text-sm"
              >
                📋 Mục lục {tocOpen ? '▲' : '▼'}
              </button>
              {tocOpen && (
                <ol className="mt-2 space-y-1 text-sm pl-2">
                  {toc.map((item) => (
                    <li key={item.index}>
                      <a href={`#${item.anchor}`} className="text-brand hover:underline">
                        {item.index}. {item.text}
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {/* Report content */}
          <div
            id="report-content"
            className="p-6 report-content"
            style={{ fontSize: `${fontSize}px` }}
            dangerouslySetInnerHTML={{ __html: injectAnchors(reportHtml) }}
          />
        </div>
      )}
    </div>
  )
}
