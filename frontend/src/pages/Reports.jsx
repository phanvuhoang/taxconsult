import { useEffect, useState, useRef } from 'react'
import { api } from '../api.js'

const TAX_TYPES = ['TNDN', 'GTGT', 'TNCN', 'FCT', 'TTDB', 'XNK', 'TP', 'HKD', 'QLT', 'HOA_DON', 'THUE_QT']
const TYPE_LABELS = {
  quick: '⚡ Quick Research',
  full: '📊 Full Report',
  scenario: '🎯 Tình huống',
  analysis: '📝 Phân tích',
  press: '📰 Bài báo',
  advice: '✉️ Tư vấn',
}
const TYPE_FILTERS = [
  { v: '', l: 'Tất cả' },
  { v: 'quick', l: '⚡ Quick Research' },
  { v: 'full', l: '📊 Full Report' },
  { v: 'scenario', l: '🎯 Tình huống' },
  { v: 'analysis', l: '📝 Phân tích' },
  { v: 'press', l: '📰 Bài báo' },
  { v: 'advice', l: '✉️ Tư vấn' },
]

export default function Reports() {
  const [items, setItems] = useState([])
  const [filterType, setFilterType] = useState('')
  const [filterTax, setFilterTax] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const searchRef = useRef(null)

  useEffect(() => {
    load()
  }, [filterType, filterTax])

  async function load(searchTerm = search) {
    setLoading(true)
    try {
      const params = {}
      if (filterType) params.report_type = filterType
      if (filterTax) params.tax_type = filterTax
      if (searchTerm) params.search = searchTerm
      const data = await api.listReports(params)
      setItems(data)
    } catch (_) {}
    setLoading(false)
  }

  function onSearchChange(val) {
    setSearch(val)
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => load(val), 400)
  }

  async function viewItem(item) {
    try {
      let content_html = ''
      if (item.source === 'report') {
        const data = await api.getReport(Number(item.id))
        content_html = data.content_html || ''
      } else if (item.source === 'research') {
        const data = await api.getResearchById(Number(item.id))
        content_html = data.answer_html || ''
      } else {
        const data = await api.getContentJob(item.id)
        content_html = data.content_html || ''
      }
      setSelected({ ...item, content_html })
    } catch (_) {}
  }

  async function deleteItem(item, e) {
    e.stopPropagation()
    if (!confirm('Xoá mục này?')) return
    try {
      if (item.source === 'report') {
        await api.deleteReport(Number(item.id))
      }
      setItems(p => p.filter(i => i.id !== item.id))
      if (selected?.id === item.id) setSelected(null)
    } catch (_) {}
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">📁 Lịch sử</h1>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Tìm theo chủ đề..."
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <select
          value={filterTax}
          onChange={e => setFilterTax(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
        >
          <option value="">Tất cả sắc thuế</option>
          {TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Type filter pills */}
      <div className="flex flex-wrap gap-1 mb-4">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.v}
            onClick={() => setFilterType(f.v)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              filterType === f.v
                ? 'bg-brand text-white border-brand'
                : 'bg-white border-gray-300 text-gray-600 hover:border-brand'
            }`}
          >
            {f.l}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        {/* List */}
        <div className={`${selected ? 'w-80 shrink-0' : 'flex-1'} bg-white rounded-xl border border-gray-200 overflow-hidden`}>
          {loading ? (
            <div className="p-8 text-center text-gray-400">Đang tải...</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-gray-400">Không có mục nào</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {items.map((item) => (
                <div
                  key={item.id + item.source}
                  className={`px-4 py-3 cursor-pointer hover:bg-gray-50 flex items-center justify-between ${
                    selected?.id === item.id && selected?.source === item.source
                      ? 'bg-green-50 border-l-2 border-brand'
                      : ''
                  }`}
                  onClick={() => viewItem(item)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900 truncate">{item.subject}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className="text-xs text-gray-500">
                        {TYPE_LABELS[item.report_type] || item.report_type}
                      </span>
                      {(item.tax_types || []).map(t => (
                        <span key={t} className="text-xs text-gray-400">· {t}</span>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-0.5">
                      {item.model_used && (
                        <span className="text-xs text-gray-300">{item.model_used}</span>
                      )}
                      <span className="text-xs text-gray-300">
                        {item.created_at_fmt || (item.created_at ? new Date(item.created_at).toLocaleString('vi-VN') : '')}
                      </span>
                    </div>
                  </div>
                  {item.source === 'report' && (
                    <button
                      onClick={(e) => deleteItem(item, e)}
                      className="ml-2 text-red-400 hover:text-red-600 text-xs shrink-0"
                    >
                      Xoá
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Viewer */}
        {selected && (
          <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-800 text-sm truncate">{selected.subject}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {TYPE_LABELS[selected.report_type] || selected.report_type}
                  {selected.model_used && ` · 🤖 ${selected.model_used}`}
                </div>
              </div>
              <div className="flex gap-2 ml-2 shrink-0">
                {selected.source === 'report' && selected.report_type === 'full' && (
                  <a
                    href={`/api/reports/${selected.id}/export-docx`}
                    className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600"
                    download
                  >
                    Word
                  </a>
                )}
                <button
                  onClick={() => setSelected(null)}
                  className="text-gray-400 hover:text-gray-600 text-sm"
                >
                  ✕
                </button>
              </div>
            </div>
            <div
              className="flex-1 overflow-y-auto p-4 report-content text-sm"
              dangerouslySetInnerHTML={{ __html: selected.content_html || '' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
