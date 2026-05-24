import { useState, useEffect, useMemo } from 'react'
import { codeToHtml } from 'shiki'
import { Copy, Check, Terminal, Code2, Play, Loader2, X, GitCompareArrows, FileCode } from 'lucide-react'
import { diffLines, type Change } from 'diff'
import { notify } from '../lib/notifications'

type RunState = 'idle' | 'confirming' | 'running' | 'done'

// Detect a file path declared on the first line via the convention `// FILE: path/to/file.ts`
// (also supports `# FILE:` for Python/shell, `--- FILE:` for SQL). Returns the parsed path
// plus the code with the marker line removed. Falls back to the code-fence meta string
// (e.g. ```typescript:src/foo.ts) when no marker comment is present.
function parseFilePathFromCode(code: string, language: string): { path: string | null; cleaned: string } {
  const lines = code.split('\n')
  const first = lines[0]?.trim() ?? ''
  const m = first.match(/^(?:\/\/|#|--)\s*FILE:\s*(.+)$/i)
  if (m) {
    return { path: m[1].trim(), cleaned: lines.slice(1).join('\n').replace(/^\n/, '') }
  }
  // Code-fence meta after a colon — ReactMarkdown preserves this in the className.
  const langMatch = language.match(/^[a-zA-Z0-9]+[:\s]+(.+\.[A-Za-z0-9]+)$/)
  if (langMatch) return { path: langMatch[1].trim(), cleaned: code }
  return { path: null, cleaned: code }
}

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
  isStreaming?: boolean
}

export default function ArtifactView({ code: rawCode, language: rawLanguage, title, isStreaming }: ArtifactViewProps) {
  const { path: filePath, cleaned: code } = useMemo(() => parseFilePathFromCode(rawCode, rawLanguage), [rawCode, rawLanguage])
  // Strip any path suffix from the language for syntax highlighting.
  const language = useMemo(() => rawLanguage.split(/[:\s]/)[0] || 'text', [rawLanguage])

  const [html, setHtml] = useState('')
  const [copied, setCopied] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [runState, setRunState] = useState<RunState>('idle')
  const [runResult, setRunResult] = useState<RunResult | null>(null)
  const [diffMode, setDiffMode] = useState(false)
  const [baseline, setBaseline] = useState<string | null>(null)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)

  const isShell = useMemo(() => language === 'bash' || language === 'sh' || language === 'shell', [language])

  const toggleDiff = async () => {
    if (!filePath) return
    if (diffMode) { setDiffMode(false); return }
    setLoadingDiff(true)
    setDiffError(null)
    try {
      const res = await (window as any).electron?.systemReadTextFile?.(filePath)
      if (res?.success) {
        setBaseline(res.content)
        setDiffMode(true)
      } else {
        setDiffError(res?.error || 'File not found')
        setDiffMode(true)
      }
    } catch (e: any) {
      setDiffError(e.message)
      setDiffMode(true)
    } finally {
      setLoadingDiff(false)
    }
  }

  const diffChanges: Change[] = useMemo(() => {
    if (!diffMode || baseline === null) return []
    return diffLines(baseline, code)
  }, [diffMode, baseline, code])

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
    // Skip syntax highlighting while streaming — avoids per-token async height flicker.
    // The <pre> fallback is stable; one final highlight runs when the stream ends.
    if (isStreaming) return

    let active = true
    async function highlight() {
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
  }, [code, language, isStreaming])

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="v-artifact" style={{ margin: '16px 0', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', background: '#090a0f', overflow: 'hidden', width: '100%' }}>
      {/* Header */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          {filePath ? <FileCode size={12} style={{ color: 'var(--crimson)', flexShrink: 0 }} /> : isShell ? <Terminal size={12} style={{ color: 'var(--crimson)' }} /> : <Code2 size={12} style={{ color: 'var(--crimson)' }} />}
          <span style={{ fontSize: '9px', fontFamily: 'monospace', fontWeight: 'bold', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.1em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {filePath ?? title ?? language ?? 'output'}
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

          {filePath && (
            <button
              onClick={toggleDiff}
              title={diffMode ? 'Hide diff' : `Compare with ${filePath}`}
              style={{
                background: diffMode ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${diffMode ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.05)'}`,
                color: diffMode ? '#c084fc' : '#71717a',
                padding: '4px 8px', borderRadius: '6px', cursor: 'pointer',
                fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}
            >
              {loadingDiff ? <Loader2 size={10} className="animate-spin" /> : <GitCompareArrows size={10} />}
              <span>{diffMode ? 'Hide' : 'Diff'}</span>
            </button>
          )}

          <button onClick={handleCopy} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.05)', color: '#71717a', padding: '4px', borderRadius: '6px', cursor: 'pointer' }}>
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      {/* Content — pre is always rendered for stable layout; shiki fades in on top once ready */}
      <div style={{ padding: '0', background: '#0d0e11', position: 'relative', minHeight: '40px' }}>
        {diffMode ? (
          diffError ? (
            <div style={{ padding: '16px', color: '#f87171', fontFamily: 'monospace', fontSize: '12px' }}>
              Diff unavailable: {diffError}
            </div>
          ) : (
            <div style={{ padding: '12px 0', fontFamily: 'monospace', fontSize: '12px', lineHeight: 1.55, overflow: 'auto', maxHeight: '500px' }}>
              {diffChanges.map((c, i) => {
                const bg = c.added ? 'rgba(16,185,129,0.10)' : c.removed ? 'rgba(244,63,94,0.12)' : 'transparent'
                const marker = c.added ? '+' : c.removed ? '-' : ' '
                const color = c.added ? '#34d399' : c.removed ? '#fb7185' : '#a1a1aa'
                // split('\n') of "foo\n" → ["foo", ""]; drop only the trailing empty string.
                // For chunks without a trailing newline (e.g. final line of a file) keep every line.
                const lines = c.value.split('\n')
                if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
                return lines.map((ln, j) => (
                  <div key={`${i}-${j}`} style={{ display: 'flex', background: bg, color, padding: '0 16px' }}>
                    <span style={{ width: '14px', flexShrink: 0, opacity: 0.7 }}>{marker}</span>
                    <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{ln || ' '}</span>
                  </div>
                ))
              })}
            </div>
          )
        ) : html && !isLoading ? (
          <div
            className="shiki-container"
            style={{ padding: '16px', fontSize: '13px', lineHeight: '1.6', overflow: 'auto', maxHeight: '500px', animation: 'artifactFadeIn 0.15s ease' }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
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
