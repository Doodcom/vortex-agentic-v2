import { useState, useEffect, useCallback } from 'react'
import { Package, Search, Download, Trash2, RefreshCw, Check, X, ChevronDown, ChevronRight, GitBranch } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { notify } from '../lib/notifications'
import DepGraph from './DepGraph'

interface PkgResult { repo: string; name: string; version: string; description: string; installed: boolean; source: string }
interface AurPkg    { name: string; version: string }

type ActionState = 'idle' | 'pending' | 'running'

interface PackagesViewProps {
  onExplore?: (name: string) => void
}

export default function PackagesView({ onExplore }: PackagesViewProps) {
  const [helper, setHelper]     = useState('pacman')
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<PkgResult[]>([])
  const [aurPkgs, setAurPkgs]   = useState<AurPkg[]>([])
  const [searching, setSearching] = useState(false)
  const [loadingAur, setLoadingAur] = useState(true)
  const [action, setAction]     = useState<{ name: string; type: 'install' | 'remove'; state: ActionState }>({ name: '', type: 'install', state: 'idle' })
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pkgInfo, setPkgInfo]   = useState<Record<string, Record<string, string>>>({})
  const [loadingInfo, setLoadingInfo] = useState<string | null>(null)
  const [depGraph, setDepGraph]       = useState<string | null>(null)
  const [depTrees, setDepTrees]       = useState<Record<string, any>>({})
  const [loadingDep, setLoadingDep]   = useState<string | null>(null)

  useEffect(() => {
    const el = (window as any).electron
    if (!el) return
    el.packageDetectHelper().then((h: string) => setHelper(h))
    el.packageListAur().then((pkgs: AurPkg[]) => { setAurPkgs(pkgs); setLoadingAur(false) })
  }, [])

  const loadDepTree = useCallback(async (name: string) => {
    if (depTrees[name]) { setDepGraph(name); return }
    setDepGraph(name)
    setLoadingDep(name)
    const tree = await (window as any).electron.packageDepTree(name)
    if (tree) setDepTrees(prev => ({ ...prev, [name]: tree }))
    setLoadingDep(null)
  }, [depTrees])

  const toggleInfo = useCallback(async (name: string) => {
    if (expanded === name) { setExpanded(null); setDepGraph(null); return }
    setExpanded(name)
    if (pkgInfo[name]) return
    setLoadingInfo(name)
    const info = await (window as any).electron.packageInfo(name)
    if (info) setPkgInfo(prev => ({ ...prev, [name]: info }))
    setLoadingInfo(null)
  }, [expanded, pkgInfo])

  const search = useCallback(async () => {
    if (!query.trim() || !(window as any).electron) return
    setSearching(true)
    setResults([])
    const res = await (window as any).electron.packageSearch(query)
    setResults(res)
    setSearching(false)
  }, [query])

  const installPkg = async (name: string) => {
    setAction({ name, type: 'install', state: 'running' })
    const res = await (window as any).electron.packageInstall({ name, helper })
    setAction({ name, type: 'install', state: 'idle' })
    if (res.success) {
      notify('Package Installed', name, 'success')
      setResults(prev => prev.map(p => p.name === name ? { ...p, installed: true } : p))
    } else {
      notify('Install Failed', res.error ?? name, 'error')
    }
  }

  const removePkg = async (name: string) => {
    setAction({ name, type: 'remove', state: 'running' })
    const res = await (window as any).electron.packageRemove(name)
    setAction({ name, type: 'remove', state: 'idle' })
    if (res.success) {
      notify('Package Removed', name, 'success')
      setResults(prev => prev.map(p => p.name === name ? { ...p, installed: false } : p))
      setAurPkgs(prev => prev.filter(p => p.name !== name))
    } else {
      notify('Remove Failed', res.error ?? name, 'error')
    }
  }

  const refreshAur = async () => {
    setLoadingAur(true)
    const pkgs = await (window as any).electron.packageListAur()
    setAurPkgs(pkgs)
    setLoadingAur(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* AUR Helper badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ padding: '6px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--crimson)' }}>
          AUR_Helper: {helper}
        </div>
        <div style={{ fontSize: '9px', fontFamily: 'monospace', color: '#52525b', textTransform: 'uppercase' }}>
          {aurPkgs.length} AUR packages installed
        </div>
      </div>

      {/* Search bar */}
      <div className="v-card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Search size={16} style={{ color: '#52525b', flexShrink: 0 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="Search packages (official repos)..."
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#f4f4f5', fontSize: '14px', fontFamily: 'monospace' }}
          />
          <button
            onClick={search}
            disabled={searching || !query.trim()}
            style={{ padding: '8px 20px', borderRadius: '10px', background: 'var(--crimson)', border: 'none', color: 'white', fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', fontWeight: 'bold', cursor: searching || !query.trim() ? 'default' : 'pointer', opacity: searching || !query.trim() ? 0.4 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {searching ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
            Search
          </button>
        </div>
      </div>

      {/* Search results */}
      {results.length > 0 && (
        <div className="v-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Package size={13} style={{ color: '#52525b' }} />
            <span style={{ fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#a1a1aa', fontWeight: 'bold' }}>
              Results ({results.length})
            </span>
          </div>

          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {results.map((pkg, i) => (
              <div key={`${pkg.repo}/${pkg.name}`}>
                <div
                  onClick={() => toggleInfo(pkg.name)}
                  style={{ display: 'grid', gridTemplateColumns: '80px 180px 120px 1fr 130px', gap: '0 12px', padding: '9px 16px', cursor: 'pointer', borderBottom: expanded === pkg.name ? 'none' : '1px solid rgba(255,255,255,0.02)', alignItems: 'center', background: expanded === pkg.name ? 'rgba(255,255,255,0.02)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.003)' }}
                >
                  <span style={{ fontSize: '8px', fontFamily: 'monospace', color: '#52525b', textTransform: 'uppercase' }}>{pkg.repo}</span>
                  <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#f4f4f5', fontWeight: pkg.installed ? 'bold' : 'normal', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {expanded === pkg.name ? <ChevronDown size={10} style={{ flexShrink: 0 }} /> : <ChevronRight size={10} style={{ flexShrink: 0 }} />}
                    {pkg.name}
                  </span>
                  <span style={{ fontSize: '9px', fontFamily: 'monospace', color: '#52525b' }}>{pkg.version}</span>
                  <span style={{ fontSize: '10px', color: '#71717a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pkg.description}</span>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                    {pkg.installed ? (
                      <>
                        <span style={{ fontSize: '8px', fontFamily: 'monospace', color: 'var(--signal)', textTransform: 'uppercase', padding: '2px 8px', borderRadius: '4px', background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.15)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Check size={9} /> Installed
                        </span>
                        <button onClick={e => { e.stopPropagation(); removePkg(pkg.name) }} disabled={action.state === 'running' && action.name === pkg.name}
                          style={{ padding: '2px 8px', borderRadius: '6px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', color: 'var(--crimson)', fontSize: '8px', fontFamily: 'monospace', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {action.state === 'running' && action.name === pkg.name && action.type === 'remove' ? <RefreshCw size={9} className="animate-spin" /> : <Trash2 size={9} />} Remove
                        </button>
                      </>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); installPkg(pkg.name) }} disabled={action.state === 'running' && action.name === pkg.name}
                        style={{ padding: '2px 10px', borderRadius: '6px', background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.15)', color: 'var(--signal)', fontSize: '8px', fontFamily: 'monospace', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {action.state === 'running' && action.name === pkg.name && action.type === 'install' ? <RefreshCw size={9} className="animate-spin" /> : <Download size={9} />} Install
                      </button>
                    )}
                  </div>
                </div>
                {/* Package info panel */}
                <AnimatePresence>
                  {expanded === pkg.name && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '14px 18px' }}>
                        {loadingInfo === pkg.name ? (
                          <div style={{ color: '#52525b', fontFamily: 'monospace', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <RefreshCw size={10} className="animate-spin" /> Loading package info...
                          </div>
                        ) : pkgInfo[pkg.name] ? (
                          <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px 24px', marginBottom: 14 }}>
                              {(['Version', 'Installed Size', 'Download Size', 'Packager', 'Build Date', 'Install Date', 'Depends On', 'Optional Deps', 'Required By', 'Description'] as const).map(key => {
                                const val = pkgInfo[pkg.name][key]
                                if (!val || val === 'None') return null
                                return (
                                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontSize: '8px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3f3f46' }}>{key}</span>
                                    <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#a1a1aa', wordBreak: 'break-word' }}>{val}</span>
                                  </div>
                                )
                              })}
                            </div>
                            <button onClick={() => depGraph === pkg.name ? setDepGraph(null) : loadDepTree(pkg.name)}
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '8px', fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase', cursor: 'pointer', background: depGraph === pkg.name ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.02)', border: `1px solid ${depGraph === pkg.name ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`, color: depGraph === pkg.name ? 'var(--crimson)' : '#52525b', marginBottom: depGraph === pkg.name ? 14 : 0 }}>
                              <GitBranch size={10} /> Dep Graph
                            </button>
                            {onExplore && (
                              <button onClick={() => onExplore(pkg.name)}
                                style={{ marginLeft: '10px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '8px', fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase', cursor: 'pointer', background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.15)', color: 'var(--signal)' }}>
                                <GitBranch size={10} /> Full Graph View
                              </button>
                            )}
                            {depGraph === pkg.name && depTrees[pkg.name] && (
                              <DepGraph tree={depTrees[pkg.name]} loading={loadingDep === pkg.name} onDrillDown={name => loadDepTree(name)} />
                            )}
                            {depGraph === pkg.name && !depTrees[pkg.name] && loadingDep === pkg.name && (
                              <div style={{ color: '#52525b', fontFamily: 'monospace', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <RefreshCw size={10} className="animate-spin" /> Loading dep tree...
                              </div>
                            )}
                          </>
                        ) : (
                          <div style={{ color: '#52525b', fontFamily: 'monospace', fontSize: '10px', fontStyle: 'italic' }}>
                            {pkg.description}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AUR installed */}
      <div className="v-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Package size={13} style={{ color: 'var(--crimson)' }} />
            <span style={{ fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#a1a1aa', fontWeight: 'bold' }}>
              AUR Installed ({aurPkgs.length})
            </span>
          </div>
          <button onClick={refreshAur} style={{ padding: '3px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: '#52525b', fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <RefreshCw size={10} className={loadingAur ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
          {loadingAur ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#3f3f46', fontFamily: 'monospace', fontSize: '11px', fontStyle: 'italic' }}>
              <RefreshCw size={12} className="animate-spin" style={{ display: 'inline', marginRight: '8px' }} /> Loading AUR packages...
            </div>
          ) : aurPkgs.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#3f3f46', fontFamily: 'monospace', fontSize: '11px', fontStyle: 'italic' }}>No AUR packages installed.</div>
          ) : aurPkgs.map((pkg, i) => (
            <div key={pkg.name} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 100px', gap: '0 12px', padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.02)', alignItems: 'center', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.003)', cursor: 'pointer' }}
              onClick={() => toggleInfo(pkg.name)}>
              <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#d4d4d8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {expanded === pkg.name ? <ChevronDown size={10} style={{ color: '#52525b' }} /> : <ChevronRight size={10} style={{ color: '#3f3f46' }} />}
                {pkg.name}
              </span>
              <span style={{ fontSize: '9px', fontFamily: 'monospace', color: '#52525b' }}>{pkg.version}</span>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => removePkg(pkg.name)}
                  disabled={action.state === 'running' && action.name === pkg.name}
                  style={{ padding: '2px 8px', borderRadius: '6px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)', color: '#52525b', fontSize: '8px', fontFamily: 'monospace', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--crimson)')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#52525b')}
                >
                  {action.state === 'running' && action.name === pkg.name
                    ? <RefreshCw size={8} className="animate-spin" />
                    : <X size={8} />
                  }
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
