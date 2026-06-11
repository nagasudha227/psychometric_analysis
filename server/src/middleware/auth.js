import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'altheria-local-dev-secret'

export function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header.' })
  }
  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.investigator = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Token expired or invalid.' })
  }
}

export function requireClearance(level) {
  return (req, res, next) => {
    const userLevel = parseInt(req.investigator?.clearance?.replace('LEVEL-', '') ?? '0')
    if (userLevel < level) {
      return res.status(403).json({ error: `Clearance LEVEL-${level} required.` })
    }
    next()
  }
}
