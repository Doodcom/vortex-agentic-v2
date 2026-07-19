import { useState, useEffect, useRef, useCallback } from 'react'
import {
  RefreshCw, Play, Square, Filter, ScrollText, Bot,
  Loader2, Terminal, AlertTriangle, CheckCircle2, AlertCircle, ShieldAlert, Server, Sparkles
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../lib/utils'

function lineColor(line: string): string {
  const l = line.toLowerCase()
  if (/\b(emerg|alert|crit|panic)\b/.test(l)) return 'var(--crimson)'
  if (/\b(error|err|failed|failure)\b/.test(l)) return '#f87171'
  if (/\b(warning|warn)\b/.test(l)) return '#f59e0b'
  if (/\b(notice|info|debug)\b/.test(l)) return '#71717a'
  return '#a1a1aa'
}

const PRIORITY_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Critical (0–2)', value: '2' },
  { label: 'Error (≤3)',     value: '3' },
  { label: 'Warning (≤4)',   value: '4' },
  { label: 'Info (≤6)',      value: '6' },
]

const SINCE_OPTIONS = [
  { label: 'Last 1h',  value: '1 hour ago' },
  { label: 'Last 6h',  value: '6 hours ago' },
  { label: 'Last 24h', value: '24 hours ago' },
  { label: 'Last 7d',  value: '7 days ago' },
  { label: 'All time', value: '' },
]

const LINE_OPTIONS = [100, 300, 500, 1000]

export default function LogView() {
  const [mode, setMode] = useState<'browse' | 'ai'>('browse')
  const [lines, setLines] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const [unit, setUnit]         = useState('')
  const [priority, setPriority] = useState('')
  const [since, setSince]       = useState('1 hour ago')
  const [keyword, setKeyword]   = useState('')
  const [lineCount, setLineCount] = useState(300)

  const scrollRef   = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchLogs = useCallback(async () => {
    const el = (window as any).electron
    if (!el?.journalGetLogs) return
    setLoading(true)
    setError(null)
    const res = await el.journalGetLogs({ unit: unit || undefined, priority: priority || undefined, lines: lineCount, keyword: keyword || undefined, since: since || undefined })
    setLoading(false)
    if (!res.success && res.error) { setError(res.error); return }
    setLines(res.lines ?? [])
    setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, 50)
  }, [unit, priority, since, keyword, lineCount])

  useEffect(() => { fetchLogs() }, [])

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (autoRefresh) intervalRef.current = setInterval(fetchLogs, 8000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [autoRefresh, fetchLogs])

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '8px', padding: '6px 10px', color: '#f4f4f5', fontSize: '11px',
    fontFamily: 'monospace', outline: 'none',
  }

  const modeTabStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '8px',
    border: `1px solid ${active ? 'rgba(34,211,238,0.25)' : 'rgba(255,255,255,0.06)'}`,
    background: active ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.02)',
    color: active ? 'var(--signal)' : '#52525b', fontSize: '10px', fontFamily: 'monospace',
    textTransform: 'uppercase', cursor: 'pointer',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: 'calc(100vh - 220px)' }}>

      {/* Mode switch: raw browsing vs AI diagnosis */}
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button onClick={() => setMode('browse')} style={modeTabStyle(mode === 'browse')}>
          <ScrollText size={11} /> Browse
        </button>
        <button onClick={() => setMode('ai')} style={modeTabStyle(mode === 'ai')}>
          <Bot size={11} /> AI Diagnose
        </button>
      </div>

      {mode === 'ai' ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <LogAnalysisPanel />
        </div>
      ) : (
      <>
      {/* Filter bar */}
      <div className="v-card" style={{ padding: '14px 18px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Filter size={13} style={{ color: '#52525b' }} />
          <span style={{ fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#52525b' }}>Filters</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="Unit (e.g. nginx.service)" style={{ ...inputStyle, width: '180px' }} />
          <select value={priority} onChange={e => setPriority(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ background: '#0d0e11' }}>{o.label}</option>)}
          </select>
          <select value={since} onChange={e => setSince(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            {SINCE_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ background: '#0d0e11' }}>{o.label}</option>)}
          </select>
          <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="Keyword / grep" style={{ ...inputStyle, width: '160px' }} />
          <select value={lineCount} onChange={e => setLineCount(Number(e.target.value))} style={{ ...inputStyle, cursor: 'pointer' }}>
            {LINE_OPTIONS.map(n => <option key={n} value={n} style={{ background: '#0d0e11' }}>{n} lines</option>)}
          </select>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={fetchLogs} disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--crimson)', fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1 }}>
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button onClick={() => setAutoRefresh(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', border: `1px solid ${autoRefresh ? 'rgba(34,211,238,0.25)' : 'rgba(255,255,255,0.06)'}`, background: autoRefresh ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.02)', color: autoRefresh ? 'var(--signal)' : '#52525b', fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', cursor: 'pointer' }}>
              {autoRefresh ? <Square size={10} /> : <Play size={10} />}
              {autoRefresh ? 'Live' : 'Follow'}
            </button>
          </div>
        </div>
      </div>

      {/* Log output */}
      <div className="v-card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#52525b' }}>
            Output — {lines.length} lines
          </span>
          {autoRefresh && (
            <span style={{ fontSize: '8px', fontFamily: 'monospace', color: 'var(--signal)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="animate-pulse-dot" style={{ display: 'inline-block', width: '5px', height: '5px', borderRadius: '50%', background: 'var(--signal)' }} />
              live · 8s
            </span>
          )}
        </div>

        {error ? (
          <div style={{ padding: '24px', color: 'var(--crimson)', fontFamily: 'monospace', fontSize: '12px' }}>{error}</div>
        ) : lines.length === 0 && !loading ? (
          <div style={{ padding: '24px', color: '#3f3f46', fontFamily: 'monospace', fontSize: '11px', fontStyle: 'italic' }}>No log entries found for the selected filters.</div>
        ) : (
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 16px', fontFamily: '"JetBrains Mono", "Fira Code", monospace', fontSize: '11px', lineHeight: '1.65' }}>
            {loading && lines.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ color: '#52525b', fontStyle: 'italic' }}>Loading...</motion.div>
            )}
            {lines.map((line, i) => (
              <div key={i} style={{ color: lineColor(line), whiteSpace: 'pre-wrap', wordBreak: 'break-all', padding: '1px 0', borderBottom: '1px solid rgba(255,255,255,0.015)' }}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  )
}

function LogAnalysisPanel() {
  const [units, setUnits] = useState<{ unit: string; description: string }[]>([])
  const [selectedUnit, setSelectedUnit] = useState<string>('')
  const [lines, setLines] = useState<number>(50)
  const [logs, setLogs] = useState<string>('')
  const [isFetchingLogs, setIsFetchingLogs] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isApplying, setIsApplying] = useState(false)

  // AI Diagnostics Results
  const [diagnostics, setDiagnostics] = useState<{
    problem: string
    diagnosis: string
    remediationCommand: string | null
    remediationSafety: 'safe' | 'needs-confirmation' | 'dangerous'
  } | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  // Execution Results
  const [execResult, setExecResult] = useState<{ success: boolean; output?: string; error?: string } | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  const fetchUnits = async () => {
    try {
      const list = await (window as any).electron.systemdListUnits()
      if (Array.isArray(list)) {
        setUnits(list.map(u => ({ unit: u.unit, description: u.description })))
      }
    } catch {}
  }

  const fetchRecentLogs = async () => {
    setIsFetchingLogs(true)
    try {
      let rawLogs = ''
      if (selectedUnit) {
        rawLogs = await (window as any).electron.systemdUnitLogs({ unit: selectedUnit, lines })
      } else {
        // Fetch error logs by default for crash diagnostics
        rawLogs = await (window as any).electron.systemGetLogs(lines)
      }
      setLogs(rawLogs || 'No logs available.')
    } catch (e: any) {
      setLogs(`Error fetching logs: ${e.message}`)
    } finally {
      setIsFetchingLogs(false)
    }
  }

  useEffect(() => {
    fetchUnits()
    fetchRecentLogs()
  }, [])

  // Refetch logs when selected unit or lines count changes
  useEffect(() => {
    fetchRecentLogs()
  }, [selectedUnit, lines])

  const handleAnalyze = async () => {
    setAnalysisError(null)
    setDiagnostics(null)
    setExecResult(null)
    setIsAnalyzing(true)

    try {
      const model = localStorage.getItem('vortex-default-model') || 'qwen3:8b'
      const res = await (window as any).electron.logRemediationAnalyze({
        unit: selectedUnit || undefined,
        lines,
        model
      })

      if (res.success && res.problem) {
        setDiagnostics({
          problem: res.problem,
          diagnosis: res.diagnosis || 'No detailed diagnosis provided.',
          remediationCommand: res.remediationCommand,
          remediationSafety: res.remediationSafety || 'safe'
        })
      } else {
        setAnalysisError(res.error || 'Failed to analyze logs.')
      }
    } catch (e: any) {
      setAnalysisError(e.message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleApplyRemediation = async () => {
    if (!diagnostics || !diagnostics.remediationCommand) return

    // Show confirmation modal for needs-confirmation and dangerous commands
    if ((diagnostics.remediationSafety === 'needs-confirmation' || diagnostics.remediationSafety === 'dangerous') && !showConfirmModal) {
      setShowConfirmModal(true)
      return
    }

    setShowConfirmModal(false)
    setIsApplying(true)
    setExecResult(null)

    try {
      const res = await (window as any).electron.logRemediationApply({
        command: diagnostics.remediationCommand
      })
      setExecResult(res)
      if (res.success) {
        // Refresh logs after applying remediation
        setTimeout(fetchRecentLogs, 1500)
      }
    } catch (e: any) {
      setExecResult({ success: false, error: e.message })
    } finally {
      setIsApplying(false)
    }
  }

  const getSafetyColor = (safety: string) => {
    switch (safety) {
      case 'safe':
        return 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5'
      case 'needs-confirmation':
        return 'text-amber-500 border-amber-500/20 bg-amber-500/5'
      case 'dangerous':
        return 'text-crimson border-crimson/20 bg-crimson/5'
      default:
        return 'text-zinc-400 border-zinc-500/20 bg-zinc-500/5'
    }
  }

  const getSafetyIcon = (safety: string) => {
    switch (safety) {
      case 'safe':
        return CheckCircle2
      case 'needs-confirmation':
        return AlertTriangle
      case 'dangerous':
        return ShieldAlert
      default:
        return AlertCircle
    }
  }

  const SafetyIconComponent = diagnostics ? getSafetyIcon(diagnostics.remediationSafety) : AlertCircle

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wide flex items-center space-x-2">
            <Bot className="w-6 h-6 text-signal" />
            <span>AI Crash Diagnostics & Remediation</span>
          </h1>
          <p className="text-zinc-500 text-xs mt-1">
            Fetch system logs, perform instant local AI diagnosis, and safely apply automated repairs.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Diagnostics Source & Raw Log Terminal */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          <div className="p-6 rounded-3xl border border-white/5 bg-white/5 space-y-4">
            <h2 className="font-bold text-sm uppercase tracking-wider text-zinc-300 flex items-center space-x-2">
              <Server className="w-4 h-4 text-zinc-400" />
              <span>Log Source Configuration</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-zinc-400">Target Systemd Unit</label>
                <select
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs focus:outline-none focus:border-signal w-full"
                >
                  <option value="">[System Error Logs]</option>
                  {units.map((u) => (
                    <option key={u.unit} value={u.unit}>
                      {u.unit} ({u.description || 'No description'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-zinc-400">Log Scope (Lines)</label>
                <input
                  type="number"
                  min={10}
                  max={200}
                  value={lines}
                  onChange={(e) => setLines(parseInt(e.target.value) || 50)}
                  className="px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs focus:outline-none focus:border-signal w-full"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <button
                onClick={fetchRecentLogs}
                disabled={isFetchingLogs || isAnalyzing}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all font-bold text-xs uppercase tracking-wider disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isFetchingLogs && "animate-spin")} />
                <span>Refresh Logs</span>
              </button>

              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing || isFetchingLogs}
                className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-signal hover:bg-signal-hover transition-all font-bold text-xs text-black uppercase tracking-wider disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>{isAnalyzing ? 'Analyzing...' : 'AI Diagnose'}</span>
              </button>
            </div>
          </div>

          {/* Terminal Logs Output */}
          <div className="rounded-3xl border border-white/5 bg-black/40 p-5 flex flex-col flex-1 min-h-[300px]">
            <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3">
              <div className="flex items-center space-x-2 text-zinc-400">
                <Terminal className="w-4 h-4 text-signal" />
                <span className="font-mono text-xs">journalctl_output.log</span>
              </div>
              {isFetchingLogs && <Loader2 className="w-3.5 h-3.5 animate-spin text-signal" />}
            </div>
            <pre className="font-mono text-[10px] text-zinc-400 overflow-auto whitespace-pre leading-relaxed flex-1 max-h-[500px]">
              {logs}
            </pre>
          </div>
        </div>

        {/* Right Column: AI Analysis Report & Resolution Execution */}
        <div className="lg:col-span-5 flex flex-col space-y-4">
          <AnimatePresence mode="wait">
            {isAnalyzing && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="p-8 rounded-3xl border border-white/5 bg-white/5 flex flex-col items-center justify-center text-center space-y-4 h-full min-h-[300px]"
              >
                <Loader2 className="w-10 h-10 animate-spin text-signal" />
                <div>
                  <h3 className="font-bold uppercase tracking-wider text-sm">Consulting Local Model...</h3>
                  <p className="text-zinc-500 text-[10px] mt-1">Reading logs, diagnosing issues, and formulating safe remediation steps.</p>
                </div>
              </motion.div>
            )}

            {!isAnalyzing && diagnostics && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-6 rounded-3xl border border-white/5 bg-white/5 flex flex-col space-y-5 h-full"
              >
                {/* Header Problem Card */}
                <div className="p-4 rounded-2xl bg-black/20 border border-white/5 flex flex-col space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">AI Log Advisor Report</span>
                  <h3 className="font-bold text-lg text-white uppercase italic">{diagnostics.problem}</h3>
                </div>

                {/* Safety Badge */}
                <div className={cn("p-4 rounded-2xl border flex items-start space-x-3", getSafetyColor(diagnostics.remediationSafety))}>
                  <SafetyIconComponent className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-xs uppercase tracking-wider">Safety Rating: {diagnostics.remediationSafety}</h4>
                    <p className="text-[10px] opacity-80 leading-relaxed mt-0.5">
                      {diagnostics.remediationSafety === 'safe' && 'This action is clean, safe, and has minimal impact on running services.'}
                      {diagnostics.remediationSafety === 'needs-confirmation' && 'This action alters configurations or package state. Review before applying.'}
                      {diagnostics.remediationSafety === 'dangerous' && 'Warning: This action requires high privileges and might alter system components.'}
                    </p>
                  </div>
                </div>

                {/* Detailed Diagnosis */}
                <div className="space-y-1.5">
                  <h4 className="text-[10px] uppercase font-bold text-zinc-400">Diagnosis</h4>
                  <p className="text-xs text-zinc-300 leading-relaxed">{diagnostics.diagnosis}</p>
                </div>

                {/* Remediation Command */}
                {diagnostics.remediationCommand ? (
                  <div className="space-y-3 pt-2">
                    <div className="space-y-1.5">
                      <h4 className="text-[10px] uppercase font-bold text-zinc-400">Remediation Command</h4>
                      <pre className="p-3 rounded-xl bg-black/50 border border-white/5 font-mono text-[10px] text-zinc-300 break-all whitespace-pre-wrap select-all">
                        {diagnostics.remediationCommand}
                      </pre>
                    </div>

                    <button
                      onClick={handleApplyRemediation}
                      disabled={isApplying}
                      className={cn(
                        "flex items-center justify-center space-x-2 w-full py-3 rounded-xl transition-all font-bold text-xs uppercase tracking-wider disabled:opacity-50",
                        diagnostics.remediationSafety === 'dangerous'
                          ? 'bg-crimson hover:bg-crimson-hover text-white'
                          : diagnostics.remediationSafety === 'needs-confirmation'
                          ? 'bg-amber-500 hover:bg-amber-600 text-black'
                          : 'bg-emerald-500 hover:bg-emerald-600 text-black'
                      )}
                    >
                      {isApplying ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                      <span>{isApplying ? 'Applying Fix...' : 'Apply AI Remediation'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-center text-xs text-zinc-400 italic">
                    No automated remediation command suggested. Manual intervention required.
                  </div>
                )}

                {/* Execution Result Area */}
                {execResult && (
                  <div className={cn(
                    "p-4 rounded-2xl border flex flex-col space-y-2 mt-4",
                    execResult.success ? "bg-emerald-500/10 border-emerald-500/20" : "bg-crimson/10 border-crimson/20"
                  )}>
                    <div className="flex items-center space-x-2">
                      {execResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-crimson" />
                      )}
                      <span className="font-bold text-xs uppercase tracking-wide">
                        {execResult.success ? 'Remediation Applied' : 'Remediation Failed'}
                      </span>
                    </div>
                    <pre className="text-[10px] font-mono text-zinc-400 bg-black/40 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-32">
                      {execResult.output || execResult.error}
                    </pre>
                  </div>
                )}
              </motion.div>
            )}

            {!isAnalyzing && !diagnostics && !analysisError && (
              <div className="p-8 rounded-3xl border border-white/5 bg-white/5 flex flex-col items-center justify-center text-center space-y-4 h-full min-h-[300px]">
                <Bot className="w-12 h-12 text-zinc-500" />
                <div>
                  <h3 className="font-bold uppercase tracking-wider text-sm">No Active Diagnosis</h3>
                  <p className="text-zinc-500 text-[10px] mt-1">Select a unit or view system logs on the left and click "AI Diagnose" to begin.</p>
                </div>
              </div>
            )}

            {analysisError && (
              <div className="p-8 rounded-3xl border border-crimson/20 bg-crimson/5 flex flex-col items-center justify-center text-center space-y-4 h-full min-h-[300px]">
                <AlertCircle className="w-10 h-10 text-crimson" />
                <div>
                  <h3 className="font-bold uppercase tracking-wider text-sm text-crimson">Diagnosis Failed</h3>
                  <p className="text-zinc-400 text-xs mt-2 font-mono bg-black/40 p-4 rounded-xl max-h-48 overflow-y-auto">{analysisError}</p>
                </div>
                <button
                  onClick={handleAnalyze}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all font-bold text-xs uppercase tracking-wider text-white border border-white/10"
                >
                  Retry Analysis
                </button>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && diagnostics && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-md w-full bg-zinc-900 border border-white/10 p-6 rounded-3xl space-y-4 shadow-2xl"
            >
              <div className="flex items-center space-x-3 text-amber-500">
                <AlertTriangle className="w-6 h-6 flex-shrink-0" />
                <h3 className="font-bold text-base uppercase tracking-wider">Confirm Remediation Action</h3>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                You are about to run a command with safety level: <strong className="text-amber-500 uppercase">{diagnostics.remediationSafety}</strong>.
              </p>
              <pre className="p-3 rounded-xl bg-black/40 border border-white/5 font-mono text-[10px] text-zinc-300 break-all whitespace-pre-wrap">
                {diagnostics.remediationCommand}
              </pre>
              <p className="text-[10px] text-zinc-500">
                This command requires privilege elevation (`pkexec`) and will run on your system. Please confirm that you trust this AI suggestion.
              </p>
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 rounded-xl hover:bg-white/5 transition-all text-xs font-bold uppercase tracking-wider text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyRemediation}
                  className="px-5 py-2 rounded-xl bg-signal hover:bg-signal-hover transition-all text-xs text-black font-bold uppercase tracking-wider"
                >
                  Proceed & Execute
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
