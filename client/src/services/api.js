/**
 * api.js — Centralised HTTP client for the Altheria FTS backend.
 * In dev, Vite proxies /api → http://localhost:4000/api
 * In production, set VITE_API_URL to your deployed server.
 */

const BASE = import.meta.env.VITE_API_URL || '/api'

// ── Token management ────────────────────────────────────────────────────────
let _token = null
export const setToken   = t => { _token = t }
export const clearToken = () => { _token = null }

function headers(extra = {}) {
  return {
    'Content-Type': 'application/json',
    ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
    ...extra,
  }
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

// ── Auth ────────────────────────────────────────────────────────────────────
export const authAPI = {
  login:  (badgeId, passcode) => request('POST', '/auth/login', { badgeId, passcode }),
  logout: ()                  => request('POST', '/auth/logout'),
}

// ── Cases ───────────────────────────────────────────────────────────────────
export const casesAPI = {
  verify:    caseId           => request('GET',   `/cases/${caseId.trim().toUpperCase()}`),
  list:      ()               => request('GET',   '/cases'),
  register:  body             => request('POST',  '/cases', body),
  setStatus: (caseId, status) => request('PATCH', `/cases/${caseId}/status`, { status }),
}

// ── Sessions ─────────────────────────────────────────────────────────────────
export const sessionsAPI = {
  start: caseId    => request('POST', '/sessions', { caseId }),
  get:   sessionId => request('GET',  `/sessions/${sessionId}`),
  end:   sessionId => request('POST', `/sessions/${sessionId}/end`),
}

// ── Interrogation ─────────────────────────────────────────────────────────────
export const interrogationAPI = {
  open:       (sessionId, language = 'en')       => request('POST', `/interrogation/${sessionId}/open`, { language }),
  respond:    (sessionId, text, language = 'en', analysisContext = {}) =>
    request('POST', `/interrogation/${sessionId}/respond`, { text, language, ...analysisContext }),
  transcript: sessionId         => request('GET',  `/interrogation/${sessionId}/transcript`),
}

// ── Recordings ────────────────────────────────────────────────────────────────
export const recordingsAPI = {
  list:    caseId => request('GET', `/recordings?caseId=${encodeURIComponent(caseId)}`),
  listAll: ()     => request('GET', '/recordings'),

  upload: (blob, caseId, sessionId, duration, startedAt, metadata = {}) => {
    const form = new FormData()
    form.append('file', blob, metadata.fileName || `recording-${caseId}-${Date.now()}.webm`)
    form.append('caseId', caseId)
    if (sessionId) form.append('sessionId', sessionId)
    if (duration)  form.append('duration', String(Math.round(duration)))
    if (startedAt) form.append('startedAt', startedAt)
    if (metadata.modality) form.append('modality', metadata.modality)
    if (metadata.label) form.append('label', metadata.label)
    if (metadata.analysisSummary) form.append('analysisSummary', metadata.analysisSummary)
    if (metadata.details) form.append('metadata', JSON.stringify(metadata.details))

    return fetch(`${BASE}/recordings`, {
      method:  'POST',
      headers: _token ? { Authorization: `Bearer ${_token}` } : {},
      body:    form,
    }).then(async r => {
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
      return data
    })
  },

  streamUrl: recId => `${BASE}/recordings/${recId}/stream`,
}

// ── Reports ───────────────────────────────────────────────────────────────────
export const reportsAPI = {
  generate:    sessionId => request('POST', '/reports/generate', { sessionId }),
  list:        caseId    => request('GET', caseId ? `/reports?caseId=${caseId}` : '/reports'),
  downloadUrl: reportId  => `${BASE}/reports/${reportId}/download`,
}

// ── Audit ─────────────────────────────────────────────────────────────────────
export const auditAPI = {
  list: (limit = 80) => request('GET', `/audit?limit=${limit}`),
}

// ── WebSocket factory ─────────────────────────────────────────────────────────
export function createMetricSocket(sessionId, token, onMessage) {
  const wsBase = window.location.origin.replace(/^http/, 'ws')
  const ws = new WebSocket(`${wsBase}/ws`)

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'IDENTIFY', sessionId, token }))
  }
  ws.onmessage = e => {
    try { onMessage(JSON.parse(e.data)) } catch {}
  }
  ws.onerror = err => console.warn('WS error', err)
  return ws
}
