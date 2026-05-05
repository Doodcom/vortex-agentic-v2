import { useState, useEffect, useMemo } from 'react'
import { codeToHtml } from 'shiki'
import { Copy, Check, Terminal, Code2, Play, Loader2, X } from 'lucide-react'
import { notify } from '../lib/notifications'

type RunState = 'idle' | 'confirming' | 'running' | 'done'

interface RunResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode?: number
}

interface ArtifactViewProps {
  code: string
  language: string
  title?: string
}

export default function ArtifactView({ code, language, title }: ArtifactViewProps) {
  const [html, setHtml] = useState('')
  const [copied, setCopied] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [runState, setRunState] = useState<RunState>('idle')
  const [runResult, setRunResult] = useState<RunResult | null>(null)

  const isShell = useMemo(() => language === 'bash' || language === 'sh' || language === 'shell', [language])

  const handleRun = async () => {
    setRunState('running')
    setRunResult(null)
    try {
      const result = await (window as any).electron.execCommand(code)
      setRunResult(result)
      if ((window as any).electron?.dbLogCommand) {
        ;(window as any).electron.dbLogCommand({ command: code.slice(0, 500), exit_code: result.exitCode ?? (result.success ? 0 : 1), source: 'ai' })
      }
      notify(
        result.success ? 'Command Succeeded' : 'Command Failed',
        code.slice(0, 80) + (code.length > 80 ? '…' : ''),
        result.success ? 'success' : 'error'
      )
    } catch (e: any) {
      setRunResult({ success: false, stdout: '', stderr: e?.message || 'Execution failed' })
      notify('Command Error', e?.message ?? 'Execution failed', 'error')
    } finally {
      setRunState('done')
    }
  }

  useEffect(() => {
    let active = true
    async function highlight() {
      // Don't bother with shiki if it's too long or if we're in a critical loop
      if (code.length > 8000) {
        setHtml('')
        setIsLoading(false)
        return
      }
      try {
        const validLangs = ['typescript', 'javascript', 'python', 'bash', 'sh', 'shell', 'sql', 'json', 'yaml', 'markdown', 'html', 'css', 'text']
        const lang = validLangs.includes(language) ? language : 'text'
        const codeHtml = await codeToHtml(code, { lang, theme: 'one-dark-pro' })
        if (active) setHtml(codeHtml)
      } catch (err) {
        if (active) setHtml('')
      } finally {
        if (active) setIsLoading(false)
      }
    }
    highlight()
    return () => { active = false }
  }, [code, language])

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="v-artifact" style={{ margin: '16px 0', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', background: '#090a0f', overflow: 'hidden', width: '100%' }}>
      {/* Header */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isShell ? <Terminal size={12} style={{ color: 'var(--crimson)' }} /> : <Code2 size={12} style={{ color: 'var(--crimson)' }} />}
          <span style={{ fontSize: '9px', fontFamily: 'monospace', fontWeight: 'bold', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {title || language || 'output'}
          </span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isShell && runState === 'idle' && (
            <button onClick={() => setRunState('confirming')} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--crimson)', padding: '4px 10px', borderRadius: '6px', fontSize: '9px', fontFamily: 'monospace', cursor: 'pointer', textTransform: 'uppercase' }}>
              <Play size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Run_Fix
            </button>
          )}

          {isShell && runState === 'confirming' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '9px', fontFamily: 'monospace', color: '#52525b' }}>RUN?</span>
              <button onClick={handleRun} style={{ background: 'var(--crimson)', color: 'white', border: 'none', padding: '3px 8px', borderRadius: '4px', fontSize: '9px', fontFamily: 'monospace', cursor: 'pointer' }}>YES</button>
              <button onClick={() => setRunState('idle')} style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer' }}><X size={12} /></button>
            </div>
          )}

          {isShell && runState === 'running' && <Loader2 size={12} className="animate-spin text-zinc-600" />}

          {isShell && runState === 'done' && (
             <button onClick={() => { setRunState('idle'); setRunResult(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: runResult?.success ? 'var(--signal)' : 'var(--crimson)', fontSize: '9px', fontFamily: 'monospace' }}>
               {runResult?.success ? 'SUCCESS' : 'FAILED'}
             </button>
          )}

          <button onClick={handleCopy} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.05)', color: '#71717a', padding: '4px', borderRadius: '6px', cursor: 'pointer' }}>
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '0', background: '#0d0e11', position: 'relative', minHeight: '40px' }}>
        {html && !isLoading ? (
          <div className="shiki-container" style={{ padding: '16px', fontSize: '13px', lineHeight: '1.6', overflow: 'auto', maxHeight: '500px' }} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre style={{ margin: 0, padding: '16px', fontSize: '13px', lineHeight: '1.6', color: '#d4d4d8', overflow: 'auto', maxHeight: '500px', fontFamily: 'monospace' }}>
            <code>{code}</code>
          </pre>
        )}
      </div>

      {/* Results */}
      {runState === 'done' && runResult && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.3)', fontFamily: 'monospace', fontSize: '11px' }}>
          <div style={{ color: '#52525b', fontSize: '9px', marginBottom: '4px' }}>// SYSTEM_OUTPUT</div>
          <pre style={{ margin: 0, color: runResult.success ? '#10b981' : '#f43f5e', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {runResult.stdout || runResult.stderr || '(no output)'}
          </pre>
        </div>
      )}
    </div>
  )
}
