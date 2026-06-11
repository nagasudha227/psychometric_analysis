import { Router } from 'express'
import { sessions, appendAudit, persistAll } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import {
  getNextQuestion,
  getOpeningStatement,
  analyzeResponse,
  normalizeLanguage,
} from '../services/aiInterrogator.js'
import { v4 as uuidv4 } from 'uuid'

const router = Router()
router.use(requireAuth)

/**
 * POST /api/interrogation/:sessionId/open
 * Returns the AI opening statement for the session.
 */
router.post('/:sessionId/open', async (req, res) => {
  const s = sessions.get(req.params.sessionId)
  if (!s) return res.status(404).json({ error: 'Session not found.' })
  if (s.status !== 'active') return res.status(409).json({ error: 'Session is not active.' })

  const language = normalizeLanguage(req.body?.language || s.language || 'en')
  s.language = language

  const opening = await getOpeningStatement({
    charge: s.charge,
    subjectName: s.subjectName,
    language,
  })
  const entry = {
    id: uuidv4(),
    speaker: 'INTERROGATOR',
    text: opening,
    stressFlag: false,
    language,
    timestamp: new Date().toISOString(),
  }
  s.transcript.push(entry)
  sessions.set(s.sessionId, s)
  appendAudit('TRANSCRIPT_ENTRY', req.investigator.badgeId, {
    caseId: s.caseId,
    detail: `Opening prompt generated in ${language}`,
  })
  persistAll()
  res.json({ entry })
})

/**
 * POST /api/interrogation/:sessionId/respond
 * Subject submits a response; AI analyzes it and returns the next question.
 * Body: { text: string }
 *
 * FIX: When question bank is exhausted, sets sessionExhausted=true in the
 *      response so the client can auto-end the session cleanly.
 */
router.post('/:sessionId/respond', async (req, res) => {
  const s = sessions.get(req.params.sessionId)
  if (!s) return res.status(404).json({ error: 'Session not found.' })
  if (s.status !== 'active') return res.status(409).json({ error: 'Session is not active.' })

  const { text, voiceMetrics = null, behaviorMetrics = null, answerStartedAt = null, answerEndedAt = null } = req.body
  if (!text?.trim()) return res.status(400).json({ error: 'text is required.' })
  const language = normalizeLanguage(req.body?.language || s.language || 'en')
  s.language = language

  // 1. Analyze the response for stress indicators
  const analysis = analyzeResponse(text, language, { voiceMetrics, behaviorMetrics })

  // 2. Store the subject's entry
  const subjectEntry = {
    id: uuidv4(),
    speaker: 'SUBJECT',
    text: text.trim(),
    stressFlag: analysis.stressFlag,
    stressSeverity: analysis.severity,
    stressIndicators: analysis.indicators,
    analysis,
    voiceMetrics,
    behaviorMetrics,
    answerStartedAt,
    answerEndedAt,
    language,
    timestamp: new Date().toISOString(),
  }
  s.transcript.push(subjectEntry)

  if (voiceMetrics) {
    s.voiceMetrics = s.voiceMetrics || []
    s.voiceMetrics.push({
      id: uuidv4(),
      transcriptId: subjectEntry.id,
      timestamp: subjectEntry.timestamp,
      answerStartedAt,
      answerEndedAt,
      ...voiceMetrics,
    })
  }

  if (behaviorMetrics) {
    s.behaviorMetrics = s.behaviorMetrics || []
    s.behaviorMetrics.push({
      id: uuidv4(),
      transcriptId: subjectEntry.id,
      timestamp: subjectEntry.timestamp,
      answerStartedAt,
      answerEndedAt,
      ...behaviorMetrics,
    })
  }

  if (analysis.stressFlag) {
    s.stressFlags.push({
      transcriptId: subjectEntry.id,
      timestamp: subjectEntry.timestamp,
      severity: analysis.severity,
      indicators: analysis.indicators,
      forensicScore: analysis.forensicScore,
      sentiment: analysis.sentiment?.label,
      note: text.slice(0, 100),
    })
  }

  // 3. Get AI next question — may return null when bank is exhausted
  const nextQ = await getNextQuestion({
    charge: s.charge,
    subjectName: s.subjectName,
    transcript: s.transcript,
    lastResponse: text,
    language,
  })

  // FIX: null means all questions asked → signal client to end session
  if (nextQ === null) {
    appendAudit('TRANSCRIPT_ENTRY', req.investigator.badgeId, {
      caseId: s.caseId,
      detail: `[EXHAUSTED] All questions complete — session should end`,
    })
    persistAll()
    return res.json({
      subjectEntry,
      interrogatorEntry: null,
      analysis,
      sessionExhausted: true,  // ← key signal to frontend
    })
  }

  const interrogatorEntry = {
    id: uuidv4(),
    speaker: 'INTERROGATOR',
    text: nextQ,
    stressFlag: false,
    language,
    timestamp: new Date().toISOString(),
  }
  s.transcript.push(interrogatorEntry)

  appendAudit('TRANSCRIPT_ENTRY', req.investigator.badgeId, {
    caseId: s.caseId,
    detail: `${analysis.stressFlag ? '[STRESS FLAG] ' : ''}Response logged`,
  })
  persistAll()

  res.json({
    subjectEntry,
    interrogatorEntry,
    analysis,
    sessionExhausted: false,
  })
})

/**
 * GET /api/interrogation/:sessionId/transcript
 */
router.get('/:sessionId/transcript', (req, res) => {
  const s = sessions.get(req.params.sessionId)
  if (!s) return res.status(404).json({ error: 'Session not found.' })
  res.json({ transcript: s.transcript, stressFlags: s.stressFlags, status: s.status })
})

export default router
