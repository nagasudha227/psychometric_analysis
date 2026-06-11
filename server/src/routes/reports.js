import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { reports, sessions, cases, recordings, appendAudit, persistAll } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { generateReport } from '../services/pdfReportService.js'
import { v4 as uuidv4 } from 'uuid'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPORTS_DIR = path.resolve(__dirname, '../../../uploads/reports')

const router = Router()
router.use(requireAuth)

/**
 * POST /api/reports/generate
 * Synthesize a PDF report from a completed session.
 * Body: { sessionId }
 */
router.post('/generate', async (req, res) => {
  const { sessionId } = req.body
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required.' })

  const session = sessions.get(sessionId)
  if (!session) return res.status(404).json({ error: 'Session not found.' })
  if (session.status !== 'completed') {
    return res.status(409).json({ error: 'Session must be completed before generating a report. Call /sessions/:id/end first.' })
  }

  const caseData = cases.get(session.caseId)
  if (!caseData) return res.status(404).json({ error: 'Case data not found.' })

  try {
    const sessionRecordings = Array.from(recordings.values()).filter(r => r.sessionId === sessionId)
    const { filename, filePath } = await generateReport(session, caseData, sessionRecordings)

    const reportId = uuidv4()
    const report = {
      id: reportId,
      caseId: session.caseId,
      sessionId,
      investigatorId: req.investigator.badgeId,
      subjectName: caseData.subjectName,
      charge: caseData.charge,
      filename,
      filePath,
      stressFlags: session.stressFlags,
      transcriptLength: session.transcript.length,
      recordingCount: sessionRecordings.length,
      riskLevel: computeRisk(session.stressFlags),
      createdAt: new Date().toISOString(),
      downloadUrl: `/api/reports/${reportId}/download`,
    }

    reports.set(reportId, report)

    appendAudit('REPORT_GENERATED', req.investigator.badgeId, {
      caseId: session.caseId,
      detail: `PDF report generated: ${filename}`,
    })
    persistAll()

    // Return report metadata (not the file itself)
    res.status(201).json({ report: sanitize(report) })
  } catch (err) {
    console.error('Report generation error:', err)
    res.status(500).json({ error: 'Failed to generate report: ' + err.message })
  }
})

/**
 * GET /api/reports?caseId=FTS-XXXX-XX
 * List all reports, optionally filtered by caseId.
 */
router.get('/', (req, res) => {
  let list = Array.from(reports.values())
  if (req.query.caseId) {
    list = list.filter(r => r.caseId === req.query.caseId.trim().toUpperCase())
  }
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  res.json({ reports: list.map(sanitize) })
})

/**
 * GET /api/reports/:id/download
 * Stream the PDF file directly for download.
 */
router.get('/:id/download', (req, res) => {
  const report = reports.get(req.params.id)
  if (!report) return res.status(404).json({ error: 'Report not found.' })

  const filePath = report.filePath || path.join(REPORTS_DIR, report.filename)
  if (!fs.existsSync(filePath)) {
    return res.status(410).json({ error: 'Report file no longer available on disk.' })
  }

  appendAudit('REPORT_DOWNLOADED', req.investigator.badgeId, {
    caseId: report.caseId,
    detail: `Report downloaded: ${report.filename}`,
  })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`)
  fs.createReadStream(filePath).pipe(res)
})

/**
 * GET /api/reports/:id
 * Get report metadata (stress flags, transcript length, etc.)
 */
router.get('/:id', (req, res) => {
  const report = reports.get(req.params.id)
  if (!report) return res.status(404).json({ error: 'Report not found.' })
  res.json({ report: sanitize(report) })
})

// ── Helpers ────────────────────────────────────────────────────────────────
function computeRisk(stressFlags) {
  const high = stressFlags.filter(f => f.severity === 'high').length
  const med  = stressFlags.filter(f => f.severity === 'medium').length
  if (high >= 3 || (high >= 1 && med >= 2)) return 'HIGH'
  if (high >= 1 || med >= 3) return 'MEDIUM'
  return 'LOW'
}

function sanitize(r) {
  const { filePath, ...rest } = r
  return rest
}

export default router
