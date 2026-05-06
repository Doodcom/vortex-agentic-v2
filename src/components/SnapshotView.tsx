import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, RotateCcw, Trash2, RefreshCw, Plus, AlertTriangle, CheckCircle2, AlertCircle, Clock, HardDrive } from 'lucide-react'

interface Snapshot {
  id: string
  type: string
  date: string
  description: string
  usedSpace: string
}

type Op = { kind: 'delete' | 'rollback'; id: string }

const TYPE_COLOR: Record<string, string> = {
  single:   '#6366f1',
  pre:      '#f59e0b',
  post:     '#10b981',
  timeline: '#3b82f6',
}

export default function SnapshotView() {
  const [snapshots, setSnapshots]     = useState<Snapshot[]>([])
  const [loading, setLoading]         = useState(true)
  const [notAvailable, setNotAvailable] = useState(false)
  const [createDesc, setCreateDesc]   = useState('')
  const [creating, setCreating]       = useState(false)
  const [toast, setToast]             = useState<{ msg: string; ok: boolean } | null>(null)
  const [pending, setPending]         = useState<Op | null>(null)
  const [busy, setBusy]               = useState<string | null>(null)

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    if (!(window as any).electron) return
    setLoading(true)
    const res = await window.electron.systemSnapperList()
    if (!res.success) {
      setNotAvailable(true)
    } else {
      setNotAvailable(false)
      setSnapshots(res.snapshots.filter(s => s.id !== '0'))
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    const desc = createDesc.trim() || 'Manual snapshot'
    setCreating(true)
    const res = await window.electron.systemSnapperCreate({ description: desc })
    setCreating(false)
    if (res.success) {
      showToast(`Snapshot #${res.id} created`, true)
      setCreateDesc('')
      await load()
    } else {
      showToast(res.error ?? 'Create failed', false)
    }
  }

  const handleDelete = async (id: string) => {
    setPending(null)
    setBusy(id)
    const res = await window.electron.systemSnapperDelete({ id })
    setBusy(null)
    if (res.success) {
      setSnapshots(prev => prev.filter(s => s.id !== id))
      showToast(`Snapshot #${id} deleted`, true)
    } else {
      showToast(res.error ?? 'Delete failed', false)
    }
  }

  const handleRollback = async (id: string) => {
    setPending(null)
    setBusy(id)
    const res = await window.electron.systemSnapperRollback({ id })
    setBusy(null)
    if (res.success) {
      showToast(`Rollback to #${id} queued — reboot to apply`, true)
    } else {
      showToast(res.error ?? 'Rollback failed', false)
    }
  }

  if (notAvailable) return (
    <div className="v-card" style={{ padding: '32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      <AlertCircle size={32} style={{ color: '#52525b' }} />
      <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#71717a' }}>Snapper Not Available</div>
      <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#3f3f46', maxWidth: '400px', lineHeight: '1.6' }}>
        Install <code style={{ color: 'var(--signal)' }}>snapper</code> and configure a root config (<code style={{ color: 'var(--signal)' }}>snapper -c root create-config /</code>) to enable restore points. Requires Btrfs filesystem.
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 200, display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px', background: toast.ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${toast.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', fontSize: '12px', fontFamily: 'monospace', color: toast.ok ? 'var(--signal)' : 'var(--crimson)' }}
          >
            {toast.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm modal */}
      <AnimatePresence>
        {pending && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setPending(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="v-card" style={{ position: 'relative', zIndex: 10, padding: '28px', maxWidth: '400px', width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <AlertTriangle size={20} style={{ color: 'var(--crimson)' }} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'white' }}>
                    {pending.kind === 'rollback' ? 'Rollback to Snapshot' : 'Delete Snapshot'} #{pending.id}
                  </div>
                  <div style={{ fontSize: '11px', color: '#71717a', marginTop: '2px' }}>
                    {pending.kind === 'rollback'
                      ? 'This sets the snapshot as default for next boot. Current state is preserved as a new snapshot.'
                      : 'This permanently removes the snapshot and cannot be undone.'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setPending(null)} style={{ padding: '8px 16px', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#71717a', fontSize: '11px', fontFamily: 'monospace', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button
                  onClick={() => pending.kind === 'rollback' ? handleRollback(pending.id) : handleDelete(pending.id)}
                  style={{ padding: '8px 20px', borderRadius: '8px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--crimson)', fontSize: '11px', fontFamily: 'monospace', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  {pending.kind === 'rollback' ? 'Rollback' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {[
          { label: 'Total Snapshots', value: snapshots.length,                                                          icon: Camera,    color: 'var(--crimson)' },
          { label: 'Manual',          value: snapshots.filter(s => s.type === 'single').length,                          icon: Plus,      color: '#6366f1' },
          { label: 'Auto / Pre-Post', value: snapshots.filter(s => s.type === 'pre' || s.type === 'timeline').length,   icon: Clock,     color: '#f59e0b' },
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

      {/* Create */}
      <div className="v-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Camera size={13} style={{ color: 'var(--signal)' }} />
          <span style={{ fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#71717a', fontWeight: 'bold' }}>Create Restore Point</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={createDesc}
            onChange={e => setCreateDesc(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Description (optional)"
            style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 12px', color: '#f4f4f5', fontSize: '12px', fontFamily: 'monospace', outline: 'none' }}
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{ padding: '8px 20px', borderRadius: '8px', background: 'rgba(34,211,238,0.10)', border: '1px solid rgba(34,211,238,0.2)', color: 'var(--signal)', fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {creating ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
            {creating ? 'Creating...' : 'Snapshot'}
          </button>
        </div>
        <div style={{ fontSize: '9px', fontFamily: 'monospace', color: '#3f3f46' }}>
          Creates a <code style={{ color: '#52525b' }}>single</code> type snapshot of the root btrfs subvolume.
        </div>
      </div>

      {/* Snapshot list */}
      <div className="v-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <HardDrive size={13} style={{ color: '#52525b' }} />
          <span style={{ fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#a1a1aa', fontWeight: 'bold' }}>Restore Points</span>
          <button onClick={load} style={{ marginLeft: 'auto', padding: '3px 8px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: '#52525b', fontSize: '9px', fontFamily: 'monospace', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <RefreshCw size={9} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '50px 80px 1fr 200px 80px 140px', gap: '0 12px', padding: '6px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '8px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#3f3f46' }}>
          <span>#</span><span>Type</span><span>Description</span><span>Date</span><span>Size</span><span>Actions</span>
        </div>

        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#3f3f46', fontFamily: 'monospace', fontSize: '11px', fontStyle: 'italic' }}>Loading snapshots...</div>
        ) : snapshots.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#3f3f46', fontFamily: 'monospace', fontSize: '11px', fontStyle: 'italic' }}>No snapshots found. Create one above.</div>
        ) : snapshots.map((s, i) => {
          const tColor = TYPE_COLOR[s.type] ?? '#52525b'
          const isBusy = busy === s.id
          return (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '50px 80px 1fr 200px 80px 140px', gap: '0 12px', padding: '9px 16px', borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: '11px', fontFamily: 'monospace', alignItems: 'center', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.003)', opacity: isBusy ? 0.4 : 1, transition: 'opacity 0.2s' }}>
              <span style={{ color: '#52525b', fontSize: '10px' }}>#{s.id}</span>
              <span style={{ fontSize: '8px', textTransform: 'uppercase', color: tColor, fontWeight: 'bold' }}>{s.type}</span>
              <span style={{ color: '#d4d4d8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.description}>{s.description || '—'}</span>
              <span style={{ color: '#52525b', fontSize: '10px' }}>{s.date || '—'}</span>
              <span style={{ color: '#71717a', fontSize: '10px' }}>{s.usedSpace || '—'}</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => setPending({ kind: 'rollback', id: s.id })}
                  disabled={isBusy}
                  title="Rollback to this snapshot on next boot"
                  style={{ padding: '3px 8px', borderRadius: '6px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: '#6366f1', fontSize: '8px', fontFamily: 'monospace', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                >
                  <RotateCcw size={9} /> Rollback
                </button>
                <button
                  onClick={() => setPending({ kind: 'delete', id: s.id })}
                  disabled={isBusy}
                  style={{ padding: '3px 8px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: '#52525b', fontSize: '8px', fontFamily: 'monospace', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                >
                  <Trash2 size={9} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Info callout */}
      <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.12)', fontSize: '10px', fontFamily: 'monospace', color: '#52525b', lineHeight: '1.7' }}>
        <span style={{ color: '#6366f1', fontWeight: 'bold' }}>Rollback</span> queues the snapshot as the default Btrfs subvolume — takes effect after reboot. Current state is automatically preserved as a new snapshot before rollback. Managed by <code style={{ color: 'var(--signal)' }}>snapper -c root</code>.
      </div>

    </div>
  )
}
