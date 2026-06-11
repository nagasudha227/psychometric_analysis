import { useState, useEffect, useRef } from 'react'
import { reportsAPI, recordingsAPI, casesAPI } from '../services/api'
import { useApp } from '../context/AppContext'

const BASE = import.meta.env.VITE_API_URL || '/api'

const riskColor = {
  HIGH: 'text-red-400 border-red-500/40 bg-red-900/10',
  MEDIUM: 'text-amber-400 border-amber-500/40 bg-amber-900/10',
  LOW: 'text-[#22c55e] border-[#22c55e]/40 bg-[#22c55e]/10',
}

const modalityMeta = {
  master: { title: 'Master Evidence', className: 'text-[#00d4d4] border-[#00d4d4]/40 bg-[#00d4d4]/10' },
  voice: { title: 'Voice Evidence', className: 'text-[#22c55e] border-[#22c55e]/40 bg-[#22c55e]/10' },
  camera: { title: 'Camera Evidence', className: 'text-[#f59e0b] border-[#f59e0b]/40 bg-[#f59e0b]/10' },
  evidence: { title: 'Evidence', className: 'text-[#7a9bbf] border-[#1a3a5c] bg-[#0d1a28]' },
}

function authDownload(url, filename, token) {
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob() })
    .then(blob => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(a.href)
    })
    .catch(err => alert('Download failed: ' + err.message))
}

function streamPath(rec) {
  return rec.url?.replace('/api', '') || `/recordings/${rec.id}/stream`
}

function normalizeModality(rec) {
  if (rec.modality) return rec.modality
  if (rec.mimetype?.startsWith('audio/')) return 'voice'
  if (rec.mimetype?.startsWith('video/')) return 'camera'
  return 'evidence'
}

function preferredRecording(recordings, report) {
  if (!report) return null
  const caseRecordings = recordings.filter(r => r.caseId === report.caseId)
  return (
    caseRecordings.find(r => normalizeModality(r) === 'master') ||
    caseRecordings.find(r => normalizeModality(r) === 'camera') ||
    caseRecordings.find(r => normalizeModality(r) === 'voice') ||
    caseRecordings[0] ||
    null
  )
}

function avg(values) {
  const clean = values.map(Number).filter(Number.isFinite)
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0
}

function pct(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '0%'
  return `${Math.round(Math.max(0, Math.min(1, numeric)) * 100)}%`
}

function dominant(values) {
  const counts = new Map()
  values.filter(Boolean).forEach(value => counts.set(value, (counts.get(value) || 0) + 1))
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
}

export default function ReportsPanel({ initialFocus = 'reports' }) {
  const { jwtToken } = useApp()
  const [caseIdInput, setCaseIdInput] = useState('')
  const [activeCaseId, setActiveCaseId] = useState('')
  const [caseSummary, setCaseSummary] = useState(null)
  const [reports, setReports] = useState([])
  const [recordings, setRecordings] = useState([])
  const [loading, setLoading] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [selected, setSelected] = useState(null)
  const [selectedRecording, setSelectedRecording] = useState(null)
  const [seekLabel, setSeekLabel] = useState(null)
  const [playbackUrl, setPlaybackUrl] = useState('')
  const [playbackError, setPlaybackError] = useState('')
  const videoRef = useRef(null)
  const pendingSeekRef = useRef(null)

  useEffect(() => {
    if (!activeCaseId) return
    setLoading(true)
    setLookupError('')
    setSelected(null)
    setSelectedRecording(null)
    setSeekLabel(null)
    Promise.all([
      casesAPI.verify(activeCaseId),
      reportsAPI.list(activeCaseId).catch(() => ({ reports: [] })),
      recordingsAPI.list(activeCaseId).catch(() => ({ recordings: [] })),
    ]).then(([caseResult, r, rec]) => {
      setCaseSummary(caseResult.case)
      setReports(r.reports || [])
      setRecordings(rec.recordings || [])
    }).catch(err => {
      setCaseSummary(null)
      setReports([])
      setRecordings([])
      setLookupError(err.message || 'Case lookup failed.')
    }).finally(() => setLoading(false))
  }, [activeCaseId])

  function submitCaseLookup(event) {
    event.preventDefault()
    const id = caseIdInput.trim().toUpperCase()
    if (!id) {
      setLookupError('Enter a Case ID.')
      return
    }
    setActiveCaseId(id)
  }

  const linkedRec = initialFocus === 'recordings' && selected ? preferredRecording(recordings, selected) : null
  const activeRecording = initialFocus === 'recordings' ? (selectedRecording || linkedRec) : null
  const activeMetadata = activeRecording?.metadata || {}
  const activeTranscript = Array.isArray(activeMetadata.transcript) ? activeMetadata.transcript : []
  const activeAnswerAnalyses = Array.isArray(activeMetadata.answerAnalyses) ? activeMetadata.answerAnalyses : []
  const activeIsAudio = activeRecording && (
    activeRecording.mimetype?.startsWith('audio/') ||
    normalizeModality(activeRecording) === 'voice'
  )
  const groupedRecordings = ['camera', 'voice', 'master', 'evidence']
    .map(key => ({
      key,
      meta: modalityMeta[key],
      items: recordings
        .filter(rec => normalizeModality(rec) === key)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    }))
    .filter(group => group.items.length > 0)
  const recordingCounts = groupedRecordings.reduce((acc, group) => {
    acc[group.key] = group.items.length
    return acc
  }, {})

  useEffect(() => {
    if (!activeRecording || !jwtToken) {
      setPlaybackUrl('')
      setPlaybackError('')
      return
    }

    let cancelled = false
    let objectUrl = ''
    setPlaybackUrl('')
    setPlaybackError('')

    fetch(`${BASE}${streamPath(activeRecording)}`, {
      headers: { Authorization: `Bearer ${jwtToken}` },
    })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.blob()
      })
      .then(blob => {
        objectUrl = URL.createObjectURL(blob)
        if (!cancelled) setPlaybackUrl(objectUrl)
      })
      .catch(err => {
        if (!cancelled) setPlaybackError('Recording preview failed: ' + err.message)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [activeRecording, jwtToken])

  useEffect(() => {
    if (!playbackUrl || pendingSeekRef.current == null || !videoRef.current || activeIsAudio) return
    videoRef.current.currentTime = pendingSeekRef.current
    videoRef.current.play().catch(() => {})
    pendingSeekRef.current = null
  }, [playbackUrl, activeIsAudio])

  function handleFlagClick(flag, report) {
    const rec = preferredRecording(recordings, report)
    if (!rec) return
    const anchor = rec.startedAt || rec.createdAt
    pendingSeekRef.current = Math.max(0, (new Date(flag.timestamp) - new Date(anchor)) / 1000)
    setSeekLabel(`Jumped to ${new Date(flag.timestamp).toLocaleTimeString('en-GB')}`)
    if (initialFocus === 'recordings') {
      setSelected(report)
      setSelectedRecording(rec)
    }
  }

  function selectReport(report) {
    const next = selected?.id === report.id ? null : report
    setSelected(next)
    setSelectedRecording(null)
    setSeekLabel(null)
  }

  return (
    <div className="p-5 space-y-6">
      <section className="fts-card p-5">
        <form onSubmit={submitCaseLookup} className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="fts-label">Case ID</label>
              <input
                value={caseIdInput}
                onChange={event => setCaseIdInput(event.target.value)}
                className="fts-input"
                placeholder="FTS-2025-C1"
                autoComplete="off"
              />
            </div>
            <button type="submit" disabled={loading} className="fts-btn-primary w-auto min-w-[140px]">
              {loading ? 'Loading...' : 'Search'}
            </button>
          </div>
          {lookupError && <p className="text-amber-400 text-xs">{lookupError}</p>}
          {caseSummary && (
            <div className="bg-[#0a0d14] border border-[#1a3a5c] rounded p-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-[#334e6b] uppercase tracking-widest">Subject</p>
                <p className="text-white">{caseSummary.subjectName}</p>
              </div>
              <div>
                <p className="text-[#334e6b] uppercase tracking-widest">Category</p>
                <p className="text-[#f59e0b]">{caseSummary.charge}</p>
              </div>
              <div>
                <p className="text-[#334e6b] uppercase tracking-widest">Status</p>
                <p className="text-[#22c55e]">{caseSummary.status}</p>
              </div>
            </div>
          )}
        </form>
      </section>

      {!activeCaseId && (
        <div className="bg-[#0d1a28] border border-[#1a3a5c] rounded p-8 text-center">
          <p className="text-[#7a9bbf] text-sm tracking-widest uppercase">Enter a Case ID to view reports and recordings.</p>
        </div>
      )}

      {loading && (
        <div className="text-center py-10">
          <svg className="animate-spin h-6 w-6 text-[#00d4d4] mx-auto mb-2" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-[#334e6b] text-xs tracking-widest uppercase animate-pulse">Loading case records...</p>
        </div>
      )}

      {activeCaseId && !loading && (
      <>
      {initialFocus !== 'recordings' && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[#00d4d4] text-xs font-bold tracking-[0.3em] uppercase">
              Reports for {activeCaseId} ({reports.length})
            </h3>
          </div>

          {reports.length === 0 ? (
            <div className="bg-[#0d1a28] border border-[#1a3a5c] rounded p-6 text-center">
              <p className="text-[#334e6b] text-xs italic">No reports yet.</p>
              <p className="text-[#1e3a5f] text-[10px] mt-1">Complete an assessment session to generate one.</p>
            </div>
          ) : reports.map(report => (
            <div
              key={report.id}
              onClick={() => selectReport(report)}
              className={`fts-card px-4 py-3 cursor-pointer transition-colors mb-2 ${
                selected?.id === report.id ? 'border-[#00d4d4]/50 bg-[#0d1e30]' : 'hover:bg-[#162030]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white text-sm font-bold tracking-wider">{report.caseId}</p>
                  <p className="text-[#7a9bbf] text-xs truncate">{report.subjectName} - {report.charge}</p>
                  <p className="text-[#334e6b] text-[10px] font-mono mt-0.5">
                    {report.transcriptLength} turns - {report.stressFlags?.length || 0} flags - {report.recordingCount || 0} media - {new Date(report.createdAt).toLocaleDateString('en-GB')}
                  </p>
                </div>
                <div className="text-right flex-shrink-0 space-y-1.5">
                  <span className={`text-xs border rounded px-2 py-0.5 block text-center ${riskColor[report.riskLevel] || riskColor.LOW}`}>
                    {report.riskLevel} RISK
                  </span>
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      const path = report.downloadUrl?.replace('/api', '') || `/reports/${report.id}/download`
                      authDownload(`${BASE}${path}`, `report-${report.caseId}.pdf`, jwtToken)
                    }}
                    className="text-[#00d4d4] text-[10px] hover:underline block w-full text-right"
                  >
                    Download PDF
                  </button>
                </div>
              </div>

              {selected?.id === report.id && (
                <div className="mt-4 pt-3 border-t border-[#1a3a5c] space-y-2">
                  <p className="text-[#7a9bbf] text-[10px] tracking-widest uppercase font-bold">
                    Stress Flags
                  </p>
                  {(!report.stressFlags || report.stressFlags.length === 0) ? (
                    <p className="text-[#22c55e] text-xs italic">No stress flags detected.</p>
                  ) : report.stressFlags.map((flag, i) => (
                    <div
                      key={i}
                      className="w-full text-left bg-[#0a0d14] border border-amber-500/30 rounded px-3 py-2"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold ${flag.severity === 'high' ? 'text-red-400' : 'text-amber-400'}`}>
                          {flag.severity?.toUpperCase()}
                        </span>
                        <span className="text-[#334e6b] text-[10px] font-mono">
                          {flag.timestamp ? new Date(flag.timestamp).toLocaleTimeString('en-GB') : ''}
                        </span>
                      </div>
                      {(flag.indicators?.length > 0 || flag.note) && (
                        <p className="text-slate-400 text-[10px] mt-0.5 truncate">
                          {(flag.indicators || []).join(', ')}{flag.note ? ` - "${flag.note}"` : ''}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {initialFocus === 'recordings' && activeRecording && (
        <section>
          <h3 className="text-[#7a9bbf] text-xs font-bold tracking-[0.3em] uppercase mb-3">
            {selectedRecording ? 'Recording Preview' : 'Linked Recording'} - {activeRecording.caseId}
          </h3>
          <div className="fts-card overflow-hidden">
            {playbackError ? (
              <div className="bg-black min-h-[180px] flex items-center justify-center px-4">
                <p className="text-red-400 text-xs text-center">{playbackError}</p>
              </div>
            ) : playbackUrl && activeIsAudio ? (
              <div className="bg-black min-h-[160px] flex items-center px-4">
                <audio controls className="w-full" src={playbackUrl}>
                  Your browser does not support audio.
                </audio>
              </div>
            ) : playbackUrl ? (
              <video ref={videoRef} controls className="w-full bg-black" src={playbackUrl}>
                Your browser does not support video.
              </video>
            ) : (
              <div className="bg-black min-h-[180px] flex items-center justify-center px-4">
                <p className="text-[#334e6b] text-xs tracking-widest uppercase animate-pulse">Loading recording...</p>
              </div>
            )}
            <div className="px-4 py-2 flex items-center justify-between">
              <span className="text-[#334e6b] text-[10px] font-mono truncate">{activeRecording.filename}</span>
              {seekLabel && <span className="text-[#00d4d4] text-[10px] animate-pulse ml-2 flex-shrink-0">{seekLabel}</span>}
            </div>
            {(activeRecording.analysisSummary || activeTranscript.length > 0 || activeAnswerAnalyses.length > 0) && (
              <div className="border-t border-[#1a3a5c] px-4 py-3 space-y-3">
                {activeRecording.analysisSummary && (
                  <p className="text-[#7a9bbf] text-xs leading-relaxed">{activeRecording.analysisSummary}</p>
                )}

                {activeAnswerAnalyses.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="bg-[#0a0d14] border border-[#1a3a5c] rounded p-2">
                      <p className="text-[#334e6b] text-[10px] uppercase tracking-widest">Voice State</p>
                      <p className="text-[#22c55e] text-xs uppercase font-bold">
                        {dominant(activeAnswerAnalyses.map(item => item.voiceMetrics?.sentiment)) || 'unavailable'}
                      </p>
                    </div>
                    <div className="bg-[#0a0d14] border border-[#1a3a5c] rounded p-2">
                      <p className="text-[#334e6b] text-[10px] uppercase tracking-widest">Avg Voice Stress</p>
                      <p className="text-[#00d4d4] text-xs font-bold">
                        {pct(avg(activeAnswerAnalyses.map(item => item.voiceMetrics?.stressScore)))}
                      </p>
                    </div>
                    <div className="bg-[#0a0d14] border border-[#1a3a5c] rounded p-2">
                      <p className="text-[#334e6b] text-[10px] uppercase tracking-widest">Avg Camera Stress</p>
                      <p className="text-[#f59e0b] text-xs font-bold">
                        {pct(avg(activeAnswerAnalyses.map(item => item.behaviorMetrics?.stressScore)))}
                      </p>
                    </div>
                  </div>
                )}

                {activeTranscript.length > 0 && (
                  <div>
                    <p className="text-[#00d4d4] text-[10px] font-bold tracking-[0.25em] uppercase mb-2">
                      Recording Transcript Evidence
                    </p>
                    <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                      {activeTranscript.map((entry, i) => (
                        <div key={`${entry.timestamp}-${i}`} className={`rounded border px-3 py-2 ${
                          entry.speaker === 'SUBJECT' ? 'border-[#f59e0b]/30 bg-[#1f1709]' : 'border-[#00d4d4]/30 bg-[#061f2a]'
                        }`}>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className={`text-[10px] uppercase tracking-widest font-bold ${
                              entry.speaker === 'SUBJECT' ? 'text-[#f59e0b]' : 'text-[#00d4d4]'
                            }`}>
                              {entry.speaker === 'SUBJECT' ? 'Answer' : 'Question'}
                            </span>
                            <span className="text-[#334e6b] text-[10px]">
                              {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString('en-GB') : ''}
                            </span>
                          </div>
                          <p className="text-slate-200 text-xs leading-relaxed whitespace-pre-wrap">{entry.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {initialFocus === 'recordings' && (
      <section>
        <h3 className="text-[#7a9bbf] text-xs font-bold tracking-[0.3em] uppercase mb-3">
          Recordings Archive for {activeCaseId} ({recordings.length})
        </h3>
        {recordings.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {['camera', 'voice', 'master', 'evidence'].map(key => {
              const meta = modalityMeta[key]
              return (
                <div key={key} className={`rounded border px-3 py-2 ${meta.className}`}>
                  <p className="text-[9px] uppercase tracking-widest">{meta.title}</p>
                  <p className="text-lg font-bold">{recordingCounts[key] || 0}</p>
                </div>
              )
            })}
          </div>
        )}
        {recordings.length === 0 ? (
          <div className="bg-[#0d1a28] border border-[#1a3a5c] rounded p-6 text-center">
            <p className="text-[#334e6b] text-xs italic">No recordings yet.</p>
            <p className="text-[#1e3a5f] text-[10px] mt-1">Recordings are saved automatically when a session ends.</p>
          </div>
        ) : groupedRecordings.map(group => (
          <div key={group.key} className="mb-4">
            <h4 className="text-[#334e6b] text-[10px] tracking-[0.25em] uppercase mb-2">
              {group.meta.title} ({group.items.length})
            </h4>
            {group.items.map(rec => {
              const meta = modalityMeta[normalizeModality(rec)] || modalityMeta.evidence
              return (
                <div key={rec.id} className="fts-card px-4 py-3 flex items-center justify-between gap-3 mb-2 hover:bg-[#162030] transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-white text-sm font-bold tracking-wider">{rec.caseId}</p>
                      <span className={`text-[9px] border rounded px-1.5 py-0.5 uppercase ${meta.className}`}>
                        {normalizeModality(rec)}
                      </span>
                    </div>
                    <p className="text-[#7a9bbf] text-xs font-mono truncate">{rec.filename}</p>
                    {rec.analysisSummary && (
                      <p className="text-slate-400 text-[10px] mt-0.5 truncate">{rec.analysisSummary}</p>
                    )}
                    <p className="text-[#334e6b] text-[10px]">
                      {rec.size > 0 ? `${(rec.size / 1024 / 1024).toFixed(1)} MB - ` : ''}
                      {rec.duration ? `${Math.round(rec.duration)}s - ` : ''}
                      ID-{rec.investigatorId}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1">
                    <p className="text-[#334e6b] text-[10px] font-mono">{new Date(rec.createdAt).toLocaleDateString('en-GB')}</p>
                    <button
                      onClick={() => {
                        setSelectedRecording(rec)
                        setSelected(null)
                        setSeekLabel(null)
                      }}
                      className="text-[#22c55e] text-[10px] hover:underline block w-full text-right"
                    >
                      Play
                    </button>
                    <button
                      onClick={() => authDownload(
                        `${BASE}${streamPath(rec)}`,
                        rec.filename || `recording-${rec.caseId}.webm`,
                        jwtToken
                      )}
                      className="text-[#00d4d4] text-[10px] hover:underline"
                    >
                      Download
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </section>
      )}
      </>
      )}
    </div>
  )
}
