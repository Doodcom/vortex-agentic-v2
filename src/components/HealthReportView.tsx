import { useState } from 'react'
import { Activity, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react'

interface ReportSection {
  title: string
  status: 'ok' | 'warn' | 'error'
  detail: string
}

interface Report {
  score: number
  summary: string
  sections: ReportSection[]
  recommendations: string[]
  generatedAt: number
}

function parseReport(text: string, data: Record<string, any>): Report {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const scoreMatch = text.match(/(?:score|rating)[:\s]+(\d+)/i)
  const score = scoreMatch ? Math.min(100, Math.max(0, parseInt(scoreMatch[1]))) : 70

  const recs: string[] = []
  let inRecs = false
  for (const line of lines) {
    if (/recommendation|suggest|action|todo/i.test(line)) { inRecs = true; continue }
    if (inRecs && line.match(/^[-•*\d.]/)) recs.push(line.replace(/^[-•*\d.]\s*/, ''))
  }

  const summary = lines.slice(0, 3).join(' ').slice(0, 280)

  const sections: ReportSection[] = [
    { title: 'CPU', status: (data.cpu?.load ?? 0) > 85 ? 'warn' : 'ok', detail: `Load: ${Math.round(data.cpu?.load ?? 0)}%` },
    { title: 'RAM', status: data.memPct > 90 ? 'error' : data.memPct > 75 ? 'warn' : 'ok', detail: `Used: ${Math.round(data.memPct ?? 0)}%` },
    { title: 'Disk', status: (data.diskPct ?? 0) > 90 ? 'error' : (data.diskPct ?? 0) > 80 ? 'warn' : 'ok', detail: `Root: ${Math.round(data.diskPct ?? 0)}% used` },
    { title: 'Journal Errors', status: (data.errorCount ?? 0) > 20 ? 'error' : (data.errorCount ?? 0) > 5 ? 'warn' : 'ok', detail: `${data.errorCount ?? 0} recent errors` },
    { title: 'Failed Services', status: (data.failedServices ?? 0) > 0 ? 'error' : 'ok', detail: `${data.failedServices ?? 0} failed units` },
    { title: 'Pending Updates', status: (data.updateCount ?? 0) > 30 ? 'warn' : 'ok', detail: `${data.updateCount ?? 0} packages` },
  ]

  return { score, summary, sections, recommendations: recs.slice(0, 6), generatedAt: Date.now() }
}

const SCORE_COLOR = (s: number) => s >= 85 ? '#34d399' : s >= 65 ? '#f59e0b' : '#f87171'
const STATUS_ICON = { ok: CheckCircle2, warn: AlertTriangle, error: XCircle }
const STATUS_COLOR = { ok: '#34d399', warn: '#f59e0b', error: '#f87171' }

function ScoreRing({ score }: { score: number }) {
  const r = 48, cx = 56, cy = 56
  const circ = 2 * Math.PI * r
  const dash = circ * (score / 100)
  const color = SCORE_COLOR(score)
  return (
    <svg width={112} height={112} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={8} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill={color} fontSize={22} fontWeight={800} fontFamily="monospace">{score}</text>
    </svg>
  )
}

export default function HealthReportView() {
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState('')

  const generate = async () => {
    if (loading) return
    setLoading(true)
    setReport(null)

    const el = (window as any).electron
    const data: Record<string, any> = {}

    setStage('Gathering system stats…')
    try {
      const stats = await el.getSystemStats()
      data.cpu = stats.cpu
      data.memPct = stats.memory ? (stats.memory.used / stats.memory.total) * 100 : 0
    } catch {}

    setStage('Checking disk…')
    try {
      const disk = await el.diskInfo()
      const root = disk.filesystems?.find((f: any) => f.mount === '/')
      if (root) data.diskPct = (root.used / root.size) * 100
    } catch {}

    setStage('Reading journal errors…')
    try {
      const journal = await el.journalGetLogs({ priority: '3', lines: 50 })
      data.errorCount = journal.lines?.filter((l: string) => l.trim()).length ?? 0
      data.recentErrors = journal.lines?.slice(0, 5).join('\n') ?? ''
    } catch {}

    setStage('Checking services…')
    try {
      const units = await el.systemdListUnits()
      data.failedServices = units.filter((u: any) => u.active === 'failed').length
      data.failedNames = units.filter((u: any) => u.active === 'failed').map((u: any) => u.unit).slice(0, 3).join(', ')
    } catch {}

    setStage('Checking updates…')
    try {
      const upd = await el.systemCheckUpdates()
      data.updateCount = (upd.repo?.length ?? 0) + (upd.aur?.length ?? 0)
    } catch {}

    setStage('Asking AI…')

    const prompt = `You are a Linux system health analyst. Analyse the following data and produce a health report.

SYSTEM DATA:
- CPU Load: ${Math.round(data.cpu?.load ?? 0)}%
- RAM Used: ${Math.round(data.memPct ?? 0)}%
- Disk (root): ${Math.round(data.diskPct ?? 0)}%
- Journal Errors (recent): ${data.errorCount ?? 0}
- Recent error samples: ${data.recentErrors || 'none'}
- Failed systemd units: ${data.failedServices ?? 0} ${data.failedNames ? `(${data.failedNames})` : ''}
- Pending package updates: ${data.updateCount ?? 0}

Respond with:
1. A single score from 0–100 (format: "Score: XX")
2. A 2-3 sentence summary of the overall system health
3. A numbered list of up to 5 specific, actionable recommendations labelled "Recommendations:"

Be concise and direct.`

    try {
      const model = localStorage.getItem('vortex-default-model') ?? 'llama3.2:latest'
      let fullText = ''
      await new Promise<void>((resolve) => {
        const unsub = el.on('ollama-stream', (chunk: string) => { fullText += chunk })
        el.ollamaChat({ model, messages: [{ role: 'user', content: prompt }] })
          .then(() => { unsub(); resolve() })
          .catch(() => { unsub(); resolve() })
      })
      if (fullText) setReport(parseReport(fullText, data))
      else setReport({ score: 0, summary: 'Could not generate report — is Ollama running?', sections: [], recommendations: [], generatedAt: Date.now() })
    } catch (e: any) {
      setReport({ score: 0, summary: `Error: ${e.message}`, sections: [], recommendations: [], generatedAt: Date.now() })
    }

    setStage('')
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: '760px' }}>
      {/* Generate button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <button
          onClick={generate}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', borderRadius: '9px', fontSize: '12px', fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: loading ? 'default' : 'pointer', background: loading ? 'rgba(255,255,255,0.03)' : 'rgba(239,68,68,0.12)', border: `1px solid ${loading ? 'rgba(255,255,255,0.06)' : 'rgba(239,68,68,0.3)'}`, color: loading ? '#4b5563' : 'var(--crimson)' }}
        >
          {loading ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> {stage || 'Analysing…'}</> : <><Activity size={14} /> Generate Health Report</>}
        </button>
        {report && <button onClick={generate} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 14px', borderRadius: '7px', fontSize: '10px', fontFamily: 'monospace', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: '#4b5563', cursor: 'pointer' }}><RefreshCw size={11} /> Refresh</button>}
      </div>

      {!report && !loading && (
        <div style={{ padding: '48px', textAlign: 'center', border: '2px dashed rgba(255,255,255,0.06)', borderRadius: '12px', color: '#3f3f46', fontSize: '13px', fontStyle: 'italic' }}>
          Click "Generate Health Report" to run an AI-powered system analysis.<br />
          <span style={{ fontSize: '11px' }}>Gathers disk, memory, journal errors, failed services, and pending updates.</span>
        </div>
      )}

      {report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Score + summary */}
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center', padding: '20px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${SCORE_COLOR(report.score)}22`, borderRadius: '12px' }}>
            <ScoreRing score={report.score} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>System Health Score</div>
              <p style={{ fontSize: '13px', color: '#e2e8f0', lineHeight: 1.7, margin: 0 }}>{report.summary}</p>
              <div style={{ fontSize: '9px', color: '#3f3f46', fontFamily: 'monospace', marginTop: '8px' }}>Generated {new Date(report.generatedAt).toLocaleTimeString()}</div>
            </div>
          </div>

          {/* Metric grid */}
          {report.sections.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {report.sections.map(s => {
                const Icon = STATUS_ICON[s.status]
                const color = STATUS_COLOR[s.status]
                return (
                  <div key={s.title} style={{ padding: '12px 14px', background: color + '08', border: `1px solid ${color}22`, borderRadius: '9px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icon size={16} style={{ color, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#e2e8f0', fontFamily: 'monospace' }}>{s.title}</div>
                      <div style={{ fontSize: '10px', color: '#52525b', marginTop: '1px' }}>{s.detail}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Recommendations */}
          {report.recommendations.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', fontFamily: 'monospace', fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>Recommendations</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {report.recommendations.map((rec, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--crimson)', fontFamily: 'monospace', flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: '12px', color: '#a1a1aa', lineHeight: 1.6 }}>{rec}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
