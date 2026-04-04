import { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'

const TAX_TYPES = ['TNDN', 'GTGT', 'TNCN', 'FCT', 'TTDB', 'XNK', 'TP', 'HKD', 'QLT', 'HOA_DON', 'THUE_QT']
const FORM_TYPES = [
  { value: 'quick_research', label: 'Quick Research' },
  { value: 'full_report', label: 'Full Report' },
  { value: 'analysis', label: 'Bài phân tích' },
  { value: 'press', label: 'Bài báo' },
  { value: 'scenario', label: 'Tình huống thuế' },
  { value: 'advice', label: 'Thư tư vấn' },
  { value: 'other', label: 'Khác' },
]
const FORM_LABEL = Object.fromEntries(FORM_TYPES.map(f => [f.value, f.label]))

function AddPanel({ onAdded }) {
  const [tab, setTab] = useState('url')
  const [urlInput, setUrlInput] = useState('')
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteContent, setPasteContent] = useState('')
  const [taxTypes, setTaxTypes] = useState([])
  const [formType, setFormType] = useState('')
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadTitle, setUploadTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  function toggleTax(t) {
    setTaxTypes(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])
  }

  async function handleUrl() {
    if (!urlInput.startsWith('http')) return
    setLoading(true)
    setMsg('')
    try {
      const result = await api.addReference({
        source_type: 'url',
        url: urlInput,
        tax_types: taxTypes,
        form_type: formType,
      })
      setMsg(result.auto_classified ? '✅ Đã lưu (🤖 tự phân loại)' : '✅ Đã lưu')
      setUrlInput('')
      setTaxTypes([])
      setFormType('')
      onAdded(result)
    } catch (err) {
      setMsg('❌ ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handlePaste() {
    if (!pasteContent.trim()) return
    setLoading(true)
    setMsg('')
    try {
      const result = await api.addReference({
        source_type: 'paste',
        content: pasteContent,
        title: pasteTitle || undefined,
        tax_types: taxTypes,
        form_type: formType,
      })
      setMsg(result.auto_classified ? '✅ Đã lưu (🤖 tự phân loại)' : '✅ Đã lưu')
      setPasteTitle('')
      setPasteContent('')
      setTaxTypes([])
      setFormType('')
      onAdded(result)
    } catch (err) {
      setMsg('❌ ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleUpload() {
    if (!uploadFile) return
    setLoading(true)
    setMsg('')
    try {
      const result = await api.uploadReference(uploadFile, {
        title: uploadTitle,
        tax_types: taxTypes,
        form_type: formType,
      })
      setMsg(result.auto_classified ? '✅ Đã lưu (🤖 tự phân loại)' : '✅ Đã lưu')
      setUploadFile(null)
      setUploadTitle('')
      setTaxTypes([])
      setFormType('')
      onAdded(result)
    } catch (err) {
      setMsg('❌ ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const commonFields = (
    <div className="mt-3 space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Sắc thuế (tuỳ chọn — để trống để AI tự classify)</label>
        <div className="flex flex-wrap gap-1">
          {TAX_TYPES.map(t => (
            <button
              key={t}
              type="button"
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
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Hình thức (tuỳ chọn)</label>
        <select
          value={formType}
          onChange={e => setFormType(e.target.value)}
          className="border border-gray-200 rounded px-2 py-1 text-sm w-48"
        >
          <option value="">— AI tự classify —</option>
          {FORM_TYPES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>
    </div>
  )

  return (
    <div className="mb-4 bg-white border border-gray-200 rounded-xl p-4">
      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-100 pb-2">
        {[['url', '🔗 Từ URL'], ['paste', '📋 Paste'], ['upload', '📁 Upload']].map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => setTab(v)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              tab === v ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'url' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">URL bài viết</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="https://..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <button
              type="button"
              onClick={handleUrl}
              disabled={loading || !urlInput.startsWith('http')}
              className="px-4 py-2 bg-brand text-white rounded-lg text-sm hover:bg-brand-dark disabled:opacity-60"
            >
              {loading ? '⏳' : 'Crawl & Lưu'}
            </button>
          </div>
          {commonFields}
        </div>
      )}

      {tab === 'paste' && (
        <div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Tiêu đề (tuỳ chọn)</label>
            <input
              type="text"
              value={pasteTitle}
              onChange={e => setPasteTitle(e.target.value)}
              placeholder="Để trống để tự detect từ nội dung"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Nội dung</label>
            <textarea
              value={pasteContent}
              onChange={e => setPasteContent(e.target.value)}
              rows={6}
              placeholder="Paste nội dung bài viết vào đây..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
            />
          </div>
          {commonFields}
          <button
            type="button"
            onClick={handlePaste}
            disabled={loading || !pasteContent.trim()}
            className="mt-3 px-4 py-2 bg-brand text-white rounded-lg text-sm hover:bg-brand-dark disabled:opacity-60"
          >
            {loading ? '⏳ Đang lưu...' : 'Lưu'}
          </button>
        </div>
      )}

      {tab === 'upload' && (
        <div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">File (PDF, DOCX, TXT)</label>
            <input
              type="file"
              accept=".pdf,.docx,.doc,.txt"
              onChange={e => setUploadFile(e.target.files?.[0] || null)}
              className="text-sm text-gray-600"
            />
            {uploadFile && (
              <div className="mt-1 text-xs text-gray-500">{uploadFile.name}</div>
            )}
          </div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Tiêu đề (tuỳ chọn)</label>
            <input
              type="text"
              value={uploadTitle}
              onChange={e => setUploadTitle(e.target.value)}
              placeholder="Để trống để tự detect"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          {commonFields}
          <button
            type="button"
            onClick={handleUpload}
            disabled={loading || !uploadFile}
            className="mt-3 px-4 py-2 bg-brand text-white rounded-lg text-sm hover:bg-brand-dark disabled:opacity-60"
          >
            {loading ? '⏳ Đang upload...' : 'Upload'}
          </button>
        </div>
      )}

      {msg && (
        <div className={`mt-3 text-sm px-3 py-2 rounded ${msg.startsWith('❌') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {msg}
        </div>
      )}
    </div>
  )
}

function ArticleDetail({ article, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [editTax, setEditTax] = useState([])
  const [editForm, setEditForm] = useState('')
  const [numSlides, setNumSlides] = useState(10)
  const [gammaLoading, setGammaLoading] = useState(false)
  const [gammaUrl, setGammaUrl] = useState('')
  const [fullArticle, setFullArticle] = useState(null)
  const [loadingContent, setLoadingContent] = useState(false)

  useEffect(() => {
    setGammaUrl(article.gamma_url || '')
    setFullArticle(null)
  }, [article.id])

  async function loadContent() {
    if (fullArticle) return
    setLoadingContent(true)
    try {
      const data = await api.getReference(article.id)
      setFullArticle(data)
    } catch (_) {}
    setLoadingContent(false)
  }

  function startEdit() {
    setEditTax([...(article.tax_types || [])])
    setEditForm(article.form_type || '')
    setEditing(true)
  }

  async function saveEdit() {
    try {
      const updated = await api.updateReference(article.id, {
        tax_types: editTax,
        form_type: editForm,
      })
      onUpdate(updated)
      setEditing(false)
    } catch (err) {
      alert('Lỗi: ' + err.message)
    }
  }

  async function handleGamma() {
    setGammaLoading(true)
    try {
      const data = await api.referenceGamma(article.id, numSlides)
      if (data.gamma_url) setGammaUrl(data.gamma_url)
    } catch (err) {
      alert('Lỗi Gamma: ' + err.message)
    } finally {
      setGammaLoading(false)
    }
  }

  const content = fullArticle?.content_html || fullArticle?.content_text

  return (
    <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col min-w-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-sm leading-snug">{article.title}</h3>
            {article.source_url && (
              <a
                href={article.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-brand hover:underline truncate block mt-0.5"
              >
                {article.source_url}
              </a>
            )}
            <div className="flex flex-wrap gap-1 mt-2">
              {(article.tax_types || []).map(t => (
                <span key={t} className="px-1.5 py-0.5 bg-green-50 border border-green-100 text-green-700 rounded text-xs">{t}</span>
              ))}
              {article.form_type && (
                <span className="px-1.5 py-0.5 bg-blue-50 border border-blue-100 text-blue-700 rounded text-xs">
                  {FORM_LABEL[article.form_type] || article.form_type}
                </span>
              )}
              {article.auto_classified && (
                <span className="text-xs text-gray-400">🤖 auto</span>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={startEdit}
              className="text-xs text-gray-500 hover:text-brand border border-gray-200 rounded px-2 py-1"
            >
              ✏️ Sửa
            </button>
            <button
              onClick={() => onDelete(article.id)}
              className="text-xs text-red-400 hover:text-red-600 border border-red-100 rounded px-2 py-1"
            >
              🗑️
            </button>
          </div>
        </div>

        {editing && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
            <div className="mb-2">
              <div className="text-xs font-medium text-gray-600 mb-1">Sắc thuế</div>
              <div className="flex flex-wrap gap-1">
                {TAX_TYPES.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEditTax(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])}
                    className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                      editTax.includes(t)
                        ? 'bg-brand text-white border-brand'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-brand'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-2">
              <div className="text-xs font-medium text-gray-600 mb-1">Hình thức</div>
              <select
                value={editForm}
                onChange={e => setEditForm(e.target.value)}
                className="border border-gray-200 rounded px-2 py-1 text-xs"
              >
                {FORM_TYPES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={saveEdit} className="text-xs bg-brand text-white px-3 py-1 rounded hover:bg-brand-dark">Lưu</button>
              <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1 rounded border border-gray-200">Huỷ</button>
            </div>
          </div>
        )}

        {/* Gamma */}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={handleGamma}
            disabled={gammaLoading}
            className="text-xs px-3 py-1.5 rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {gammaLoading ? '⏳' : '✨'} Gamma ({numSlides})
          </button>
          <input
            type="number"
            min={3}
            max={60}
            value={numSlides}
            onChange={e => setNumSlides(Number(e.target.value))}
            className="w-12 border rounded px-1 py-1 text-xs"
          />
          {gammaUrl && (
            <a href={gammaUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-brand hover:underline">
              Xem Slides →
            </a>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {!fullArticle && (
          <button
            onClick={loadContent}
            disabled={loadingContent}
            className="text-xs text-brand hover:underline mb-3"
          >
            {loadingContent ? '⏳ Đang tải...' : '📄 Xem nội dung'}
          </button>
        )}
        {fullArticle && content && (
          fullArticle.content_html ? (
            <div
              className="report-content text-sm"
              dangerouslySetInnerHTML={{ __html: fullArticle.content_html }}
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
              {fullArticle.content_text}
            </pre>
          )
        )}
        {fullArticle && !content && (
          <div className="text-gray-400 text-sm">Không có nội dung</div>
        )}
      </div>
    </div>
  )
}

export default function References() {
  const [articles, setArticles] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [filterTax, setFilterTax] = useState('')
  const [filterForm, setFilterForm] = useState('')
  const [search, setSearch] = useState('')
  const searchRef = useRef(null)

  useEffect(() => {
    loadArticles()
  }, [filterTax, filterForm])

  async function loadArticles(searchTerm = search) {
    setLoading(true)
    try {
      const params = {}
      if (filterTax) params.tax_type = filterTax
      if (filterForm) params.form_type = filterForm
      if (searchTerm) params.search = searchTerm
      const data = await api.listReferences(params)
      setArticles(data)
    } catch (_) {}
    setLoading(false)
  }

  function onSearchChange(val) {
    setSearch(val)
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => loadArticles(val), 400)
  }

  function handleAdded(article) {
    setArticles(prev => [article, ...prev])
    setShowAdd(false)
  }

  function handleUpdate(updated) {
    setArticles(prev => prev.map(a => a.id === updated.id ? updated : a))
    if (selected?.id === updated.id) setSelected(updated)
  }

  async function handleDelete(id) {
    if (!confirm('Xoá bài tham khảo này?')) return
    try {
      await api.deleteReference(id)
      setArticles(prev => prev.filter(a => a.id !== id))
      if (selected?.id === id) setSelected(null)
    } catch (err) {
      alert('Lỗi: ' + err.message)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">📎 Bài tham khảo</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 bg-brand text-white rounded-lg text-sm hover:bg-brand-dark"
        >
          {showAdd ? '✕ Đóng' : '+ Thêm bài'}
        </button>
      </div>

      {showAdd && <AddPanel onAdded={handleAdded} />}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Tìm theo tiêu đề/nội dung..."
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <select
          value={filterTax}
          onChange={e => setFilterTax(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
        >
          <option value="">Tất cả sắc thuế</option>
          {TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={filterForm}
          onChange={e => setFilterForm(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
        >
          <option value="">Tất cả hình thức</option>
          {FORM_TYPES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        {(filterTax || filterForm || search) && (
          <button
            onClick={() => { setFilterTax(''); setFilterForm(''); setSearch('') }}
            className="text-xs text-gray-400 hover:text-gray-600 px-2"
          >
            ✕ Xoá filter
          </button>
        )}
      </div>

      <div className="flex gap-4">
        {/* Article list */}
        <div className={`${selected ? 'w-80 shrink-0' : 'flex-1'} bg-white rounded-xl border border-gray-200 overflow-hidden`}>
          {loading ? (
            <div className="p-8 text-center text-gray-400">Đang tải...</div>
          ) : articles.length === 0 ? (
            <div className="p-8 text-center text-gray-400">Chưa có bài tham khảo</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {articles.map((a) => (
                <div
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className={`px-4 py-3 cursor-pointer hover:bg-gray-50 ${
                    selected?.id === a.id ? 'bg-green-50 border-l-2 border-brand' : ''
                  }`}
                >
                  <div className="font-medium text-sm text-gray-900 truncate">{a.title}</div>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {(a.tax_types || []).map(t => (
                      <span key={t} className="px-1 py-0.5 bg-green-50 border border-green-100 text-green-700 rounded text-xs">{t}</span>
                    ))}
                    {a.form_type && (
                      <span className="px-1 py-0.5 bg-blue-50 border border-blue-100 text-blue-600 rounded text-xs">
                        {FORM_LABEL[a.form_type] || a.form_type}
                      </span>
                    )}
                    {a.auto_classified && <span className="text-xs text-gray-400">🤖</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{a.created_at}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Article detail */}
        {selected && (
          <ArticleDetail
            article={selected}
            onDelete={handleDelete}
            onUpdate={handleUpdate}
          />
        )}
      </div>
    </div>
  )
}
