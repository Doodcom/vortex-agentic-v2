import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Zap, Trash2, LayoutDashboard, MessageSquare, RefreshCw, Sparkles, Video, Box, Layers, Home } from 'lucide-react'
import { cn } from '../lib/utils'

interface CommandPaletteProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  onNavigate: (tab: string) => void
}

const COMMANDS = [
  { id: 'dash', label: 'Go to Dashboard', icon: LayoutDashboard, action: 'nav:dashboard' },
  { id: 'home', label: 'Open Home Assistant', icon: Home, action: 'nav:home' },
  { id: 'image', label: 'Generate AI Imagery', icon: Sparkles, action: 'nav:image-gen' },
  { id: 'video', label: 'Generate AI Motion', icon: Video, action: 'nav:video-gen' },
  { id: 'chat', label: 'Open AI Assistant', icon: MessageSquare, action: 'nav:assistant' },
  { id: 'docker', label: 'Manage Docker Containers', icon: Box, action: 'nav:docker' },
  { id: 'dep', label: 'View Dependency Graph', icon: Layers, action: 'nav:depgraph' },
  { id: 'updates', label: 'Check for Updates', icon: RefreshCw, action: 'nav:updates' },
  { id: 'clean', label: 'Run System Cleanup', icon: Trash2, action: 'nav:cleaner' },
  { id: 'opt', label: 'Open Optimizer', icon: Zap, action: 'nav:optimizer' },
]

export default function CommandPalette({ isOpen, setIsOpen, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const filteredCommands = COMMANDS.filter(cmd => 
    cmd.label.toLowerCase().includes(query.toLowerCase())
  )

  const handleAction = useCallback((action: string) => {
    if (action.startsWith('nav:')) {
      onNavigate(action.split(':')[1])
    }
    setIsOpen(false)
    setQuery('')
  }, [onNavigate, setIsOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault()
        setIsOpen(!isOpen)
      }
      if (e.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, setIsOpen])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
          onClick={() => setIsOpen(false)}
        />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          className="w-full max-w-xl bg-ink-800 border border-white/10 rounded-2xl shadow-2xl overflow-hidden relative z-10"
        >
          <div className="flex items-center px-4 border-b border-white/5 bg-white/5">
            <Search className="w-5 h-5 text-zinc-500" />
            <input
              autoFocus
              className="w-full p-4 bg-transparent border-none outline-none text-white font-mono text-sm placeholder:text-zinc-600"
              placeholder="Search commands..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setSelectedIndex(0)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  setSelectedIndex(prev => (prev + 1) % filteredCommands.length)
                } else if (e.key === 'ArrowUp') {
                  setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length)
                } else if (e.key === 'Enter') {
                  handleAction(filteredCommands[selectedIndex].action)
                }
              }}
            />
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/40 border border-white/5">
              <span className="text-[10px] font-mono text-zinc-500 uppercase">ESC</span>
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto p-2">
            {filteredCommands.length > 0 ? (
              filteredCommands.map((cmd, i) => (
                <button
                  key={cmd.id}
                  onClick={() => handleAction(cmd.action)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={cn(
                    "w-full flex items-center gap-4 p-3 rounded-xl transition-all text-left group",
                    i === selectedIndex ? "bg-crimson/10 border border-crimson/20" : "bg-transparent border border-transparent hover:bg-white/5"
                  )}
                >
                  <div className={cn(
                    "p-2 rounded-lg transition-colors",
                    i === selectedIndex ? "bg-crimson/20 text-crimson" : "bg-white/5 text-zinc-500 group-hover:text-zinc-300"
                  )}>
                    <cmd.icon size={18} />
                  </div>
                  <div className="flex-1">
                    <div className={cn(
                      "text-sm font-medium transition-colors",
                      i === selectedIndex ? "text-white" : "text-zinc-400 group-hover:text-zinc-200"
                    )}>
                      {cmd.label}
                    </div>
                  </div>
                  {i === selectedIndex && (
                    <div className="text-[10px] font-mono text-crimson uppercase tracking-widest animate-pulse">
                      Execute
                    </div>
                  )}
                </button>
              ))
            ) : (
              <div className="p-8 text-center">
                <div className="text-zinc-600 font-mono text-xs uppercase italic">No matches found</div>
              </div>
            )}
          </div>

          <div className="p-3 bg-black/20 border-t border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-mono text-zinc-500">↑↓</kbd>
                <span className="text-[9px] font-mono text-zinc-600 uppercase">Navigate</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-mono text-zinc-500">↵</kbd>
                <span className="text-[9px] font-mono text-zinc-600 uppercase">Execute</span>
              </div>
            </div>
            <span className="text-[9px] font-mono text-zinc-700 uppercase">Vortex Agentic v2.0.1</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
