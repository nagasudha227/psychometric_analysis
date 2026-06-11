import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { rateLimit } from 'express-rate-limit'

import authRouter         from './routes/auth.js'
import casesRouter        from './routes/cases.js'
import sessionsRouter     from './routes/sessions.js'
import interrogationRouter from './routes/interrogation.js'
import recordingsRouter   from './routes/recordings.js'
import reportsRouter      from './routes/reports.js'
import auditRouter        from './routes/audit.js'
import { attachWebSocket } from './wsHandler.js'

const app  = express()
const PORT = process.env.PORT || 4000

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))

// Rate limiting — stricter on auth
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }))
app.use('/api',      rateLimit({ windowMs: 60 * 1000, max: 300 }))

// ── REST Routes ────────────────────────────────────────────────────────────
app.use('/api/auth',          authRouter)
app.use('/api/cases',         casesRouter)
app.use('/api/sessions',      sessionsRouter)
app.use('/api/interrogation', interrogationRouter)
app.use('/api/recordings',    recordingsRouter)
app.use('/api/reports',       reportsRouter)
app.use('/api/audit',         auditRouter)

// Health check
app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', ts: new Date().toISOString(), service: 'Altheria FTS v3' })
)

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Endpoint not found.' }))

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: err.message || 'Internal server error.' })
})

// ── HTTP + WebSocket Server ────────────────────────────────────────────────
const httpServer = createServer(app)
const wss = new WebSocketServer({ server: httpServer, path: '/ws' })
attachWebSocket(wss)

export function startServer(port = PORT) {
  if (httpServer.listening) return Promise.resolve(httpServer)
  return new Promise(resolve => {
    httpServer.listen(port, () => {
      console.log(`\n🔒 Altheria FTS Server v3`)
      console.log(`   REST  → http://localhost:${port}/api`)
      console.log(`   WS    → ws://localhost:${port}/ws`)
      console.log(`   ENV   → ${process.env.NODE_ENV || 'development'}\n`)
      resolve(httpServer)
    })
  })
}

if (process.env.ALTHERIA_NO_AUTO_START !== '1') {
  startServer()
}

export { app, httpServer, wss }
