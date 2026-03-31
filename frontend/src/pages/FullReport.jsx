import { useState, useRef, useEffect } from 'react'
import { api, downloadBlob } from '../api.js'
import PeriodSelector from '../components/PeriodSelector.jsx'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const TAX_TYPES = ['TNDN', 'GTGT', 'TNCN', 'FCT', 'TTDB', 'XNK', 'TP', 'HKD']
const MODELS = [
  { value: 'deepseek', label: '🧠 DeepSeek Reasoner', desc: 'Phân tích sâu (mặc định)' },
  { value: 'haiku',    label: '⚡ Claude Haiku',      desc: 'Nhanh, tiết kiệm' },
  { value: 'fast',     label: '🎯 Claude Sonnet',     desc: 'Cân bằng' },
]
const DEFAULT_SECTIONS = [
  { id: 's1', title: 'Tổng quan về ngành/doanh nghiệp', enabled: true, tax_aware: false, sub: ['Quy mô thị trường', 'Đặc điểm kinh doanh', 'Mô hình doanh thu/chi phí'] },
  { id: 's2', title: 'Đặc thù kinh doanh', enabled: true, tax_aware: false, sub: ['Chuỗi cung ứng', 'Working capital cycle', 'Đặc điểm tài sản'] },
  { id: 's3', title: 'Các quy định pháp lý', enabled: true, tax_aware: true, sub: ['Luật chuyên ngành', 'Điều kiện kinh doanh', 'Hạn chế FDI'] },
  { id: 's4', title: 'Phân tích các loại thuế áp dụng', enabled: true, tax_aware: true, sub: ['Thuế TNDN', 'Thuế GTGT', 'Thuế Nhà thầu', 'Thuế TTĐB', 'Thuế XNK'] },
  { id: 's5', title: 'Các vấn đề thuế đặc thù', enabled: true, tax_aware: true, sub: ['Rủi ro doanh thu/chi phí', 'Chuyển giá', 'Ưu đãi thuế', 'Hóa đơn đặc thù', 'Tranh chấp thuế'] },
  { id: 's6', title: 'Thông lệ thuế quốc tế', enabled: true, tax_aware: true, sub: ['BEPS', 'Chuyển giá quốc tế', 'So sánh khu vực', 'Hiệp định thuế'] },
  { id: 's7', title: 'Khuyến nghị & Kết luận', enabled: true, tax_aware: true, sub: ['Tối ưu hóa thuế', 'Tuân thủ', 'Cơ hội ưu đãi', 'Rủi ro cần theo dõi'] },
]
const POLL_INTERVAL = 3000

// ── SectionCard ──────────────────────────────────────────────────────────────
function SectionCard({ section, subject, dragHandle, onToggle, onUpdateTitle, onAddSub, onRemoveSub, onRemove, onSuggestSubs, onToggleTaxAware }) {
  return (
    <div className={`border rounded-lg p-3 transition-opacity ${!section.enabled ? 'opacity-50' : 'bg-white'}`}>
      <div className="flex items-center gap-2 mb-1">
        {dragHandle}
        <input
          type="checkbox"
          checked={section.enabled}
          onChange={(e) => onToggle(section.id, e.target.checked)}
          className="accent-brand w-4 h-4 cursor-pointer shrink-0"
        />
        <input
          type="text"
          defaultValue={section.title}
          onBlur={(e) => onUpdateTitle(section.id, e.target.value)}
          className="flex-1 text-sm font-medium border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-brand/30 rounded px-1"
        />
        <button
          type="button"
          onClick={() => onToggleTaxAware(section.id)}
          title={section.tax_aware ? 'Đang dùng anchor docs — click để tắt' : 'Click để bật anchor docs'}
          className={`text-xs px-1.5 py-0.5 rounded border transition shrink-0 ${
            section.tax_aware
              ? 'bg-green-100 border-green-200 text-green-700'
              : 'bg-gray-100 border-gray-200 text-gray-400'
          }`}
        >
          📚 {section.tax_aware ? 'anchor on' : 'anchor off'}
        </button>
        <button
          type="button"
          onClick={() => onSuggestSubs(section.id)}
          title="AI gợi ý chủ đề con"
          className="text-xs px-1.5 py-0.5 rounded border border-gray-200 hover:bg-gray-50 text-gray-400 shrink-0"
        >
          ✨
        </button>
        <button
          type="button"
          onClick={() => onRemove(section.id)}
          className="text-gray-300 hover:text-red-400 text-sm px-1 shrink-0"
        >
          ✕
        </button>
      </div>
      {/* Sub-topics */}
      <div className="flex flex-wrap gap-1 ml-6">
        {(section.sub || []).map((sub, j) => (
          <span key={j} className="sub-chip inline-flex items-center gap-1 bg-green-50 border border-green-100 rounded-full px-2 py-0.5 text-xs">
            {sub}
            <button
              type="button"
              onClick={() => onRemoveSub(section.id, j)}
              className="text-gray-400 hover:text-red-400 leading-none"
            >
              ✕
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => {
            const name = window.prompt('Nhập tên chủ đề con:')
            if (name?.trim()) onAddSub(section.id, name.trim())
          }}
          className="text-xs px-2 py-0.5 rounded-full border border-dashed border-gray-300 hover:border-brand hover:text-brand transition text-gray-400"
        >
          + thêm
        </button>
      </div>
    </div>
  )
}

// ── SortableSectionCard ───────────────────────────────────────────────────────
function SortableSectionCard({ section, ...props }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div ref={setNodeRef} style={style}>
      <SectionCard
        section={section}
        dragHandle={
          <span
            {...attributes}
            {...listeners}
            className="cursor-grab text-gray-300 hover:text-gray-500 px-1 touch-none select-none shrink-0"
            title="Kéo để sắp xếp"
          >
            ⠿
          </span>
        }
        {...props}
      />
    </div>
  )
}

function buildTOC(html) {
  const matches = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
  return matches.map((m, i) => ({
    index: i + 1,
    // Strip leading "N. " nếu AI đã tự đánh số → tránh "1. 1. Tên phần"
    text: m[1].replace(/<[^>]+>/g, '').replace(/^\d+\.\s*/, '').trim(),
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
  const [sonar, setSonar] = useState('sonar-pro')
  const [sections, setSections] = useState(DEFAULT_SECTIONS)
  const [suggesting, setSuggesting] = useState(false)

  // dnd-kit sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

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

  // Citations
  const [citations, setCitations] = useState([])
  const [refOpen, setRefOpen] = useState(false)

  // Gamma
  const [createGamma, setCreateGamma] = useState(true)
  const [numSlides, setNumSlides] = useState(20)
  const [gammaUrl, setGammaUrl] = useState('')
  const [gammaLoading, setGammaLoading] = useState(false)

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

  async function handleModeChange(newMode) {
    setMode(newMode)
    try {
      const data = await api.getDefaultSections(newMode)
      if (data?.length) setSections(data)
    } catch (e) { console.error(e) }
  }

  async function resetSections() {
    try {
      const data = await api.getDefaultSections(mode)
      if (data?.length) setSections(data)
    } catch (e) { console.error(e) }
  }

  function toggleTaxAware(id) {
    setSections((prev) => prev.map((s) => s.id === id ? { ...s, tax_aware: !s.tax_aware } : s))
  }

  function handleDragEnd(event) {
    const { active, over } = event
    if (active.id !== over?.id) {
      setSections((prev) => {
        const oldIdx = prev.findIndex((s) => s.id === active.id)
        const newIdx = prev.findIndex((s) => s.id === over.id)
        return arrayMove(prev, oldIdx, newIdx)
      })
    }
  }

  function toggleSection(id, enabled) {
    setSections((p) => p.map((s) => (s.id === id ? { ...s, enabled } : s)))
  }
  function updateTitle(id, title) {
    setSections((p) => p.map((s) => (s.id === id ? { ...s, title } : s)))
  }
  function addSub(id, sub) {
    setSections((p) => p.map((s) => (s.id === id ? { ...s, sub: [...(s.sub || []), sub] } : s)))
  }
  function removeSub(id, idx) {
    setSections((p) => p.map((s) => s.id === id ? { ...s, sub: s.sub.filter((_, i) => i !== idx) } : s))
  }
  function removeSection(id) {
    setSections((p) => p.filter((s) => s.id !== id))
  }
  function addSection() {
    const id = 's' + Date.now()
    setSections((p) => [...p, { id, title: 'Phần mới', sub: [], enabled: true, tax_aware: false }])
  }
  async function suggestSubs(secId) {
    const sec = sections.find((s) => s.id === secId)
    if (!sec || !subject.trim()) return
    try {
      const data = await api.suggestSubsections({ title: sec.title, subject })
      if (data.suggestions?.length) {
        setSections((p) => p.map((s) => s.id === secId
          ? { ...s, sub: [...(s.sub || []), ...data.suggestions.filter((sg) => !(s.sub || []).includes(sg))] }
          : s))
      }
    } catch (e) { console.error(e) }
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
    setCitations([])
    setGammaUrl('')
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
            if (data.citations?.length) setCitations(data.citations)
            setStatus('done')
            // Auto-create Gamma if opted in
            if (createGamma && data.html_content) {
              setGammaLoading(true)
              api.createGamma({ subject, html_content: data.html_content, num_cards: numSlides })
                .then((r) => setGammaUrl(r.url || ''))
                .catch(() => {})
                .finally(() => setGammaLoading(false))
            }
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
                    checked={mode === m} onChange={() => handleModeChange(m)}
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
              {[{ v: 'sonar', l: 'Sonar' }, { v: 'sonar-pro', l: 'Sonar Pro ⭐' }].map((m) => (
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
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <label className="text-xs font-medium text-gray-600">Các phần báo cáo</label>
            <button type="button" onClick={handleSuggestTopics}
              disabled={suggesting || !subject.trim()}
              className="text-xs px-2 py-1 rounded bg-brand/10 text-brand hover:bg-brand/20 disabled:opacity-50 flex items-center gap-1"
            >
              {suggesting ? '⏳ Đang gợi ý...' : '✨ AI gợi ý topics'}
            </button>
            <button type="button" onClick={resetSections}
              className="text-xs px-2 py-1 rounded border border-gray-300 hover:border-brand hover:text-brand text-gray-400 transition-colors"
            >
              ↺ Reset mặc định
            </button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">
                {sections.map((s) => (
                  <SortableSectionCard
                    key={s.id}
                    section={s}
                    subject={subject}
                    onToggle={toggleSection}
                    onUpdateTitle={updateTitle}
                    onAddSub={addSub}
                    onRemoveSub={removeSub}
                    onRemove={removeSection}
                    onSuggestSubs={suggestSubs}
                    onToggleTaxAware={toggleTaxAware}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <button type="button" onClick={addSection}
            className="mt-2 text-xs px-3 py-1 rounded border border-dashed border-gray-300 hover:border-brand hover:text-brand text-gray-400 transition-colors"
          >
            + Thêm phần
          </button>
        </div>

        {/* Gamma option */}
        <div className="mb-4 border rounded-lg p-3 bg-purple-50/30">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createGamma}
                onChange={(e) => setCreateGamma(e.target.checked)}
                className="accent-brand"
              />
              <span className="text-sm font-medium">✨ Tự động tạo Gamma Slides sau khi xong</span>
            </label>
            {createGamma && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Số slides:</span>
                <input
                  type="number" min={5} max={60} value={numSlides}
                  onChange={(e) => setNumSlides(Number(e.target.value))}
                  className="w-16 border rounded px-2 py-1 text-sm"
                />
              </div>
            )}
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

          {/* Gamma result */}
          {(gammaLoading || gammaUrl) && (
            <div className="px-5 py-3 border-b border-gray-100 bg-purple-50/30">
              {gammaLoading && <span className="text-sm text-purple-600">⏳ Đang tạo Gamma Slides...</span>}
              {gammaUrl && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-purple-700">🎞️ Gamma Slides đã tạo:</span>
                  <a href={gammaUrl} target="_blank" rel="noopener"
                    className="text-brand font-medium text-sm hover:underline">
                    Xem Slides →
                  </a>
                </div>
              )}
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

          {/* Citations / References */}
          {citations.length > 0 && (
            <div className="px-6 pb-6 border-t border-gray-100 pt-4">
              <button
                onClick={() => setRefOpen(!refOpen)}
                className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-brand"
              >
                📎 Nguồn tham khảo ({citations.length}) {refOpen ? '▲' : '▼'}
              </button>
              {refOpen && (
                <ol className="mt-2 space-y-1 text-xs text-gray-500">
                  {citations.map((url, i) => (
                    <li key={i}>
                      <a href={url} target="_blank" rel="noopener"
                        className="hover:text-brand hover:underline break-all">
                        [{i + 1}] {url}
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
