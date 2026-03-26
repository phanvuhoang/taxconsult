const BASE = '/api'

function getToken() {
  return localStorage.getItem('token')
}

async function request(method, path, body = null, options = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    ...options,
  })

  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    return
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }

  return res.json()
}

export const api = {
  // Auth
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  me: () => request('GET', '/auth/me'),
  changePassword: (current_password, new_password) =>
    request('POST', '/auth/change-password', { current_password, new_password }),

  // Reports
  listReports: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request('GET', `/reports${q ? '?' + q : ''}`)
  },
  getReport: (id) => request('GET', `/reports/${id}`),
  deleteReport: (id) => request('DELETE', `/reports/${id}`),

  // Research
  quickResearch: (body) => request('POST', '/research/quick', body),
  startFullReport: (body) => request('POST', '/research/full', body),
  researchHistory: () => request('GET', '/research/history'),
  getResearchSession: (id) => request('GET', `/research/history/${id}`),

  // Tax Docs
  listTaxDocs: (search) =>
    request('GET', `/tax-docs${search ? '?search=' + encodeURIComponent(search) : ''}`),
  deleteTaxDoc: (id) => request('DELETE', `/tax-docs/${id}`),
  searchDbvntax: (q) => request('GET', `/tax-docs/search-dbvntax?q=${encodeURIComponent(q)}`),
  importFromDbvntax: (dbvntax_id) => request('POST', '/tax-docs/import-from-dbvntax', { dbvntax_id }),

  uploadTaxDoc: async (file) => {
    const form = new FormData()
    form.append('file', file)
    const token = getToken()
    const res = await fetch(`${BASE}/tax-docs/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail || 'Upload failed')
    }
    return res.json()
  },

  // Admin
  listUsers: () => request('GET', '/admin/users'),
  createUser: (body) => request('POST', '/admin/users', body),
  toggleUserActive: (id) => request('PATCH', `/admin/users/${id}/toggle-active`),
  adminStats: () => request('GET', '/admin/stats'),
  getDbvntaxSacThue: () => request('GET', '/admin/dbvntax-sac-thue'),

  // Priority Docs
  listPriorityDocs: (sac_thue) =>
    request('GET', `/priority-docs${sac_thue ? '?sac_thue=' + encodeURIComponent(sac_thue) : ''}`),
  addPriorityDoc: (body) => request('POST', '/priority-docs', body),
  updatePriorityDoc: (id, body) => request('PATCH', `/priority-docs/${id}`, body),
  deletePriorityDoc: (id) => request('DELETE', `/priority-docs/${id}`),
  getPriorityDocContent: (dbvntax_id) => request('GET', `/priority-docs/content/${dbvntax_id}`),

  // Tax Docs — dbvntax browse
  browseDbvntax: (sac_thue, loai) => {
    const params = new URLSearchParams({ sac_thue })
    if (loai) params.append('loai', loai)
    return request('GET', `/tax-docs/dbvntax-browse?${params}`)
  },
  getDbvntaxContent: (id) => request('GET', `/tax-docs/dbvntax-content/${id}`),
  getTaxDocContent: (id) => request('GET', `/tax-docs/content/${id}`),
}

export function streamFullReport(jobId, onEvent, onError, onDone) {
  const token = getToken()
  const url = `${BASE}/research/full/${jobId}/stream`
  const source = new EventSource(url + (token ? `?token=${token}` : ''))

  // Actually EventSource doesn't support custom headers, use fetch stream instead
  source.close()

  // Use fetch with ReadableStream for SSE with auth
  const controller = new AbortController()

  fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) {
      onError(new Error('Stream failed'))
      return
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            onEvent(data)
            if (data.type === 'done') {
              onDone(data)
              return
            }
          } catch {}
        }
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') onError(err)
  })

  return () => controller.abort()
}
