/**
 * auditLogger.js — Client-side log entry factory.
 * Also used to label/color entries that arrive from the server audit API.
 */

export const LOG_TYPES = {
  AUTH_SUCCESS:       'AUTH_SUCCESS',
  AUTH_FAILED:        'AUTH_FAILED',
  CASE_LOOKUP:        'CASE_LOOKUP',
  CASE_NOT_FOUND:     'CASE_NOT_FOUND',
  CASE_STATUS_CHANGE: 'CASE_STATUS_CHANGE',
  REGISTRATION:       'REGISTRATION',
  SESSION_START:      'SESSION_START',
  SESSION_END:        'SESSION_END',
  TRANSCRIPT_ENTRY:   'TRANSCRIPT_ENTRY',
  RECORDING_SAVED:    'RECORDING_SAVED',
  RECORDING_DELETED:  'RECORDING_DELETED',
  REPORT_GENERATED:   'REPORT_GENERATED',
  REPORT_DOWNLOADED:  'REPORT_DOWNLOADED',
  WS_STRESS_EVENT:    'WS_STRESS_EVENT',
  WS_DISCONNECT:      'WS_DISCONNECT',
  LOGOUT:             'LOGOUT',
}

export function createLogEntry(type, investigatorId, meta = {}) {
  const now = new Date()
  return {
    id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    type,
    investigatorId,
    timestamp: now.toISOString(),
    displayTime: now.toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }),
    displayDate: now.toLocaleDateString('en-GB'),
    ...meta,
  }
}

export function logTypeLabel(type) {
  const labels = {
    AUTH_SUCCESS:       '✓ AUTH',
    AUTH_FAILED:        '✗ AUTH FAIL',
    CASE_LOOKUP:        '⌕ LOOKUP',
    CASE_NOT_FOUND:     '✗ NOT FOUND',
    CASE_STATUS_CHANGE: '↺ STATUS',
    REGISTRATION:       '✦ REGISTERED',
    SESSION_START:      '▶ SESSION',
    SESSION_END:        '■ ENDED',
    TRANSCRIPT_ENTRY:   '❝ TRANSCRIPT',
    RECORDING_SAVED:    '⏺ RECORDING',
    RECORDING_DELETED:  '⌫ REC DEL',
    REPORT_GENERATED:   '⬡ REPORT',
    REPORT_DOWNLOADED:  '↓ DOWNLOAD',
    WS_STRESS_EVENT:    '⚑ STRESS',
    WS_DISCONNECT:      '⊘ WS DROP',
    LOGOUT:             '⏻ LOGOUT',
  }
  return labels[type] ?? type
}

export function logTypeColor(type) {
  const colors = {
    AUTH_SUCCESS:       'text-[#22c55e]',
    AUTH_FAILED:        'text-[#ef4444]',
    CASE_LOOKUP:        'text-[#00d4d4]',
    CASE_NOT_FOUND:     'text-[#f59e0b]',
    CASE_STATUS_CHANGE: 'text-[#7a9bbf]',
    REGISTRATION:       'text-[#a78bfa]',
    SESSION_START:      'text-[#22c55e]',
    SESSION_END:        'text-slate-400',
    TRANSCRIPT_ENTRY:   'text-[#7a9bbf]',
    RECORDING_SAVED:    'text-[#00d4d4]',
    RECORDING_DELETED:  'text-[#ef4444]',
    REPORT_GENERATED:   'text-[#a78bfa]',
    REPORT_DOWNLOADED:  'text-[#22c55e]',
    WS_STRESS_EVENT:    'text-[#f59e0b]',
    WS_DISCONNECT:      'text-[#ef4444]',
    LOGOUT:             'text-[#ef4444]',
  }
  return colors[type] ?? 'text-slate-400'
}

/** Normalise a server-side log entry so client components can render it */
export function normaliseServerLog(log) {
  const d = new Date(log.timestamp)
  return {
    ...log,
    displayTime: d.toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }),
    displayDate: d.toLocaleDateString('en-GB'),
  }
}
