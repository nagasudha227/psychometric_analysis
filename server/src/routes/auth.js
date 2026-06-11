import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { investigators, appendAudit } from '../db.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'altheria-local-dev-secret'

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { badgeId, passcode } = req.body
    if (!badgeId || !passcode) {
      return res.status(400).json({ error: 'badgeId and passcode are required.' })
    }

    const id = badgeId.trim().toUpperCase()
    const investigator = investigators.get(id)

    if (!investigator) {
      // Don't reveal whether badge exists
      appendAudit('AUTH_FAILED', id, { detail: 'Badge ID not found', ip: req.ip })
      return res.status(401).json({ error: 'Invalid credentials.' })
    }

    const valid = await bcrypt.compare(passcode, investigator.passwordHash)
    if (!valid) {
      appendAudit('AUTH_FAILED', id, { detail: 'Wrong passcode', ip: req.ip })
      return res.status(401).json({ error: 'Invalid credentials.' })
    }

    const token = jwt.sign(
      {
        badgeId: investigator.badgeId,
        name: investigator.name,
        rank: investigator.rank,
        clearance: investigator.clearance,
      },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    )

    appendAudit('AUTH_SUCCESS', id, { detail: 'Gateway authenticated', ip: req.ip })

    res.json({
      token,
      investigator: {
        badgeId: investigator.badgeId,
        name: investigator.name,
        rank: investigator.rank,
        clearance: investigator.clearance,
      },
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Internal server error.' })
  }
})

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  // JWT is stateless; client drops the token.
  // We log the intent server-side.
  const auth = req.headers.authorization
  if (auth) {
    try {
      const payload = jwt.decode(auth.slice(7))
      if (payload?.badgeId) {
        appendAudit('LOGOUT', payload.badgeId, { detail: 'Session terminated' })
      }
    } catch {}
  }
  res.json({ message: 'Logged out.' })
})

export default router
