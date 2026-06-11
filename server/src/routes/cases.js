import { Router } from 'express'
import { cases, appendAudit } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/:caseId', (req, res) => {
  const id = req.params.caseId.trim().toUpperCase()
  const c = cases.get(id)
  if (!c) {
    appendAudit('CASE_NOT_FOUND', req.investigator.badgeId, { caseId: id })
    return res.status(404).json({ error: `Case ${id} not found.` })
  }
  appendAudit('CASE_LOOKUP', req.investigator.badgeId, {
    caseId: id,
    detail: `Verified case for ${c.subjectName}`,
  })
  res.json({ case: c })
})

router.get('/', (req, res) => {
  const list = Array.from(cases.values()).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  )
  res.json({ cases: list })
})

router.post('/', (req, res) => {
  const { fullName, caseId, dob, charge, notes } = req.body
  if (!fullName || !caseId || !dob || !charge) {
    return res.status(400).json({ error: 'fullName, caseId, dob, charge are required.' })
  }

  const id = caseId.trim().toUpperCase()
  if (cases.has(id)) {
    return res.status(409).json({ error: `Case ID ${id} already exists.` })
  }

  const newCase = {
    caseId: id,
    subjectName: fullName.trim(),
    dob,
    charge,
    notes: notes || '',
    status: 'Active',
    registeredBy: req.investigator.badgeId,
    createdAt: new Date().toISOString(),
  }

  cases.set(id, newCase)
  appendAudit('REGISTRATION', req.investigator.badgeId, {
    caseId: id,
    subject: fullName.trim(),
    detail: `${charge} - DOB ${dob}`,
  })
  res.status(201).json({ case: newCase })
})

router.patch('/:caseId/status', (req, res) => {
  const id = req.params.caseId.trim().toUpperCase()
  const c = cases.get(id)
  if (!c) return res.status(404).json({ error: 'Case not found.' })
  const { status } = req.body
  if (!['Active', 'Pending', 'Closed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' })
  }
  c.status = status
  cases.set(id, c)
  appendAudit('CASE_STATUS_CHANGE', req.investigator.badgeId, {
    caseId: id,
    detail: `Status -> ${status}`,
  })
  res.json({ case: c })
})

export default router
