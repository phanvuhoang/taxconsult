import { useEffect, useState, useRef } from 'react'
import { api } from '../api.js'

export default function TaxDocs() {
  const [docs, setDocs] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [importQuery, setImportQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef()

  useEffect(() => {
    load()
  }, [])

  async function load(q) {
    setLoading(true)
    try {
      const data = await api.listTaxDocs(q || search || '')
      setDocs(data)
    } catch {}
    setLoading(false)
  }

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setMsg('')
    try {
      const res = await api.uploadTaxDoc(file)
      setMsg(`✅ Đã upload: ${res.ten} (${res.chars} ký tự)`)
      load()
    } catch (err) {
      setMsg(`❌ ${err.message}`)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleSearch() {
    if (!importQuery.trim()) return
    setSearching(true)
    try {
      const data = await api.searchDbvntax(importQuery)
      setSearchResults(data)
    } catch (err) {
      setMsg(`❌ ${err.message}`)
    } finally {
      setSearching(false)
    }
  }

  async function handleImport(id) {
    setMsg('')
    try {
      const res = await api.importFromDbvntax(id)
      setMsg(`✅ Đã import: ${res.so_hieu} — ${res.ten}`)
      load()
      setSearchResults([])
      setImportQuery('')
    } catch (err) {
      setMsg(`❌ ${err.message}`)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Xoá văn bản này?')) return
    try {
      await api.deleteTaxDoc(id)
      setDocs((p) => p.filter((d) => d.id !== id))
    } catch {}
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">📚 Tax Docs — Knowledge Base</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Upload */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 mb-3">Upload văn bản</h3>
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:border-brand transition-colors">
            <span className="text-3xl mb-2">📄</span>
            <span className="text-sm text-gray-500">Kéo thả hoặc click để upload</span>
            <span className="text-xs text-gray-400">.docx, .pdf, .txt</span>
            <input
              ref={fileRef}
              type="file"
              accept=".docx,.pdf,.txt"
              onChange={handleUpload}
              className="hidden"
            />
          </label>
          {uploading && <div className="text-sm text-gray-500 mt-2">Đang upload...</div>}
        </div>

        {/* Import from dbvntax */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 mb-3">Import từ dbvntax</h3>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={importQuery}
              onChange={(e) => setImportQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Tìm theo số hiệu hoặc tên..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="bg-brand text-white px-3 py-1.5 rounded-lg text-sm hover:bg-brand-dark disabled:opacity-60"
            >
              Tìm
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-lg divide-y text-xs">
              {searchResults.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.so_hieu}</div>
                    <div className="text-gray-400 truncate">{r.ten}</div>
                  </div>
                  <button
                    onClick={() => handleImport(r.id)}
                    className="ml-2 bg-brand text-white px-2 py-0.5 rounded hover:bg-brand-dark"
                  >
                    Import
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {msg && (
        <div
          className={`px-4 py-2 rounded-lg mb-4 text-sm ${
            msg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {msg}
        </div>
      )}

      {/* Search */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          placeholder="Tìm kiếm văn bản..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <button
          onClick={() => load()}
          className="bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg text-sm"
        >
          Tìm
        </button>
      </div>

      {/* Docs list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Đang tải...</div>
        ) : docs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Chưa có văn bản nào</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Số hiệu</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Tên</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Loại</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Trạng thái</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-600">Nguồn</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {docs.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs">{d.so_hieu || '—'}</td>
                  <td className="px-4 py-2 max-w-xs truncate">{d.ten}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{d.loai || '—'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        d.tinh_trang === 'con_hieu_luc'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {d.tinh_trang === 'con_hieu_luc' ? 'Còn hiệu lực' : d.tinh_trang}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400">{d.source}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleDelete(d.id)}
                      className="text-red-400 hover:text-red-600 text-xs"
                    >
                      Xoá
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
