import { createContext, useContext, useState, useCallback } from 'react'
import { createLogEntry, LOG_TYPES } from '../utils/auditLogger'
import { setToken, clearToken } from '../services/api'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [investigatorId, setInvestigatorId] = useState(null)
  const [investigatorName, setInvestigatorName] = useState(null)
  const [jwtToken, setJwtToken] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])

  const pushLog = useCallback((entry) => {
    setAuditLogs(prev => [entry, ...prev].slice(0, 100))
  }, [])

  function addLog(type, meta = {}) {
    const entry = createLogEntry(type, investigatorId, meta)
    pushLog(entry)
    return entry
  }

  function login(badgeId, name, token) {
    setInvestigatorId(badgeId)
    setInvestigatorName(name)
    setJwtToken(token)
    setToken(token)
    const entry = createLogEntry(LOG_TYPES.AUTH_SUCCESS, badgeId, {
      detail: `Gateway authenticated as ${name}`,
    })
    pushLog(entry)
  }

  function logout() {
    addLog(LOG_TYPES.LOGOUT, { detail: 'Session terminated' })
    setInvestigatorId(null)
    setInvestigatorName(null)
    setJwtToken(null)
    clearToken()
  }

  return (
    <AppContext.Provider value={{
      investigatorId,
      investigatorName,
      jwtToken,
      auditLogs,
      addLog,
      login,
      logout,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
