import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Zap, Trash2, LayoutDashboard, MessageSquare, RefreshCw, Sparkles, Video, Box, Layers,
  Home, Terminal, Network, Cpu, HardDrive, Activity, List, Settings, Brain, Image, BookOpen,
  Shield, Rocket, BarChart3, Play, Server, BotMessageSquare, Camera, GitBranch,
  CalendarClock, KeyRound, FlameKindling, Archive, Gauge, Variable, AppWindow, HeartPulse
} from 'lucide-react'
import { cn } from '../lib/utils'

interface CommandPaletteProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  onNavigate: (tab: string) => void
}

const COMMANDS = [
  { id: 'dash',      label: 'Dashboard',               icon: LayoutDashboard, action: 'nav:dashboard',  shortcut: 'Ctrl+1' },
  { id: 'assistant', label: 'AI Assistant',             icon: MessageSquare,   action: 'nav:assistant',  shortcut: 'Ctrl+2' },
  { id: 'image',     label: 'Image Generation',         icon: Sparkles,        action: 'nav:image-gen',  shortcut: 'Ctrl+3' },
  { id: 'video',     label: 'Video Generation',         icon: Video,           action: 'nav:video-gen',  shortcut: 'Ctrl+4' },
  { id: 'memory',    label: 'AI Memory',                icon: Brain,           action: 'nav:memory',     shortcut: 'Ctrl+5' },
  { id: 'ai-models', label: 'AI Models (Ollama)',      icon: BotMessageSquare, action: 'nav:ai-models'  },
  { id: 'home',      label: 'Home Assistant',           icon: Home,            action: 'nav:home',       shortcut: 'Ctrl+6' },
  { id: 'updates',   label: 'System Updates',           icon: RefreshCw,       action: 'nav:updates',    shortcut: 'Ctrl+7' },
  { id: 'packages',  label: 'Package Manager',          icon: Box,             action: 'nav:packages',   shortcut: 'Ctrl+8' },
  { id: 'scheduler', label: 'CPU Scheduler (SCX/BORE)', icon: Cpu,             action: 'nav:scheduler',  shortcut: 'Ctrl+9' },
  { id: 'processes', label: 'Process Manager',          icon: Activity,        action: 'nav:processes'   },
  { id: 'services',  label: 'Systemd Services',         icon: Server,          action: 'nav:services'    },
  { id: 'docker',    label: 'Docker Containers',        icon: Play,            action: 'nav:docker'      },
  { id: 'network',   label: 'Network Monitor',          icon: Network,         action: 'nav:network'     },
  { id: 'disk',      label: 'Disk & SMART',             icon: HardDrive,       action: 'nav:disk'        },
  { id: 'boot',      label: 'Boot Analyzer',            icon: Rocket,          action: 'nav:boot'        },
  { id: 'logs',      label: 'Log Viewer',               icon: BookOpen,        action: 'nav:logs'        },
  { id: 'startup',   label: 'Startup Apps',             icon: List,            action: 'nav:startup'     },
  { id: 'cleaner',    label: 'System Cleaner',            icon: Trash2,          action: 'nav:cleaner'     },
  { id: 'snapshots',  label: 'Restore Points (Snapper)', icon: Camera,          action: 'nav:snapshots'   },
  { id: 'optimizer', label: 'Optimizer (x86-v4)',       icon: Zap,             action: 'nav:optimizer'   },
  { id: 'sandbox',   label: 'WinBoat Sandbox',          icon: Shield,          action: 'nav:sandbox'     },
  { id: 'gallery',   label: 'Asset Gallery',            icon: Image,           action: 'nav:gallery'     },
  { id: 'terminal',  label: 'Terminal',                 icon: Terminal,        action: 'nav:terminal'    },
  { id: 'audit',     label: 'Audit Log',                icon: BarChart3,       action: 'nav:audit'       },
  { id: 'depgraph',  label: 'Dependency Graph',         icon: Layers,          action: 'nav:depgraph'    },
  { id: 'automations', label: 'Automation Workflows',    icon: GitBranch,       action: 'nav:automations' },
  { id: 'cron',      label: 'Cron Job Manager',         icon: CalendarClock,   action: 'nav:cron'        },
  { id: 'ssh',       label: 'SSH Key Manager',          icon: KeyRound,        action: 'nav:ssh'         },
  { id: 'firewall',  label: 'UFW Firewall',             icon: FlameKindling,   action: 'nav:firewall'    },
  { id: 'vault',     label: 'Dotfile Vault',            icon: Archive,         action: 'nav:vault'       },
  { id: 'benchmark', label: 'System Benchmark',         icon: Gauge,           action: 'nav:benchmark'   },
  { id: 'env',       label: 'Environment Variables',    icon: Variable,        action: 'nav:env'         },
  { id: 'app-launcher', label: 'App Launcher',          icon: AppWindow,       action: 'nav:app-launcher'},
  { id: 'health',    label: 'Health Report',            icon: HeartPulse,      action: 'nav:health'      },
  { id: 'settings',  label: 'Settings',                 icon: Settings,        action: 'nav:settings'    },
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
                  {(cmd as any).shortcut && (
                    <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-mono text-zinc-500">
                      {(cmd as any).shortcut}
                    </kbd>
                  )}
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
