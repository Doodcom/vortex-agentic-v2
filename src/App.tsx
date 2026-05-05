import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

import Sidebar from './components/Sidebar'
import Header from './components/Header'
import DashboardView from './components/DashboardView'
import AssistantView from './components/AssistantView'
import UpdatesView from './components/UpdatesView'
import CleanerView from './components/CleanerView'
import OptimizerView from './components/OptimizerView'
import TerminalView from './components/TerminalView'
import SettingsPage from './components/SettingsPage'
import ServiceView from './components/ServiceView'
import ProcessView from './components/ProcessView'
import NetworkView from './components/NetworkView'
import BootView from './components/BootView'
import DiskView from './components/DiskView'
import AuditView from './components/AuditView'
import PackagesView from './components/PackagesView'
import CommandPalette from './components/CommandPalette'
import StatusBar from './components/StatusBar'
import LogView from './components/LogView'
import StartupView from './components/StartupView'
import ImageView from './components/ImageView'
import VideoView from './components/VideoView'
import GalleryView from './components/GalleryView'
import MemoryView from './components/MemoryView'
import DockerView from './components/DockerView'
import HomeView from './components/HomeView'
import SchedulerView from './components/SchedulerView'
import DepGraph from './components/DepGraph'
import { useTheme } from './components/ThemeProvider'
import { navItems } from './components/Sidebar'

export default function App() {
  const { animationsEnabled } = useTheme()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [i2vSource, setI2vSource] = useState<string | null>(null)
  const [stats, setStats] = useState<any>(null)
  const [sidebarWidth, setSidebarWidth] = useState(() => parseInt(localStorage.getItem('vortex-sidebar-width') ?? '256', 10))
  const [explorePkg, setExplorePkg] = useState<string | null>(null)
  const isDraggingRef = useRef(false)
  const dragStartXRef = useRef(0)
  const dragStartWidthRef = useRef(256)

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (!isSidebarExpanded) return
    e.preventDefault()
    isDraggingRef.current = true
    dragStartXRef.current = e.clientX
    dragStartWidthRef.current = sidebarWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [isSidebarExpanded, sidebarWidth])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return
      const delta = e.clientX - dragStartXRef.current
      const w = Math.max(180, Math.min(380, dragStartWidthRef.current + delta))
      const el = document.querySelector('.v-sidebar') as HTMLElement | null
      if (el) { el.style.width = `${w}px`; el.style.transition = 'none' }
    }
    const onUp = () => {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      const el = document.querySelector('.v-sidebar') as HTMLElement | null
      if (el) {
        const w = parseInt(el.style.width, 10) || dragStartWidthRef.current
        el.style.transition = ''
        setSidebarWidth(w)
        localStorage.setItem('vortex-sidebar-width', String(w))
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA'

      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const n = parseInt(e.key)
        if (n >= 1 && n <= navItems.length) {
          e.preventDefault()
          setActiveTab(navItems[n - 1].id)
          return
        }
        if (e.key === 'k' && !isTyping) {
          e.preventDefault()
          setActiveTab('assistant')
          setTimeout(() => window.dispatchEvent(new CustomEvent('vortex-focus-ai')), 50)
          return
        }
        if (e.key === '`' && !isTyping) {
          e.preventDefault()
          setActiveTab('terminal')
          setTimeout(() => window.dispatchEvent(new CustomEvent('vortex-focus-terminal')), 50)
          return
        }
        if (e.key === 'p') {
          e.preventDefault()
          setIsCommandPaletteOpen(true)
          return
        }
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('vortex-new-chat'))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Renderer-side context menu listener (aggresive restoration)
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      if ((window as any).electron) {
        // Build basic props to mimic Electron's native context-menu event
        const props = {
          x: e.clientX,
          y: e.clientY,
          editFlags: {
            canCut: true,
            canCopy: true,
            canPaste: true
          }
        }
        ;(window as any).electron.showContextMenu(props)
      }
    }
    window.addEventListener('contextmenu', handleContextMenu)
    return () => window.removeEventListener('contextmenu', handleContextMenu)
  }, [])

  useEffect(() => {
    const fetchStats = async () => {
      if (!(window as any).electron) return
      try {
        const s = await (window as any).electron.getSystemStats()
        setStats(s)
      } catch (e) {
        console.error('Failed to fetch stats:', e)
      }
    }
    fetchStats()
    const id = setInterval(fetchStats, 2000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const handleSetI2vSource = (e: any) => {
      setI2vSource(e.detail)
    }
    window.addEventListener('vortex-set-i2v-source', handleSetI2vSource)
    return () => window.removeEventListener('vortex-set-i2v-source', handleSetI2vSource)
  }, [])

  const handleSetActiveTab = useCallback(async (id: string) => {
    const isAssistant = activeTab === 'assistant';
    const isComfy = activeTab === 'image-gen' || activeTab === 'video-gen';
    const targetAssistant = id === 'assistant';
    const targetComfy = id === 'image-gen' || id === 'video-gen';

    // 1. Moving AWAY from Assistant to anything else
    if (isAssistant && !targetAssistant) {
      if ((window as any).electron?.ollamaPurge) {
        console.log('[Vortex] Purging LLM VRAM on exit');
        await (window as any).electron.ollamaPurge();
      }
    }
    
    // 2. Moving AWAY from Comfy (Image/Video) to anything else
    if (isComfy && !targetComfy) {
      if ((window as any).electron?.comfyPurge) {
        console.log('[Vortex] Purging ComfyUI VRAM on exit');
        await (window as any).electron.comfyPurge();
      }
    }

    // 3. Moving TO Comfy from Assistant (Cross-Engine swap)
    if (isAssistant && targetComfy) {
       if ((window as any).electron?.ollamaPurge) {
        console.log('[Vortex] Swapping LLM -> Comfy: Purging LLM');
        await (window as any).electron.ollamaPurge();
      }
    }

    // 4. Moving TO Assistant from Comfy (Cross-Engine swap)
    if (isComfy && targetAssistant) {
      if ((window as any).electron?.comfyPurge) {
        console.log('[Vortex] Swapping Comfy -> LLM: Purging Comfy');
        await (window as any).electron.comfyPurge();
      }
    }
    
    setActiveTab(id)
  }, [activeTab])

  return (
    <div className="v-app" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
      
      <Sidebar
        activeTab={activeTab}
        setActiveTab={handleSetActiveTab}
        isExpanded={isSidebarExpanded}
        setIsExpanded={setIsSidebarExpanded}
        cpuLoad={stats?.cpu?.load ?? 0}
        sidebarWidth={sidebarWidth}
      />
      {/* Drag handle */}
      {isSidebarExpanded && (
        <div
          onMouseDown={handleDragStart}
          style={{ width: '4px', flexShrink: 0, cursor: 'col-resize', background: 'transparent', position: 'relative', zIndex: 20, transition: 'background 0.15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(239,68,68,0.25)' }}
          onMouseLeave={e => { if (!isDraggingRef.current) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
        />
      )}

      <CommandPalette 
        isOpen={isCommandPaletteOpen} 
        setIsOpen={setIsCommandPaletteOpen} 
        onNavigate={setActiveTab} 
      />

      <main className="v-main">
        <Header />

        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', background: 'var(--ink-900)' }}>
          {/* Subtle Grid Pattern */}
          <div style={{ 
            position: 'absolute', inset: 0, opacity: 0.03, pointerEvents: 'none',
            backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '32px 32px' 
          }} />

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: animationsEnabled ? 0 : 1, x: animationsEnabled ? 20 : 0 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: animationsEnabled ? 0 : 1, x: animationsEnabled ? -20 : 0 }}
              transition={{ duration: animationsEnabled ? 0.3 : 0, ease: "easeOut" }}
              style={{ height: '100%', width: '100%', padding: '32px', overflowY: 'auto', position: 'relative', zIndex: 10, boxSizing: 'border-box' }}
            >
              <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <header style={{ marginBottom: '32px' }}>
                  <h1 className="v-h1">
                    {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                    <span style={{ WebkitTextFillColor: 'var(--crimson)', opacity: 0.5, marginLeft: '10px', fontStyle: 'normal', fontWeight: 300 }}>/</span>
                  </h1>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontFamily: 'monospace', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#334155' }}>
                    <span className="animate-pulse-dot" style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--signal)', flexShrink: 0 }} />
                    <span>System Online</span>
                  </div>
                </header>
                
                {activeTab === 'dashboard' ? (
                  <DashboardView stats={stats} onNavigate={setActiveTab} />
                ) : activeTab === 'home' ? (
                  <HomeView />
                ) : activeTab === 'assistant' ? (
                  <AssistantView />
                ) : activeTab === 'updates' ? (
                  <UpdatesView />
                ) : activeTab === 'cleaner' ? (
                  <CleanerView />
                ) : activeTab === 'optimizer' ? (
                  <OptimizerView />
                ) : activeTab === 'packages' ? (
                  <PackagesView onExplore={(name) => { setExplorePkg(name); setActiveTab('depgraph') }} />
                ) : activeTab === 'depgraph' ? (
                  <DepGraphWrapper initialPackage={explorePkg} />
                ) : activeTab === 'processes' ? (
                  <ProcessView />
                ) : activeTab === 'services' ? (
                  <ServiceView />
                ) : activeTab === 'docker' ? (
                  <DockerView />
                ) : activeTab === 'network' ? (
                  <NetworkView />
                ) : activeTab === 'boot' ? (
                  <BootView />
                ) : activeTab === 'disk' ? (
                  <DiskView />
                ) : activeTab === 'audit' ? (
                  <AuditView />
                ) : activeTab === 'logs' ? (
                  <LogView />
                ) : activeTab === 'startup' ? (
                  <StartupView />
                ) : activeTab === 'image-gen' ? (
                  <ImageView onAnimate={(url) => { setI2vSource(url); setActiveTab('video-gen') }} />
                ) : activeTab === 'video-gen' ? (
                  <VideoView i2vSource={i2vSource} />
                ) : activeTab === 'gallery' ? (
                  <GalleryView />
                ) : activeTab === 'memory' ? (
                  <MemoryView />
                ) : activeTab === 'terminal' ? (
                  <TerminalView onAskAI={setActiveTab} />
                ) : activeTab === 'scheduler' ? (
                  <SchedulerView />
                ) : activeTab === 'settings' ? (
                  <SettingsPage />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', opacity: 0.3, fontStyle: 'italic', fontFamily: 'monospace', fontSize: '14px' }}>
                    <div style={{ width: '48px', height: '48px', border: '2px dashed #52525b', borderRadius: '50%', marginBottom: '16px' }} />
                    Segment_Loading: {activeTab.toUpperCase()}...
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
        <StatusBar stats={stats} />
      </main>
    </div>
  )
}

function DepGraphWrapper({ initialPackage }: { initialPackage: string | null }) {
  const [tree, setTree] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState(initialPackage ?? 'linux')

  useEffect(() => {
    async function fetch() {
      if (!(window as any).electron) return
      setLoading(true)
      const res = await (window as any).electron.packageGetTree(target)
      setTree(res)
      setLoading(false)
    }
    fetch()
  }, [target])

  if (!tree && loading) return <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'monospace', color: '#52525b' }}>Analysing dependency tree...</div>
  if (!tree) return <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'monospace', color: '#52525b' }}>Failed to load dependency data.</div>

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', margin: 0 }}>Dependency Visualiser</h2>
        <p style={{ fontSize: '11px', color: '#52525b', marginTop: '4px' }}>Deep-scan of package relationships for <span style={{ color: 'var(--crimson)' }}>{target}</span></p>
      </div>
      <DepGraph tree={tree} loading={loading} onDrillDown={setTarget} />
    </div>
  )
}
