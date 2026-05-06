import { useState, useEffect, useMemo } from 'react'
import { Search, Copy, Check, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'

interface EnvVar { key: string; value: string }

const PATH_KEYS = new Set(['PATH', 'LD_LIBRARY_PATH', 'PYTHONPATH', 'MANPATH', 'PKG_CONFIG_PATH', 'XDG_DATA_DIRS'])
const HIGHLIGHT_KEYS = new Set(['HOME', 'USER', 'SHELL', 'TERM', 'LANG', 'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_SESSION_TYPE', 'XDG_CURRENT_DESKTOP', 'EDITOR', 'PAGER', 'DBUS_SESSION_BUS_ADDRESS'])

export default function EnvView() {
  const [vars, setVars] = useState<EnvVar[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState('')
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'important' | 'path'>('all')

  const load = async () => {
    setLoading(true)
    try {
      const res = await (window as any).electron.execCommand('env')
      const lines = (res.stdout ?? '').split('\n')
      const parsed: EnvVar[] = []
      for (const line of lines) {
        const eq = line.indexOf('=')
        if (eq < 1) continue
        parsed.push({ key: line.slice(0, eq), value: line.slice(eq + 1) })
      }
      parsed.sort((a, b) => a.key.localeCompare(b.key))
      setVars(parsed)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    let list = vars
    if (filter === 'important') list = list.filter(v => HIGHLIGHT_KEYS.has(v.key))
    if (filter === 'path') list = list.filter(v => PATH_KEYS.has(v.key))
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(v => v.key.toLowerCase().includes(q) || v.value.toLowerCase().includes(q))
    }
    return list
  }, [vars, query, filter])

  const copyValue = (key: string, value: string) => {
    navigator.clipboard.writeText(value)
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
  }

  const togglePath = (key: string) => setExpandedPaths(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })

  const isPath = (v: EnvVar) => PATH_KEYS.has(v.key) || v.value.includes(':')
  const pathParts = (value: string) => value.split(':').filter(Boolean)

  return (
    <div style={{ maxWidth: '860px' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
          <Search size={12} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#4b5563' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter by key or value…"
            style={{ width: '100%', boxSizing: 'border-box', paddingLeft: '30px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '7px 10px 7px 30px', fontSize: '11px', fontFamily: 'monospace', color: '#e2e8f0' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['all', 'important', 'path'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontFamily: 'monospace', cursor: 'pointer', background: filter === f ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${filter === f ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)'}`, color: filter === f ? '#f87171' : '#52525b', textTransform: 'capitalize' }}
            >
              {f}
            </button>
          ))}
        </div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', fontSize: '10px', fontFamily: 'monospace', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: '#4b5563', cursor: 'pointer' }}>
          <RefreshCw size={11} /> Refresh
        </button>
        <span style={{ fontSize: '10px', color: '#3f3f46', fontFamily: 'monospace', flexShrink: 0 }}>
          {filtered.length} / {vars.length} vars
        </span>
      </div>

      {loading ? (
        <div style={{ padding: '32px', textAlign: 'center', fontSize: '12px', color: '#3f3f46', fontFamily: 'monospace' }}>Loading environment…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {filtered.map(v => {
            const isImportant = HIGHLIGHT_KEYS.has(v.key)
            const isPathVar = isPath(v) && pathParts(v.value).length > 1
            const pathExpanded = expandedPaths.has(v.key)
            return (
              <div
                key={v.key}
                style={{ display: 'flex', flexDirection: 'column', padding: '7px 10px', background: isImportant ? 'rgba(96,165,250,0.05)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isImportant ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.05)'}`, borderRadius: '6px' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: isImportant ? '#93c5fd' : '#a78bfa', fontFamily: 'monospace', flexShrink: 0, minWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.key}</span>
                  <span style={{ flex: 1, fontSize: '11px', color: '#6b7280', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isPathVar && !pathExpanded ? 'nowrap' : 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5 }}>
                    {v.value || <span style={{ color: '#374151', fontStyle: 'italic' }}>empty</span>}
                  </span>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    {isPathVar && (
                      <button onClick={() => togglePath(v.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563', padding: '1px' }}>
                        {pathExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                      </button>
                    )}
                    <button onClick={() => copyValue(v.key, v.value)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === v.key ? '#34d399' : '#4b5563', padding: '1px' }}>
                      {copied === v.key ? <Check size={11} /> : <Copy size={11} />}
                    </button>
                  </div>
                </div>
                {isPathVar && pathExpanded && (
                  <div style={{ marginTop: '6px', marginLeft: '188px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {pathParts(v.value).map((part, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '9px', color: '#374151', fontFamily: 'monospace', minWidth: '16px', textAlign: 'right' }}>{i + 1}</span>
                        <span style={{ fontSize: '10px', color: '#71717a', fontFamily: 'monospace' }}>{part}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
