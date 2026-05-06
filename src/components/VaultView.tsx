import { useState, useCallback, useEffect } from 'react'
import { Archive, Plus, Trash2, RotateCcw, RefreshCw, X, FolderOpen, Save } from 'lucide-react'
import { notify } from '../lib/notifications'

const VAULT_PATHS_KEY = 'vortex-vault-paths'

const DEFAULT_PATHS = [
  '~/.bashrc', '~/.zshrc', '~/.config/fish/config.fish',
  '~/.gitconfig', '~/.ssh/config', '~/.config/nvim',
  '~/.config/hypr', '~/.config/waybar', '~/.config/kitty',
]

interface Backup { filename: string; ts: number; path: string }

function loadPaths(): string[] {
  try { return JSON.parse(localStorage.getItem(VAULT_PATHS_KEY) ?? 'null') ?? DEFAULT_PATHS } catch { return DEFAULT_PATHS }
}

export default function VaultView() {
  const [paths, setPaths] = useState<string[]>(loadPaths)
  const [newPath, setNewPath] = useState('')
  const [backups, setBackups] = useState<Backup[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const savePaths = (p: string[]) => { setPaths(p); localStorage.setItem(VAULT_PATHS_KEY, JSON.stringify(p)) }

  const addPath = () => {
    const t = newPath.trim()
    if (!t || paths.includes(t)) return
    savePaths([...paths, t])
    setNewPath('')
  }

  const removePath = (p: string) => savePaths(paths.filter(x => x !== p))

  const loadBackups = useCallback(async () => {
    setLoading(true)
    const res = await (window as any).electron.vaultListBackups()
    if (res.success) setBackups(res.backups)
    setLoading(false)
  }, [])

  useEffect(() => { loadBackups() }, [loadBackups])

  const createBackup = async () => {
    if (paths.length === 0) return
    setCreating(true)
    const res = await (window as any).electron.vaultCreate({ paths })
    setCreating(false)
    if (res.success) { notify('Vault', `Backup created: ${res.filename}`, 'success'); loadBackups() }
    else notify('Vault', `Backup failed: ${res.error}`, 'error')
  }

  const restore = async (filename: string) => {
    const res = await (window as any).electron.vaultRestore({ filename })
    setConfirmRestore(null)
    if (res.success) notify('Vault', `Restored from ${filename}`, 'success')
    else notify('Vault', `Restore failed: ${res.error}`, 'error')
  }

  const deleteBackup = async (filename: string) => {
    const res = await (window as any).electron.vaultDelete({ filename })
    setConfirmDel(null)
    if (res.success) { notify('Vault', 'Backup deleted', 'success'); setBackups(prev => prev.filter(b => b.filename !== filename)) }
    else notify('Vault', `Delete failed: ${res.error}`, 'error')
  }

  return (
    <div style={{ maxWidth: '700px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
      {/* Left: file list */}
      <div>
        <div style={{ fontSize: '10px', fontFamily: 'monospace', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <FolderOpen size={12} /> Files to Back Up
        </div>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
          <input
            value={newPath}
            onChange={e => setNewPath(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addPath()}
            placeholder="~/.config/something"
            style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '5px 8px', fontSize: '11px', fontFamily: 'monospace', color: '#e2e8f0' }}
          />
          <button onClick={addPath} style={{ padding: '5px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', cursor: 'pointer' }}>
            <Plus size={12} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '280px', overflowY: 'auto', marginBottom: '14px' }}>
          {paths.map(p => (
            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px' }}>
              <span style={{ flex: 1, fontSize: '11px', fontFamily: 'monospace', color: '#a1a1aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p}</span>
              <button onClick={() => removePath(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563', flexShrink: 0 }}><X size={11} /></button>
            </div>
          ))}
        </div>
        <button
          onClick={createBackup}
          disabled={creating || paths.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', justifyContent: 'center', padding: '9px 0', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: creating || paths.length === 0 ? 'default' : 'pointer', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--crimson)', opacity: paths.length === 0 ? 0.4 : 1 }}
        >
          <Save size={13} /> {creating ? 'Archiving…' : 'Create Backup Now'}
        </button>
      </div>

      {/* Right: backups list */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ fontSize: '10px', fontFamily: 'monospace', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Archive size={12} /> Saved Backups
          </div>
          <button onClick={loadBackups} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563' }}><RefreshCw size={11} /></button>
        </div>
        {loading ? (
          <div style={{ fontSize: '11px', color: '#3f3f46', fontFamily: 'monospace', fontStyle: 'italic' }}>Loading…</div>
        ) : backups.length === 0 ? (
          <div style={{ fontSize: '11px', color: '#3f3f46', fontFamily: 'monospace', fontStyle: 'italic' }}>No backups yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '360px', overflowY: 'auto' }}>
            {backups.map(b => (
              <div key={b.filename} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px' }}>
                <div style={{ fontSize: '10px', color: '#a1a1aa', fontFamily: 'monospace', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.filename}</div>
                <div style={{ fontSize: '9px', color: '#4b5563', marginBottom: '8px' }}>{b.ts ? new Date(b.ts).toLocaleString() : '—'}</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {confirmRestore === b.filename ? (
                    <>
                      <button onClick={() => restore(b.filename)} style={{ flex: 1, padding: '4px', borderRadius: '5px', fontSize: '9px', fontFamily: 'monospace', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', cursor: 'pointer' }}>Confirm Restore</button>
                      <button onClick={() => setConfirmRestore(null)} style={{ padding: '4px 8px', borderRadius: '5px', fontSize: '9px', background: 'none', border: '1px solid rgba(255,255,255,0.07)', color: '#52525b', cursor: 'pointer' }}>×</button>
                    </>
                  ) : confirmDel === b.filename ? (
                    <>
                      <button onClick={() => deleteBackup(b.filename)} style={{ flex: 1, padding: '4px', borderRadius: '5px', fontSize: '9px', fontFamily: 'monospace', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', cursor: 'pointer' }}>Confirm Delete</button>
                      <button onClick={() => setConfirmDel(null)} style={{ padding: '4px 8px', borderRadius: '5px', fontSize: '9px', background: 'none', border: '1px solid rgba(255,255,255,0.07)', color: '#52525b', cursor: 'pointer' }}>×</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setConfirmRestore(b.filename)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '4px', borderRadius: '5px', fontSize: '9px', fontFamily: 'monospace', background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.18)', color: '#22d3ee', cursor: 'pointer' }}>
                        <RotateCcw size={9} /> Restore
                      </button>
                      <button onClick={() => setConfirmDel(b.filename)} style={{ padding: '4px 8px', borderRadius: '5px', fontSize: '9px', background: 'none', border: '1px solid rgba(255,255,255,0.07)', color: '#4b5563', cursor: 'pointer' }}>
                        <Trash2 size={10} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
