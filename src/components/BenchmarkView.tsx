import { useState } from 'react'
import { Cpu, HardDrive, MemoryStick, Play, History, Trash2 } from 'lucide-react'
import { notify } from '../lib/notifications'

const BENCH_HISTORY_KEY = 'vortex-bench-history'

interface BenchResult { score: number; unit: string; detail: string }
interface BenchRun { ts: number; results: Record<string, BenchResult> }

const TESTS = [
  { id: 'cpu',        label: 'CPU',         sublabel: 'Arithmetic throughput',     icon: Cpu,         color: '#f87171' },
  { id: 'disk_write', label: 'Disk Write',  sublabel: '256 MB sequential write',   icon: HardDrive,   color: '#f59e0b' },
  { id: 'disk_read',  label: 'Disk Read',   sublabel: '256 MB sequential read',    icon: HardDrive,   color: '#60a5fa' },
  { id: 'ram',        label: 'RAM',         sublabel: 'Memory throughput',          icon: MemoryStick, color: '#a78bfa' },
]

function loadHistory(): BenchRun[] {
  try { return JSON.parse(localStorage.getItem(BENCH_HISTORY_KEY) ?? '[]') } catch { return [] }
}
function saveHistory(h: BenchRun[]) { localStorage.setItem(BENCH_HISTORY_KEY, JSON.stringify(h.slice(-10))) }

function ScoreBar({ score, max, color }: { score: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (score / max) * 100) : 0
  return (
    <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden', width: '100%' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px', transition: 'width 0.6s ease' }} />
    </div>
  )
}

const MAX_SCORES: Record<string, number> = { cpu: 500, disk_write: 7000, disk_read: 7000, ram: 30000 }

export default function BenchmarkView() {
  const [selected, setSelected] = useState<Set<string>>(new Set(TESTS.map(t => t.id)))
  const [running, setRunning] = useState(false)
  const [currentTest, setCurrentTest] = useState('')
  const [results, setResults] = useState<Record<string, BenchResult>>({})
  const [history, setHistory] = useState<BenchRun[]>(loadHistory)
  const [showHistory, setShowHistory] = useState(false)

  const toggle = (id: string) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const run = async () => {
    if (running || selected.size === 0) return
    setRunning(true)
    setResults({})
    const tests = TESTS.filter(t => selected.has(t.id)).map(t => t.id)

    for (const testId of tests) {
      setCurrentTest(testId)
      const res = await (window as any).electron.benchmarkRun({ tests: [testId] })
      if (res.success && res.results[testId]) {
        setResults(prev => ({ ...prev, [testId]: res.results[testId] }))
      }
    }

    setCurrentTest('')
    setRunning(false)

    setResults(prev => {
      const run: BenchRun = { ts: Date.now(), results: prev }
      const newHistory = [...loadHistory(), run]
      saveHistory(newHistory)
      setHistory(newHistory)
      notify('Benchmark', 'Run complete', 'success')
      return prev
    })
  }

  const clearHistory = () => {
    localStorage.removeItem(BENCH_HISTORY_KEY)
    setHistory([])
  }

  return (
    <div style={{ maxWidth: '700px' }}>
      {/* Test selector */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '10px', fontFamily: 'monospace', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>Select Tests</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {TESTS.map(t => {
            const Icon = t.icon
            const on = selected.has(t.id)
            return (
              <button
                key={t.id}
                onClick={() => toggle(t.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace', cursor: 'pointer', background: on ? t.color + '18' : 'rgba(255,255,255,0.03)', border: `1px solid ${on ? t.color + '44' : 'rgba(255,255,255,0.07)'}`, color: on ? t.color : '#4b5563', transition: 'all 0.15s' }}
              >
                <Icon size={12} /> {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Run button */}
      <button
        onClick={run}
        disabled={running || selected.size === 0}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', borderRadius: '9px', fontSize: '12px', fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: running || selected.size === 0 ? 'default' : 'pointer', background: running ? 'rgba(255,255,255,0.03)' : 'rgba(239,68,68,0.12)', border: `1px solid ${running ? 'rgba(255,255,255,0.06)' : 'rgba(239,68,68,0.3)'}`, color: running ? '#4b5563' : 'var(--crimson)', marginBottom: '24px', opacity: selected.size === 0 ? 0.4 : 1 }}
      >
        <Play size={14} />
        {running ? `Running ${TESTS.find(t => t.id === currentTest)?.label ?? '…'}` : 'Run Benchmark'}
      </button>

      {/* Results grid */}
      {TESTS.some(t => results[t.id] || (running && currentTest === t.id)) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '28px' }}>
          {TESTS.filter(t => selected.has(t.id)).map(t => {
            const Icon = t.icon
            const r = results[t.id]
            const isRunning = running && currentTest === t.id
            return (
              <div key={t.id} style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${r ? t.color + '30' : 'rgba(255,255,255,0.06)'}`, borderRadius: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <Icon size={14} style={{ color: t.color }} />
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#e2e8f0', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.label}</span>
                  {isRunning && <span style={{ fontSize: '9px', color: t.color, fontFamily: 'monospace', marginLeft: 'auto', animation: 'pulse 1s infinite' }}>RUNNING…</span>}
                </div>
                {r ? (
                  <>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: t.color, fontFamily: 'monospace', marginBottom: '4px' }}>
                      {r.score.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '10px', color: '#52525b', fontFamily: 'monospace', marginBottom: '8px' }}>{r.unit}</div>
                    <ScoreBar score={r.score} max={MAX_SCORES[t.id] ?? 1000} color={t.color} />
                    <div style={{ fontSize: '9px', color: '#3f3f46', fontFamily: 'monospace', marginTop: '6px' }}>{r.detail}</div>
                  </>
                ) : (
                  <div style={{ height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#3f3f46', fontFamily: 'monospace' }}>
                    {isRunning ? '—' : 'Pending'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* History */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <button
            onClick={() => setShowHistory(p => !p)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', fontFamily: 'monospace', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <History size={12} /> Run History ({history.length})
          </button>
          {history.length > 0 && showHistory && (
            <button onClick={clearHistory} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', fontFamily: 'monospace', background: 'none', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '5px', padding: '3px 8px', color: '#4b5563', cursor: 'pointer' }}>
              <Trash2 size={10} /> Clear
            </button>
          )}
        </div>
        {showHistory && history.length === 0 && (
          <div style={{ fontSize: '11px', color: '#3f3f46', fontStyle: 'italic', fontFamily: 'monospace' }}>No previous runs.</div>
        )}
        {showHistory && history.slice().reverse().map((run, i) => (
          <div key={i} style={{ padding: '10px 14px', marginBottom: '6px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px' }}>
            <div style={{ fontSize: '9px', color: '#4b5563', fontFamily: 'monospace', marginBottom: '8px' }}>
              {new Date(run.ts).toLocaleString()}
            </div>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {Object.entries(run.results).map(([id, r]) => {
                const t = TESTS.find(t => t.id === id)
                return (
                  <div key={id} style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    <span style={{ fontSize: '9px', color: '#4b5563', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t?.label ?? id}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: t?.color ?? '#94a3b8', fontFamily: 'monospace' }}>{r.score.toLocaleString()}</span>
                    <span style={{ fontSize: '8px', color: '#3f3f46', fontFamily: 'monospace' }}>{r.unit.split(' ')[0]}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
