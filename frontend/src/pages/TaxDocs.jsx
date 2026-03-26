import { useEffect, useState, useRef } from 'react'
import { api } from '../api.js'

const LOAI_OPTIONS = ['Tất cả', 'Luat', 'ND', 'TT', 'VBHN']

// ─── Modal: Add to Priority (with AI-suggest) ──────────────────────────────
function AddPriorityModal({ doc, onClose, onAdded }) {
  const [form, setForm] = useState({
    hieu_luc_tu: doc.hieu_luc_tu || '',
    hieu_luc_den: '',
    thay_the_boi: '',
    pham_vi_het_hieu_luc: '',
    ghi_chu_hieu_luc: '',
    sort_order: 0,
  })
  const [loading, setLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSource, setAiSource] = useState(null)
  const [err, setErr] = useState('')

  async function handleAiSuggest() {
    setAiLoading(true)
    setErr('')
    try {
      const s = await api.suggestPriorityMeta(doc.id)
      setForm(prev => ({
        hieu_luc_tu:          (!prev.hieu_luc_tu && s.hieu_luc_tu)                       ? s.hieu_luc_tu          : prev.hieu_luc_tu,
        hieu_luc_den:         (!prev.hieu_luc_den && s.hieu_luc_den)                      ? s.hieu_luc_den         : prev.hieu_luc_den,
        thay_the_boi:         (!prev.thay_the_boi && s.thay_the_boi)                      ? s.thay_the_boi         : prev.thay_the_boi,
        pham_vi_het_hieu_luc: (!prev.pham_vi_het_hieu_luc && s.pham_vi_het_hieu_luc)      ? s.pham_vi_het_hieu_luc : prev.pham_vi_het_hieu_luc,
        ghi_chu_hieu_luc:     (!prev.ghi_chu_hieu_luc && s.ghi_chu_hieu_luc)              ? s.ghi_chu_hieu_luc    : prev.ghi_chu_hieu_luc,
        sort_order: prev.sort_order,
      }))
      setAiSource(s.source)
    } catch (e) {
      setErr('Không thể lấy gợi ý: ' + e.message)
    } finally {
      setAiLoading(false)
    }
  }

  async function submit(e) {
    e.preventDefault()
    setErr('')
    setLoading(true)
    try {
      await api.addPriorityDoc({
        dbvntax_id: doc.id,
        hieu_luc_tu: form.hieu_luc_tu || null,
        hieu_luc_den: form.hieu_luc_den || null,
        thay_the_boi: form.thay_the_boi || null,
        pham_vi_het_hieu_luc: form.pham_vi_het_hieu_luc || null,
        ghi_chu_hieu_luc: form.ghi_chu_hieu_luc || null,
        sort_order: Number(form.sort_order),
      })
      onAdded()
      onClose()
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900">Thêm vào văn bản ưu tiên</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="text-xs text-gray-500 mb-3 truncate">{doc.so_hieu} — {doc.ten}</div>

        {/* AI suggest button */}
        <button
          type="button"
          onClick={handleAiSuggest}
          disabled={aiLoading}
          className="w-full flex items-center justify-center gap-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 mb-3"
        >
          {aiLoading
            ? <><span className="animate-spin inline-block">⏳</span> Đang phân tích...</>
            : <><span>✨</span> AI gợi ý từ nội dung văn bản</>
          }
        </button>
        {aiSource && (
          <div className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded mb-3">
            ✅ Đã điền từ {aiSource === 'ai' ? 'AI phân tích' : 'hieu_luc_index'}
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Hiệu lực từ</label>
              <input type="date" value={form.hieu_luc_tu}
                onChange={e => setForm(p => ({ ...p, hieu_luc_tu: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Hết hiệu lực</label>
              <input type="date" value={form.hieu_luc_den}
                onChange={e => setForm(p => ({ ...p, hieu_luc_den: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Bị thay thế bởi</label>
            <input type="text" value={form.thay_the_boi}
              onChange={e => setForm(p => ({ ...p, thay_the_boi: e.target.value }))}
              placeholder="Vd: NĐ 132/2020/NĐ-CP"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Phạm vi hết hiệu lực</label>
            <select value={form.pham_vi_het_hieu_luc}
              onChange={e => setForm(p => ({ ...p, pham_vi_het_hieu_luc: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand">
              <option value="">Còn hiệu lực</option>
              <option value="toan_bo">Hết hiệu lực toàn bộ</option>
              <option value="mot_phan">Hết hiệu lực một phần</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Ghi chú hiệu lực</label>
            <textarea value={form.ghi_chu_hieu_luc}
              onChange={e => setForm(p => ({ ...p, ghi_chu_hieu_luc: e.target.value }))}
              rows={2}
              placeholder="Phần nào bị thay thế / sửa đổi..."
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand resize-none" />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Sort order</label>
            <input type="number" value={form.sort_order}
              onChange={e => setForm(p => ({ ...p, sort_order: e.target.value }))}
              className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>

          {err && <div className="text-red-600 text-xs">{err}</div>}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={loading}
              className="flex-1 bg-brand text-white py-2 rounded-lg text-sm hover:bg-brand-dark disabled:opacity-60">
              {loading ? 'Đang thêm...' : '+ Thêm vào ưu tiên'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              Huỷ
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Edit Priority Doc inline form ─────────────────────────────────────────
function EditPriorityForm({ doc, onSave, onCancel }) {
  const [form, setForm] = useState({
    hieu_luc_tu: doc.hieu_luc_tu || '',
    hieu_luc_den: doc.hieu_luc_den || '',
    thay_the_boi: doc.thay_the_boi || '',
    pham_vi_het_hieu_luc: doc.pham_vi_het_hieu_luc || '',
    ghi_chu_hieu_luc: doc.ghi_chu_hieu_luc || '',
    sort_order: doc.sort_order ?? 0,
  })
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    setLoading(true)
    setErr('')
    try {
      const updated = await api.updatePriorityDoc(doc.id, {
        hieu_luc_tu: form.hieu_luc_tu || null,
        hieu_luc_den: form.hieu_luc_den || null,
        thay_the_boi: form.thay_the_boi || null,
        pham_vi_het_hieu_luc: form.pham_vi_het_hieu_luc || null,
        ghi_chu_hieu_luc: form.ghi_chu_hieu_luc || null,
        sort_order: Number(form.sort_order),
      })
      onSave(updated)
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-1 text-xs space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {[['Hiệu lực từ', 'hieu_luc_tu', 'date'], ['Hết hiệu lực', 'hieu_luc_den', 'date']].map(([label, key, type]) => (
          <div key={key}>
            <div className="text-gray-500 mb-0.5">{label}</div>
            <input type={type} value={form[key]}
              onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
              className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
        ))}
      </div>
      <div>
        <div className="text-gray-500 mb-0.5">Thay thế bởi</div>
        <input type="text" value={form.thay_the_boi}
          onChange={e => setForm(p => ({ ...p, thay_the_boi: e.target.value }))}
          className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand" />
      </div>
      <div>
        <div className="text-gray-500 mb-0.5">Phạm vi HHL</div>
        <select value={form.pham_vi_het_hieu_luc}
          onChange={e => setForm(p => ({ ...p, pham_vi_het_hieu_luc: e.target.value }))}
          className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand">
          <option value="">Còn hiệu lực</option>
          <option value="toan_bo">Toàn bộ</option>
          <option value="mot_phan">Một phần</option>
        </select>
      </div>
      <div>
        <div className="text-gray-500 mb-0.5">Ghi chú</div>
        <input type="text" value={form.ghi_chu_hieu_luc}
          onChange={e => setForm(p => ({ ...p, ghi_chu_hieu_luc: e.target.value }))}
          className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand" />
      </div>
      {err && <div className="text-red-600">{err}</div>}
      <div className="flex gap-2">
        <button onClick={save} disabled={loading}
          className="bg-brand text-white px-3 py-1 rounded hover:bg-brand-dark disabled:opacity-60 text-xs">
          Lưu
        </button>
        <button onClick={onCancel} className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-100 text-xs">
          Huỷ
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function TaxDocs() {
  const [tab, setTab] = useState('priority')
  const [viewer, setViewer] = useState(null)
  const [viewerLoading, setViewerLoading] = useState(false)
  const [fontSize, setFontSize] = useState(14)

  // Resizable panel
  const [panelWidth, setPanelWidth] = useState(380)
  const [isDragging, setIsDragging] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (!isDragging) return
    function onMove(e) { setPanelWidth(Math.max(220, Math.min(600, e.clientX))) }
    function onUp() { setIsDragging(false) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [isDragging])

  // --- Priority docs ---
  const [priorityDocs, setPriorityDocs] = useState([])
  const [priorityFilter, setPriorityFilter] = useState('')
  const [editingId, setEditingId] = useState(null)

  // --- Browse ---
  const [sacThueList, setSacThueList] = useState([])
  const [browseSacThue, setBrowseSacThue] = useState('')
  const [browseLoai, setBrowseLoai] = useState('')
  const [browseResults, setBrowseResults] = useState([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [addModalDoc, setAddModalDoc] = useState(null)

  // --- Imported ---
  const [importedDocs, setImportedDocs] = useState([])
  const [importSearch, setImportSearch] = useState('')
  const [importSearchQuery, setImportSearchQuery] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef()

  useEffect(() => {
    loadPriorityDocs()
    api.getDbvntaxSacThue().then(list => {
      setSacThueList(list)
      if (list.length > 0) setBrowseSacThue(list[0].sac_thue)
    }).catch(() => {})
  }, [])

  useEffect(() => { loadImported() }, [importSearch])

  async function loadPriorityDocs() {
    try {
      const data = await api.listPriorityDocs(priorityFilter || undefined)
      setPriorityDocs(data)
    } catch {}
  }

  async function loadImported() {
    setImportLoading(true)
    try { setImportedDocs(await api.listTaxDocs(importSearch)) } catch {}
    setImportLoading(false)
  }

  async function loadPriorityContent(doc) {
    setViewerLoading(true); setViewer(null)
    try {
      const d = await api.getPriorityDocContent(doc.dbvntax_id)
      setViewer({ so_hieu: doc.so_hieu, ten: doc.ten, noi_dung_html: d.noi_dung_html, link_tvpl: doc.link_tvpl })
    } catch {}
    setViewerLoading(false)
  }

  async function loadBrowseContent(doc) {
    setViewerLoading(true); setViewer(null)
    try {
      const d = await api.getDbvntaxContent(doc.id)
      setViewer({ so_hieu: doc.so_hieu, ten: doc.ten, noi_dung_html: d.noi_dung_html, link_tvpl: doc.link_tvpl })
    } catch {}
    setViewerLoading(false)
  }

  async function loadImportedContent(doc) {
    setViewerLoading(true); setViewer(null)
    try {
      const d = await api.getTaxDocContent(doc.id)
      setViewer({ so_hieu: doc.so_hieu, ten: doc.ten, noi_dung_html: d.noi_dung_html, link_tvpl: doc.link_tvpl })
    } catch {}
    setViewerLoading(false)
  }

  async function browseLoad() {
    if (!browseSacThue) return
    setBrowseLoading(true)
    try { setBrowseResults(await api.browseDbvntax(browseSacThue, browseLoai || undefined)) } catch {}
    setBrowseLoading(false)
  }
  useEffect(() => { if (browseSacThue) browseLoad() }, [browseSacThue, browseLoai])

  async function deletePriority(id) {
    if (!confirm('Xoá khỏi danh sách ưu tiên?')) return
    try { await api.deletePriorityDoc(id); setPriorityDocs(p => p.filter(d => d.id !== id)) } catch {}
  }

  async function handleUpload(e) {
    const file = e.target.files[0]; if (!file) return
    setUploading(true); setMsg('')
    try { const r = await api.uploadTaxDoc(file); setMsg(`✅ Đã upload: ${r.ten}`); loadImported() }
    catch (err) { setMsg(`❌ ${err.message}`) }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function deleteImported(id) {
    if (!confirm('Xoá văn bản này?')) return
    try { await api.deleteTaxDoc(id); setImportedDocs(p => p.filter(d => d.id !== id)) } catch {}
  }

  function statusBadge(d) {
    if (d.pham_vi_het_hieu_luc === 'mot_phan') return <span className="text-xs px-1 py-0.5 rounded-full bg-orange-100 text-orange-700">⚠️ một phần</span>
    if (d.pham_vi_het_hieu_luc === 'toan_bo' || d.hieu_luc_den) return <span className="text-xs px-1 py-0.5 rounded-full bg-red-100 text-red-700">Hết HL</span>
    return <span className="text-xs px-1 py-0.5 rounded-full bg-green-100 text-green-700">Còn HL</span>
  }

  function loaiBadge(loai) {
    const map = { Luat: 'bg-purple-100 text-purple-700', ND: 'bg-blue-100 text-blue-700', TT: 'bg-cyan-100 text-cyan-700', VBHN: 'bg-gray-100 text-gray-600' }
    return <span className={`text-xs px-1 py-0.5 rounded ${map[loai] || 'bg-gray-100 text-gray-500'}`}>{loai || '?'}</span>
  }

  // Active list for collapsed view
  const activeList = tab === 'priority' ? priorityDocs : tab === 'browse' ? browseResults : importedDocs
  const activeLoadFn = (d) => tab === 'priority' ? loadPriorityContent(d) : tab === 'browse' ? loadBrowseContent(d) : loadImportedContent(d)

  return (
    <div className="flex h-full overflow-hidden select-none">
      {/* ── Left panel ── */}
      <div
        style={{ width: collapsed ? 48 : panelWidth, minWidth: collapsed ? 48 : panelWidth }}
        className="flex flex-col border-r border-gray-200 bg-white overflow-hidden transition-[width] duration-150"
      >
        {collapsed ? (
          <div className="flex flex-col h-full">
            <button onClick={() => setCollapsed(false)}
              className="p-2 text-gray-400 hover:text-brand hover:bg-gray-50 border-b border-gray-100 text-center text-sm"
              title="Mở rộng">»</button>
            <div className="flex-1 overflow-y-auto">
              {activeList.map((d, i) => (
                <div key={d.id || i}
                  className="px-1 py-2 text-xs font-mono cursor-pointer hover:bg-gray-100 text-gray-600 overflow-hidden"
                  style={{ writingMode: 'vertical-rl', height: 72, textOverflow: 'ellipsis' }}
                  onClick={() => activeLoadFn(d)}
                  title={`${d.so_hieu || '—'} — ${d.ten}`}>
                  {d.so_hieu || '—'}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Tabs */}
            <div className="flex items-center border-b border-gray-200 px-2 pt-2 gap-0.5">
              {[
                { id: 'priority', label: '⭐ Ưu tiên' },
                { id: 'browse', label: '🔎 Browse' },
                { id: 'imported', label: '📁 Import' },
              ].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-2 py-1.5 rounded-t-lg text-xs font-medium transition-colors flex-1 ${
                    tab === t.id ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                  }`}>{t.label}</button>
              ))}
              <button onClick={() => setCollapsed(true)}
                className="ml-1 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 shrink-0 text-sm"
                title="Thu nhỏ">«</button>
            </div>

            {/* ── Priority tab ── */}
            {tab === 'priority' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-2 border-b border-gray-100 flex gap-1">
                  <select value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value); setTimeout(loadPriorityDocs, 0) }}
                    className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand">
                    <option value="">Tất cả sắc thuế</option>
                    {sacThueList.map(s => <option key={s.sac_thue} value={s.sac_thue}>{s.sac_thue} ({s.count})</option>)}
                  </select>
                  <button onClick={loadPriorityDocs} className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded">↻</button>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
                  {priorityDocs.length === 0
                    ? <div className="p-6 text-center text-gray-400 text-sm">Chưa có văn bản ưu tiên</div>
                    : priorityDocs.map(d => (
                      <div key={d.id} className="p-2.5">
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadPriorityContent(d)}>
                            <div className="flex items-center gap-1 flex-wrap mb-0.5">
                              {loaiBadge(d.loai)}{statusBadge(d)}
                            </div>
                            <div className="text-xs font-mono text-gray-700 truncate">{d.so_hieu}</div>
                            <div className="text-xs text-gray-800 line-clamp-2 leading-snug">{d.ten}</div>
                            {d.thay_the_boi && <div className="text-xs text-orange-600 mt-0.5 truncate">↳ {d.thay_the_boi}</div>}
                            {d.ghi_chu_hieu_luc && <div className="text-xs text-gray-400 mt-0.5 truncate">{d.ghi_chu_hieu_luc}</div>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => setEditingId(editingId === d.id ? null : d.id)} className="text-xs text-gray-400 hover:text-brand">✏️</button>
                            <button onClick={() => deletePriority(d.id)} className="text-xs text-gray-400 hover:text-red-600">🗑️</button>
                          </div>
                        </div>
                        {editingId === d.id && (
                          <EditPriorityForm doc={d}
                            onSave={updated => { setPriorityDocs(p => p.map(x => x.id === d.id ? updated : x)); setEditingId(null) }}
                            onCancel={() => setEditingId(null)} />
                        )}
                      </div>
                    ))
                  }
                </div>
              </div>
            )}

            {/* ── Browse tab ── */}
            {tab === 'browse' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-2 border-b border-gray-100 flex gap-1">
                  <select value={browseSacThue} onChange={e => setBrowseSacThue(e.target.value)}
                    className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand">
                    {sacThueList.map(s => <option key={s.sac_thue} value={s.sac_thue}>{s.sac_thue} ({s.count})</option>)}
                  </select>
                  <select value={browseLoai} onChange={e => setBrowseLoai(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand">
                    {LOAI_OPTIONS.map(l => <option key={l} value={l === 'Tất cả' ? '' : l}>{l}</option>)}
                  </select>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
                  {browseLoading
                    ? <div className="p-6 text-center text-gray-400 text-sm">Đang tải...</div>
                    : browseResults.length === 0
                      ? <div className="p-6 text-center text-gray-400 text-sm">Không có văn bản</div>
                      : browseResults.map(d => (
                        <div key={d.id} className="p-2.5 hover:bg-gray-50">
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadBrowseContent(d)}>
                              <div className="flex items-center gap-1 flex-wrap mb-0.5">
                                {loaiBadge(d.loai)}
                                <span className={`text-xs px-1 py-0.5 rounded-full ${d.tinh_trang === 'con_hieu_luc' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {d.tinh_trang === 'con_hieu_luc' ? 'Còn HL' : 'Hết HL'}
                                </span>
                                <span className="text-xs text-gray-400">{d.ngay_ban_hanh}</span>
                              </div>
                              <div className="text-xs font-mono text-gray-700 truncate">{d.so_hieu}</div>
                              <div className="text-xs text-gray-800 line-clamp-2">{d.ten}</div>
                            </div>
                            <button onClick={() => setAddModalDoc(d)}
                              className="shrink-0 text-xs bg-brand text-white px-1.5 py-0.5 rounded hover:bg-brand-dark">
                              + Ưu tiên
                            </button>
                          </div>
                        </div>
                      ))
                  }
                </div>
              </div>
            )}

            {/* ── Imported tab ── */}
            {tab === 'imported' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-2 border-b border-gray-100 space-y-1.5">
                  <label className="flex items-center gap-1.5 border border-dashed border-gray-300 rounded px-2 py-1.5 cursor-pointer hover:border-brand text-xs text-gray-500 hover:text-brand transition-colors">
                    <span>📄</span>
                    <span>{uploading ? 'Đang upload...' : 'Upload .docx / .pdf / .txt'}</span>
                    <input ref={fileRef} type="file" accept=".docx,.pdf,.txt" onChange={handleUpload} className="hidden" />
                  </label>
                  <div className="flex gap-1">
                    <input type="text" value={importSearchQuery}
                      onChange={e => setImportSearchQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && setImportSearch(importSearchQuery)}
                      placeholder="Tìm số hiệu / tên..."
                      className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand" />
                    <button onClick={() => setImportSearch(importSearchQuery)} className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded">Tìm</button>
                  </div>
                  <ImportFromDbvntaxRow onImported={loadImported} />
                </div>
                {msg && (
                  <div className={`mx-2 mt-1 px-2 py-1 rounded text-xs ${msg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg}</div>
                )}
                <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
                  {importLoading
                    ? <div className="p-6 text-center text-gray-400 text-sm">Đang tải...</div>
                    : importedDocs.length === 0
                      ? <div className="p-6 text-center text-gray-400 text-sm">Chưa có văn bản nào</div>
                      : importedDocs.map(d => (
                        <div key={d.id} className="px-2.5 py-2 hover:bg-gray-50 flex items-center justify-between gap-1">
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadImportedContent(d)}>
                            <div className="flex items-center gap-1 flex-wrap mb-0.5">
                              {loaiBadge(d.loai)}
                              <span className="text-xs text-gray-400">{d.source}</span>
                            </div>
                            <div className="text-xs font-mono text-gray-600 truncate">{d.so_hieu || '—'}</div>
                            <div className="text-xs text-gray-800 truncate">{d.ten}</div>
                          </div>
                          <button onClick={() => deleteImported(d.id)} className="text-red-400 hover:text-red-600 text-xs shrink-0">Xoá</button>
                        </div>
                      ))
                  }
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Divider — draggable ── */}
      <div
        onMouseDown={e => { e.preventDefault(); setIsDragging(true) }}
        className={`w-1 shrink-0 cursor-col-resize transition-colors ${isDragging ? 'bg-brand' : 'bg-gray-200 hover:bg-brand'}`}
      />

      {/* ── Right panel: Viewer ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {viewerLoading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center"><div className="text-3xl mb-2 animate-pulse">📄</div><div className="text-sm">Đang tải nội dung...</div></div>
          </div>
        ) : !viewer ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center"><div className="text-5xl mb-3">📄</div><div className="text-sm">Chọn văn bản để xem nội dung</div></div>
          </div>
        ) : (
          <>
            {/* Viewer header */}
            <div className="border-b border-gray-200 bg-white px-4 py-2.5 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs text-brand font-semibold">{viewer.so_hieu}</div>
                  <div className="text-sm font-medium text-gray-900 mt-0.5 leading-snug line-clamp-2">{viewer.ten}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setFontSize(f => Math.max(f - 2, 10))}
                    className="text-xs px-1.5 py-1 bg-gray-100 hover:bg-gray-200 rounded font-bold text-gray-600"
                    title="Giảm cỡ chữ">A-</button>
                  <span className="text-xs text-gray-400 w-8 text-center">{fontSize}px</span>
                  <button onClick={() => setFontSize(f => Math.min(f + 2, 24))}
                    className="text-xs px-1.5 py-1 bg-gray-100 hover:bg-gray-200 rounded font-bold text-gray-600"
                    title="Tăng cỡ chữ">A+</button>
                  {viewer.link_tvpl && (
                    <a href={viewer.link_tvpl} target="_blank" rel="noopener noreferrer"
                      className="ml-1 text-xs bg-brand text-white px-2 py-1 rounded-lg hover:bg-brand-dark">
                      🔗 TVPL
                    </a>
                  )}
                </div>
              </div>
            </div>
            {/* Viewer content */}
            <div className="flex-1 overflow-y-auto p-5">
              {viewer.noi_dung_html
                ? <div className="doc-html-viewer" style={{ fontSize: `${fontSize}px` }} dangerouslySetInnerHTML={{ __html: viewer.noi_dung_html }} />
                : <div className="text-gray-400 text-sm text-center mt-10">Không có nội dung HTML</div>
              }
            </div>
          </>
        )}
      </div>

      {/* Add Priority Modal */}
      {addModalDoc && (
        <AddPriorityModal
          doc={addModalDoc}
          onClose={() => setAddModalDoc(null)}
          onAdded={() => { loadPriorityDocs(); setMsg('✅ Đã thêm vào danh sách ưu tiên') }}
        />
      )}
    </div>
  )
}

// ─── Mini: Import from dbvntax by search ───────────────────────────────────
function ImportFromDbvntaxRow({ onImported }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [msg, setMsg] = useState('')

  async function search() {
    if (!q.trim()) return
    setSearching(true)
    try { setResults(await api.searchDbvntax(q)) } catch {}
    setSearching(false)
  }

  async function doImport(id) {
    setMsg('')
    try {
      const r = await api.importFromDbvntax(id)
      setMsg(`✅ ${r.so_hieu}`)
      setResults([]); setQ('')
      onImported()
    } catch (err) { setMsg(`❌ ${err.message}`) }
  }

  return (
    <div>
      <div className="flex gap-1">
        <input type="text" value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Import từ dbvntax..."
          className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand" />
        <button onClick={search} disabled={searching}
          className="text-xs px-2 py-1 bg-brand text-white rounded hover:bg-brand-dark disabled:opacity-60">
          {searching ? '...' : 'Tìm'}
        </button>
      </div>
      {msg && <div className="text-xs mt-1 text-green-600">{msg}</div>}
      {results.length > 0 && (
        <div className="mt-1 max-h-32 overflow-y-auto border border-gray-100 rounded divide-y text-xs">
          {results.map(r => (
            <div key={r.id} className="flex items-center justify-between px-2 py-1.5 hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{r.so_hieu}</div>
                <div className="text-gray-400 truncate">{r.ten}</div>
              </div>
              <button onClick={() => doImport(r.id)}
                className="ml-1 bg-brand text-white px-2 py-0.5 rounded hover:bg-brand-dark shrink-0">Import</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
