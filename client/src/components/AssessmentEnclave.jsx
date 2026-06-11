import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { interrogationAPI, recordingsAPI, reportsAPI, sessionsAPI } from '../services/api'
import { LOG_TYPES } from '../utils/auditLogger'

const SILENCE_MS = 5000
const MAX_QUESTIONS = 8
const RECORDER_TIMESLICE_MS = 1000

const LANGUAGES = {
  en: {
    label: 'English',
    api: 'en',
    stt: 'en-IN',
    startText: 'Assessment is ready. Answer after each question. Five seconds of silence will submit your answer.',
  },
  hi: {
    label: 'Hindi',
    api: 'hi',
    stt: 'hi-IN',
    startText: 'मूल्यांकन तैयार है। हर सवाल के बाद जवाब दें। पांच सेकंड की चुप्पी के बाद आपका जवाब जमा हो जाएगा।',
  },
  kn: {
    label: 'Kannada',
    api: 'kn',
    stt: 'kn-IN',
    startText: 'ಮೌಲ್ಯಮಾಪನ ಸಿದ್ಧವಾಗಿದೆ. ಪ್ರತಿಯೊಂದು ಪ್ರಶ್ನೆಯ ನಂತರ ಉತ್ತರಿಸಿ. ಐದು ಸೆಕೆಂಡ್ ಮೌನದ ನಂತರ ಉತ್ತರ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಸಲ್ಲಿಸಲಾಗುತ್ತದೆ.',
  },
}
function getInitialLanguageKey() {
  const fromUrl = new URLSearchParams(window.location.search).get('lang')?.toLowerCase()
  const fromStorage = window.localStorage?.getItem?.('assessmentLanguage')?.toLowerCase()
  const nav = navigator.language?.toLowerCase() || ''
  const browserPrimary = nav.startsWith('hi') ? 'hi' : nav.startsWith('kn') ? 'kn' : 'en'
  return LANGUAGES[fromUrl] ? fromUrl : LANGUAGES[fromStorage] ? fromStorage : browserPrimary
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function average(values) {
  const clean = values.filter(Number.isFinite)
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0
}

function percent(value) {
  return `${Math.round(clamp01(value) * 100)}%`
}

function dominant(values) {
  const counts = new Map()
  values.filter(Boolean).forEach(value => counts.set(value, (counts.get(value) || 0) + 1))
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
}

function fmtDuration(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function chooseSupportedMime(candidates) {
  if (!window.MediaRecorder?.isTypeSupported) return ''
  return candidates.find(type => window.MediaRecorder.isTypeSupported(type)) || ''
}

function extensionForMime(mimeType = '') {
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'webm'
}

function mediaErrorMessage(err) {
  if (['NotAllowedError', 'SecurityError', 'PermissionDeniedError'].includes(err?.name)) {
    return 'Camera/microphone permission is blocked. Click the browser address-bar permission icon and allow camera and microphone access.'
  }
  if (['NotReadableError', 'TrackStartError'].includes(err?.name)) {
    return 'Camera was found but could not start. Close WhatsApp, Camera, Teams, Zoom, or any app using the webcam, then click Retry Camera.'
  }
  if (['NotFoundError', 'DevicesNotFoundError'].includes(err?.name)) {
    return 'No camera device was found by this browser. Check Windows camera privacy settings and webcam driver status.'
  }
  if (['OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(err?.name)) {
    return 'The camera rejected the requested resolution. The app will retry with a simpler camera mode.'
  }
  return `Media unavailable: ${err?.message || err?.name || 'device request failed'}`
}

function cameraErrorDetails(err) {
  if (!err) return ''
  const name = err.name || 'UnknownError'
  const message = err.message || 'No browser message provided'
  return `${name}: ${message}`
}

function waitForVideoFrames(track, timeoutMs = 3500) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 48
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    let settled = false
    let frameChecks = 0
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Camera opened but did not produce video frames. Try another detected camera.'))
    }, timeoutMs)

    const cleanup = () => {
      clearTimeout(timer)
      video.onloadedmetadata = null
      video.onplaying = null
      video.onerror = null
      video.pause()
      video.srcObject = null
    }

    const finish = (fn, value) => {
      if (settled) return
      settled = true
      cleanup()
      fn(value)
    }

    video.muted = true
    video.playsInline = true
    video.srcObject = new MediaStream([track])
    video.onplaying = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        const checkFrame = () => {
          if (settled) return
          frameChecks += 1
          const quality = inspectVideoFrame(video, canvas, ctx)
          if (quality.valid) {
            finish(resolve, { width: video.videoWidth, height: video.videoHeight, ...quality })
            return
          }
          if (frameChecks >= 8) {
            finish(reject, new Error(`Camera opened but produced unusable frames: ${quality.reason}`))
            return
          }
          setTimeout(checkFrame, 180)
        }
        checkFrame()
      }
    }
    video.onloadedmetadata = () => video.play().catch(err => {
      finish(reject, err)
    })
    video.onerror = () => {
      finish(reject, new Error('Camera preview failed to start.'))
    }
  })
}

function inspectVideoFrame(video, canvas, ctx) {
  if (!ctx) return { valid: true, reason: 'frame context unavailable' }
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let sumR = 0
    let sumG = 0
    let sumB = 0
    let minLum = 255
    let maxLum = 0
    let changed = 0
    let prevLum = null
    const pixels = data.length / 4

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const lum = (r + g + b) / 3
      sumR += r
      sumG += g
      sumB += b
      minLum = Math.min(minLum, lum)
      maxLum = Math.max(maxLum, lum)
      if (prevLum != null && Math.abs(lum - prevLum) > 6) changed += 1
      prevLum = lum
    }

    const avgR = sumR / pixels
    const avgG = sumG / pixels
    const avgB = sumB / pixels
    const contrast = maxLum - minLum
    const variation = changed / pixels
    const solidOrange = avgR > 190 && avgG > 80 && avgG < 180 && avgB < 80 && contrast < 18
    const tooFlat = contrast < 10 && variation < 0.03
    const tooDark = avgR < 8 && avgG < 8 && avgB < 8

    if (solidOrange) return { valid: false, reason: 'solid orange privacy/virtual-camera frame' }
    if (tooDark) return { valid: false, reason: 'black camera frame' }
    if (tooFlat) return { valid: false, reason: 'flat single-color camera frame' }
    return { valid: true, contrast, variation }
  } catch (err) {
    return { valid: false, reason: err.message || 'frame inspection failed' }
  }
}

function evidenceLabel(status) {
  return {
    idle: 'ARMING',
    requesting: 'REQUESTING',
    recording: 'RECORDING',
    included: 'INCLUDED',
    saved: 'SAVED',
    error: 'ERROR',
    unavailable: 'UNAVAILABLE',
  }[status] || 'ARMING'
}

function useTTS(languageRef) {
  const voicesRef = useRef([])

  useEffect(() => {
    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis?.getVoices?.() || []
    }
    loadVoices()
    window.speechSynthesis?.addEventListener?.('voiceschanged', loadVoices)
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', loadVoices)
  }, [])

  const cancel = useCallback(() => {
    window.speechSynthesis?.cancel?.()
  }, [])

  const speakAsync = useCallback((text, enabled = true) => {
    if (!enabled || !text?.trim() || !window.speechSynthesis) return Promise.resolve()

    return new Promise(resolve => {
      window.speechSynthesis.cancel()
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text)
        const langCode = languageRef.current?.stt || 'en-IN'
        const primary = langCode.split('-')[0].toLowerCase()
        const voices = voicesRef.current
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          resolve()
        }

        utterance.lang = langCode
        utterance.rate = primary === 'hi' ? 0.92 : 0.96
        utterance.pitch = 0.95
        utterance.voice =
          voices.find(v => v.lang?.toLowerCase() === langCode.toLowerCase()) ||
          voices.find(v => v.lang?.toLowerCase().startsWith(`${primary}-`)) ||
          (primary === 'en' ? voices.find(v => v.lang?.toLowerCase().startsWith('en')) : null)
        utterance.onend = finish
        utterance.onerror = finish

        const estimatedMs = Math.min(45000, Math.max(5000, text.length * (primary === 'hi' ? 95 : 70)))
        setTimeout(finish, estimatedMs)
        window.speechSynthesis.speak(utterance)
      }, 120)
    })
  }, [languageRef])

  return { speakAsync, cancel }
}

function summarizeVoice(samples, startedAt, endedAt) {
  const scoped = samples.filter(s => s.timestamp >= startedAt && s.timestamp <= endedAt)
  const levels = scoped.map(s => s.level)
  const avgLevel = average(levels)
  const peakLevel = Math.max(0, ...levels)
  const variability = average(levels.map(level => Math.abs(level - avgLevel)))
  const stressScore = clamp01(peakLevel * 0.45 + variability * 2.4 + (avgLevel > 0.18 ? 0.2 : 0))
  return {
    sampleCount: scoped.length,
    averageLevel: avgLevel,
    peakLevel,
    variability,
    stressScore,
    strainScore: stressScore,
    sentiment: stressScore > 0.65 ? 'strained' : stressScore > 0.35 ? 'alert' : 'steady',
  }
}

function summarizeBehavior(samples, startedAt, endedAt) {
  const scoped = samples.filter(s => s.timestamp >= startedAt && s.timestamp <= endedAt)
  const summary = {
    eyeContact: average(scoped.map(s => s.eyeContact)) || 0.5,
    microExpressions: average(scoped.map(s => s.microExpressions)) || 0.2,
    headMovement: average(scoped.map(s => s.headMovement)) || 0.1,
    blinkRate: average(scoped.map(s => s.blinkRate)) || 0.3,
    faceTurn: average(scoped.map(s => s.faceTurn)) || 0.1,
  }
  summary.stressScore = clamp01(
    summary.microExpressions * 0.35 +
    summary.headMovement * 0.25 +
    summary.faceTurn * 0.2 +
    summary.blinkRate * 0.1 +
    (1 - summary.eyeContact) * 0.1
  )
  summary.agitationScore = summary.stressScore
  return summary
}

function summarizeCameraTimeline(samples) {
  const clean = samples.filter(Boolean)
  if (!clean.length) {
    return {
      sampleCount: 0,
      eyeContact: 0,
      headMovement: 0,
      faceTurn: 0,
      microExpressions: 0,
      blinkRate: 0,
      stressScore: 0,
      peakStress: 0,
    }
  }

  const stressValues = clean.map(sample => (
    sample.stressScore ??
    clamp01(
      sample.microExpressions * 0.35 +
      sample.headMovement * 0.25 +
      sample.faceTurn * 0.2 +
      sample.blinkRate * 0.1 +
      (1 - sample.eyeContact) * 0.1
    )
  ))

  return {
    sampleCount: clean.length,
    eyeContact: average(clean.map(sample => sample.eyeContact)),
    headMovement: average(clean.map(sample => sample.headMovement)),
    faceTurn: average(clean.map(sample => sample.faceTurn)),
    microExpressions: average(clean.map(sample => sample.microExpressions)),
    blinkRate: average(clean.map(sample => sample.blinkRate)),
    stressScore: average(stressValues),
    agitationScore: average(stressValues),
    peakStress: Math.max(0, ...stressValues),
  }
}

function MetricBar({ label, value }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] tracking-widest uppercase text-[#7a9bbf] mb-1">
        <span>{label}</span>
        <span>{percent(value)}</span>
      </div>
      <div className="h-2 bg-[#0a0d14] border border-[#1a3a5c] rounded overflow-hidden">
        <div className="h-full bg-[#00d4d4]" style={{ width: percent(value) }} />
      </div>
    </div>
  )
}

function CameraFeed({ stream, mediaError, cameraDiagnostics, selectedCameraId, onSelectCamera, onRetryCamera, retryingCamera }) {
  const videoRef = useRef(null)
  const liveVideoTracks = stream?.getVideoTracks?.().filter(track => track.readyState === 'live') || []

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (liveVideoTracks.length) {
      const previewStream = new MediaStream(liveVideoTracks)
      video.srcObject = previewStream
      video.onloadedmetadata = () => video.play().catch(() => {})
      video.play().catch(() => {})
    } else {
      video.pause()
      video.srcObject = null
    }

    return () => {
      video.onloadedmetadata = null
    }
  }, [stream, liveVideoTracks.length])

  return (
    <div className="aspect-video bg-black border border-[#1a3a5c] rounded overflow-hidden flex items-center justify-center">
      {liveVideoTracks.length ? (
        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
      ) : (
        <div className="px-5 text-center space-y-3">
          <p className="text-[#7a9bbf] text-xs tracking-widest uppercase">
            {mediaError || 'Camera unavailable. Voice assessment can continue.'}
          </p>
          {cameraDiagnostics && (
            <div className="text-[10px] text-left bg-[#0a0d14] border border-[#1a3a5c] rounded p-2 space-y-1">
              <p className="text-[#f59e0b] uppercase tracking-widest">Camera Diagnostic</p>
              <p className="text-slate-400">Secure page: {cameraDiagnostics.secureContext ? 'yes' : 'no'}</p>
              <p className="text-slate-400">Permission: {cameraDiagnostics.permission || 'unknown'}</p>
              <p className="text-slate-400">Detected cameras: {cameraDiagnostics.deviceCount ?? 0}</p>
              {cameraDiagnostics.activeTrack && <p className="text-slate-400">Track: {cameraDiagnostics.activeTrack}</p>}
              {cameraDiagnostics.lastError && <p className="text-red-300 break-words">{cameraDiagnostics.lastError}</p>}
              {cameraDiagnostics.attempts?.length > 0 && (
                <div className="max-h-24 overflow-y-auto border-t border-[#1a3a5c] pt-1 mt-1">
                  {cameraDiagnostics.attempts.slice(-5).map((item, index) => (
                    <p key={`${item.label}-${index}`} className={item.ok ? 'text-[#22c55e]' : 'text-slate-500'}>
                      {item.ok ? 'OK' : 'FAIL'} - {item.label}{item.error ? `: ${item.error}` : ''}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          {cameraDiagnostics?.devices?.length > 0 && (
            <select
              value={selectedCameraId}
              onChange={event => onSelectCamera(event.target.value)}
              className="w-full bg-[#0a0d14] border border-[#1a3a5c] rounded px-3 py-2 text-xs text-slate-200"
            >
              <option value="">Auto camera</option>
              {cameraDiagnostics.devices.map((device, index) => (
                <option key={device.deviceId || index} value={device.deviceId}>
                  {device.label || `Camera ${index + 1}`}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={onRetryCamera}
            disabled={retryingCamera}
            className="px-4 py-2 rounded border border-[#00d4d4]/50 text-[#00d4d4] text-[10px] tracking-widest uppercase hover:bg-[#00d4d4]/10 disabled:opacity-60"
          >
            {retryingCamera ? 'Requesting Camera' : 'Retry Camera'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function AssessmentEnclave() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { addLog } = useApp()

  const [session, setSession] = useState(null)
  const [transcript, setTranscript] = useState([])
  const [stressFlags, setStressFlags] = useState([])
  const [metrics, setMetrics] = useState({ eyeContact: 0.5, microExpressions: 0.2, headMovement: 0.1, blinkRate: 0.3, faceTurn: 0.1 })
  const [phase, setPhase] = useState('loading')
  const [turnState, setTurnState] = useState('loading')
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [langKey, setLangKey] = useState(getInitialLanguageKey)
  const [error, setError] = useState('')
  const [mediaError, setMediaError] = useState('')
  const [mediaStream, setMediaStream] = useState(null)
  const [listening, setListening] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [recognitionError, setRecognitionError] = useState('')
  const [answerText, setAnswerText] = useState('')
  const [questionCount, setQuestionCount] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [reportId, setReportId] = useState(null)
  const [sessionEnding, setSessionEnding] = useState(false)
  const [voiceSummary, setVoiceSummary] = useState(null)
  const [behaviorSummary, setBehaviorSummary] = useState(null)
  const [evidenceStatus, setEvidenceStatus] = useState({ master: 'idle', voice: 'idle', camera: 'idle' })
  const [sidePanelsVisible, setSidePanelsVisible] = useState(false)
  const [retryingCamera, setRetryingCamera] = useState(false)
  const [cameraDiagnostics, setCameraDiagnostics] = useState(null)
  const [selectedCameraId, setSelectedCameraId] = useState('')

  const language = LANGUAGES[langKey] || LANGUAGES.en
  const languageRef = useRef(language)
  const ttsEnabledRef = useRef(ttsEnabled)
  const sessionRef = useRef(null)
  const streamRef = useRef(null)
  const openingStartedRef = useRef(false)
  const recognitionRef = useRef(null)
  const shouldListenRef = useRef(false)
  const processingAnswerRef = useRef(false)
  const finalTextRef = useRef('')
  const latestHeardTextRef = useRef('')
  const silenceTimerRef = useRef(null)
  const answerStartedAtRef = useRef(null)
  const transcriptEndRef = useRef(null)
  const startTimeRef = useRef(null)
  const recordersRef = useRef({})
  const recorderStopResolversRef = useRef({})
  const recorderStreamsRef = useRef({})
  const suppressRecorderUploadRef = useRef({})
  const chunksRef = useRef({ master: [], voice: [], camera: [] })
  const mimeRef = useRef({ master: 'video/webm', voice: 'audio/webm', camera: 'video/webm' })
  const voiceSamplesRef = useRef([])
  const behaviorSamplesRef = useRef([])
  const transcriptRef = useRef([])
  const stressFlagsRef = useRef([])
  const answerAnalysesRef = useRef([])
  const analyzerCleanupRef = useRef([])
  const selectedCameraIdRef = useRef('')
  const cleanupRef = useRef(() => {})

  const { speakAsync, cancel: cancelTTS } = useTTS(languageRef)

  const speakQuestionThenListen = useCallback(async text => {
    setTurnState('speaking')
    await speakAsync(text, ttsEnabledRef.current)
    setTurnState('listening')
    setTimeout(() => startRecognizerRef.current?.(), 350)
  }, [speakAsync])

  const stopRecognizer = useCallback(() => {
    shouldListenRef.current = false
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    silenceTimerRef.current = null
    try { recognitionRef.current?.abort?.() } catch {}
    recognitionRef.current = null
    setListening(false)
  }, [])

  const stopAllMedia = useCallback(() => {
    analyzerCleanupRef.current.forEach(cleanup => cleanup?.())
    analyzerCleanupRef.current = []
    streamRef.current?.getTracks?.().forEach(track => track.stop())
    Object.values(recorderStreamsRef.current).forEach(stream => stream?.getTracks?.().forEach(track => track.stop()))
  }, [])

  const uploadRecording = useCallback(async (kind, blob, mimeType) => {
    const activeSession = sessionRef.current
    if (!activeSession || !blob.size) return

    try {
      const duration = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : undefined
      const latestVoice = answerAnalysesRef.current.at(-1)?.voiceMetrics
      const latestBehavior = answerAnalysesRef.current.at(-1)?.behaviorMetrics
      const cameraTimeline = summarizeCameraTimeline(behaviorSamplesRef.current)
      const transcriptSnapshot = transcriptRef.current.map(entry => ({
        speaker: entry.speaker,
        text: entry.text,
        language: entry.language,
        timestamp: entry.timestamp,
        stressFlag: entry.stressFlag,
      }))
      const questionEvidence = transcriptSnapshot
        .filter(entry => entry.speaker === 'INTERROGATOR')
        .map((entry, index) => ({
          index: index + 1,
          text: entry.text,
          language: entry.language || languageRef.current.api,
          timestamp: entry.timestamp,
          note: 'Question was spoken by browser text-to-speech and preserved as transcript evidence.',
        }))
      const voiceStates = answerAnalysesRef.current.map(item => item.voiceMetrics?.sentiment).filter(Boolean)
      const dominantVoiceState = dominant(voiceStates) || latestVoice?.sentiment || 'unavailable'
      const avgVoiceStress = average(answerAnalysesRef.current.map(item => Number(item.voiceMetrics?.stressScore)))
      const avgBehaviorStress = average(answerAnalysesRef.current.map(item => Number(item.behaviorMetrics?.stressScore)))
      const analysisSummary = [
        `${transcriptSnapshot.filter(entry => entry.speaker === 'INTERROGATOR').length} questions`,
        `${transcriptSnapshot.filter(entry => entry.speaker === 'SUBJECT').length} answers`,
        `voice state: ${dominantVoiceState}`,
        `avg voice stress: ${percent(avgVoiceStress)}`,
        `avg camera stress: ${percent(avgBehaviorStress || cameraTimeline.stressScore)}`,
        `camera samples: ${cameraTimeline.sampleCount}`,
      ].join(' | ')

      await recordingsAPI.upload(blob, activeSession.caseId, activeSession.sessionId, duration, activeSession.startedAt, {
        modality: kind,
        label: `${kind[0].toUpperCase()}${kind.slice(1)} assessment evidence`,
        fileName: `${kind}-${activeSession.caseId}-${Date.now()}.${extensionForMime(mimeType)}`,
        analysisSummary,
        details: {
          language: languageRef.current.api,
          transcript: transcriptSnapshot,
          questionEvidence,
          stressFlags: stressFlagsRef.current,
          answerAnalyses: answerAnalysesRef.current,
          cameraTimeline,
          latestVoice,
          latestBehavior,
          recordingNote: 'Browser SpeechSynthesis prompt audio cannot be directly mixed into MediaRecorder by standard browser APIs. Hindi and English question text is preserved here as synchronized transcript evidence and included in the report.',
        },
      })
      setEvidenceStatus(prev => ({ ...prev, [kind]: 'saved' }))
      addLog(LOG_TYPES.RECORDING_SAVED, { caseId: activeSession.caseId, detail: `${kind} evidence saved` })
    } catch (err) {
      setEvidenceStatus(prev => ({ ...prev, [kind]: 'error' }))
      console.error(`Failed to upload ${kind} recording`, err)
    }
  }, [addLog])

  const stopRecorders = useCallback(() => {
    const stopPromises = Object.entries(recordersRef.current).map(([kind, recorder]) => {
      if (recorder?.state !== 'inactive') {
        return new Promise(resolve => {
          recorderStopResolversRef.current[kind] = resolve
          try {
            recorder.stop()
          } catch {
            resolve()
          }
        })
      }

      if (chunksRef.current[kind]?.length) {
        const blob = new Blob(chunksRef.current[kind] || [], { type: mimeRef.current[kind] })
        return uploadRecording(kind, blob, mimeRef.current[kind])
      }

      return Promise.resolve()
    })
    return Promise.allSettled(stopPromises)
  }, [uploadRecording])

  const finishSession = useCallback(async () => {
    if (sessionEnding) return
    setSessionEnding(true)
    setTurnState('ending')
    stopRecognizer()
    cancelTTS()

    try {
      await stopRecorders()
      stopAllMedia()
      const { session: ended } = await sessionsAPI.end(sessionId)
      setSession(ended)
      setTranscript(ended.transcript || [])
      setStressFlags(ended.stressFlags || [])
      addLog(LOG_TYPES.SESSION_END, { caseId: ended.caseId, detail: 'Assessment session ended' })
      try {
        const report = await reportsAPI.generate(sessionId)
        setReportId(report.report?.reportId || report.reportId || null)
      } catch (reportErr) {
        console.warn('Report generation failed', reportErr)
      }
      setPhase('completed')
    } catch (err) {
      setError(`Could not end session: ${err.message}`)
      setPhase('active')
    } finally {
      setSessionEnding(false)
    }
  }, [addLog, cancelTTS, sessionEnding, sessionId, stopAllMedia, stopRecognizer, stopRecorders])

  const appendTranscript = useCallback((subjectEntry, interrogatorEntry) => {
    setTranscript(prev => {
      const next = [
      ...prev,
      ...(subjectEntry ? [subjectEntry] : []),
      ...(interrogatorEntry ? [interrogatorEntry] : []),
      ]
      transcriptRef.current = next
      return next
    })
  }, [])

  const submitAnswer = useCallback(async rawText => {
    const text = rawText.trim()
    if (!text || processingAnswerRef.current) return

    processingAnswerRef.current = true
    stopRecognizer()
    setTurnState('analyzing')
    setAnswerText(text)
    setInterimText('')

    const endedAt = Date.now()
    const startedAt = answerStartedAtRef.current || endedAt
      const voiceMetrics = summarizeVoice(voiceSamplesRef.current, startedAt, endedAt)
      const behaviorMetrics = summarizeBehavior(behaviorSamplesRef.current, startedAt, endedAt)
      setVoiceSummary(voiceMetrics)
      setBehaviorSummary(behaviorMetrics)

    try {
      const response = await interrogationAPI.respond(sessionId, text, languageRef.current.api, {
        voiceMetrics,
        behaviorMetrics,
        answerStartedAt: new Date(startedAt).toISOString(),
        answerEndedAt: new Date(endedAt).toISOString(),
      })

      appendTranscript(response.subjectEntry, response.interrogatorEntry)
      answerAnalysesRef.current.push({
        answer: text,
        language: languageRef.current.api,
        voiceMetrics,
        behaviorMetrics,
        analysis: response.analysis,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
      })
      if (response.analysis?.stressFlag) {
        setStressFlags(prev => [...prev, {
          transcriptId: response.subjectEntry?.id,
          timestamp: response.subjectEntry?.timestamp,
          severity: response.analysis?.severity,
          indicators: response.analysis?.indicators || [],
        }])
      }
      addLog(LOG_TYPES.TRANSCRIPT_ENTRY, { caseId: sessionRef.current?.caseId, detail: 'Voice answer captured and submitted' })

      if (response.sessionExhausted || !response.interrogatorEntry || questionCount >= MAX_QUESTIONS) {
        await finishSession()
        return
      }

      setQuestionCount(count => count + 1)
      await speakQuestionThenListen(response.interrogatorEntry.text)
    } catch (err) {
      setError(`Could not submit answer: ${err.message}`)
      setTurnState('listening')
      setTimeout(() => startRecognizerRef.current?.(), 600)
    } finally {
      processingAnswerRef.current = false
    }
  }, [addLog, appendTranscript, finishSession, questionCount, sessionId, speakQuestionThenListen, stopRecognizer])

  const scheduleSilenceSubmit = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    silenceTimerRef.current = setTimeout(() => {
      const text = (finalTextRef.current || latestHeardTextRef.current).trim()
      if (text) submitAnswer(text)
    }, SILENCE_MS)
  }, [submitAnswer])

  const startRecognizerRef = useRef(null)
  const startRecognizer = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setRecognitionError('This browser does not support SpeechRecognition. Use Chrome or Edge for hands-free assessment.')
      setTurnState('speech-unavailable')
      return
    }

    if (processingAnswerRef.current) return
    try { recognitionRef.current?.abort?.() } catch {}

    finalTextRef.current = ''
    latestHeardTextRef.current = ''
    answerStartedAtRef.current = null
    setInterimText('')
    setAnswerText('')
    setRecognitionError('')

    const recognition = new SpeechRecognition()
    recognition.lang = languageRef.current.stt
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      shouldListenRef.current = true
      setListening(true)
      setTurnState('listening')
    }

    recognition.onresult = event => {
      let interim = ''
      let changed = false

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i][0]?.transcript || ''
        if (!piece.trim()) continue
        changed = true
        if (event.results[i].isFinal) {
          finalTextRef.current = `${finalTextRef.current} ${piece}`.trim()
        } else {
          interim += piece
        }
      }

      const combined = `${finalTextRef.current} ${interim}`.trim()
      if (combined) {
        latestHeardTextRef.current = combined
        if (!answerStartedAtRef.current) answerStartedAtRef.current = Date.now()
        setInterimText(combined)
      }
      if (changed) scheduleSilenceSubmit()
    }

    recognition.onerror = event => {
      if (event.error === 'no-speech') return
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setRecognitionError('Microphone permission was denied for speech recognition.')
        shouldListenRef.current = false
      } else {
        setRecognitionError(`Speech recognition error: ${event.error}`)
      }
    }

    recognition.onend = () => {
      setListening(false)
      if (processingAnswerRef.current) return
      if ((finalTextRef.current || latestHeardTextRef.current).trim()) {
        scheduleSilenceSubmit()
      } else if (shouldListenRef.current) {
        setTimeout(() => {
          if (shouldListenRef.current && !processingAnswerRef.current) {
            try { recognition.start() } catch {}
          }
        }, 400)
      }
    }

    recognitionRef.current = recognition
    shouldListenRef.current = true
    try {
      recognition.start()
    } catch (err) {
      setRecognitionError(err.message || 'Speech recognition could not start.')
    }
  }, [scheduleSilenceSubmit])
  startRecognizerRef.current = startRecognizer

  const startRecorder = useCallback((kind, tracks, preferredMimes) => {
    if (!tracks.length || !window.MediaRecorder) {
      setEvidenceStatus(prev => ({ ...prev, [kind]: 'unavailable' }))
      return
    }

    const stream = new MediaStream(tracks.map(track => track.clone()))
    const mimeType = chooseSupportedMime(preferredMimes)
    mimeRef.current[kind] = mimeType || (kind === 'voice' ? 'audio/webm' : 'video/webm')
    chunksRef.current[kind] = []

    try {
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderStreamsRef.current[kind] = stream
      recorder.ondataavailable = event => {
        if (event.data?.size) chunksRef.current[kind].push(event.data)
      }
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current[kind], { type: mimeRef.current[kind] })
        try {
          if (!blob.size) {
            setEvidenceStatus(prev => ({ ...prev, [kind]: 'unavailable' }))
            return
          }
          if (!suppressRecorderUploadRef.current[kind]) {
            await uploadRecording(kind, blob, mimeRef.current[kind])
          }
        } finally {
          suppressRecorderUploadRef.current[kind] = false
          stream.getTracks().forEach(track => track.stop())
          recorderStopResolversRef.current[kind]?.()
          delete recorderStopResolversRef.current[kind]
        }
      }
      recorder.onerror = () => setEvidenceStatus(prev => ({ ...prev, [kind]: 'error' }))
      recorder.start(RECORDER_TIMESLICE_MS)
      recordersRef.current[kind] = recorder
      setEvidenceStatus(prev => ({ ...prev, [kind]: 'recording' }))
    } catch (err) {
      stream.getTracks().forEach(track => track.stop())
      setEvidenceStatus(prev => ({ ...prev, [kind]: 'error' }))
      console.error(`Failed to start ${kind} recorder`, err)
    }
  }, [uploadRecording])

  const readCameraDiagnostics = useCallback(async extra => {
    const diagnostics = {
      secureContext: window.isSecureContext,
      permission: 'unknown',
      deviceCount: 0,
      devices: [],
      activeTrack: null,
      lastError: '',
      attempts: [],
      ...(extra || {}),
    }

    try {
      if (navigator.permissions?.query) {
        const permission = await navigator.permissions.query({ name: 'camera' })
        diagnostics.permission = permission?.state || 'unknown'
      }
    } catch {
      diagnostics.permission = 'unsupported'
    }

    try {
      const devices = await navigator.mediaDevices?.enumerateDevices?.()
      const cameras = (devices || []).filter(device => device.kind === 'videoinput')
      diagnostics.deviceCount = cameras.length
      diagnostics.devices = cameras.map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${index + 1}`,
      }))
    } catch {}

    setCameraDiagnostics(diagnostics)
    return diagnostics
  }, [])

  const requestCameraTrack = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not expose camera APIs.')
    }

    const diagnostics = await readCameraDiagnostics({ lastError: '' })
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [])
    const cameras = devices.filter(device => device.kind === 'videoinput')
    const chosenDevice = selectedCameraIdRef.current
    const selected = chosenDevice ? cameras.filter(device => device.deviceId === chosenDevice) : []
    const orderedCameras = [...selected, ...cameras.filter(device => device.deviceId !== chosenDevice)]
    const orderedDeviceAttempts = orderedCameras.flatMap((device, index) => {
      const name = device.label || `Camera ${index + 1}`
      return [
        {
          label: `${name} low resolution`,
          constraints: { deviceId: { exact: device.deviceId }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } },
        },
        {
          label: `${name} default`,
          constraints: { deviceId: { exact: device.deviceId } },
        },
      ]
    })
    const attempts = [
      ...orderedDeviceAttempts,
      {
        label: 'Browser default low resolution',
        constraints: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } },
      },
      {
        label: 'Browser default safe mode',
        constraints: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 24 } },
      },
      { label: 'Browser default camera', constraints: true },
    ]

    let lastError = null
    const attemptLog = []
    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index]
      let cameraStream = null
      try {
        setCameraDiagnostics(prev => ({
          ...(prev || diagnostics),
          attempts: attemptLog,
          lastError: `Testing ${attempt.label}...`,
        }))
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: attempt.constraints, audio: false })
        const track = cameraStream.getVideoTracks()[0]
        if (track && track.readyState === 'live') {
          track.enabled = true
          const settings = track.getSettings?.() || {}
          const frameInfo = await waitForVideoFrames(track)
          const label = track.label || settings.deviceId || `camera attempt ${index + 1}`
          track.addEventListener?.('ended', () => {
            setMediaError('Camera stopped during assessment. Click Retry Camera to reconnect.')
            setEvidenceStatus(prev => ({ ...prev, camera: 'unavailable' }))
            setCameraDiagnostics(prev => ({ ...(prev || diagnostics), activeTrack: null, lastError: 'Camera track ended during assessment.' }))
          })
          setCameraDiagnostics(prev => ({
            ...(prev || diagnostics),
            attempts: [...attemptLog, { label: attempt.label, ok: true }],
            activeTrack: `${label} (${frameInfo.width}x${frameInfo.height}, contrast ${Math.round(frameInfo.contrast || 0)})`,
            lastError: '',
          }))
          return { stream: cameraStream, track }
        }
        attemptLog.push({ label: attempt.label, ok: false, error: 'No live video track returned' })
        cameraStream.getTracks().forEach(item => item.stop())
      } catch (err) {
        cameraStream?.getTracks?.().forEach(item => item.stop())
        attemptLog.push({ label: attempt.label, ok: false, error: err.name || err.message || 'failed' })
        setCameraDiagnostics(prev => ({
          ...(prev || diagnostics),
          attempts: attemptLog,
          lastError: `${attempt.label} failed: ${cameraErrorDetails(err)}`,
        }))
        lastError = err
      }
    }
    const detail = cameraErrorDetails(lastError)
    await readCameraDiagnostics({ lastError: detail || 'Camera track unavailable after all retry modes.' })
    throw lastError || new Error('Camera track unavailable')
  }, [readCameraDiagnostics])

  const requestAudioStream = useCallback(() => navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  }), [])

  const startAnalyzers = useCallback(stream => {
    const audioTrack = stream.getAudioTracks()[0]
    if (audioTrack && window.AudioContext) {
      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]))
      const analyser = audioContext.createAnalyser()
      const data = new Uint8Array(analyser.fftSize)
      source.connect(analyser)
      let frame = 0
      let stopped = false

      const tick = () => {
        if (stopped) return
        analyser.getByteTimeDomainData(data)
        const level = Math.sqrt(average(Array.from(data, value => ((value - 128) / 128) ** 2)))
        voiceSamplesRef.current.push({ timestamp: Date.now(), level: clamp01(level * 3) })
        if (voiceSamplesRef.current.length > 1200) voiceSamplesRef.current.shift()
        frame = requestAnimationFrame(tick)
      }
      tick()
      analyzerCleanupRef.current.push(() => {
        stopped = true
        cancelAnimationFrame(frame)
        audioContext.close().catch(() => {})
      })
    }

    const videoTrack = stream.getVideoTracks()[0]
    let video = null
    let canvas = null
    let ctx = null
    let previousFrame = null
    let faceDetector = null
    if (videoTrack) {
      video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.srcObject = new MediaStream([videoTrack])
      video.play().catch(() => {})
      canvas = document.createElement('canvas')
      canvas.width = 80
      canvas.height = 60
      ctx = canvas.getContext('2d', { willReadFrequently: true })
      if ('FaceDetector' in window) {
        try {
          faceDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 })
        } catch {
          faceDetector = null
        }
      }
    }

    const behaviorTimer = setInterval(async () => {
      const previous = behaviorSamplesRef.current.at(-1) || { eyeContact: 0.5, microExpressions: 0.2, headMovement: 0.1, blinkRate: 0.3, faceTurn: 0.1 }
      let cameraSample = null

      if (video && ctx && video.readyState >= 2) {
        let faceTurn = previous.faceTurn || 0.1
        if (faceDetector) {
          try {
            const faces = await faceDetector.detect(video)
            const face = faces?.[0]?.boundingBox
            if (face) {
              const centerX = face.x + face.width / 2
              faceTurn = clamp01(Math.abs(centerX / video.videoWidth - 0.5) * 2)
            }
          } catch {}
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        let brightness = 0
        let leftBrightness = 0
        let rightBrightness = 0
        let motion = 0
        const pixels = frame.length / 4

        for (let i = 0; i < frame.length; i += 4) {
          const pixelIndex = i / 4
          const x = pixelIndex % canvas.width
          const lum = (frame[i] + frame[i + 1] + frame[i + 2]) / 3
          brightness += lum
          if (x < canvas.width / 2) leftBrightness += lum
          else rightBrightness += lum
          if (previousFrame) motion += Math.abs(lum - previousFrame[pixelIndex])
        }

        brightness /= pixels * 255
        const balance = Math.abs(leftBrightness - rightBrightness) / Math.max(1, leftBrightness + rightBrightness)
        const motionScore = previousFrame ? clamp01(motion / pixels / 45) : previous.headMovement
        previousFrame = new Float32Array(pixels)
        for (let i = 0; i < frame.length; i += 4) {
          previousFrame[i / 4] = (frame[i] + frame[i + 1] + frame[i + 2]) / 3
        }

        cameraSample = {
          eyeContact: clamp01(0.75 - balance * 1.2 - faceTurn * 0.45 - Math.abs(brightness - 0.5) * 0.25),
          microExpressions: clamp01(motionScore * 0.65 + balance * 0.25 + faceTurn * 0.1),
          headMovement: clamp01(motionScore * 0.65 + balance * 0.2 + faceTurn * 0.25),
          blinkRate: clamp01(previous.blinkRate * 0.6 + motionScore * 0.4),
          faceTurn,
        }
      }

      const sample = {
        timestamp: Date.now(),
        eyeContact: cameraSample?.eyeContact ?? clamp01(previous.eyeContact + (Math.random() - 0.5) * 0.04),
        microExpressions: cameraSample?.microExpressions ?? clamp01(previous.microExpressions + (Math.random() - 0.45) * 0.04),
        headMovement: cameraSample?.headMovement ?? clamp01(previous.headMovement + (Math.random() - 0.5) * 0.04),
        blinkRate: cameraSample?.blinkRate ?? clamp01(previous.blinkRate + (Math.random() - 0.5) * 0.03),
        faceTurn: cameraSample?.faceTurn ?? clamp01((previous.faceTurn || 0.1) + (Math.random() - 0.5) * 0.03),
      }
      sample.stressScore = clamp01(
        sample.microExpressions * 0.35 +
        sample.headMovement * 0.25 +
        sample.faceTurn * 0.2 +
        sample.blinkRate * 0.1 +
        (1 - sample.eyeContact) * 0.1
      )
      sample.agitationScore = sample.stressScore
      behaviorSamplesRef.current.push(sample)
      if (behaviorSamplesRef.current.length > 1200) behaviorSamplesRef.current.shift()
      setMetrics(sample)
    }, 1000)
    analyzerCleanupRef.current.push(() => {
      clearInterval(behaviorTimer)
      if (video) {
        video.pause()
        video.srcObject = null
      }
    })
  }, [])

  const replaceActiveAnalyzers = useCallback(stream => {
    analyzerCleanupRef.current.forEach(cleanup => cleanup?.())
    analyzerCleanupRef.current = []
    startAnalyzers(stream)
  }, [startAnalyzers])

  const retryCamera = useCallback(async () => {
    if (retryingCamera) return
    setRetryingCamera(true)
    setEvidenceStatus(prev => ({ ...prev, camera: 'requesting' }))

    try {
      const { track } = await requestCameraTrack()
      const current = streamRef.current
      const audioTracks = current?.getAudioTracks?.() || []
      const nextStream = new MediaStream([...audioTracks, track])
      current?.getVideoTracks?.().forEach(item => item.stop())
      streamRef.current = nextStream
      setMediaStream(nextStream)
      setMediaError('')
      replaceActiveAnalyzers(nextStream)

      const currentMaster = recordersRef.current.master
      if (currentMaster?.state === 'recording') {
        suppressRecorderUploadRef.current.master = true
        await new Promise(resolve => {
          recorderStopResolversRef.current.master = resolve
          try {
            currentMaster.stop()
          } catch {
            resolve()
          }
        })
      }

      const currentCamera = recordersRef.current.camera
      if (currentCamera?.state === 'recording') {
        suppressRecorderUploadRef.current.camera = true
        await new Promise(resolve => {
          recorderStopResolversRef.current.camera = resolve
          try {
            currentCamera.stop()
          } catch {
            resolve()
          }
        })
      }

      startRecorder('master', [...audioTracks, track], ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
      startRecorder('camera', [track], ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'])
      addLog(LOG_TYPES.RECORDING_SAVED, { caseId: sessionRef.current?.caseId, detail: 'Camera capture enabled' })
    } catch (err) {
      setMediaError(`Camera unavailable. ${mediaErrorMessage(err)}`)
      setCameraDiagnostics(prev => ({ ...(prev || {}), lastError: cameraErrorDetails(err) }))
      setEvidenceStatus(prev => ({ ...prev, camera: 'unavailable' }))
    } finally {
      setRetryingCamera(false)
    }
  }, [addLog, replaceActiveAnalyzers, requestCameraTrack, retryingCamera, startRecorder])

  const handleSelectCamera = useCallback(value => {
    selectedCameraIdRef.current = value
    setSelectedCameraId(value)
    setCameraDiagnostics(prev => ({ ...(prev || {}), lastError: value ? 'Camera selected. Click Retry Camera to test this device.' : 'Auto camera selected. Click Retry Camera.' }))
  }, [])

  const startMediaPipeline = useCallback(async () => {
    setEvidenceStatus({ master: 'requesting', voice: 'requesting', camera: 'requesting' })
    try {
      const audioStream = await requestAudioStream()
      const audioTracks = audioStream.getAudioTracks()
      let cameraTrack = null
      try {
        const cameraResult = await requestCameraTrack()
        cameraTrack = cameraResult.track
        setMediaError('')
      } catch (cameraErr) {
        setMediaError(`Camera unavailable. ${mediaErrorMessage(cameraErr)}`)
        setCameraDiagnostics(prev => ({ ...(prev || {}), lastError: cameraErrorDetails(cameraErr) }))
      }

      const stream = new MediaStream([...audioTracks, ...(cameraTrack ? [cameraTrack] : [])])
      streamRef.current = stream
      setMediaStream(stream)
      startTimeRef.current = Date.now()
      startAnalyzers(stream)

      const videoTracks = stream.getVideoTracks()
      startRecorder('voice', audioTracks, ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'])
      startRecorder('master', [...audioTracks, ...videoTracks], ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
      startRecorder('camera', videoTracks, ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'])
      setEvidenceStatus(prev => ({
        ...prev,
        voice: audioTracks.length ? 'recording' : 'unavailable',
        camera: videoTracks.length ? 'recording' : 'unavailable',
      }))
      if (videoTracks.length) setMediaError('')
      return stream
    } catch (err) {
      setMediaError(mediaErrorMessage(err))
      setEvidenceStatus({ master: 'unavailable', voice: 'unavailable', camera: 'unavailable' })
      throw err
    }
  }, [requestAudioStream, requestCameraTrack, startAnalyzers, startRecorder])

  useEffect(() => {
    languageRef.current = language
    window.localStorage?.setItem?.('assessmentLanguage', langKey)
  }, [language])

  useEffect(() => {
    selectedCameraIdRef.current = selectedCameraId
  }, [selectedCameraId])

  useEffect(() => {
    ttsEnabledRef.current = ttsEnabled
  }, [ttsEnabled])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    transcriptRef.current = transcript
  }, [transcript])

  useEffect(() => {
    stressFlagsRef.current = stressFlags
  }, [stressFlags])

  useEffect(() => {
    cleanupRef.current = () => {
      stopRecognizer()
      cancelTTS()
      stopRecorders()
      stopAllMedia()
    }
  }, [cancelTTS, stopAllMedia, stopRecognizer, stopRecorders])

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [transcript, interimText])

  useEffect(() => {
    const timer = setInterval(() => {
      if (startTimeRef.current) setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        setPhase('loading')
        const { session: loaded } = await sessionsAPI.get(sessionId)
        if (cancelled) return
        setSession(loaded)
        setTranscript(loaded.transcript || [])
        setStressFlags(loaded.stressFlags || [])
        setQuestionCount((loaded.transcript || []).filter(entry => entry.speaker === 'INTERROGATOR').length)
        setPhase(loaded.status === 'active' ? 'active' : 'completed')
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setPhase('error')
        }
      }
    }

    boot()
    return () => { cancelled = true }
  }, [sessionId])

  useEffect(() => {
    if (phase !== 'active' || openingStartedRef.current) return
    openingStartedRef.current = true

    async function openAssessment() {
      try {
        setTurnState('arming')
        await startMediaPipeline()
        const currentTranscript = sessionRef.current?.transcript || transcript
        if (!currentTranscript.length) {
          setTurnState('speaking')
          await speakAsync(languageRef.current.startText, ttsEnabledRef.current)
          const { entry } = await interrogationAPI.open(sessionId, languageRef.current.api)
          setTranscript([entry])
          setQuestionCount(1)
          await speakQuestionThenListen(entry.text)
          return
        }
        setTimeout(() => startRecognizer(), 300)
      } catch (err) {
        setError(mediaErrorMessage(err))
        setTurnState('media-error')
      }
    }

    openAssessment()
  }, [phase, sessionId, speakAsync, speakQuestionThenListen, startMediaPipeline, startRecognizer, transcript])

  useEffect(() => {
    return () => cleanupRef.current()
  }, [])

  const statusText = useMemo(() => ({
    loading: 'Loading session',
    arming: 'Requesting microphone',
    speaking: 'Question speaking',
    listening: listening ? 'Listening for answer' : 'Preparing listener',
    analyzing: 'Submitting answer',
    ending: 'Finalizing session',
    'media-error': 'Microphone unavailable',
    'speech-unavailable': 'Speech recognition unavailable',
  }[turnState] || turnState), [listening, turnState])

  const assessmentGridClass = sidePanelsVisible
    ? 'flex-1 grid grid-cols-1 lg:grid-cols-[minmax(320px,420px)_1fr_minmax(280px,360px)] gap-4 p-4'
    : 'flex-1 grid grid-cols-1 gap-4 p-4'

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-[#0a0d14] flex items-center justify-center">
        <p className="text-[#00d4d4] tracking-[0.25em] uppercase text-sm">Initializing assessment...</p>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-[#0a0d14] flex items-center justify-center px-4">
        <div className="fts-card max-w-lg p-8 text-center">
          <h1 className="text-red-400 font-bold tracking-widest uppercase mb-3">Assessment Error</h1>
          <p className="text-slate-300 text-sm mb-6">{error}</p>
          <button className="fts-btn-secondary" onClick={() => navigate('/hub')}>Command Hub</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0d14] flex flex-col">
      <header className="border-b border-[#1a3a5c] bg-[#0a0d14]/95 sticky top-0 z-20">
        <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => navigate('/hub')} className="text-[#7a9bbf] hover:text-[#00d4d4] text-xs tracking-widest uppercase font-bold">
            Back
          </button>
          <div className="text-center">
            <p className="text-[#00d4d4] text-xs tracking-[0.3em] uppercase font-bold">Assessment Enclave</p>
            <p className="text-[#334e6b] text-[10px] tracking-widest uppercase">{session?.caseId} - {fmtDuration(elapsed)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidePanelsVisible(value => !value)}
              className="px-3 py-1.5 rounded border border-[#1a3a5c] text-[#7a9bbf] hover:text-[#00d4d4] hover:border-[#00d4d4]/60 text-[10px] tracking-widest uppercase"
            >
              {sidePanelsVisible ? 'Hide Panels' : 'Show Panels'}
            </button>
            {Object.entries(LANGUAGES).map(([key, item]) => (
              <button
                key={key}
                disabled={questionCount > 0}
                onClick={() => setLangKey(key)}
                className={`px-3 py-1.5 rounded border text-[10px] tracking-widest uppercase ${
                  langKey === key ? 'border-[#00d4d4] text-[#00d4d4]' : 'border-[#1a3a5c] text-[#7a9bbf]'
                } disabled:opacity-60`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className={assessmentGridClass}>
        {sidePanelsVisible && (
        <section className="space-y-4">
            <CameraFeed
              stream={mediaStream}
              mediaError={mediaError}
              cameraDiagnostics={cameraDiagnostics}
              selectedCameraId={selectedCameraId}
              onSelectCamera={handleSelectCamera}
              onRetryCamera={retryCamera}
              retryingCamera={retryingCamera}
            />
            <div className="fts-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="fts-label mb-0">Voice State</span>
                <span className={`text-xs tracking-widest uppercase ${listening ? 'text-[#22c55e]' : 'text-[#f59e0b]'}`}>
                  {statusText}
                </span>
              </div>
              <div className="h-3 bg-[#0a0d14] border border-[#1a3a5c] rounded overflow-hidden">
                <div className={`h-full ${listening ? 'bg-[#22c55e] animate-pulse' : 'bg-[#00d4d4]'}`} style={{ width: listening ? '100%' : '42%' }} />
              </div>
              <p className="text-[#7a9bbf] text-xs leading-relaxed">
                Answers are submitted automatically after {SILENCE_MS / 1000} seconds of silence.
              </p>
              {recognitionError && <p className="text-amber-400 text-xs">{recognitionError}</p>}
              {error && <p className="text-red-400 text-xs">{error}</p>}
            </div>

            <div className="fts-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="fts-label mb-0">Speech Output</span>
                <button onClick={() => setTtsEnabled(v => !v)} className="text-[#00d4d4] text-xs tracking-widest uppercase">
                  {ttsEnabled ? 'TTS On' : 'TTS Off'}
                </button>
              </div>
              {['master', 'voice', 'camera'].map(kind => (
                <div key={kind} className="flex items-center justify-between text-xs">
                  <span className="text-[#7a9bbf] uppercase tracking-widest">{kind}</span>
                  <span className="text-slate-300">{evidenceLabel(evidenceStatus[kind])}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="fts-card p-4 flex flex-col min-h-[70vh]">
            <div className="flex items-center justify-between border-b border-[#1a3a5c] pb-3 mb-3">
              <div>
                <h1 className="text-[#00d4d4] text-lg font-bold tracking-[0.18em] uppercase">Live Transcript</h1>
                <p className="text-[#334e6b] text-xs tracking-widest uppercase">Question {questionCount || 0} of {MAX_QUESTIONS}</p>
              </div>
              {phase === 'active' && (
                <button disabled={sessionEnding} onClick={finishSession} className="px-4 py-2 bg-red-900/30 border border-red-700/50 text-red-300 rounded text-xs tracking-widest uppercase">
                  End Session
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {transcript.map(entry => (
                <div key={entry.id || `${entry.timestamp}-${entry.text}`} className={`p-3 rounded border ${
                  entry.speaker === 'SUBJECT' ? 'bg-[#101827] border-[#1a3a5c]' : 'bg-[#061f2a] border-[#00d4d4]/30'
                }`}>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className={`text-[10px] tracking-widest uppercase font-bold ${entry.speaker === 'SUBJECT' ? 'text-[#f59e0b]' : 'text-[#00d4d4]'}`}>
                      {entry.speaker === 'SUBJECT' ? 'Subject' : 'Assessment Prompt'}
                    </span>
                    <span className="text-[#334e6b] text-[10px]">{entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString('en-GB') : ''}</span>
                  </div>
                  <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{entry.text}</p>
                </div>
              ))}
              {interimText && (
                <div className="p-3 rounded border border-[#22c55e]/40 bg-[#102018]">
                  <span className="text-[10px] tracking-widest uppercase font-bold text-[#22c55e]">Listening</span>
                  <p className="text-slate-200 text-sm leading-relaxed mt-1">{interimText}</p>
                </div>
              )}
              <div ref={transcriptEndRef} />
            </div>

            {phase === 'completed' && (
              <div className="mt-4 border-t border-[#1a3a5c] pt-4 text-center">
                <p className="text-[#22c55e] tracking-widest uppercase text-sm font-bold">Session Completed</p>
                {reportId && <p className="text-[#7a9bbf] text-xs mt-1">Report generated: {reportId}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                  <button onClick={() => navigate('/hub?drawer=reports')} className="fts-btn-primary">Open Reports</button>
                  <button onClick={() => navigate('/hub')} className="fts-btn-secondary">Command Hub</button>
                </div>
              </div>
            )}
        </section>

        {sidePanelsVisible && (
        <aside className="space-y-4">
          {phase === 'completed' && (
            <div className="fts-card p-4 space-y-3 border-[#22c55e]/40">
              <h2 className="text-[#22c55e] text-sm font-bold tracking-[0.2em] uppercase">Session Completed</h2>
              {reportId ? (
                <p className="text-[#7a9bbf] text-xs">Report generated: {reportId}</p>
              ) : (
                <p className="text-[#7a9bbf] text-xs">Report generation has been requested.</p>
              )}
              <button onClick={() => navigate('/hub?drawer=reports')} className="fts-btn-primary">Open Reports</button>
              <button onClick={() => navigate('/hub')} className="fts-btn-secondary">Command Hub</button>
            </div>
          )}

          <div className="fts-card p-4 space-y-4">
            <h2 className="text-[#00d4d4] text-sm font-bold tracking-[0.2em] uppercase">Behavior Metrics</h2>
            <MetricBar label="Eye Contact" value={metrics.eyeContact} />
            <MetricBar label="Micro Expressions" value={metrics.microExpressions} />
            <MetricBar label="Head Movement" value={metrics.headMovement} />
            <MetricBar label="Face Turn" value={metrics.faceTurn || 0} />
            <MetricBar label="Blink Rate" value={metrics.blinkRate} />
          </div>

          <div className="fts-card p-4 space-y-3">
            <h2 className="text-[#00d4d4] text-sm font-bold tracking-[0.2em] uppercase">Last Answer</h2>
            <p className="text-slate-300 text-sm min-h-[48px]">{answerText || 'Waiting for spoken answer...'}</p>
            {voiceSummary && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <span className="text-[#7a9bbf]">Voice stress</span>
                <span className="text-right text-slate-200">{percent(voiceSummary.stressScore)}</span>
                <span className="text-[#7a9bbf]">Peak level</span>
                <span className="text-right text-slate-200">{percent(voiceSummary.peakLevel)}</span>
                <span className="text-[#7a9bbf]">State</span>
                <span className="text-right text-slate-200 uppercase">{voiceSummary.sentiment}</span>
              </div>
            )}
            {behaviorSummary && (
              <p className="text-[#334e6b] text-[10px] uppercase tracking-widest">
                Behavior sample attached to answer
              </p>
            )}
          </div>

          <div className="fts-card p-4">
            <h2 className="text-[#00d4d4] text-sm font-bold tracking-[0.2em] uppercase mb-3">Stress Flags</h2>
            {stressFlags.length ? (
              <div className="space-y-2">
                {stressFlags.slice(-5).map((flag, index) => (
                  <div key={flag.transcriptId || index} className="border border-[#f59e0b]/30 bg-[#2a1d08] rounded p-2">
                    <p className="text-[#f59e0b] text-xs uppercase tracking-widest">{flag.severity || 'flag'}</p>
                    <p className="text-slate-300 text-xs">{(flag.indicators || []).join(', ') || flag.note || 'Stress indicator detected'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[#7a9bbf] text-xs">No stress flags yet.</p>
            )}
          </div>
        </aside>
        )}
      </main>
    </div>
  )
}

