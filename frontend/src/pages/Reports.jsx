import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Reports() {
  const [reports, setReports] = useState([])
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [filter])

  async function load() {
    setLoading(true)
    try {
      const params = filter ? { report_type: filter } : {}
      const data = await api.listReports(params)
      setReports(data)
    } catch {}
    setLoading(false)
  }

  async function viewReport(id) {
    try {
      const data = await api.getReport(id)
      setSelected(data)
    } catch {}
  }

  async function deleteReport(id) {
    if (!confirm('Xoá báo cáo này?')) return
    try {
      await api.deleteReport(id)
      setReports((p) => p.filter((r) => r.id !== id))
      if (selected?.id === id) setSelected(null)
    } catch {}
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">📁 Lịch sử báo cáo</h1>

      <div className="flex gap-2 mb-4">
        {[
          { v: '', l: 'Tất cả' },
          { v: 'quick', l: '⚡ Quick Research' },
          { v: 'full', l: '📊 Full Report' },
        ].map((f) => (
          <button
            key={f.v}
            onClick={() => setFilter(f.v)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              filter === f.v
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
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Đang tải...</div>
          ) : reports.length === 0 ? (
            <div className="p-8 text-center text-gray-400">Không có báo cáo nào</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {reports.map((r) => (
                <div
                  key={r.id}
                  className={`px-4 py-3 cursor-pointer hover:bg-gray-50 flex items-center justify-between ${
                    selected?.id === r.id ? 'bg-green-50 border-l-2 border-brand' : ''
                  }`}
                  onClick={() => viewReport(r.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900 truncate">{r.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {r.report_type === 'quick' ? '⚡' : '📊'}{' '}
                      {r.tax_types?.join(', ')} · {r.time_period || 'hiện tại'}
                    </div>
                    <div className="text-xs text-gray-300">
                      {r.created_at ? new Date(r.created_at).toLocaleString('vi-VN') : ''}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteReport(r.id)
                    }}
                    className="ml-2 text-red-400 hover:text-red-600 text-xs"
                  >
                    Xoá
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Viewer */}
        {selected && (
          <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="font-semibold text-gray-800 text-sm truncate">{selected.title}</div>
              <div className="flex gap-2 ml-2">
                {selected.report_type === 'full' && (
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
