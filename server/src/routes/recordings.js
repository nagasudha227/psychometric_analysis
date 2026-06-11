import { Router } from 'express'
import Busboy from 'busboy'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import { recordings, sessions, cases, appendAudit, persistAll } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../../..')
const UPLOADS_DIR = path.join(PROJECT_ROOT, 'uploads', 'recordings')
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024
const ALLOWED_MIME = new Set([
  'video/webm',
  'video/mp4',
  'audio/webm',
  'audio/ogg',
  'audio/wav',
  'application/octet-stream',
])
fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const router = Router()
router.use(requireAuth)

router.post('/', async (req, res) => {
  let upload
  try {
    upload = await receiveRecordingUpload(req)
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || 'Recording upload failed.' })
  }

  const { file, fields } = upload
  if (!file) return res.status(400).json({ error: 'No file uploaded.' })

  const { caseId, sessionId, duration, startedAt, modality, label, analysisSummary, metadata } = fields
  if (!caseId) {
    cleanupUpload(file.path)
    return res.status(400).json({ error: 'caseId is required.' })
  }

  const id = caseId.trim().toUpperCase()
  if (!cases.has(id)) {
    cleanupUpload(file.path)
    return res.status(404).json({ error: `Case ${id} not found.` })
  }

  const recId = uuidv4()
  const normalizedModality = normalizeModality(modality || inferModality(file.mimetype))
  const record = {
    id: recId,
    caseId: id,
    sessionId: sessionId || null,
    investigatorId: req.investigator.badgeId,
    filename: file.filename,
    storagePath: path.relative(PROJECT_ROOT, file.path),
    originalName: file.originalName,
    mimetype: file.mimetype || fallbackMime(normalizedModality),
    size: file.size,
    duration: duration ? Number(duration) : null,
    startedAt: startedAt || null,
    modality: normalizedModality,
    label: label || defaultLabel(normalizedModality),
    analysisSummary: analysisSummary || null,
    metadata: parseMetadata(metadata),
    finalizedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    url: `/api/recordings/${recId}/stream`,
  }

  recordings.set(recId, record)
  linkRecordingToSession(record)
  persistAll()

  appendAudit('RECORDING_SAVED', req.investigator.badgeId, {
    caseId: id,
    detail: `${record.modality} recording saved to uploads/recordings/${record.filename} (${(file.size / 1024 / 1024).toFixed(2)} MB)`,
  })

  res.status(201).json({ recording: record })
})

router.get('/', (req, res) => {
  const { caseId } = req.query
  let list = Array.from(recordings.values()).map(withAvailability)
  if (caseId) {
    list = list.filter(r => r.caseId === caseId.trim().toUpperCase())
  }
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  res.json({ recordings: list })
})

router.get('/:id/stream', (req, res) => {
  const rec = recordings.get(req.params.id)
  if (!rec) return res.status(404).json({ error: 'Recording not found.' })

  const filePath = recordingPath(rec)
  if (!fs.existsSync(filePath)) return res.status(410).json({ error: 'File no longer available.' })

  const stat = fs.statSync(filePath)
  const fileSize = stat.size
  const contentType = rec.mimetype || fallbackMime(rec.modality)
  const range = req.headers.range

  if (!fileSize) {
    res.writeHead(200, {
      'Content-Length': 0,
      'Content-Type': contentType,
    })
    return res.end()
  }

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-')
    const start = Math.max(0, parseInt(startStr, 10) || 0)
    const end = Math.min(fileSize - 1, endStr ? parseInt(endStr, 10) : fileSize - 1)
    const chunkSize = end - start + 1

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    })
    fs.createReadStream(filePath, { start, end }).pipe(res)
  } else {
    res.writeHead(200, {
      'Accept-Ranges': 'bytes',
      'Content-Length': fileSize,
      'Content-Type': contentType,
    })
    fs.createReadStream(filePath).pipe(res)
  }
})

router.delete('/:id', (req, res) => {
  const rec = recordings.get(req.params.id)
  if (!rec) return res.status(404).json({ error: 'Recording not found.' })

  cleanupUpload(recordingPath(rec))
  recordings.delete(req.params.id)
  unlinkRecordingFromSession(rec)
  persistAll()

  appendAudit('RECORDING_DELETED', req.investigator.badgeId, {
    caseId: rec.caseId,
    detail: `Recording deleted: ${rec.id}`,
  })
  res.json({ message: 'Recording deleted.' })
})

function recordingPath(rec) {
  if (rec.storagePath) return path.join(PROJECT_ROOT, rec.storagePath)
  return path.join(UPLOADS_DIR, rec.filename)
}

function withAvailability(rec) {
  const filePath = recordingPath(rec)
  return {
    ...rec,
    available: fs.existsSync(filePath),
  }
}

function cleanupUpload(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {}
}

function receiveRecordingUpload(req) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers['content-type'] || '').includes('multipart/form-data')) {
      reject(httpError(415, 'Recording upload must be multipart/form-data.'))
      return
    }

    let parser
    try {
      parser = Busboy({
        headers: req.headers,
        limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 32 },
      })
    } catch (err) {
      reject(httpError(400, err.message))
      return
    }

    const fields = {}
    let fileRecord = null
    let writePromise = Promise.resolve()
    let settled = false

    const fail = err => {
      if (settled) return
      settled = true
      cleanupUpload(fileRecord?.path)
      reject(err)
    }

    parser.on('field', (name, value) => {
      fields[name] = value
    })

    parser.on('file', (name, stream, info) => {
      if (name !== 'file' || fileRecord) {
        stream.resume()
        return
      }

      const mimetype = info.mimeType || info.mimetype || 'application/octet-stream'
      if (!isAllowedMime(mimetype)) {
        stream.resume()
        fail(httpError(415, 'Invalid file type. Only video/audio evidence is accepted.'))
        return
      }

      fs.mkdirSync(UPLOADS_DIR, { recursive: true })
      const originalName = info.filename || `recording${extensionForMime(mimetype)}`
      const filename = `${uuidv4()}${safeExtension(originalName, mimetype)}`
      const filePath = path.join(UPLOADS_DIR, filename)
      const out = fs.createWriteStream(filePath, { flags: 'wx' })

      fileRecord = {
        filename,
        path: filePath,
        originalName,
        mimetype,
        size: 0,
      }

      stream.on('data', chunk => {
        fileRecord.size += chunk.length
      })
      stream.on('limit', () => fail(httpError(413, 'Recording file exceeds the 2 GB archive limit.')))
      stream.on('error', fail)
      out.on('error', fail)
      writePromise = new Promise((resolveWrite, rejectWrite) => {
        out.on('finish', resolveWrite)
        out.on('error', rejectWrite)
      })

      stream.pipe(out)
    })

    parser.on('filesLimit', () => fail(httpError(400, 'Only one recording file may be uploaded at a time.')))
    parser.on('error', fail)
    parser.on('finish', async () => {
      if (settled) return
      try {
        await writePromise
        settled = true
        resolve({ fields, file: fileRecord })
      } catch (err) {
        fail(err)
      }
    })

    req.pipe(parser)
  })
}

function isAllowedMime(mimetype = '') {
  return ALLOWED_MIME.has(mimetype) || mimetype.startsWith('video/') || mimetype.startsWith('audio/')
}

function safeExtension(originalName, mimetype) {
  const ext = path.extname(String(originalName || '')).toLowerCase()
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : extensionForMime(mimetype)
}

function extensionForMime(mimetype = '') {
  if (mimetype.includes('mp4')) return '.mp4'
  if (mimetype.includes('ogg')) return '.ogg'
  if (mimetype.includes('wav')) return '.wav'
  return '.webm'
}

function httpError(statusCode, message) {
  const err = new Error(message)
  err.statusCode = statusCode
  return err
}

function normalizeModality(value = '') {
  const key = String(value || '').trim().toLowerCase()
  return ['master', 'voice', 'camera'].includes(key) ? key : 'evidence'
}

function inferModality(mimetype = '') {
  if (mimetype.startsWith('audio/')) return 'voice'
  if (mimetype.startsWith('video/')) return 'camera'
  return 'evidence'
}

function fallbackMime(modality) {
  return modality === 'voice' ? 'audio/webm' : 'video/webm'
}

function defaultLabel(modality) {
  if (modality === 'master') return 'Master synchronized evidence'
  if (modality === 'voice') return 'Voice-only forensic evidence'
  if (modality === 'camera') return 'Camera-only behavioral evidence'
  return 'Forensic evidence'
}

function linkRecordingToSession(record) {
  if (!record.sessionId) return
  const session = sessions.get(record.sessionId)
  if (!session) return
  session.recordings = session.recordings || []
  session.recordings.push({
    id: record.id,
    modality: record.modality,
    filename: record.filename,
    mimetype: record.mimetype,
    size: record.size,
    duration: record.duration,
    url: record.url,
    analysisSummary: record.analysisSummary,
    finalizedAt: record.finalizedAt,
  })
}

function unlinkRecordingFromSession(record) {
  if (!record.sessionId) return
  const session = sessions.get(record.sessionId)
  if (!session?.recordings) return
  session.recordings = session.recordings.filter(item => item.id !== record.id)
}

function parseMetadata(value) {
  if (!value) return null
  try {
    return typeof value === 'string' ? JSON.parse(value) : value
  } catch {
    return null
  }
}

export default router
