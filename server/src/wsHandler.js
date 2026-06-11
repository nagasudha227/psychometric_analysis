/**
 * wsHandler.js
 * WebSocket server for real-time streaming of behavioural metrics
 * from the Assessment Enclave (MediaPipe/camera data) to the backend.
 *
 * Message protocol (JSON):
 *   Client → Server:
 *     { type: 'IDENTIFY', sessionId, token }
 *     { type: 'METRIC', metric, value }          — e.g. { metric: 'eyeContact', value: 0.72 }
 *     { type: 'STRESS_EVENT', severity, note }
 *     { type: 'PING' }
 *
 *   Server → Client:
 *     { type: 'IDENTIFIED', sessionId }
 *     { type: 'ACK', entryId }
 *     { type: 'ERROR', message }
 *     { type: 'PONG' }
 */

import jwt from 'jsonwebtoken'
import { sessions, appendAudit } from './db.js'
import { v4 as uuidv4 } from 'uuid'

const JWT_SECRET = process.env.JWT_SECRET || 'altheria-local-dev-secret'

export function attachWebSocket(wss) {
  wss.on('connection', (ws, req) => {
    ws.sessionId = null
    ws.investigatorId = null
    ws.isAlive = true

    ws.on('pong', () => { ws.isAlive = true })

    ws.on('message', raw => {
      let msg
      try { msg = JSON.parse(raw) } catch {
        return send(ws, { type: 'ERROR', message: 'Invalid JSON.' })
      }

      switch (msg.type) {
        case 'IDENTIFY': {
          // Authenticate via JWT token in message
          try {
            const payload = jwt.verify(msg.token, JWT_SECRET)
            const session = sessions.get(msg.sessionId)
            if (!session) return send(ws, { type: 'ERROR', message: 'Session not found.' })
            if (session.status !== 'active') return send(ws, { type: 'ERROR', message: 'Session not active.' })

            ws.sessionId = msg.sessionId
            ws.investigatorId = payload.badgeId
            send(ws, { type: 'IDENTIFIED', sessionId: msg.sessionId })
          } catch {
            send(ws, { type: 'ERROR', message: 'Invalid or expired token.' })
          }
          break
        }

        case 'METRIC': {
          if (!ws.sessionId) return send(ws, { type: 'ERROR', message: 'Not identified.' })
          const session = sessions.get(ws.sessionId)
          if (!session) return send(ws, { type: 'ERROR', message: 'Session not found.' })

          const entry = {
            id: uuidv4(),
            metric: msg.metric,
            value: msg.value,
            timestamp: new Date().toISOString(),
          }
          session.behaviorMetrics.push(entry)
          send(ws, { type: 'ACK', entryId: entry.id })
          break
        }

        case 'STRESS_EVENT': {
          if (!ws.sessionId) return send(ws, { type: 'ERROR', message: 'Not identified.' })
          const session = sessions.get(ws.sessionId)
          if (!session) return send(ws, { type: 'ERROR', message: 'Session not found.' })

          const flag = {
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            severity: msg.severity || 'medium',
            note: msg.note || 'Camera-detected stress event',
            source: 'CAMERA',
            indicators: ['Camera behavioral signal'],
          }
          session.stressFlags.push(flag)
          appendAudit('WS_STRESS_EVENT', ws.investigatorId, {
            caseId: session.caseId,
            detail: `Camera stress event: ${msg.severity}`,
          })
          send(ws, { type: 'ACK', entryId: flag.id })
          break
        }

        case 'PING':
          send(ws, { type: 'PONG' })
          break

        default:
          send(ws, { type: 'ERROR', message: `Unknown message type: ${msg.type}` })
      }
    })

    ws.on('close', () => {
      if (ws.investigatorId) {
        appendAudit('WS_DISCONNECT', ws.investigatorId, {
          detail: `WebSocket disconnected from session ${ws.sessionId}`,
        })
      }
    })
  })

  // Heartbeat: remove dead connections every 30s
  const interval = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) return ws.terminate()
      ws.isAlive = false
      ws.ping()
    })
  }, 30_000)

  wss.on('close', () => clearInterval(interval))
}

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj))
}
