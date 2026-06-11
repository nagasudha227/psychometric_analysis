import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { casesAPI, sessionsAPI } from '../services/api'
import { LOG_TYPES } from '../utils/auditLogger'
import FocusLayout from './FocusLayout'
import NewEntry from './NewEntry'

export default function Intake({ inDrawer = false, onCloseDrawer }) {
  const [caseId, setCaseId] = useState('')
  const [status, setStatus] = useState('idle')
  const [caseData, setCaseData] = useState(null)
  const [error, setError] = useState('')
  const [showRegister, setShowRegister] = useState(false)
  const { addLog } = useApp()
  const navigate = useNavigate()

  async function handleVerify(e) {
    e.preventDefault()
    if (!caseId.trim()) {
      setError('Enter a Case ID.')
      return
    }
    setError('')
    setStatus('loading')
    setCaseData(null)

    try {
      const data = await casesAPI.verify(caseId.trim())
      setCaseData(data.case)
      setStatus('found')
      addLog(LOG_TYPES.CASE_LOOKUP, {
        caseId: data.case.caseId,
        detail: `Verified: ${data.case.subjectName} - ${data.case.charge}`,
      })
    } catch (err) {
      setStatus('notfound')
      setError(err.message)
      addLog(LOG_TYPES.CASE_NOT_FOUND, {
        caseId: caseId.trim().toUpperCase(),
        detail: 'Case ID not found in registry',
      })
    }
  }

  async function handleStartAssessment() {
    setStatus('starting')
    try {
      const { session } = await sessionsAPI.start(caseData.caseId)
      if (inDrawer) onCloseDrawer?.()
      navigate(`/enclave/${session.sessionId}`)
    } catch (err) {
      setStatus('found')
      setError('Failed to start session: ' + err.message)
    }
  }

  function goBack() {
    if (inDrawer) onCloseDrawer?.()
    else navigate('/hub')
  }

  if (showRegister) {
    return (
      <NewEntry
        inDrawer={inDrawer}
        onCloseDrawer={onCloseDrawer}
        onBack={() => setShowRegister(false)}
      />
    )
  }

  const content = (
    <div className={`flex items-center justify-center px-4 ${inDrawer ? 'py-10' : 'min-h-[calc(100vh-57px)]'}`}>
      <div className="fts-card w-full max-w-md p-8">
        <h2 className="text-[#00d4d4] text-xl font-bold tracking-[0.25em] uppercase text-center mb-7">
          Case Verification
        </h2>

        <form onSubmit={handleVerify} className="space-y-3">
          <div>
            <label className="fts-label">Enter Existing Case ID</label>
            <input
              type="text"
              className={`fts-input ${status === 'notfound' ? 'border-amber-500' : status === 'found' ? 'border-[#22c55e]/60' : ''}`}
              placeholder="FTS-XXXX-XX"
              value={caseId}
              onChange={e => { setCaseId(e.target.value); setStatus('idle'); setCaseData(null); setError('') }}
              autoComplete="off"
              disabled={status === 'loading' || status === 'starting'}
            />
          </div>

          {error && (
            <p className="text-amber-400 text-xs tracking-wider text-center py-1">Warning: {error}</p>
          )}

          {status === 'found' && caseData && (
            <div className="bg-[#0d1e30] border border-[#22c55e]/30 rounded p-4 space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-[#22c55e]" />
                <span className="text-[#22c55e] text-xs font-bold tracking-widest uppercase">Case Verified</span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <span className="fts-label mb-0">Subject</span>
                <span className="text-white">{caseData.subjectName}</span>
                <span className="fts-label mb-0">Category</span>
                <span className="text-[#f59e0b]">{caseData.charge}</span>
                <span className="fts-label mb-0">Status</span>
                <span className={caseData.status === 'Active' ? 'text-[#22c55e]' : 'text-slate-400'}>
                  {caseData.status}
                </span>
                <span className="fts-label mb-0">Case ID</span>
                <span className="text-[#00d4d4] font-mono">{caseData.caseId}</span>
              </div>
            </div>
          )}

          {status === 'found' ? (
            <button
              type="button"
              onClick={handleStartAssessment}
              disabled={status === 'starting'}
              className="fts-btn-primary bg-[#22c55e] hover:bg-[#16a34a] text-white flex items-center justify-center gap-2"
            >
              {status === 'starting' ? 'Starting Assessment...' : 'Start Assessment'}
            </button>
          ) : (
            <button
              type="submit"
              disabled={status === 'loading'}
              className="fts-btn-primary flex items-center justify-center gap-2"
            >
              {status === 'loading' ? 'Checking Database...' : 'Submit Case ID'}
            </button>
          )}
        </form>

        <div className="flex items-center my-6">
          <div className="flex-1 border-t border-[#1e3a5f]" />
        </div>

        <p className="text-[#7a9bbf] text-sm text-center mb-4">
          Or create a new case profile:
        </p>
        <button onClick={() => setShowRegister(true)} className="fts-btn-secondary">
          Register New Entry
        </button>

        <div className="text-center mt-5">
          <button onClick={goBack} className="text-[#ef4444] text-xs tracking-wider hover:text-red-300 transition-colors underline underline-offset-2">
            Return to Dashboard
          </button>
        </div>
      </div>
    </div>
  )

  if (inDrawer) return content
  return <FocusLayout taskName="Case Verification">{content}</FocusLayout>
}
