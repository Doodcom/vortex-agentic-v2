import {
  LayoutDashboard, Zap, Trash2, Rocket,
  Package, MessageSquare,
  Terminal as TerminalIcon, Settings, Palette, Server, Activity, Wifi,
  Clock, HardDrive, ShieldCheck, ScrollText, Power, Sparkles, Video, Box, Layers,
  Library, Brain, Home, Cpu
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import { useTheme } from './ThemeProvider'

export const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'home',      label: 'Home Assistant', icon: Home },
  { id: 'image-gen', label: 'Image Gen',     icon: Sparkles },
  { id: 'video-gen', label: 'Video Gen',     icon: Video },
  { id: 'gallery',   label: 'AI Gallery',   icon: Library },
  { id: 'memory',    label: 'AI Memory',    icon: Brain },
  { id: 'assistant', label: 'Quantum AI', icon: MessageSquare },
  { id: 'terminal', label: 'Terminal', icon: TerminalIcon },
  { id: 'processes', label: 'Processes', icon: Activity },
  { id: 'docker',    label: 'Docker',      icon: Box },
  { id: 'services',  label: 'Services',  icon: Server },
  { id: 'updates', label: 'Updates', icon: Zap },
  { id: 'optimizer', label: 'Optimizer', icon: Rocket },
  { id: 'cleaner', label: 'Cleaner', icon: Trash2 },
  { id: 'packages', label: 'Packages', icon: Package },
  { id: 'depgraph', label: 'Dependency Graph', icon: Layers },
  { id: 'network',   label: 'Network',   icon: Wifi },
  { id: 'boot',      label: 'Boot Analyser', icon: Clock },
  { id: 'disk',      label: 'Disk Monitor',  icon: HardDrive },
  { id: 'audit',     label: 'Audit Log',     icon: ShieldCheck },
  { id: 'logs',      label: 'Log Viewer',    icon: ScrollText },
  { id: 'startup',   label: 'Startup Apps',  icon: Power },
  { id: 'scheduler', label: 'Scheduler',    icon: Cpu },
  { id: 'settings', label: 'Settings', icon: Settings },
]

interface SidebarProps {
  activeTab: string
  setActiveTab: (id: string) => void
  isExpanded: boolean
  setIsExpanded: (expanded: boolean) => void
  cpuLoad: number
  sidebarWidth: number
}

export default function Sidebar({ activeTab, setActiveTab, isExpanded, setIsExpanded, cpuLoad, sidebarWidth }: SidebarProps) {
  const { theme, setTheme, playSound } = useTheme()

  const handleTabClick = (id: string) => {
    playSound('click')
    setActiveTab(id)
  }

  return (
    <aside
      className="v-sidebar"
      style={{ width: isExpanded ? sidebarWidth : 64 }}
    >
      <div className="h-14 flex items-center px-4 border-b border-white/5 drag">
        <div className="w-8 h-8 rounded-lg bg-crimson flex items-center justify-center mr-3 flex-shrink-0 crimson-glow shadow-[0_0_10px_rgba(239,68,68,0.3)]">
          <span className="font-bold text-white text-xs">V2</span>
        </div>
        {isExpanded && (
          <span className="font-bold tracking-widest text-[10px] uppercase truncate">
            Vortex <span className="text-zinc-500">//</span> Agentic
          </span>
        )}
      </div>

      <nav className="flex-1 py-4 overflow-y-auto no-drag">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleTabClick(item.id)}
            onMouseEnter={() => playSound('hover')}
            onDragOver={(e) => {
              if (item.id === 'video-gen') {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
                // Auto-switch to video tab after a short hover while dragging
                const timer = (window as any)._dragTimer
                if (!timer && activeTab !== 'video-gen') {
                  (window as any)._dragTimer = setTimeout(() => {
                    setActiveTab('video-gen')
                    playSound('hover')
                  }, 600)
                }
              }
            }}
            onDragLeave={() => {
              if (item.id === 'video-gen') {
                clearTimeout((window as any)._dragTimer)
                delete (window as any)._dragTimer
              }
            }}
            onDrop={(e) => {
              if (item.id === 'video-gen') {
                e.preventDefault()
                clearTimeout((window as any)._dragTimer)
                delete (window as any)._dragTimer
                const url = e.dataTransfer.getData('text/plain')
                if (url && url.startsWith('http')) {
                  window.dispatchEvent(new CustomEvent('vortex-set-i2v-source', { detail: url }))
                  setActiveTab('video-gen')
                  playSound('success')
                } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  const file = e.dataTransfer.files[0]
                  if (file.type.startsWith('image/')) {
                    const localUrl = URL.createObjectURL(file)
                    window.dispatchEvent(new CustomEvent('vortex-set-i2v-source', { detail: localUrl }))
                    setActiveTab('video-gen')
                    playSound('success')
                  }
                }
              }
            }}
            className={cn(
              "v-nav-item",
              activeTab === item.id && "active"
            )}
          >
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <item.icon className={cn(
                "w-4 h-4 transition-transform",
                activeTab === item.id ? "crimson-glow text-crimson" : "text-zinc-500"
              )} />
              {!isExpanded && item.id === 'dashboard' && (
                <div style={{
                  position: 'absolute', top: '-3px', right: '-4px',
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: cpuLoad > 85 ? 'var(--crimson)' : cpuLoad > 60 ? '#f59e0b' : 'var(--signal)',
                  boxShadow: `0 0 5px ${cpuLoad > 85 ? 'var(--crimson)' : cpuLoad > 60 ? '#f59e0b' : 'var(--signal)'}`,
                }} />
              )}
            </div>
            {isExpanded && (
              <span className="ml-4 truncate">{item.label}</span>
            )}
            {activeTab === item.id && (
              <motion.div 
                layoutId="active-nav"
                className="absolute left-0 w-[2px] h-5 bg-crimson rounded-r-full"
              />
            )}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-white/5 no-drag bg-black/20 space-y-3">
        {isExpanded && (
          <div className="flex items-center justify-between px-2 mb-2">
            <Palette size={12} className="text-zinc-500" />
            <div className="flex gap-1.5">
              {(['vortex-red', 'cyber-blue', 'neon-gold', 'matrix-green'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTheme(t); playSound('success'); }}
                  className={cn(
                    "w-3 h-3 rounded-full border border-white/10 transition-transform hover:scale-125",
                    t === 'vortex-red' && "bg-red-500",
                    t === 'cyber-blue' && "bg-cyan-400",
                    t === 'neon-gold' && "bg-amber-500",
                    t === 'matrix-green' && "bg-emerald-500",
                    theme.name === t && "ring-2 ring-white/20 ring-offset-2 ring-offset-ink-800"
                  )}
                />
              ))}
            </div>
          </div>
        )}
        <button 
          onClick={() => { setIsExpanded(!isExpanded); playSound('click'); }}
          className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors text-zinc-600 hover:text-zinc-300"
        >
          <span className="text-[9px] font-bold uppercase tracking-[0.2em]">
            {isExpanded ? "« Collapse" : "»"}
          </span>
        </button>
      </div>
    </aside>
  )
}
