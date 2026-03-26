import { useEffect, useState, useRef } from 'react'
import { api } from '../api.js'

const LOAI_OPTIONS = ['Tất cả', 'Luat', 'ND', 'TT', 'VBHN']

// ─── Modal: Add to Priority ────────────────────────────────────────────────
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
  const [err, setErr] = useState('')

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
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Thêm vào văn bản ưu tiên</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="text-xs text-gray-500 mb-3 truncate">{doc.so_hieu} — {doc.ten}</div>

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
  const [tab, setTab] = useState('priority')  // 'priority' | 'browse' | 'imported'
  const [viewer, setViewer] = useState(null)   // { so_hieu, ten, noi_dung_html, link_tvpl }
  const [viewerLoading, setViewerLoading] = useState(false)

  // --- Priority docs state ---
  const [priorityDocs, setPriorityDocs] = useState([])
  const [priorityFilter, setPriorityFilter] = useState('')
  const [editingId, setEditingId] = useState(null)

  // --- Browse state ---
  const [sacThueList, setSacThueList] = useState([])
  const [browseSacThue, setBrowseSacThue] = useState('')
  const [browseLoai, setBrowseLoai] = useState('')
  const [browseResults, setBrowseResults] = useState([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [addModalDoc, setAddModalDoc] = useState(null)

  // --- Imported docs state ---
  const [importedDocs, setImportedDocs] = useState([])
  const [importSearch, setImportSearch] = useState('')
  const [importSearchQuery, setImportSearchQuery] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef()

  // Load on mount
  useEffect(() => {
    loadPriorityDocs()
    api.getDbvntaxSacThue().then(list => {
      setSacThueList(list)
      if (list.length > 0 && !browseSacThue) setBrowseSacThue(list[0].sac_thue)
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
    try {
      const data = await api.listTaxDocs(importSearch)
      setImportedDocs(data)
    } catch {}
    setImportLoading(false)
  }

  async function loadViewer(so_hieu, ten, noi_dung_html, link_tvpl) {
    setViewer({ so_hieu, ten, noi_dung_html, link_tvpl })
  }

  async function loadPriorityContent(doc) {
    setViewerLoading(true)
    setViewer(null)
    try {
      const data = await api.getPriorityDocContent(doc.dbvntax_id)
      setViewer({ so_hieu: doc.so_hieu, ten: doc.ten, noi_dung_html: data.noi_dung_html, link_tvpl: doc.link_tvpl })
    } catch {}
    setViewerLoading(false)
  }

  async function loadBrowseContent(doc) {
    setViewerLoading(true)
    setViewer(null)
    try {
      const data = await api.getDbvntaxContent(doc.id)
      setViewer({ so_hieu: doc.so_hieu, ten: doc.ten, noi_dung_html: data.noi_dung_html, link_tvpl: doc.link_tvpl })
    } catch {}
    setViewerLoading(false)
  }

  async function loadImportedContent(doc) {
    setViewerLoading(true)
    setViewer(null)
    try {
      const data = await api.getTaxDocContent(doc.id)
      setViewer({ so_hieu: doc.so_hieu, ten: doc.ten, noi_dung_html: data.noi_dung_html, link_tvpl: doc.link_tvpl })
    } catch {
      setViewer({ so_hieu: doc.so_hieu, ten: doc.ten, noi_dung_html: null, link_tvpl: doc.link_tvpl })
    }
    setViewerLoading(false)
  }
  async function browseDbvntax() {
    if (!browseSacThue) return
    setBrowseLoading(true)
    try {
      const data = await api.browseDbvntax(browseSacThue, browseLoai || undefined)
      setBrowseResults(data)
    } catch {}
    setBrowseLoading(false)
  }

  useEffect(() => { if (browseSacThue) browseDbvntax() }, [browseSacThue, browseLoai])

  async function deletePriority(id) {
    if (!confirm('Xoá khỏi danh sách ưu tiên?')) return
    try {
      await api.deletePriorityDoc(id)
      setPriorityDocs(p => p.filter(d => d.id !== id))
    } catch {}
  }

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setMsg('')
    try {
      const res = await api.uploadTaxDoc(file)
      setMsg(`✅ Đã upload: ${res.ten}`)
      loadImported()
    } catch (err) {
      setMsg(`❌ ${err.message}`)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleImportFromDbvntax(id) {
    setMsg('')
    try {
      const res = await api.importFromDbvntax(id)
      setMsg(`✅ Đã import: ${res.so_hieu} — ${res.ten}`)
      loadImported()
    } catch (err) {
      setMsg(`❌ ${err.message}`)
    }
  }

  async function deleteImported(id) {
    if (!confirm('Xoá văn bản này?')) return
    try {
      await api.deleteTaxDoc(id)
      setImportedDocs(p => p.filter(d => d.id !== id))
    } catch {}
  }

  function statusBadge(d) {
    if (d.pham_vi_het_hieu_luc === 'mot_phan')
      return <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">⚠️ một phần</span>
    if (d.pham_vi_het_hieu_luc === 'toan_bo' || d.hieu_luc_den)
      return <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Hết hiệu lực</span>
    return <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Còn hiệu lực</span>
  }

  function loaiBadge(loai) {
    const map = { Luat: 'bg-purple-100 text-purple-700', ND: 'bg-blue-100 text-blue-700', TT: 'bg-cyan-100 text-cyan-700', VBHN: 'bg-gray-100 text-gray-600' }
    return <span className={`text-xs px-1.5 py-0.5 rounded ${map[loai] || 'bg-gray-100 text-gray-500'}`}>{loai || '?'}</span>
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left panel ── */}
      <div className="w-[42%] min-w-[320px] flex flex-col border-r border-gray-200 bg-white overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-3 pt-3 gap-1">
          {[
            { id: 'priority', label: '⭐ Ưu tiên' },
            { id: 'browse', label: '🔎 Browse dbvntax' },
            { id: 'imported', label: '📁 Đã import' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-t-lg text-sm font-medium transition-colors ${
                tab === t.id ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Priority Docs ── */}
        {tab === 'priority' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-gray-100 flex gap-2">
              <select value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value); setTimeout(loadPriorityDocs, 0) }}
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand">
                <option value="">Tất cả sắc thuế</option>
                {sacThueList.map(s => <option key={s.sac_thue} value={s.sac_thue}>{s.sac_thue} ({s.count})</option>)}
              </select>
              <button onClick={loadPriorityDocs} className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded">↻</button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {priorityDocs.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">Chưa có văn bản ưu tiên</div>
              ) : priorityDocs.map(d => (
                <div key={d.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadPriorityContent(d)}>
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        {loaiBadge(d.loai)}
                        {statusBadge(d)}
                        <span className="text-xs font-mono text-gray-700">{d.so_hieu}</span>
                      </div>
                      <div className="text-sm text-gray-800 leading-snug line-clamp-2">{d.ten}</div>
                      {d.thay_the_boi && (
                        <div className="text-xs text-orange-600 mt-0.5">↳ Thay thế bởi: {d.thay_the_boi}</div>
                      )}
                      {d.ghi_chu_hieu_luc && (
                        <div className="text-xs text-gray-400 mt-0.5 truncate">{d.ghi_chu_hieu_luc}</div>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => setEditingId(editingId === d.id ? null : d.id)}
                        className="text-xs text-gray-400 hover:text-brand" title="Sửa">✏️</button>
                      <button onClick={() => deletePriority(d.id)}
                        className="text-xs text-gray-400 hover:text-red-600" title="Xoá">🗑️</button>
                    </div>
                  </div>
                  {editingId === d.id && (
                    <EditPriorityForm
                      doc={d}
                      onSave={updated => {
                        setPriorityDocs(p => p.map(x => x.id === d.id ? updated : x))
                        setEditingId(null)
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab: Browse dbvntax ── */}
        {tab === 'browse' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-gray-100 space-y-2">
              <div className="flex gap-2">
                <select value={browseSacThue} onChange={e => setBrowseSacThue(e.target.value)}
                  className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand">
                  {sacThueList.length === 0 && <option value="">-- Chọn sắc thuế --</option>}
                  {sacThueList.map(s => <option key={s.sac_thue} value={s.sac_thue}>{s.sac_thue} ({s.count})</option>)}
                </select>
                <select value={browseLoai} onChange={e => setBrowseLoai(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand">
                  {LOAI_OPTIONS.map(l => <option key={l} value={l === 'Tất cả' ? '' : l}>{l}</option>)}
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {browseLoading ? (
                <div className="p-6 text-center text-gray-400 text-sm">Đang tải...</div>
              ) : browseResults.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">Không có văn bản</div>
              ) : browseResults.map(d => (
                <div key={d.id} className="p-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadBrowseContent(d)}>
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        {loaiBadge(d.loai)}
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                          d.tinh_trang === 'con_hieu_luc' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {d.tinh_trang === 'con_hieu_luc' ? 'Còn HLực' : 'Hết HLực'}
                        </span>
                        <span className="text-xs text-gray-500">{d.ngay_ban_hanh}</span>
                      </div>
                      <div className="text-xs font-mono text-gray-700">{d.so_hieu}</div>
                      <div className="text-sm text-gray-800 leading-snug line-clamp-2">{d.ten}</div>
                    </div>
                    <button
                      onClick={() => setAddModalDoc(d)}
                      className="shrink-0 text-xs bg-brand text-white px-2 py-1 rounded hover:bg-brand-dark"
                      title="Thêm vào ưu tiên"
                    >
                      + Ưu tiên
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab: Imported ── */}
        {tab === 'imported' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-gray-100 space-y-2">
              {/* Upload */}
              <label className="flex items-center gap-2 border border-dashed border-gray-300 rounded-lg px-3 py-2 cursor-pointer hover:border-brand text-sm text-gray-500 hover:text-brand transition-colors">
                <span>📄</span>
                <span>{uploading ? 'Đang upload...' : 'Upload .docx / .pdf / .txt'}</span>
                <input ref={fileRef} type="file" accept=".docx,.pdf,.txt" onChange={handleUpload} className="hidden" />
              </label>

              {/* Search */}
              <div className="flex gap-2">
                <input type="text" value={importSearchQuery}
                  onChange={e => setImportSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && setImportSearch(importSearchQuery)}
                  placeholder="Tìm theo số hiệu / tên..."
                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
                <button onClick={() => setImportSearch(importSearchQuery)}
                  className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded">Tìm</button>
              </div>

              {/* Import from dbvntax shortcut */}
              <ImportFromDbvntaxRow onImported={loadImported} />
            </div>

            {msg && (
              <div className={`mx-3 mt-2 px-3 py-1.5 rounded text-xs ${msg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {msg}
              </div>
            )}

            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {importLoading ? (
                <div className="p-6 text-center text-gray-400 text-sm">Đang tải...</div>
              ) : importedDocs.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">Chưa có văn bản nào</div>
              ) : importedDocs.map(d => (
                <div key={d.id} className="px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => {
                    if (d.dbvntax_id) {
                      loadBrowseContent({ id: d.dbvntax_id, so_hieu: d.so_hieu, ten: d.ten, link_tvpl: d.link_tvpl })
                    } else {
                      loadImportedContent(d)
                    }
                  }}>
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      {loaiBadge(d.loai)}
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${d.tinh_trang === 'con_hieu_luc' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {d.tinh_trang === 'con_hieu_luc' ? 'Còn HLực' : d.tinh_trang}
                      </span>
                      <span className="text-xs text-gray-400">{d.source}</span>
                    </div>
                    <div className="text-xs font-mono text-gray-600">{d.so_hieu || '—'}</div>
                    <div className="text-sm text-gray-800 truncate">{d.ten}</div>
                  </div>
                  <button onClick={() => deleteImported(d.id)} className="text-red-400 hover:text-red-600 text-xs shrink-0">Xoá</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Right panel: Viewer ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {viewerLoading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-3xl mb-2 animate-pulse">📄</div>
              <div className="text-sm">Đang tải nội dung...</div>
            </div>
          </div>
        ) : !viewer ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-5xl mb-3">📄</div>
              <div className="text-sm">Chọn văn bản để xem nội dung</div>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="border-b border-gray-200 bg-white px-5 py-3 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs text-brand font-semibold">{viewer.so_hieu}</div>
                  <div className="text-sm font-medium text-gray-900 mt-0.5 leading-snug">{viewer.ten}</div>
                </div>
                {viewer.link_tvpl && (
                  <a href={viewer.link_tvpl} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 text-xs bg-brand text-white px-2.5 py-1 rounded-lg hover:bg-brand-dark flex items-center gap-1">
                    🔗 TVPL
                  </a>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {viewer.noi_dung_html ? (
                <div
                  className="doc-html-viewer"
                  dangerouslySetInnerHTML={{ __html: viewer.noi_dung_html }}
                />
              ) : (
                <div className="text-gray-400 text-sm text-center mt-10">Không có nội dung HTML</div>
              )}
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
    try {
      const data = await api.searchDbvntax(q)
      setResults(data)
    } catch {}
    setSearching(false)
  }

  async function doImport(id) {
    setMsg('')
    try {
      const res = await api.importFromDbvntax(id)
      setMsg(`✅ ${res.so_hieu}`)
      setResults([])
      setQ('')
      onImported()
    } catch (err) {
      setMsg(`❌ ${err.message}`)
    }
  }

  return (
    <div>
      <div className="flex gap-1">
        <input type="text" value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Import từ dbvntax (số hiệu)..."
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
                className="ml-1 bg-brand text-white px-2 py-0.5 rounded hover:bg-brand-dark shrink-0">
                Import
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
