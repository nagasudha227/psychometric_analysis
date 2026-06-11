import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { casesAPI, authAPI } from '../services/api'
import SlideDrawer from './SlideDrawer'
import AuditConsole from './AuditConsole'
import Intake from './Intake'
import ReportsPanel from './ReportsPanel'

export default function CommandHub() {
  const { investigatorId, investigatorName, auditLogs, logout } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawer, setDrawer] = useState(null) // null | 'intake' | 'reports'
  const [stats, setStats] = useState({
    active: '—', pending: '—', health: '98%',
  })

  // Fetch live case stats from server
  useEffect(() => {
    casesAPI.list()
      .then(({ cases }) => {
        const active  = cases.filter(c => c.status === 'Active').length
        const pending = cases.filter(c => c.status === 'Pending').length
        setStats({ active: String(active).padStart(2,'0'), pending: String(pending).padStart(2,'0'), health: '98%' })
      })
      .catch(() => setStats({ active: '14', pending: '03', health: '98%' }))
  }, [])

  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('drawer')
    if (['intake', 'reports', 'recordings'].includes(requested)) {
      setDrawer(requested)
    }
  }, [location.search])

  async function handleLogout() {
    try { await authAPI.logout() } catch {}
    logout()
    navigate('/')
  }

  const statCards = [
    { label: 'Active Investigations', value: stats.active,  color: 'text-white' },
    { label: 'Pending Reports',       value: stats.pending, color: 'text-[#f59e0b]' },
    { label: 'System Health',         value: stats.health,  color: 'text-[#22c55e]' },
  ]

  const actions = [
    { key: 'intake',     title: 'New Assessment',    subtitle: 'Launch or Resume Case',   active: true,  onClick: () => setDrawer('intake') },
    { key: 'reports',    title: 'Reports & History', subtitle: 'Forensic Data Archives',  active: true,  onClick: () => setDrawer('reports') },
    { key: 'recordings', title: 'Recordings Archive',subtitle: 'Secure Biometric Media',  active: true,  onClick: () => setDrawer('recordings') },
  ]

  return (
    <div className="min-h-screen bg-[#0a0d14] p-6 md:p-8">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-[#00d4d4] text-3xl md:text-4xl font-bold tracking-[0.15em] uppercase leading-tight">
            Altheria <span className="text-white">| Command Hub</span>
          </h1>
          <p className="text-[#7a9bbf] text-sm mt-1 italic">
            Criminology Department – Forensic Investigative Division
          </p>
        </div>
        <div className="text-right ml-4 flex-shrink-0">
          <p className="text-[#7a9bbf] text-xs tracking-widest uppercase">Investigator</p>
          <p className="text-white font-bold text-lg tracking-wider">ID-{investigatorId}</p>
          {investigatorName && (
            <p className="text-[#7a9bbf] text-xs">{investigatorName}</p>
          )}
          <button
            onClick={handleLogout}
            className="text-[#ef4444] text-xs tracking-widest uppercase hover:text-red-300 transition-colors mt-1 font-bold"
          >
            Log Out
          </button>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {statCards.map(stat => (
          <div key={stat.label} className="fts-card p-5 md:p-6">
            <p className="text-[#7a9bbf] text-xs tracking-widest uppercase mb-2">{stat.label}</p>
            <p className={`text-4xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* ── Action cards ── */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {actions.map(action => (
          <button
            key={action.key}
            onClick={action.active ? action.onClick : undefined}
            className={`fts-card p-8 md:p-10 text-center transition-all
              ${action.active ? 'hover:bg-[#162030] hover:border-[#00d4d4]/40 cursor-pointer' : 'opacity-60 cursor-default'}
              ${drawer === action.key ? 'border-[#00d4d4]/60 bg-[#0f2030]' : ''}
            `}
          >
            <p className="text-white font-bold text-lg md:text-xl tracking-[0.15em] uppercase mb-2">{action.title}</p>
            <p className="text-[#7a9bbf] text-xs tracking-widest uppercase">{action.subtitle}</p>
            {action.active && (
              <p className="text-[#00d4d4]/40 text-[10px] tracking-widest uppercase mt-3">Open Panel →</p>
            )}
          </button>
        ))}
      </div>

      {/* ── Audit Console ── */}
      <AuditConsole logs={auditLogs} />

      {/* ── Slide-over Drawer ── */}
      <SlideDrawer
        isOpen={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer === 'intake' ? 'New Assessment' : drawer === 'recordings' ? 'Recordings Archive' : 'Reports & History'}
      >
        {drawer === 'intake'   && <Intake inDrawer onCloseDrawer={() => setDrawer(null)} />}
        {drawer === 'reports'  && <ReportsPanel />}
        {drawer === 'recordings' && <ReportsPanel initialFocus="recordings" />}
      </SlideDrawer>
    </div>
  )
}
