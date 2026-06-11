import { useNavigate } from 'react-router-dom'

/**
 * FocusLayout — Wraps operational pages (Intake, NewEntry).
 * Hides the global investigator navbar and shows only:
 *   • ALTHERIA wordmark (small)
 *   • Current task name
 *   • ← Back to Command Hub control
 */
export default function FocusLayout({ taskName, children }) {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#0a0d14] flex flex-col">
      {/* Minimalist focus header */}
      <header className="border-b border-[#1a3a5c] bg-[#0a0d14]/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          {/* Left — back control */}
          <button
            onClick={() => navigate('/hub')}
            className="flex items-center gap-2 text-[#7a9bbf] hover:text-[#00d4d4] 
                       transition-colors text-xs tracking-widest uppercase font-bold group"
          >
            <span className="text-lg leading-none group-hover:-translate-x-0.5 transition-transform">←</span>
            <span>Command Hub</span>
          </button>

          {/* Center — task name */}
          <div className="absolute left-1/2 -translate-x-1/2 text-center">
            <p className="text-[#00d4d4] text-xs tracking-[0.3em] uppercase font-bold">
              {taskName}
            </p>
            <p className="text-[#334e6b] text-[10px] tracking-widest uppercase">
              Altheria FTS
            </p>
          </div>

          {/* Right — status indicator */}
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
            <span className="text-[#334e6b] text-xs tracking-widest uppercase">Operational</span>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
