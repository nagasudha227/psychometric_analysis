import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { authAPI } from '../services/api'

export default function Gateway() {
  const [badgeId, setBadgeId]   = useState('')
  const [passcode, setPasscode] = useState('')
  const [error, setError]       = useState('')
  const [phase, setPhase]       = useState('idle') // idle | connecting | initializing | done
  const { login } = useApp()
  const navigate  = useNavigate()

  async function handleAuthenticate(e) {
    e.preventDefault()
    setError('')
    if (!badgeId.trim() || !passcode.trim()) {
      setError('All credentials are required.')
      return
    }

    setPhase('connecting')
    try {
      const data = await authAPI.login(badgeId.trim(), passcode)
      setPhase('initializing')
      // Initialization delay for UX
      setTimeout(() => {
        login(data.investigator.badgeId, data.investigator.name, data.token)
        navigate('/hub')
      }, 1200)
    } catch (err) {
      setPhase('idle')
      setError(err.message || 'Authentication failed.')
    }
  }

  const isLoading = phase !== 'idle'

  const phaseLabel = {
    connecting:   'Verifying credentials...',
    initializing: 'Initializing System...',
  }

  return (
    <div className="min-h-screen bg-[#0a0d14] flex flex-col items-center justify-center px-4">
      <div className="text-center mb-10">
        <h1 className="text-white text-2xl font-bold tracking-[0.3em] uppercase mb-1">
          Criminology Department
        </h1>
        <p className="text-[#7a9bbf] text-xs tracking-[0.35em] uppercase">
          Forensic Tactical Simulation System
        </p>
      </div>

      <div className="fts-card w-full max-w-sm p-8">
        <h2 className="text-[#00d4d4] text-xl font-bold tracking-[0.25em] uppercase text-center mb-7">
          Altheria Gateway
        </h2>

        <form onSubmit={handleAuthenticate} className="space-y-4">
          <input
            type="text"
            className="fts-input disabled:opacity-50"
            placeholder="Badge ID"
            value={badgeId}
            onChange={e => setBadgeId(e.target.value)}
            autoComplete="off"
            disabled={isLoading}
          />
          <input
            type="password"
            className="fts-input disabled:opacity-50"
            placeholder="Passcode Hash"
            value={passcode}
            onChange={e => setPasscode(e.target.value)}
            disabled={isLoading}
          />

          {error && (
            <p className="text-red-400 text-xs text-center tracking-wider bg-red-900/20 border border-red-800/40 rounded px-3 py-2">
              ✗ {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className={`fts-btn-primary mt-2 flex items-center justify-center gap-2
              ${isLoading ? 'opacity-90 cursor-not-allowed' : ''}`}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                {phaseLabel[phase] || 'Processing...'}
              </>
            ) : 'Authenticate'}
          </button>
        </form>

        {isLoading && (
          <p className="text-[#00d4d4] text-[10px] tracking-[0.3em] uppercase text-center mt-4 animate-pulse">
            Establishing secure channel...
          </p>
        )}

        <p className="text-[#334e6b] text-[10px] text-center mt-6 tracking-wider">
          Demo: Badge ID <span className="text-[#7a9bbf]">8829</span> / Passcode <span className="text-[#7a9bbf]">password123</span>
        </p>
      </div>
    </div>
  )
}
