import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Box, FileCode, Play, AlertTriangle, ShieldCheck, Download, Trash2, History } from 'lucide-react'
import { notify } from '../lib/notifications'

export default function SandboxView() {
  const [hasWinBoat, setHasWinBoat] = useState<boolean | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [history, setHistory] = useState<{ path: string; name: string; time: number }[]>(() => {
    return JSON.parse(localStorage.getItem('vortex-sandbox-history') ?? '[]')
  })

  useEffect(() => {
    window.electron.winboatDetect().then(res => setHasWinBoat(res.success))
  }, [])

  const handleLaunch = async (path: string) => {
    const name = path.split('/').pop() || path
    notify('Sandbox', `Initializing isolated session for ${name}...`, 'info')
    
    const res = await window.electron.winboatRun(path)
    if (res.success) {
      notify('Sandbox', 'Session started successfully.', 'success')
      const newEntry = { path, name, time: Date.now() }
      const nextHistory = [newEntry, ...history.filter(h => h.path !== path)].slice(0, 10)
      setHistory(nextHistory)
      localStorage.setItem('vortex-sandbox-history', JSON.stringify(nextHistory))
    } else {
      notify('Sandbox', res.error || 'Failed to start session', 'error')
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    const exe = files.find(f => f.name.toLowerCase().endsWith('.exe') || f.name.toLowerCase().endsWith('.msi'))
    if (exe) {
      handleLaunch((exe as any).path)
    } else {
      notify('Sandbox', 'Only .exe or .msi files are supported.', 'warning')
    }
  }

  if (hasWinBoat === false) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-6 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-crimson/10 border border-crimson/30 flex items-center justify-center text-crimson">
          <AlertTriangle size={32} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white mb-2 uppercase tracking-tight">WinBoat Not Detected</h2>
          <p className="text-zinc-500 text-sm leading-relaxed">
            The WinBoat sandbox engine is required for isolated Windows application execution. 
            CachyOS provides a native integration for seamless GPU-accelerated sandboxing.
          </p>
        </div>
        <button
          onClick={() => window.electron.packageInstall({ name: 'winboat', helper: 'pacman' }).then(() => window.location.reload())}
          className="v-btn v-btn-primary flex items-center gap-2"
        >
          <Download size={16} />
          INSTALL WINBOAT ENGINE
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header Info */}
      <div className="v-card p-6 flex items-center gap-6 bg-gradient-to-br from-cyan-500/5 to-transparent border-cyan-500/10">
        <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
          <ShieldCheck size={32} />
        </div>
        <div className="flex-1">
          <div className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest mb-1">Secure Environment</div>
          <h2 className="text-lg font-bold text-white uppercase">WinBoat Container Sandbox</h2>
          <p className="text-xs text-zinc-500 mt-1 max-w-lg">
            Isolated Windows execution via Docker. Direct GPU mapping (4070 Ti S) and Xwayland passthrough enabled. 
            No persistent changes to your Wine/Proton prefixes.
          </p>
        </div>
      </div>

      {/* Main Drag Zone */}
      <motion.div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        animate={{ 
          borderColor: isDragging ? 'var(--cyan-400)' : 'rgba(255,255,255,0.05)',
          backgroundColor: isDragging ? 'rgba(34,211,238,0.05)' : 'rgba(0,0,0,0.2)'
        }}
        className="v-card h-64 border-2 border-dashed flex flex-col items-center justify-center gap-4 transition-all"
      >
        <div className={`p-6 rounded-full transition-all ${isDragging ? 'bg-cyan-500/20 text-cyan-400 scale-110' : 'bg-white/5 text-zinc-600'}`}>
          <Box size={48} strokeWidth={1} />
        </div>
        <div className="text-center">
          <p className="text-white font-bold text-sm uppercase tracking-wider">Drag & Drop Windows Binary</p>
          <p className="text-zinc-500 text-[10px] mt-2 font-monospace uppercase tracking-widest">Supports .EXE / .MSI</p>
        </div>
      </motion.div>

      {/* History */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 px-2">
          <History size={14} className="text-zinc-500" />
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Recent Sessions</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <AnimatePresence>
            {history.length === 0 ? (
              <div className="col-span-full p-8 text-center text-zinc-700 font-monospace text-xs italic">
                No recent sandbox activity.
              </div>
            ) : history.map((h) => (
              <motion.div
                key={h.time}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="v-card p-4 flex items-center gap-4 group"
              >
                <div className="p-2 rounded-lg bg-white/5 text-zinc-400">
                  <FileCode size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">{h.name}</div>
                  <div className="text-[9px] text-zinc-500 font-monospace truncate">{h.path}</div>
                </div>
                <button
                  onClick={() => handleLaunch(h.path)}
                  className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Play size={16} fill="currentColor" />
                </button>
                <button
                  onClick={() => {
                    const next = history.filter(item => item.time !== h.time)
                    setHistory(next)
                    localStorage.setItem('vortex-sandbox-history', JSON.stringify(next))
                  }}
                  className="p-2 rounded-lg text-zinc-600 hover:text-crimson transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
