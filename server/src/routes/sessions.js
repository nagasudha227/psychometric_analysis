import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { sessions, cases, appendAudit, persistAll } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

// POST /api/sessions — start a new assessment session
router.post('/', (req, res) => {
  const { caseId } = req.body
  if (!caseId) return res.status(400).json({ error: 'caseId is required.' })

  const id = caseId.trim().toUpperCase()
  const c = cases.get(id)
  if (!c) return res.status(404).json({ error: `Case ${id} not found.` })

  const sessionId = uuidv4()
  const session = {
    sessionId,
    caseId: id,
    investigatorId: req.investigator.badgeId,
    charge: c.charge,
    subjectName: c.subjectName,
    startedAt: new Date().toISOString(),
    endedAt: null,
    transcript: [],        // { speaker, text, timestamp, stressFlag }
    behaviorMetrics: [],   // { timestamp, metric, value }
    voiceMetrics: [],      // { timestamp, transcriptId, stressScore, sentiment }
    recordings: [],        // finalized master/voice/camera evidence records
    stressFlags: [],       // { timestamp, severity, note }
    status: 'active',
  }
  sessions.set(sessionId, session)

  appendAudit('SESSION_START', req.investigator.badgeId, {
    caseId: id,
    detail: `Assessment session started: ${sessionId}`,
  })

  res.status(201).json({ session })
})

// GET /api/sessions/:sessionId
router.get('/:sessionId', (req, res) => {
  const s = sessions.get(req.params.sessionId)
  if (!s) return res.status(404).json({ error: 'Session not found.' })
  res.json({ session: s })
})

// POST /api/sessions/:sessionId/transcript — append a transcript entry
router.post('/:sessionId/transcript', (req, res) => {
  const s = sessions.get(req.params.sessionId)
  if (!s) return res.status(404).json({ error: 'Session not found.' })
  if (s.status !== 'active') return res.status(409).json({ error: 'Session is not active.' })

  const { speaker, text, stressFlag } = req.body
  const entry = {
    id: uuidv4(),
    speaker: speaker || 'SYSTEM',
    text: text || '',
    stressFlag: stressFlag || false,
    timestamp: new Date().toISOString(),
  }
  s.transcript.push(entry)
  if (stressFlag) {
    s.stressFlags.push({
      transcriptId: entry.id,
      timestamp: entry.timestamp,
      severity: req.body.severity || 'medium',
      note: text?.slice(0, 80),
    })
  }
  persistAll()
  res.json({ entry })
})

// POST /api/sessions/:sessionId/metrics — append a behavior metric
router.post('/:sessionId/metrics', (req, res) => {
  const s = sessions.get(req.params.sessionId)
  if (!s) return res.status(404).json({ error: 'Session not found.' })

  const { metric, value } = req.body
  const entry = { id: uuidv4(), metric, value, timestamp: new Date().toISOString() }
  s.behaviorMetrics.push(entry)
  persistAll()
  res.json({ entry })
})

// POST /api/sessions/:sessionId/end — finalize the session
router.post('/:sessionId/end', (req, res) => {
  const s = sessions.get(req.params.sessionId)
  if (!s) return res.status(404).json({ error: 'Session not found.' })
  s.endedAt = new Date().toISOString()
  s.status = 'completed'

  appendAudit('SESSION_END', req.investigator.badgeId, {
    caseId: s.caseId,
    detail: `Session ended. ${s.transcript.length} turns, ${s.stressFlags.length} flags.`,
  })
  persistAll()

  res.json({ session: s })
})

export default router
