import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import Gateway          from './components/Gateway'
import CommandHub       from './components/CommandHub'
import Intake           from './components/Intake'
import NewEntry         from './components/NewEntry'
import AssessmentEnclave from './components/AssessmentEnclave'

function ProtectedRoute({ children }) {
  const { investigatorId } = useApp()
  return investigatorId ? children : <Navigate to="/" replace />
}

function GatewayRoute() {
  const { investigatorId } = useApp()
  return investigatorId ? <Navigate to="/hub" replace /> : <Gateway />
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                    element={<GatewayRoute />} />
        <Route path="/hub"                 element={<ProtectedRoute><CommandHub /></ProtectedRoute>} />
        <Route path="/intake"              element={<ProtectedRoute><Intake /></ProtectedRoute>} />
        <Route path="/register"            element={<ProtectedRoute><NewEntry /></ProtectedRoute>} />
        <Route path="/enclave/:sessionId"  element={<ProtectedRoute><AssessmentEnclave /></ProtectedRoute>} />
        <Route path="*"                    element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  )
}
