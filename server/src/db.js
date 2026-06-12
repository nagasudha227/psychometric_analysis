/**
 * db.js - local data store with seed data and JSON persistence.
 * The data shape mirrors Firestore-style collections, but it remains simple
 * enough to run as a complete local demo without external services.
 */
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.VERCEL
  ? '/tmp/uploads/data'
  : path.resolve(__dirname, '../../uploads/data')
const DATA_FILE = path.join(DATA_DIR, 'store.json')

fs.mkdirSync(DATA_DIR, { recursive: true })

function readStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return {}
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  } catch (err) {
    console.warn('Failed to read local data store:', err.message)
    return {}
  }
}

const persisted = readStore()

const HASH = await bcrypt.hash('password123', 10)

export const investigators = new Map([
  ['8829', {
    id: '8829',
    badgeId: '8829',
    passwordHash: HASH,
    name: 'Naga Thanisha',
    rank: 'Senior Investigator',
    clearance: 'LEVEL-3',
    createdAt: '2024-01-15T09:00:00Z',
  }],
  ['ADMIN', {
    id: 'ADMIN',
    badgeId: 'ADMIN',
    passwordHash: await bcrypt.hash('admin123', 10),
    name: 'System Administrator',
    rank: 'Chief Analyst',
    clearance: 'LEVEL-5',
    createdAt: '2024-01-01T00:00:00Z',
  }],
])

const seedCases = [
  ['FTS-2024-AA', {
    caseId: 'FTS-2024-AA',
    subjectName: 'Marcus T. Webb',
    dob: '1988-04-12',
    charge: 'Cybercrime',
    notes: 'Suspected financial hacking, multiple offshore accounts flagged.',
    status: 'Closed',
    registeredBy: '8829',
    createdAt: '2024-11-03T14:22:00Z',
  }],
  ['FTS-2024-BC', {
    caseId: 'FTS-2024-BC',
    subjectName: 'Priya Nair',
    dob: '1992-08-30',
    charge: 'Fraud / White-Collar',
    notes: 'Alleged securities fraud, co-conspirators under investigation.',
    status: 'Active',
    registeredBy: '8829',
    createdAt: '2025-01-17T10:05:00Z',
  }],
  ['FTS-2025-C1', {
    caseId: 'FTS-2025-C1',
    subjectName: 'Devon Ashcroft',
    dob: '1979-11-02',
    charge: 'Violent Offense',
    notes: 'Multiple prior charges. High agitation risk.',
    status: 'Active',
    registeredBy: 'ADMIN',
    createdAt: '2025-03-08T08:30:00Z',
  }],
  ['FTS-2025-D4', {
    caseId: 'FTS-2025-D4',
    subjectName: 'Lena Korowski',
    dob: '1995-02-14',
    charge: 'Drug Offense',
    notes: 'Distribution suspected. Cooperative in prior interviews.',
    status: 'Pending',
    registeredBy: 'ADMIN',
    createdAt: '2025-04-21T16:45:00Z',
  }],
  ['FTS-2025-E9', {
    caseId: 'FTS-2025-E9',
    subjectName: 'Omar Said',
    dob: '1983-07-19',
    charge: 'Trafficking',
    notes: 'Cross-border network. Linked to two open Interpol notices.',
    status: 'Active',
    registeredBy: '8829',
    createdAt: '2025-05-01T11:00:00Z',
  }],
]

export const cases = new Map(seedCases)
for (const c of persisted.cases || []) {
  if (c?.caseId) cases.set(c.caseId, c)
}

export const sessions = new Map(
  (persisted.sessions || []).filter(s => s?.sessionId).map(s => [s.sessionId, s])
)

export const recordings = new Map(
  (persisted.recordings || []).filter(r => r?.id).map(r => [r.id, r])
)

export const reports = new Map(
  (persisted.reports || []).filter(r => r?.id).map(r => [r.id, r])
)

export const auditLogs = Array.isArray(persisted.auditLogs)
  ? persisted.auditLogs.slice(0, 500)
  : []

export function persistAll() {
  const payload = {
    cases: Array.from(cases.values()),
    sessions: Array.from(sessions.values()),
    recordings: Array.from(recordings.values()),
    reports: Array.from(reports.values()),
    auditLogs: auditLogs.slice(0, 500),
    updatedAt: new Date().toISOString(),
  }

  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2))
  } catch (err) {
    console.warn('Failed to persist local data store:', err.message)
  }
}

export function appendAudit(type, investigatorId, meta = {}) {
  const entry = {
    id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    type,
    investigatorId,
    timestamp: new Date().toISOString(),
    ...meta,
  }
  auditLogs.unshift(entry)
  if (auditLogs.length > 500) auditLogs.pop()
  persistAll()
  return entry
}
