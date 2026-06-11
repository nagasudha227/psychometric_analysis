import { useEffect } from 'react'

/**
 * SlideDrawer — A slide-over side panel that renders over the Command Hub
 * without destroying it. The hub remains as the persistent background anchor.
 *
 * Props:
 *   isOpen    {boolean}  — controls visibility
 *   onClose   {function} — called when user dismisses
 *   title     {string}   — panel header title
 *   children  {node}     — panel body content
 */
export default function SlideDrawer({ isOpen, onClose, title, children }) {
  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/60 backdrop-blur-[2px] z-30 transition-opacity duration-300
          ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      />

      {/* Drawer panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-xl bg-[#0b1420] border-l border-[#1a3a5c] 
                    z-40 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out
                    ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a3a5c] flex-shrink-0">
          <div>
            <p className="text-[#334e6b] text-[10px] tracking-[0.3em] uppercase mb-0.5">
              Altheria FTS · Workspace
            </p>
            <h2 className="text-[#00d4d4] font-bold tracking-[0.2em] uppercase text-sm">
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded border border-[#1a3a5c] 
                       text-[#7a9bbf] hover:text-white hover:border-[#00d4d4] 
                       transition-colors text-lg leading-none"
            aria-label="Close panel"
          >
            ×
          </button>
        </div>

        {/* Drawer body — scrollable */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  )
}
