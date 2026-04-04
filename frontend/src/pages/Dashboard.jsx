import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'

export default function Dashboard() {
  const [reports, setReports] = useState([])
  const [stats, setStats] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.listReports({ limit: 5 }).then(setReports).catch(() => {})
    api.adminStats().then(setStats).catch(() => {})
  }, [])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <button
          onClick={() => navigate('/quick-research')}
          className="flex items-center gap-4 bg-white border-2 border-brand rounded-xl p-5 hover:bg-brand hover:text-white group transition-colors text-left"
        >
          <span className="text-3xl">🔍</span>
          <div>
            <div className="font-bold text-lg">Quick Research</div>
            <div className="text-sm text-gray-500 group-hover:text-green-100">
              Câu hỏi thuế cụ thể — trả lời trong 20-45 giây
            </div>
          </div>
        </button>
        <button
          onClick={() => navigate('/full-report')}
          className="flex items-center gap-4 bg-white border-2 border-blue-500 rounded-xl p-5 hover:bg-blue-500 hover:text-white group transition-colors text-left"
        >
          <span className="text-3xl">📊</span>
          <div>
            <div className="font-bold text-lg">Báo cáo phân tích thuế</div>
            <div className="text-sm text-gray-500 group-hover:text-blue-100">
              Báo cáo ngành / công ty — 5-10 phút
            </div>
          </div>
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Quick Research', value: stats.total_research_sessions, icon: '🔍' },
            { label: 'Full Report', value: stats.total_reports, icon: '📊' },
            { label: 'Nội dung AI', value: stats.total_content_jobs ?? 0, icon: '✍️' },
            { label: 'Văn bản pháp luật', value: stats.total_tax_docs, icon: '📚' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <div className="text-2xl">{s.icon}</div>
              <div className="text-2xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Recent reports */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Báo cáo gần đây</h2>
          <button onClick={() => navigate('/reports')} className="text-brand text-sm hover:underline">
            Xem tất cả →
          </button>
        </div>
        {reports.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Chưa có báo cáo nào</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {reports.map((r) => (
              <div key={r.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                <div>
                  <div className="font-medium text-gray-900 text-sm">{r.title}</div>
                  <div className="text-xs text-gray-400">
                    {r.report_type === 'quick' ? '⚡ Quick' : '📊 Full'} ·{' '}
                    {r.tax_types?.join(', ')} · {r.time_period || 'hiện tại'}
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  {r.created_at ? new Date(r.created_at).toLocaleDateString('vi-VN') : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
