import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPORTS_DIR = path.resolve(__dirname, '../../../uploads/reports')
fs.mkdirSync(REPORTS_DIR, { recursive: true })

const TEAL = '#00d4d4'
const WHITE = '#ffffff'
const BLACK = '#111827'
const GREY = '#94a3b8'
const DARK_GREY = '#475569'
const AMBER = '#f59e0b'
const RED = '#ef4444'
const GREEN = '#22c55e'

const WINDOWS_DIR = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows'
const FONT_CANDIDATES = [
  process.env.ALTHERIA_REPORT_FONT,
  path.join(WINDOWS_DIR, 'Fonts', 'Nirmala.ttf'),
  path.join(WINDOWS_DIR, 'Fonts', 'mangal.ttf'),
  '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
].filter(Boolean)

export async function generateReport(session, caseData, sessionRecordings = []) {
  return new Promise((resolve, reject) => {
    const assessmentType = caseData.charge || caseData.assessmentType || 'Adaptive Psychological Assessment'
    const filename = `report-${session.caseId}-${Date.now()}.pdf`
    const filePath = path.join(REPORTS_DIR, filename)
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `Adaptive Assessment Report - ${session.caseId}`,
        Author: `Investigator ID-${session.investigatorId}`,
        Subject: `${assessmentType} - ${caseData.subjectName}`,
        Creator: 'Altheria FTS v3',
      },
    })

    const stream = fs.createWriteStream(filePath)
    doc.pipe(stream)
    const fonts = registerUnicodeFonts(doc)
    const W = doc.page.width - 100

    doc.rect(0, 0, doc.page.width, 110).fill('#0f1824')
    doc.fontSize(9).fillColor(TEAL).font('Helvetica-Bold')
      .text('PSYCHOMETRIC ASSESSMENT SYSTEM', 50, 25, { align: 'center', width: W })
    doc.fontSize(18).fillColor(WHITE).font('Helvetica-Bold')
      .text('ADAPTIVE PSYCHOLOGICAL ASSESSMENT REPORT', 50, 45, { align: 'center', width: W })
    doc.fontSize(9).fillColor(GREY).font('Helvetica')
      .text(`CLASSIFICATION: RESTRICTED  |  GENERATED: ${new Date().toUTCString()}`, 50, 80, { align: 'center', width: W })
    doc.y = 135

    sectionHeader(doc, 'CASE INFORMATION', W)
    metaTable(doc, [
      ['Case ID', session.caseId],
      ['Subject Name', caseData.subjectName],
      ['Date of Birth', caseData.dob],
      ['Assessment Type', assessmentType],
      ['Case Status', caseData.status],
      ['Assigned Investigator', `ID-${session.investigatorId}`],
      ['Session Started', fmt(session.startedAt)],
      ['Session Ended', session.endedAt ? fmt(session.endedAt) : 'N/A'],
      ['Duration', session.endedAt ? `${Math.round((new Date(session.endedAt) - new Date(session.startedAt)) / 60000)} minutes` : 'Ongoing'],
      ['Language', session.language || 'en'],
    ], W, fonts)

    const subjectEntries = session.transcript.filter(t => t.speaker === 'SUBJECT')
    const flagCount = session.stressFlags.length
    const highFlags = session.stressFlags.filter(f => f.severity === 'high').length
    const medFlags = session.stressFlags.filter(f => f.severity === 'medium').length
    const risk = computeRisk(session.stressFlags)
    const riskPaint = risk === 'HIGH' ? RED : risk === 'MEDIUM' ? AMBER : GREEN
    const voiceMetrics = session.voiceMetrics || []
    const behaviorMetrics = session.behaviorMetrics || []

    sectionHeader(doc, 'EXECUTIVE SUMMARY', W)
    doc.fontSize(10).fillColor(BLACK).font(fonts.regular)
      .text(
        `The subject responded to ${subjectEntries.length} adaptive local assessment prompt(s). ` +
        `The local analysis engine detected ${flagCount} stress event(s), reviewed transcript language, ` +
        `voice prosody, and camera behavior proxies, and linked ${sessionRecordings.length} evidence recording(s).`,
        { align: 'justify' }
      )
    doc.moveDown(0.5)
    doc.fontSize(22).fillColor(riskPaint).font('Helvetica-Bold').text(`${risk} RISK`, { align: 'center' })
    doc.moveDown(1)

    sectionHeader(doc, 'VISUAL DATA OVERVIEW', W)
    metricBarChart(doc, 'Session stress summary', [
      ['Voice stress', avg(voiceMetrics.map(m => m.stressScore)), TEAL],
      ['Camera agitation', avg(behaviorMetrics.map(m => m.stressScore || m.agitationScore)), AMBER],
      ['Eye-contact loss', 1 - avg(behaviorMetrics.map(m => m.eyeContact)), RED],
      ['Head movement', avg(behaviorMetrics.map(m => m.headMovement)), GREEN],
      ['Face turn', avg(behaviorMetrics.map(m => m.faceTurn)), DARK_GREY],
    ], W)
    if (voiceMetrics.length || behaviorMetrics.length) {
      trendChart(doc, 'Answer-by-answer voice and camera stress', [
        { label: 'Voice', color: TEAL, values: voiceMetrics.map(m => Number(m.stressScore || 0)) },
        { label: 'Camera', color: AMBER, values: behaviorMetrics.map(m => Number(m.stressScore || m.agitationScore || 0)) },
      ], W)
    }

    sectionHeader(doc, `STRESS FLAGS (${flagCount} detected)`, W)
    if (flagCount === 0) {
      doc.fontSize(10).fillColor(GREEN).font('Helvetica-Oblique')
        .text('No stress indicators were detected during this session.', { align: 'center' })
    } else {
      session.stressFlags.forEach((flag, i) => {
        const sevColor = flag.severity === 'high' ? RED : flag.severity === 'medium' ? AMBER : GREY
        doc.fontSize(9).fillColor(TEAL).font('Helvetica-Bold').text(`[${i + 1}] ${fmt(flag.timestamp)}`, { continued: true })
        doc.fillColor(sevColor).text(`  ${String(flag.severity || 'none').toUpperCase()}`, { continued: true })
        doc.fillColor(GREY).font('Helvetica').text(`  ${(flag.indicators || []).join(', ')}`)
        if (flag.note) {
          doc.fontSize(9).fillColor(BLACK).font(fonts.regular).text(`"${flag.note}"`, { indent: 20 })
        }
        if (flag.forensicScore != null) {
          doc.fontSize(8).fillColor(GREY).font('Helvetica').text(`Score: ${flag.forensicScore}/100  |  Sentiment: ${flag.sentiment || 'neutral'}`, { indent: 20 })
        }
        doc.moveDown(0.4)
      })
    }

    sectionHeader(doc, 'ANSWER-LEVEL VOICE, SENTIMENT AND BEHAVIOUR ANALYSIS', W)
    if (subjectEntries.length === 0) {
      doc.fontSize(10).fillColor(GREY).font('Helvetica-Oblique').text('No subject answers were captured for analysis.', { align: 'center' })
    } else {
      subjectEntries.forEach((entry, i) => {
        const analysis = entry.analysis || {}
        ensureSpace(doc, 120)
        doc.fontSize(9).fillColor(TEAL).font('Helvetica-Bold').text(`Answer ${i + 1} - ${fmt(entry.timestamp)}`)
        doc.fontSize(9).fillColor(BLACK).font(fonts.regular).text(entry.text || 'N/A', { align: 'justify', indent: 10 })
        compactTable(doc, [
          ['Analysis score', `${analysis.forensicScore ?? 0}/100`],
          ['Stress severity', analysis.severity || 'none'],
          ['Text sentiment', sentimentLabel(analysis.sentiment)],
          ['Voice state', entry.voiceMetrics?.sentiment || 'unavailable'],
          ['Voice stress', pct(analysis.voiceStress)],
          ['Camera stress', pct(analysis.behaviorStress)],
        ], W, fonts)
        if (analysis.indicators?.length) {
          doc.fontSize(8).fillColor(AMBER).font(fonts.regular).text(`Indicators: ${analysis.indicators.join(', ')}`)
        }
        if (analysis.sentiment?.positiveHits?.length || analysis.sentiment?.negativeHits?.length) {
          doc.fontSize(8).fillColor(DARK_GREY).font(fonts.regular)
            .text(`Sentiment words: + ${joinOrDash(analysis.sentiment.positiveHits)} | - ${joinOrDash(analysis.sentiment.negativeHits)}`)
        }
        doc.moveDown(0.45)
      })
    }

    sectionHeader(doc, 'VOICE ANALYSIS - SENTIMENT AND PROSODY', W)
    if (voiceMetrics.length === 0) {
      doc.fontSize(10).fillColor(GREY).font('Helvetica-Oblique')
        .text('No voice metrics were available. Microphone access may have been denied.', { align: 'center' })
    } else {
      metaTable(doc, [
        ['Analyzed Answers', String(voiceMetrics.length)],
        ['Average Prosody Stress', pct(avg(voiceMetrics.map(m => m.stressScore)))],
        ['Peak Level', pct(Math.max(...voiceMetrics.map(m => m.peakLevel || 0)))],
        ['Average Variability', pct(avg(voiceMetrics.map(m => m.variability)))],
        ['Dominant Voice State', dominant(voiceMetrics.map(m => m.sentiment))],
      ], W, fonts)
      metricBarChart(doc, 'Voice metrics graph', [
        ['Average stress', avg(voiceMetrics.map(m => m.stressScore)), TEAL],
        ['Peak level', Math.max(...voiceMetrics.map(m => m.peakLevel || 0)), AMBER],
        ['Variability', avg(voiceMetrics.map(m => m.variability)), GREEN],
      ], W)

      sectionSubhead(doc, 'Per-answer voice detail', W)
      voiceMetrics.forEach((m, i) => {
        ensureSpace(doc, 78)
        const linkedAnswer = subjectEntries.find(entry => entry.id === m.transcriptId) || subjectEntries[i]
        doc.fontSize(8).fillColor(TEAL).font('Helvetica-Bold')
          .text(`Voice sample ${i + 1} - ${fmt(m.timestamp || linkedAnswer?.timestamp)}`)
        compactTable(doc, [
          ['Voice state', m.sentiment || 'unavailable'],
          ['Prosody stress', pct(m.stressScore)],
          ['Peak voice level', pct(m.peakLevel)],
          ['Level variability', pct(m.variability)],
          ['Sample count', String(m.sampleCount || 0)],
        ], W, fonts)
        if (linkedAnswer?.text) {
          doc.fontSize(8).fillColor(DARK_GREY).font(fonts.regular)
            .text(`Linked answer: ${truncate(linkedAnswer.text, 180)}`)
        }
        doc.moveDown(0.35)
      })
    }

    sectionHeader(doc, 'CAMERA ANALYSIS - BEHAVIOR AND FACE MOVEMENT', W)
    if (behaviorMetrics.length === 0) {
      doc.fontSize(10).fillColor(GREY).font('Helvetica-Oblique')
        .text('No camera behavior metrics were available. Camera access may have been denied.', { align: 'center' })
    } else {
      metaTable(doc, [
        ['Analyzed Answers', String(behaviorMetrics.length)],
        ['Average Eye Contact Proxy', pct(avg(behaviorMetrics.map(m => m.eyeContact)))],
        ['Average Head Movement', pct(avg(behaviorMetrics.map(m => m.headMovement)))],
        ['Average Face Turn Proxy', pct(avg(behaviorMetrics.map(m => m.faceTurn)))],
        ['Average Micro-expression Proxy', pct(avg(behaviorMetrics.map(m => m.microExpressions)))],
        ['Average Behavioral Agitation', pct(avg(behaviorMetrics.map(m => m.stressScore)))],
        ['Peak Blink Rate Window', String(Math.max(...behaviorMetrics.map(m => m.blinkRate || 0)))],
      ], W, fonts)
      metricBarChart(doc, 'Camera visual behavior graph', [
        ['Eye contact proxy', avg(behaviorMetrics.map(m => m.eyeContact)), GREEN],
        ['Head movement', avg(behaviorMetrics.map(m => m.headMovement)), AMBER],
        ['Face turn', avg(behaviorMetrics.map(m => m.faceTurn)), RED],
        ['Micro-expression', avg(behaviorMetrics.map(m => m.microExpressions)), TEAL],
        ['Blink-rate window', avg(behaviorMetrics.map(m => m.blinkRate)), DARK_GREY],
        ['Agitation', avg(behaviorMetrics.map(m => m.stressScore || m.agitationScore)), AMBER],
      ], W)

      sectionSubhead(doc, 'Per-answer camera detail', W)
      behaviorMetrics.forEach((m, i) => {
        ensureSpace(doc, 86)
        const linkedAnswer = subjectEntries.find(entry => entry.id === m.transcriptId) || subjectEntries[i]
        doc.fontSize(8).fillColor(TEAL).font('Helvetica-Bold')
          .text(`Camera sample ${i + 1} - ${fmt(m.timestamp || linkedAnswer?.timestamp)}`)
        compactTable(doc, [
          ['Eye contact proxy', pct(m.eyeContact)],
          ['Head movement', pct(m.headMovement)],
          ['Face turn proxy', pct(m.faceTurn)],
          ['Micro-expression proxy', pct(m.microExpressions)],
          ['Blink-rate window', pct(m.blinkRate)],
          ['Behavioral agitation', pct(m.stressScore || m.agitationScore)],
        ], W, fonts)
        if (linkedAnswer?.text) {
          doc.fontSize(8).fillColor(DARK_GREY).font(fonts.regular)
            .text(`Linked answer: ${truncate(linkedAnswer.text, 180)}`)
        }
        doc.moveDown(0.35)
      })
    }

    sectionHeader(doc, 'RECORDING EVIDENCE ARCHIVE', W)
    if (!sessionRecordings.length) {
      doc.fontSize(10).fillColor(AMBER).font('Helvetica-Oblique').text('No recording files were linked to this report.', { align: 'center' })
    } else {
      sessionRecordings.forEach((rec, i) => {
        doc.fontSize(9).fillColor(TEAL).font('Helvetica-Bold')
          .text(`[${i + 1}] ${String(rec.modality || 'evidence').toUpperCase()} - ${rec.filename}`)
        doc.fontSize(8).fillColor(GREY).font('Helvetica')
          .text(`Size: ${(Number(rec.size || 0) / 1024 / 1024).toFixed(2)} MB  |  Duration: ${rec.duration || 'N/A'}s  |  Created: ${fmt(rec.createdAt)}`)
        if (rec.analysisSummary) {
          doc.fontSize(8).fillColor(BLACK).font(fonts.regular).text(rec.analysisSummary, { indent: 10 })
        }
        if (rec.metadata?.cameraTimeline) {
          const cam = rec.metadata.cameraTimeline
          compactTable(doc, [
            ['Camera samples', String(cam.sampleCount || 0)],
            ['Timeline agitation', pct(cam.stressScore || cam.agitationScore)],
            ['Peak camera stress', pct(cam.peakStress)],
            ['Avg eye contact', pct(cam.eyeContact)],
            ['Avg head movement', pct(cam.headMovement)],
            ['Avg face turn', pct(cam.faceTurn)],
          ], W, fonts)
        }
        const recTranscript = Array.isArray(rec.metadata?.transcript) ? rec.metadata.transcript : []
        if (recTranscript.length) {
          const questionCount = recTranscript.filter(entry => entry.speaker === 'INTERROGATOR').length
          const answerCount = recTranscript.filter(entry => entry.speaker === 'SUBJECT').length
          doc.fontSize(8).fillColor(GREY).font(fonts.regular)
            .text(`Linked transcript evidence: ${questionCount} question(s), ${answerCount} answer(s), language ${rec.metadata?.language || session.language || 'en'}`, { indent: 10 })
        }
        doc.moveDown(0.35)
      })
    }

    const transcriptEvidence = sessionRecordings
      .map(rec => rec.metadata?.transcript)
      .find(items => Array.isArray(items) && items.length)
    if (transcriptEvidence?.length) {
      sectionHeader(doc, 'RECORDING-LINKED QUESTION / ANSWER EVIDENCE', W)
      transcriptEvidence.forEach(entry => {
        const isQuestion = entry.speaker === 'INTERROGATOR'
        doc.fontSize(8).fillColor(isQuestion ? TEAL : AMBER).font('Helvetica-Bold')
          .text(`${isQuestion ? 'QUESTION' : 'ANSWER'}  |  ${fmt(entry.timestamp)}`)
        doc.fontSize(9).fillColor(BLACK).font(fonts.regular)
          .text(entry.text || '', { align: 'justify', indent: 10 })
        doc.moveDown(0.3)
      })
    }

    sectionHeader(doc, 'FULL TRANSCRIPT', W)
    if (session.transcript.length === 0) {
      doc.fontSize(10).fillColor(GREY).font('Helvetica-Oblique').text('No transcript recorded.', { align: 'center' })
    } else {
      session.transcript.forEach(entry => {
        const isInterrogator = entry.speaker === 'INTERROGATOR'
        const label = isInterrogator ? 'INTERROGATOR' : 'SUBJECT'
        const labelColor = isInterrogator ? TEAL : AMBER
        const textColor = BLACK
        doc.fontSize(8).fillColor(labelColor).font('Helvetica-Bold')
          .text(`${label}  |  ${fmt(entry.timestamp)}`, { continued: entry.stressFlag })
        if (entry.stressFlag) {
          doc.fillColor(AMBER).font('Helvetica-Bold').text('  STRESS FLAG')
        }
        doc.fontSize(10).fillColor(textColor).font(fonts.regular)
          .text(entry.text || '', { align: 'justify', indent: 10 })
        doc.moveDown(0.5)
      })
    }

    doc.fontSize(8).fillColor('#334e6b').font('Helvetica')
      .text(`Altheria - Confidential Assessment Document | Case ${session.caseId}`, 50, doc.page.height - 40, { align: 'center', width: W })

    doc.end()
    stream.on('finish', () => resolve({ filename, filePath }))
    stream.on('error', reject)
  })
}

function sectionHeader(doc, title, W) {
  ensureSpace(doc, 58)
  const y = doc.y + 10
  doc.rect(50, y, W, 24).fill('#0f1824')
  doc.fontSize(9).fillColor(WHITE).font('Helvetica-Bold').text(title, 60, y + 7, {
    width: W - 20,
    characterSpacing: 0.5,
  })
  doc.y = y + 36
}

function metaTable(doc, rows, W, fonts) {
  rows.forEach(([label, value], i) => {
    ensureSpace(doc, 28)
    const y = doc.y
    if (i % 2 === 0) doc.rect(50, y - 3, W, 22).fill('#f1f5f9')
    doc.fontSize(9).fillColor(DARK_GREY).font('Helvetica-Bold').text(label, 58, y + 2, { width: 170 })
    doc.fontSize(9).fillColor(BLACK).font(fonts.regular).text(String(value || '-'), 230, y + 2, { width: W - 190 })
    doc.y = y + 24
  })
  doc.moveDown(0.5)
}

function compactTable(doc, rows, W, fonts) {
  const colWidth = Math.floor((W - 16) / 2)
  for (let i = 0; i < rows.length; i += 2) {
    ensureSpace(doc, 26)
    const y = doc.y
    doc.rect(58, y - 2, W - 16, 22).fill('#f8fafc')
    drawCompactCell(doc, rows[i], 66, y + 2, colWidth, fonts)
    if (rows[i + 1]) drawCompactCell(doc, rows[i + 1], 66 + colWidth + 8, y + 2, colWidth, fonts)
    doc.y = y + 24
  }
}

function drawCompactCell(doc, row, x, y, width, fonts) {
  const [label, value] = row
  doc.fontSize(7).fillColor(DARK_GREY).font('Helvetica-Bold').text(String(label), x, y, { width })
  doc.fontSize(8).fillColor(BLACK).font(fonts.regular).text(String(value || '-'), x, y + 9, { width })
}

function sectionSubhead(doc, title, W) {
  ensureSpace(doc, 34)
  doc.moveDown(0.25)
  doc.fontSize(8).fillColor(DARK_GREY).font('Helvetica-Bold')
    .text(title.toUpperCase(), 50, doc.y, { width: W, characterSpacing: 0.4 })
  doc.moveDown(0.35)
}

function metricBarChart(doc, title, rows, W) {
  const clean = rows.filter(row => Number.isFinite(Number(row[1])))
  if (!clean.length) return
  const chartHeight = 34 + clean.length * 24
  ensureSpace(doc, chartHeight + 16)
  const x = 58
  const y = doc.y
  const labelW = 145
  const barW = W - labelW - 105
  doc.roundedRect(50, y, W, chartHeight, 4).fillAndStroke('#f8fafc', '#e2e8f0')
  doc.fontSize(9).fillColor(DARK_GREY).font('Helvetica-Bold').text(title.toUpperCase(), x, y + 10, { width: W - 16 })
  clean.forEach(([label, value, color], index) => {
    const rowY = y + 32 + index * 24
    const v = clamp01(Number(value))
    doc.fontSize(8).fillColor(BLACK).font('Helvetica').text(label, x, rowY + 2, { width: labelW })
    doc.rect(x + labelW, rowY, barW, 12).fill('#e5e7eb')
    doc.rect(x + labelW, rowY, Math.max(2, barW * v), 12).fill(color || TEAL)
    doc.fontSize(8).fillColor(DARK_GREY).font('Helvetica-Bold').text(pct(v), x + labelW + barW + 8, rowY + 1, { width: 55 })
  })
  doc.y = y + chartHeight + 12
}

function trendChart(doc, title, series, W) {
  const valid = series
    .map(item => ({ ...item, values: item.values.map(Number).filter(Number.isFinite).map(clamp01) }))
    .filter(item => item.values.length)
  if (!valid.length) return
  ensureSpace(doc, 170)
  const x = 58
  const y = doc.y
  const chartW = W - 28
  const chartH = 100
  doc.roundedRect(50, y, W, 150, 4).fillAndStroke('#f8fafc', '#e2e8f0')
  doc.fontSize(9).fillColor(DARK_GREY).font('Helvetica-Bold').text(title.toUpperCase(), x, y + 10, { width: W - 16 })
  const plotX = x
  const plotY = y + 36
  doc.rect(plotX, plotY, chartW, chartH).stroke('#cbd5e1')
  ;[0.25, 0.5, 0.75].forEach(level => {
    const gy = plotY + chartH - chartH * level
    doc.moveTo(plotX, gy).lineTo(plotX + chartW, gy).strokeColor('#e2e8f0').lineWidth(0.5).stroke()
  })
  valid.forEach(item => {
    const values = item.values
    doc.strokeColor(item.color || TEAL).lineWidth(2)
    values.forEach((value, index) => {
      const px = plotX + (values.length === 1 ? chartW / 2 : (chartW * index) / (values.length - 1))
      const py = plotY + chartH - chartH * value
      if (index === 0) doc.moveTo(px, py)
      else doc.lineTo(px, py)
    })
    doc.stroke()
  })
  let legendX = x
  valid.forEach(item => {
    doc.rect(legendX, y + 140, 8, 8).fill(item.color || TEAL)
    doc.fontSize(8).fillColor(DARK_GREY).font('Helvetica').text(item.label, legendX + 12, y + 138, { width: 70 })
    legendX += 86
  })
  doc.y = y + 164
}

function ensureSpace(doc, needed = 80) {
  if (doc.y + needed > doc.page.height - 60) {
    doc.addPage()
    doc.y = 55
  }
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function sentimentLabel(sentiment) {
  if (!sentiment) return 'neutral'
  const score = Number(sentiment.score || 0)
  const sign = score > 0 ? '+' : ''
  return `${sentiment.label || 'neutral'} (${sign}${score})`
}

function joinOrDash(values) {
  return Array.isArray(values) && values.length ? values.join(', ') : '-'
}

function truncate(text, max = 160) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean
}

function registerUnicodeFonts(doc) {
  const fontPath = FONT_CANDIDATES.find(candidate => candidate && fs.existsSync(candidate))
  if (!fontPath) return { regular: 'Helvetica' }
  try {
    doc.registerFont('AltheriaUnicode', fontPath)
    return { regular: 'AltheriaUnicode' }
  } catch {
    return { regular: 'Helvetica' }
  }
}

function computeRisk(stressFlags) {
  const high = stressFlags.filter(f => f.severity === 'high').length
  const med = stressFlags.filter(f => f.severity === 'medium').length
  if (high >= 3 || (high >= 1 && med >= 2)) return 'HIGH'
  if (high >= 1 || med >= 3) return 'MEDIUM'
  return 'LOW'
}

function avg(values) {
  const clean = values.map(Number).filter(Number.isFinite)
  if (!clean.length) return 0
  return clean.reduce((sum, value) => sum + value, 0) / clean.length
}

function pct(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '0%'
  return `${Math.round(Math.max(0, Math.min(1, numeric)) * 100)}%`
}

function dominant(values) {
  const counts = new Map()
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1)
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unavailable'
}

function summarizeSdq(subjectEntries) {
  const scales = {
    emotional: 0,
    conduct: 0,
    hyperactivity: 0,
    peer: 0,
    prosocial: 0,
  }
  let answered = 0

  for (const entry of subjectEntries) {
    const sdq = entry.analysis?.sdq
    if (!sdq || !Number.isFinite(sdq.score) || !scales.hasOwnProperty(sdq.scale)) continue
    scales[sdq.scale] += Number(sdq.score)
    answered += 1
  }

  return {
    answered,
    scales,
    totalDifficulties: scales.emotional + scales.conduct + scales.hyperactivity + scales.peer,
  }
}

function fmt(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
