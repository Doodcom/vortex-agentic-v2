import { useState, useEffect, useMemo } from 'react'
import { Search, Play, RefreshCw, AppWindow } from 'lucide-react'
import { notify } from '../lib/notifications'

interface App { name: string; exec: string; comment: string; categories: string; icon: string; path: string }

const CAT_COLORS: Record<string, string> = {
  Audio: '#a78bfa', Video: '#60a5fa', AudioVideo: '#60a5fa',
  Development: '#34d399', Education: '#f59e0b', Game: '#f87171',
  Graphics: '#f472b6', Network: '#22d3ee', Office: '#94a3b8',
  Science: '#6ee7b7', Settings: '#71717a', System: '#f87171',
  Utility: '#a1a1aa', Internet: '#22d3ee',
}

function primaryCategory(cats: string): string {
  if (!cats) return 'Other'
  const parts = cats.split(';').filter(Boolean)
  return parts.find(c => c in CAT_COLORS) ?? parts[0] ?? 'Other'
}

const ALL_CATS_LABEL = 'All'

export default function AppLauncherView() {
  const [apps, setApps] = useState<App[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [catFilter, setCatFilter] = useState(ALL_CATS_LABEL)
  const [launching, setLaunching] = useState('')

  const load = async () => {
    setLoading(true)
    const res = await (window as any).electron.appsList()
    if (res.success) setApps(res.apps)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const categories = useMemo(() => {
    const set = new Set<string>()
    apps.forEach(a => set.add(primaryCategory(a.categories)))
    return [ALL_CATS_LABEL, ...[...set].sort()]
  }, [apps])

  const filtered = useMemo(() => {
    let list = apps
    if (catFilter !== ALL_CATS_LABEL) list = list.filter(a => primaryCategory(a.categories) === catFilter)
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(a => a.name.toLowerCase().includes(q) || a.comment.toLowerCase().includes(q) || a.categories.toLowerCase().includes(q))
    }
    return list
  }, [apps, query, catFilter])

  const launch = async (app: App) => {
    if (!app.exec) { notify('Launcher', 'No exec entry for this app', 'error'); return }
    setLaunching(app.name)
    const res = await (window as any).electron.appsLaunch({ exec: app.exec })
    setTimeout(() => setLaunching(''), 1500)
    if (res.success) notify('Launcher', `Launched ${app.name}`, 'success')
    else notify('Launcher', `Failed: ${res.error}`, 'error')
  }

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Search + refresh */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={12} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#4b5563' }} />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search applications…"
            style={{ width: '100%', boxSizing: 'border-box', paddingLeft: '30px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 10px 8px 30px', fontSize: '12px', fontFamily: 'monospace', color: '#e2e8f0' }}
          />
        </div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '7px', fontSize: '10px', fontFamily: 'monospace', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: '#4b5563', cursor: 'pointer' }}>
          <RefreshCw size={11} /> Rescan
        </button>
      </div>

      {/* Category chips */}
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {categories.map(cat => {
          const on = catFilter === cat
          const color = cat === ALL_CATS_LABEL ? '#94a3b8' : (CAT_COLORS[cat] ?? '#52525b')
          return (
            <button
              key={cat}
              onClick={() => setCatFilter(cat)}
              style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '10px', fontFamily: 'monospace', cursor: 'pointer', background: on ? color + '22' : 'rgba(255,255,255,0.03)', border: `1px solid ${on ? color + '55' : 'rgba(255,255,255,0.06)'}`, color: on ? color : '#4b5563', transition: 'all 0.12s' }}
            >
              {cat}
            </button>
          )
        })}
      </div>

      {/* Count */}
      <div style={{ fontSize: '10px', color: '#3f3f46', fontFamily: 'monospace', marginBottom: '12px' }}>
        {loading ? 'Scanning…' : `${filtered.length} of ${apps.length} apps`}
      </div>

      {/* App grid */}
      {loading ? (
        <div style={{ padding: '32px', textAlign: 'center', fontSize: '12px', color: '#3f3f46', fontFamily: 'monospace' }}>Parsing .desktop files…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', fontSize: '12px', color: '#3f3f46', fontStyle: 'italic' }}>No apps match your search.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
          {filtered.map(app => {
            const cat = primaryCategory(app.categories)
            const catColor = CAT_COLORS[cat] ?? '#52525b'
            const isLaunching = launching === app.name
            return (
              <button
                key={app.name}
                onClick={() => launch(app)}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: isLaunching ? 'rgba(34,211,238,0.07)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isLaunching ? 'rgba(34,211,238,0.25)' : 'rgba(255,255,255,0.06)'}`, borderRadius: '9px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s' }}
                onMouseEnter={e => { if (!isLaunching) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => { if (!isLaunching) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)' }}
              >
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: catColor + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isLaunching ? <Play size={14} style={{ color: '#22d3ee' }} /> : <AppWindow size={14} style={{ color: catColor }} />}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.name}</div>
                  <div style={{ fontSize: '9px', color: catColor, fontFamily: 'monospace', marginTop: '1px' }}>{cat}</div>
                  {app.comment && <div style={{ fontSize: '9px', color: '#4b5563', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.comment}</div>}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
