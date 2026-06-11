import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { LOG_TYPES } from '../utils/auditLogger'
import { casesAPI } from '../services/api'
import FocusLayout from './FocusLayout'

const CHARGE_OPTIONS = [
  'Violent Offense',
  'Property Crime',
  'Drug Offense',
  'Cybercrime',
  'Fraud / White-Collar',
  'Homicide',
  'Trafficking',
  'Terrorism',
  'Other',
]

const VALIDATORS = {
  fullName: v => {
    if (!v.trim()) return { state: 'error', msg: 'Full legal name is required.' }
    if (v.trim().length < 3) return { state: 'warn', msg: 'Name seems too short.' }
    return { state: 'ok' }
  },
  caseId: v => {
    if (!v.trim()) return { state: 'error', msg: 'Case ID is required.' }
    if (!/^FTS-[A-Z0-9]{4}-[A-Z0-9]{2}$/i.test(v.trim())) {
      return { state: 'warn', msg: 'Format: FTS-XXXX-XX (e.g. FTS-2026-AB).' }
    }
    return { state: 'ok' }
  },
  dob: v => {
    if (!v) return { state: 'error', msg: 'Date of birth is required.' }
    const age = (Date.now() - new Date(v)) / (1000 * 60 * 60 * 24 * 365.25)
    if (age < 10) return { state: 'warn', msg: 'Age appears unusually young.' }
    if (age > 120) return { state: 'warn', msg: 'Date appears invalid.' }
    return { state: 'ok' }
  },
}

function getFieldClass(state) {
  if (state === 'error') return 'fts-input border-red-500 focus:border-red-500'
  if (state === 'warn') return 'fts-input border-amber-500 focus:border-amber-400'
  if (state === 'ok') return 'fts-input border-[#22c55e]/60 focus:border-[#22c55e]'
  return 'fts-input'
}

function getMsgClass(state) {
  return state === 'error' ? 'text-red-400' : state === 'warn' ? 'text-amber-400' : 'text-[#22c55e]'
}

export default function NewEntry({ inDrawer = false, onCloseDrawer, onBack }) {
  const navigate = useNavigate()
  const { addLog, investigatorId } = useApp()
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')
  const [form, setForm] = useState({
    fullName: '',
    caseId: '',
    dob: '',
    charge: 'Violent Offense',
    notes: '',
  })
  const [fieldState, setFieldState] = useState({})

  function handleChange(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    if (VALIDATORS[field]) setFieldState(s => ({ ...s, [field]: VALIDATORS[field](value) }))
  }

  function validateAll() {
    const next = {}
    let hasError = false
    for (const [field, validator] of Object.entries(VALIDATORS)) {
      const result = validator(form[field])
      next[field] = result
      if (result.state === 'error') hasError = true
    }
    setFieldState(next)
    return !hasError
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validateAll()) return
    setSubmitting(true)
    setServerError('')
    try {
      await casesAPI.register({
        fullName: form.fullName.trim(),
        caseId: form.caseId.trim(),
        dob: form.dob,
        charge: form.charge,
        notes: form.notes,
      })
      addLog(LOG_TYPES.REGISTRATION, {
        caseId: form.caseId.trim().toUpperCase(),
        subject: form.fullName.trim(),
        detail: `${form.charge} - DOB ${form.dob}`,
      })
      setSubmitted(true)
    } catch (err) {
      setServerError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  function goHub() {
    if (inDrawer) onCloseDrawer?.()
    else navigate('/hub')
  }

  if (submitted) {
    const success = (
      <div className={`flex items-center justify-center px-6 ${inDrawer ? 'py-10' : 'min-h-[calc(100vh-57px)]'}`}>
        <div className="w-full max-w-2xl">
          <div className="fts-card p-10 text-center">
            <div className="w-14 h-14 rounded-full border-2 border-[#22c55e] flex items-center justify-center mx-auto mb-5">
              <span className="text-[#22c55e] text-2xl">✓</span>
            </div>
            <h3 className="text-[#00d4d4] font-bold tracking-[0.2em] uppercase text-lg mb-2">Registration Successful</h3>
            <p className="text-slate-300 text-sm mb-1">Profile saved to database.</p>
            <p className="text-[#334e6b] text-xs font-mono mb-6">
              CASE: {form.caseId.toUpperCase()} - USER: ID-{investigatorId}
            </p>
            <div className="flex items-center justify-center gap-6">
              {onBack && <button onClick={onBack} className="text-[#7a9bbf] text-xs tracking-wider hover:text-white transition-colors uppercase">Back</button>}
              <button onClick={goHub} className="text-[#00d4d4] text-sm underline underline-offset-2 hover:text-cyan-300 tracking-wider">Return to Command Hub</button>
            </div>
          </div>
        </div>
      </div>
    )
    if (inDrawer) return success
    return <FocusLayout taskName="Registration Complete">{success}</FocusLayout>
  }

  const formContent = (
    <div className={`px-6 ${inDrawer ? 'py-6' : 'py-10 min-h-[calc(100vh-57px)]'}`}>
      <div className="max-w-2xl mx-auto">
        {!inDrawer && (
          <div className="mb-8">
            <h1 className="text-[#00d4d4] text-2xl font-bold tracking-[0.2em] uppercase">New Case Intake</h1>
            <p className="text-[#7a9bbf] text-sm mt-1">Fill in profile details to initialize the assessment case file.</p>
          </div>
        )}
        <div className="fts-card p-6 md:p-8">
          {serverError && (
            <div className="mb-4 bg-red-900/20 border border-red-700/40 rounded px-4 py-3">
              <p className="text-red-400 text-xs tracking-wider">× {serverError}</p>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="fts-label">Full Legal Name</label>
                <input type="text" className={getFieldClass(fieldState.fullName?.state)}
                  value={form.fullName} onChange={e => handleChange('fullName', e.target.value)}
                  autoComplete="off" placeholder="e.g. John A. Doe" />
                {fieldState.fullName?.msg && <p className={`text-xs mt-1 ${getMsgClass(fieldState.fullName.state)}`}>{fieldState.fullName.msg}</p>}
              </div>
              <div>
                <label className="fts-label">Unique Case ID</label>
                <input type="text" className={getFieldClass(fieldState.caseId?.state)}
                  value={form.caseId} onChange={e => handleChange('caseId', e.target.value)}
                  autoComplete="off" placeholder="FTS-XXXX-XX" />
                {fieldState.caseId?.msg && <p className={`text-xs mt-1 ${getMsgClass(fieldState.caseId.state)}`}>{fieldState.caseId.msg}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="fts-label">Date of Birth</label>
                <input type="date" className={getFieldClass(fieldState.dob?.state)}
                  value={form.dob} onChange={e => handleChange('dob', e.target.value)} />
                {fieldState.dob?.msg && <p className={`text-xs mt-1 ${getMsgClass(fieldState.dob.state)}`}>{fieldState.dob.msg}</p>}
              </div>
              <div>
                <label className="fts-label">Case Category</label>
                <select className="fts-input appearance-none cursor-pointer"
                  value={form.charge} onChange={e => handleChange('charge', e.target.value)}>
                  {CHARGE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="fts-label">History / Notes</label>
              <textarea className="fts-input resize-y min-h-[110px]" value={form.notes}
                onChange={e => handleChange('notes', e.target.value)}
                placeholder="Prior records, behavioural notes, known context..." />
            </div>
            <div className="flex gap-4 pt-1">
              <button type="submit" disabled={submitting}
                className={`fts-btn-primary flex-1 flex items-center justify-center gap-2 ${submitting ? 'opacity-80 cursor-not-allowed' : ''}`}>
                {submitting ? 'Registering...' : 'Register Case'}
              </button>
              <button type="button"
                onClick={onBack ?? (() => inDrawer ? onCloseDrawer?.() : navigate('/intake'))}
                className="px-6 py-3 bg-transparent border border-[#2a5080] text-slate-300 rounded tracking-widest text-sm uppercase font-bold hover:bg-[#1a3a5c] transition-colors cursor-pointer">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )

  if (inDrawer) return formContent
  return <FocusLayout taskName="New Case Intake">{formContent}</FocusLayout>
}
