import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, Trash2, Plus, Search, ShieldAlert, Check, X } from 'lucide-react'
import { notify } from '../lib/notifications'
import { useTheme } from './ThemeProvider'

interface MemoryFact {
  id: number
  fact: string
  created_at: number
}

export default function MemoryView() {
  const { playSound } = useTheme()
  const [memories, setMemories] = useState<MemoryFact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [newFact, setNewFact] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const loadMemories = async () => {
    if (!(window as any).electron) return
    setLoading(true)
    try {
      const list = await (window as any).electron.memoryGetAll()
      setMemories(list)
    } catch (e) {
      console.error('Failed to load memories:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMemories()
  }, [])

  const handleAdd = async () => {
    if (!newFact.trim()) return
    try {
      const res = await (window as any).electron.memoryAdd(newFact.trim())
      if (res.success) {
        notify('Memory', 'New fact recorded', 'success')
        setNewFact('')
        setIsAdding(false)
        loadMemories()
        playSound('success')
      }
    } catch (e: any) {
      notify('Memory', e.message, 'error')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await (window as any).electron.memoryDelete(id)
      if (res.success) {
        setMemories(prev => prev.filter(m => m.id !== id))
        playSound('click')
      }
    } catch (e: any) {
      notify('Memory', e.message, 'error')
    }
  }

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to wipe all persistent AI memories?')) return
    try {
      const res = await (window as any).electron.memoryClear()
      if (res.success) {
        setMemories([])
        notify('Memory', 'Neural database wiped', 'warning')
        playSound('success')
      }
    } catch (e: any) {
      notify('Memory', e.message, 'error')
    }
  }

  const filtered = memories.filter(m => m.fact.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>

      {/* Header Info */}
      <div className="v-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '20px', background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.1)' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7' }}>
          <Brain size={24} />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: 'white', margin: 0, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Neural Memory Bank</h3>
          <p style={{ fontSize: '11px', color: '#71717a', margin: '4px 0 0', lineHeight: 1.5 }}>
            Persistent facts learned by the AI. These are injected into every chat context to ensure continuity across sessions.
          </p>
        </div>
        <button
          onClick={handleClearAll}
          style={{ padding: '8px 16px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--crimson)', fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <ShieldAlert size={14} /> Wipe Bank
        </button>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#52525b' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search neural patterns..."
            style={{
              width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '10px', padding: '10px 12px 10px 36px', color: '#f4f4f5', fontSize: '12px',
              fontFamily: 'monospace', outline: 'none'
            }}
          />
        </div>

        <button
          onClick={() => setIsAdding(true)}
          style={{ padding: '10px 20px', borderRadius: '10px', background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7', fontSize: '11px', fontFamily: 'monospace', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Plus size={14} /> Add Fact
        </button>
      </div>

      {/* Add Form */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="v-card" style={{ padding: '16px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <textarea
                autoFocus
                value={newFact}
                onChange={e => setNewFact(e.target.value)}
                placeholder="Record a new persistent fact (e.g., 'The user prefers Python for automation scripts')"
                style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px', padding: '12px', color: '#f4f4f5', fontSize: '13px', fontFamily: 'monospace', resize: 'none', minHeight: '80px', outline: 'none' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button onClick={handleAdd} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(168,85,247,0.2)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)', cursor: 'pointer' }}><Check size={16} /></button>
                <button onClick={() => setIsAdding(false)} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: '#52525b', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}><X size={16} /></button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content Area */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {loading ? (
          <div style={{ textAlign: 'center', opacity: 0.3, padding: '40px', fontFamily: 'monospace', fontSize: '12px' }}>Synchronizing neural buffers...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', opacity: 0.1, padding: '80px', fontFamily: 'monospace', fontSize: '12px' }}>No persistent patterns detected.</div>
        ) : (
          <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '40px' }}>
            {filtered.map(m => (
              <motion.div
                layout
                key={m.id}
                className="v-card"
                style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}
              >
                <div style={{ width: '4px', height: '24px', background: 'var(--crimson)', borderRadius: '2px', opacity: 0.5 }} />
                <div style={{ flex: 1, fontSize: '13px', color: '#d4d4d8', lineHeight: 1.5 }}>{m.fact}</div>
                <div style={{ fontSize: '10px', color: '#3f3f46', fontFamily: 'monospace' }}>{new Date(m.created_at * 1000).toLocaleDateString()}</div>
                <button
                  onClick={() => handleDelete(m.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3f3f46', padding: '6px', borderRadius: '6px', transition: 'all 0.2s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--crimson)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#3f3f46'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                >
                  <Trash2 size={14} />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
