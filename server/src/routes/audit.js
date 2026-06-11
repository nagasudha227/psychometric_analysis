import { Router } from 'express'
import { auditLogs } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

/**
 * GET /api/audit
 * Returns the server-side audit log (newest first).
 * Optional query: ?limit=50&investigatorId=8829
 */
router.get('/', (req, res) => {
  let list = [...auditLogs]
  if (req.query.investigatorId) {
    list = list.filter(l => l.investigatorId === req.query.investigatorId)
  }
  const limit = Math.min(parseInt(req.query.limit || '100'), 500)
  res.json({ logs: list.slice(0, limit), total: auditLogs.length })
})

export default router
