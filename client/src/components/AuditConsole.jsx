import { useState, useEffect, useCallback } from 'react'
import { logTypeLabel, logTypeColor, normaliseServerLog } from '../utils/auditLogger'
import { auditAPI } from '../services/api'

/**
 * AuditConsole — Merges client-side action logs with the server audit trail.
 * Polls the server every 10 s when the panel is expanded.
 */
export default function AuditConsole({ logs: clientLogs }) {
  const [serverLogs, setServerLogs] = useState([])
  const [merged,     setMerged]     = useState([])
  const [expanded,   setExpanded]   = useState(true)
  const [source,     setSource]     = useState('all') // all | client | server
  const [lastFetch,  setLastFetch]  = useState(null)

  const fetchServerLogs = useCallback(async () => {
    try {
      const { logs } = await auditAPI.list(80)
      setServerLogs(logs.map(normaliseServerLog))
      setLastFetch(new Date())
    } catch {
      // Server may not be running; silently skip
    }
  }, [])

  // Initial fetch + poll every 10 s while expanded
  useEffect(() => {
    if (!expanded) return
    fetchServerLogs()
    const t = setInterval(fetchServerLogs, 10_000)
    return () => clearInterval(t)
  }, [expanded, fetchServerLogs])

  // Merge + deduplicate by id, sort newest-first
  useEffect(() => {
    const all = [...clientLogs, ...serverLogs]
    const seen = new Set()
    const unique = []
    for (const log of all) {
      if (!seen.has(log.id)) { seen.add(log.id); unique.push(log) }
    }
    unique.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    setMerged(unique)
  }, [clientLogs, serverLogs])

  const displayed = source === 'client'
    ? merged.filter(l => clientLogs.some(c => c.id === l.id))
    : source === 'server'
    ? serverLogs
    : merged

  return (
    <div className="fts-card mt-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1a3a5c]">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse flex-shrink-0" />
          <span className="text-[#00d4d4] text-xs font-bold tracking-[0.25em] uppercase">
            System Audit Console
          </span>
          <span className="text-[#334e6b] text-[10px] font-mono">
            {displayed.length} entries
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Source filter */}
          <div className="flex gap-1">
            {['all','client','server'].map(s => (
              <button key={s} onClick={() => setSource(s)}
                className={`text-[10px] px-2 py-0.5 rounded border tracking-widest uppercase transition-colors
                  ${source === s
                    ? 'border-[#00d4d4]/60 text-[#00d4d4] bg-[#00d4d4]/10'
                    : 'border-[#1a3a5c] text-[#334e6b] hover:text-[#7a9bbf]'
                  }`}>
                {s}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button onClick={fetchServerLogs}
            className="text-[#334e6b] hover:text-[#00d4d4] transition-colors text-xs"
            title="Refresh server logs">
            ↻
          </button>

          {/* Collapse toggle */}
          <button onClick={() => setExpanded(v => !v)}
            className="text-[#334e6b] hover:text-[#7a9bbf] transition-colors text-xs font-mono">
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {expanded && (
        <>
          <div className="font-mono text-xs max-h-52 overflow-y-auto px-4 py-3 space-y-1.5">
            {displayed.length === 0 ? (
              <p className="text-[#334e6b] tracking-widest italic">
                — No activity recorded this session —
              </p>
            ) : displayed.map(log => (
              <div key={log.id} className="flex items-start gap-2 group hover:bg-[#0d1e30]/50 -mx-1 px-1 rounded py-0.5">
                <span className="text-[#334e6b] flex-shrink-0 w-[72px] tabular-nums">
                  {log.displayTime}
                </span>
                <span className={`flex-shrink-0 w-32 font-bold truncate ${logTypeColor(log.type)}`}>
                  {logTypeLabel(log.type)}
                </span>
                <span className="text-[#7a9bbf] flex-shrink-0 w-16 truncate">
                  {log.investigatorId ? `ID-${log.investigatorId}` : '—'}
                </span>
                <span className="text-slate-400 truncate min-w-0">
                  {log.caseId && <span className="text-white mr-1">{log.caseId}</span>}
                  {log.detail || log.subject || ''}
                </span>
              </div>
            ))}
          </div>

          {lastFetch && (
            <div className="border-t border-[#0d1a28] px-4 py-1.5 flex justify-between items-center">
              <span className="text-[#1e3a5f] text-[9px] font-mono tracking-widest">
                SERVER SYNC · {lastFetch.toLocaleTimeString('en-GB')}
              </span>
              <span className="text-[#1e3a5f] text-[9px] font-mono">
                {serverLogs.length} server · {clientLogs.length} client
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
