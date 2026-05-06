import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, Download, Trash2, RefreshCw, X, CheckCircle2, AlertCircle, HardDrive, Layers } from 'lucide-react'

interface OllamaModel {
  name: string
  size: number
  modified_at: string
  details: {
    parameter_size: string
    quantization_level: string
    family: string
  }
}

interface PullProgress {
  status: string
  completed?: number
  total?: number
}

function fmtSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

const FAMILY_COLORS: Record<string, string> = {
  llama:   '#f59e0b',
  mistral: '#6366f1',
  gemma:   '#10b981',
  qwen:    '#3b82f6',
  phi:     '#8b5cf6',
  deepseek:'#ef4444',
}

function familyColor(family: string): string {
  return FAMILY_COLORS[family?.toLowerCase()] ?? '#52525b'
}

export default function OllamaModelsView() {
  const [models, setModels] = useState<OllamaModel[]>([])
  const [loading, setLoading] = useState(true)
  const [pullName, setPullName] = useState('')
  const [pulling, setPulling] = useState(false)
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null)
  const [pullError, setPullError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const load = useCallback(async () => {
    if (!(window as any).electron) return
    setLoading(true)
    const list = await (window as any).electron.ollamaListModels()
    setModels(list)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    return () => { cleanupRef.current?.() }
  }, [load])

  const handlePull = async () => {
    const name = pullName.trim()
    if (!name || pulling) return
    setPulling(true)
    setPullError(null)
    setPullProgress({ status: 'Connecting...' })

    cleanupRef.current?.()
    const unsub = (window as any).electron.on('ollama-pull-progress', (p: PullProgress) => {
      setPullProgress(p)
    })
    cleanupRef.current = unsub

    const result = await (window as any).electron.ollamaPullModel({ name })
    cleanupRef.current?.()
    cleanupRef.current = null

    if (result.success) {
      setPullProgress({ status: 'success' })
      setPullName('')
      await load()
    } else {
      setPullError(result.error ?? 'Pull failed')
    }
    setPulling(false)
  }

  const handleDelete = async (name: string) => {
    setDeleting(name)
    setDeleteConfirm(null)
    const result = await (window as any).electron.ollamaDeleteModel({ name })
    if (result.success) {
      setModels(prev => prev.filter(m => m.name !== name))
    }
    setDeleting(null)
  }

  const totalSize = models.reduce((sum, m) => sum + m.size, 0)
  const pullPct = pullProgress?.total ? Math.round((pullProgress.completed! / pullProgress.total) * 100) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {[
          { label: 'Installed Models', value: models.length, icon: Brain,      color: 'var(--crimson)' },
          { label: 'Total Size',       value: fmtSize(totalSize), icon: HardDrive, color: '#f59e0b' },
          { label: 'Families',         value: [...new Set(models.map(m => m.details?.family).filter(Boolean))].length, icon: Layers, color: 'var(--signal)' },
        ].map(s => (
          <div key={s.label} className="v-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ padding: '8px', borderRadius: '8px', background: `${s.color}15`, border: `1px solid ${s.color}30` }}>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <div>
              <div style={{ fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase', color: '#52525b', marginBottom: '3px' }}>{s.label}</div>
              <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 'bold', color: '#f4f4f5' }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Pull panel */}
      <div className="v-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Download size={13} style={{ color: 'var(--signal)' }} />
          <span style={{ fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#71717a', fontWeight: 'bold' }}>Pull New Model</span>
          <span style={{ fontSize: '9px', fontFamily: 'monospace', color: '#3f3f46', marginLeft: '4px' }}>e.g. llama3.2, qwen2.5:7b, deepseek-r1:8b</span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={pullName}
            onChange={e => setPullName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handlePull()}
            placeholder="model:tag"
            disabled={pulling}
            style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 12px', color: '#f4f4f5', fontSize: '12px', fontFamily: 'monospace', outline: 'none' }}
          />
          <button
            onClick={handlePull}
            disabled={pulling || !pullName.trim()}
            style={{ padding: '8px 20px', borderRadius: '8px', background: pulling ? 'rgba(34,211,238,0.08)' : 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.2)', color: 'var(--signal)', fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', cursor: pulling ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !pullName.trim() ? 0.4 : 1 }}
          >
            {pulling ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
            {pulling ? 'Pulling...' : 'Pull'}
          </button>
        </div>

        <AnimatePresence>
          {pullProgress && pulling && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#71717a' }}>{pullProgress.status}</span>
                  {pullPct !== null && <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--signal)' }}>{pullPct}%</span>}
                </div>
                {pullPct !== null && (
                  <div style={{ height: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                    <motion.div animate={{ width: `${pullPct}%` }} style={{ height: '100%', background: 'var(--signal)', borderRadius: '2px' }} transition={{ ease: 'easeOut' }} />
                  </div>
                )}
              </div>
            </motion.div>
          )}
          {pullProgress?.status === 'success' && !pulling && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', fontFamily: 'monospace', color: 'var(--signal)' }}>
              <CheckCircle2 size={12} /> Model pulled successfully
            </motion.div>
          )}
          {pullError && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', fontFamily: 'monospace', color: 'var(--crimson)' }}>
              <AlertCircle size={12} /> {pullError}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Model list */}
      <div className="v-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Brain size={13} style={{ color: 'var(--crimson)' }} />
          <span style={{ fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#a1a1aa', fontWeight: 'bold' }}>Installed Models</span>
          <button onClick={load} style={{ marginLeft: 'auto', padding: '3px 8px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: '#52525b', fontSize: '9px', fontFamily: 'monospace', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <RefreshCw size={9} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 110px 70px 70px', gap: '0 12px', padding: '6px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '8px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#3f3f46' }}>
          <span>Name</span><span>Family</span><span>Parameters</span><span>Quantization</span><span>Size</span><span>Actions</span>
        </div>

        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#3f3f46', fontFamily: 'monospace', fontSize: '11px', fontStyle: 'italic' }}>Loading models...</div>
        ) : models.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#3f3f46', fontFamily: 'monospace', fontSize: '11px', fontStyle: 'italic' }}>No models installed. Pull one above.</div>
        ) : models.map((m, i) => {
          const family = m.details?.family ?? '—'
          const fColor = familyColor(family)
          const isDeleting = deleting === m.name
          const isConfirming = deleteConfirm === m.name
          return (
            <motion.div
              key={m.name}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, height: 0 }}
              style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 110px 70px 70px', gap: '0 12px', padding: '9px 16px', borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: '11px', fontFamily: 'monospace', alignItems: 'center', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.003)', opacity: isDeleting ? 0.4 : 1, transition: 'opacity 0.2s' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                <span style={{ color: '#f4f4f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.name}>{m.name}</span>
                <span style={{ fontSize: '8px', color: '#3f3f46' }}>{fmtDate(m.modified_at)}</span>
              </div>

              <span style={{ fontSize: '9px', textTransform: 'uppercase', color: fColor, fontWeight: 'bold' }}>{family}</span>
              <span style={{ color: '#a1a1aa' }}>{m.details?.parameter_size ?? '—'}</span>
              <span style={{ color: '#71717a', fontSize: '10px' }}>{m.details?.quantization_level ?? '—'}</span>
              <span style={{ color: '#52525b' }}>{fmtSize(m.size)}</span>

              <div>
                {isConfirming ? (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => handleDelete(m.name)}
                      style={{ padding: '3px 7px', borderRadius: '5px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--crimson)', fontSize: '8px', fontFamily: 'monospace', cursor: 'pointer' }}
                    >Del</button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      style={{ padding: '3px 6px', borderRadius: '5px', background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: '#52525b', fontSize: '8px', fontFamily: 'monospace', cursor: 'pointer' }}
                    ><X size={9} /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(m.name)}
                    disabled={isDeleting}
                    style={{ padding: '4px 8px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: '#52525b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', fontFamily: 'monospace' }}
                  >
                    <Trash2 size={10} /> Delete
                  </button>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Popular models reference */}
      <div className="v-card" style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: '8px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#3f3f46', marginBottom: '10px' }}>Popular Models</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {[
            'llama3.2:3b', 'llama3.1:8b', 'qwen2.5:7b', 'qwen2.5-coder:7b',
            'deepseek-r1:8b', 'mistral:7b', 'gemma3:4b', 'phi4:14b',
            'nomic-embed-text', 'codellama:7b',
          ].map(name => (
            <button
              key={name}
              onClick={() => setPullName(name)}
              style={{ padding: '3px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: '#52525b', fontSize: '9px', fontFamily: 'monospace', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f4f4f5'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.15)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#52525b'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.06)' }}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}
