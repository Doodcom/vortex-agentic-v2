import { useState, useEffect, useCallback, useRef } from 'react'
import { notify } from '../lib/notifications'
import { VORTEX_MODELS, DEFAULT_MODEL } from '../lib/models'

export interface Session {
  id: number
  name: string
  created_at: number
  updated_at: number
}

export function useOllama() {
  const [models, setModels] = useState<any[]>(VORTEX_MODELS)
  const [activeModel, setActiveModelState] = useState<string>(
    () => localStorage.getItem('vortex-default-model') ?? DEFAULT_MODEL
  )

  const setActiveModel = (m: string) => {
    setActiveModelState(m)
    localStorage.setItem('vortex-default-model', m)
    window.dispatchEvent(new CustomEvent('vortex-model-change', { detail: m }))
  }

  // Purge previous model from VRAM when changing models — skip on initial mount
  const isFirstModelMount = useRef(true)
  useEffect(() => {
    if (isFirstModelMount.current) { isFirstModelMount.current = false; return }
    if (window.electron?.ollamaPurge) {
      window.electron.ollamaPurge()
    }
  }, [activeModel])

  const [sessions, setSessions]                 = useState<Session[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null)
  const currentSessionIdRef                     = useRef<number | null>(null)

  const [messages, setMessages]     = useState<any[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [pullProgress, setPullProgress] = useState<{ status: string; percent: number } | null>(null)
  const [tokenUsage, setTokenUsage] = useState<{ promptTokens: number; completionTokens: number } | null>(null)
  const [smartRoute, setSmartRouteState] = useState(() => localStorage.getItem('vortex-smart-route') === 'true')
  const [lastRoutedModel, setLastRoutedModel] = useState('')
  const [agentMode, setAgentModeState] = useState(() => localStorage.getItem('vortex-agent-mode') === 'true')
  const [orchestraMode, setOrchestraModeState] = useState(() => localStorage.getItem('vortex-orchestra-mode') === 'true')
  const currentResponseRef = useRef('')

  const setSmartRoute = (v: boolean) => {
    setSmartRouteState(v)
    localStorage.setItem('vortex-smart-route', String(v))
  }

  const setAgentMode = (v: boolean) => {
    setAgentModeState(v)
    localStorage.setItem('vortex-agent-mode', String(v))
  }

  const setOrchestraMode = (v: boolean) => {
    setOrchestraModeState(v)
    localStorage.setItem('vortex-orchestra-mode', String(v))
  }

  function pickModel(content: string, baseModel: string): string {
    if (!smartRoute || models.length < 2) return baseModel
    const COMPLEX = [
      /\b(write|create|implement|build|code|program|script|class|function|refactor|debug|fix|analyze|compare|design|architect|generate)\b/i,
      /\b(step by step|in detail|explain how|walk me through|comprehensive)\b/i,
    ]
    const isComplex = content.length > 250 || COMPLEX.some(re => re.test(content))
    if (isComplex) return baseModel
    // Route to smallest available model for simple queries
    const small = models.find(m => /1b|3b|7b|8b/i.test(m.name) && m.name !== baseModel)
    return small?.name ?? baseModel
  }

  // Keep ref in sync so the IPC done-handler always has the latest id
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId
    if (currentSessionId && sessions.length > 0) {
      const s = sessions.find(x => x.id === currentSessionId)
      if (s) window.dispatchEvent(new CustomEvent('vortex-session-change', { detail: s }))
    }
  }, [currentSessionId, sessions])

  // ── Session helpers ──────────────────────────────────────────────────────────
  const refreshSessions = useCallback(async () => {
    if (!(window as any).electron) return
    const rows: Session[] = await (window as any).electron.dbGetSessions()
    setSessions(rows)
    return rows
  }, [])

  const loadSession = useCallback(async (id: number) => {
    if (!(window as any).electron) return
    const rows = await (window as any).electron.dbGetMessages(id)
    setMessages(rows.length > 0 ? rows : [])
    setCurrentSessionId(id)
  }, [])

  const createSession = useCallback(async (name = 'New Chat') => {
    if (!(window as any).electron) return null
    const sess = await (window as any).electron.dbCreateSession(name)
    await refreshSessions()
    await loadSession(sess.id)
    return sess as Session
  }, [refreshSessions, loadSession])

  const renameSession = useCallback(async (id: number, name: string) => {
    if (!(window as any).electron) return
    await (window as any).electron.dbRenameSession({ id, name })
    await refreshSessions()
  }, [refreshSessions])

  const deleteSession = useCallback(async (id: number) => {
    if (!(window as any).electron) return
    await (window as any).electron.dbDeleteSession(id)
    const rows = await refreshSessions() as Session[] | undefined
    if (rows && rows.length > 0) {
      await loadSession(rows[0].id)
    } else {
      // No sessions left — create a fresh default
      const sess = await (window as any).electron.dbCreateSession('New Chat')
      await refreshSessions()
      await loadSession(sess.id)
    }
  }, [refreshSessions, loadSession])

  // ── Init ─────────────────────────────────────────────────────────────────────
  const fetchModels = useCallback(async () => {
    if (!(window as any).electron) {
      setModels(VORTEX_MODELS)
      return
    }
    try {
      const list = await (window as any).electron.ollamaListModels()
      
      // FORCE SYNC: Override Ollama's metadata with our professional tier labels
      const merged = VORTEX_MODELS.map(vm => {
        const found = list.find((m: any) => m.name === vm.name)
        return {
          ...vm,
          size: found ? found.size : vm.size,
          // We keep OUR labels, not Ollama's generic ones
        }
      })
      setModels(merged)
    } catch {
      setModels(VORTEX_MODELS)
    }
  }, [])

  useEffect(() => {
    fetchModels()
    if (!(window as any).electron) return
    ;(async () => {
      const rows: Session[] = await (window as any).electron.dbGetSessions()
      setSessions(rows)
      if (rows.length > 0) {
        await loadSession(rows[0].id)
      } else {
        // First launch — create default session
        const sess = await (window as any).electron.dbCreateSession('New Chat')
        setSessions([sess])
        setCurrentSessionId(sess.id)
      }
    })()
  }, [])

  // ── Streaming IPC listeners ───────────────────────────────────────────────
  useEffect(() => {
    if (!(window as any).electron) return

    const handleToken = (token: string) => {
      currentResponseRef.current += token
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last && last.role === 'assistant') {
          return [...prev.slice(0, -1), { ...last, content: currentResponseRef.current }]
        }
        return [...prev, { role: 'assistant', content: currentResponseRef.current }]
      })
    }

    const handlePullProgress = (data: any) => {
      if (data.status.includes('success')) {
        setPullProgress(null)
        fetchModels()
        notify('Model Downloaded', `${data.status}`, 'success')
      } else {
        const percent = data.total ? Math.round((data.completed || 0) / data.total * 100) : 0
        setPullProgress({ status: data.status, percent })
      }
    }

    const handleDone = () => {
      const sid = currentSessionIdRef.current
      if ((window as any).electron && currentResponseRef.current) {
        (window as any).electron.dbSaveMessage({
          role: 'assistant',
          content: currentResponseRef.current,
          sessionId: sid ?? undefined
        })
      }
      setIsStreaming(false)
      currentResponseRef.current = ''
    }

    const handleError = (err: string) => {
      setError(err)
      setIsStreaming(false)
    }

    const handleTokenUsage = (data: { promptTokens: number; completionTokens: number }) => {
      setTokenUsage(data)
      window.dispatchEvent(new CustomEvent('vortex-token-usage', { detail: data }))
    }

    const handleOrchAgent = (data: { agentId: number; role: string; status: 'working' | 'done'; output?: string }) => {
      setMessages(prev => {
        const idx = prev.findIndex((m: any) => m.role === 'orch_agent' && m.agentId === data.agentId)
        const updated = { role: 'orch_agent', agentId: data.agentId, agentRole: data.role, status: data.status, output: data.output }
        if (idx >= 0) return prev.map((m: any, i: number) => i === idx ? updated : m)
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant') return [...prev.slice(0, -1), updated, last]
        return [...prev, updated]
      })
    }

    const handleAgentStep = (data: { type: 'call' | 'result'; name: string; args?: any; result?: string; stepId: number }) => {
      if (data.type === 'call') {
        setMessages(prev => {
          const last = prev[prev.length - 1]
          const step = { role: 'tool_step' as const, stepId: data.stepId, name: data.name, args: data.args }
          if (last?.role === 'assistant') return [...prev.slice(0, -1), step, last]
          return [...prev, step]
        })
      } else {
        setMessages(prev => prev.map((m: any) =>
          m.role === 'tool_step' && m.stepId === data.stepId ? { ...m, result: data.result } : m
        ))
      }
    }

    ;(window as any).electron.on('ollama-token', handleToken)
    ;(window as any).electron.on('ollama-done', handleDone)
    ;(window as any).electron.on('ollama-error', handleError)
    ;(window as any).electron.on('ollama-pull-progress', handlePullProgress)
    ;(window as any).electron.on('ollama-agent-step', handleAgentStep)
    ;(window as any).electron.on('ollama-token-usage', handleTokenUsage)
    ;(window as any).electron.on('ollama-orch-agent', handleOrchAgent)

    return () => {
      ;(window as any).electron.removeListener('ollama-token')
      ;(window as any).electron.removeListener('ollama-done')
      ;(window as any).electron.removeListener('ollama-error')
      ;(window as any).electron.removeListener('ollama-pull-progress')
      ;(window as any).electron.removeListener('ollama-agent-step')
      ;(window as any).electron.removeListener('ollama-token-usage')
      ;(window as any).electron.removeListener('ollama-orch-agent')
    }
  }, [fetchModels])

  // ── Send ────────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (content: string, images?: string[]) => {
    if (!content.trim() && (!images || images.length === 0)) return
    if (isStreaming || !(window as any).electron) return

    setError(null)
    setIsStreaming(true)
    const userMsg = { role: 'user', content, images }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)

    const sid = currentSessionIdRef.current
    ;(window as any).electron.dbSaveMessage({ role: 'user', content, sessionId: sid ?? undefined })

    if (messages.length === 0 && sid !== null) {
      await renameSession(sid, content.slice(0, 40).replace(/\n/g, ' '))
    }

    setMessages(prev => [...prev, { role: 'assistant', content: '' }])
    currentResponseRef.current = ''

    // Trim oldest messages from API context when total chars exceed limit
    // Full history stays in UI; only the API call sees the trimmed window
    // 128k chars is roughly 32k tokens, ideal for 14B/30B models on high-end hardware.
    const MAX_CONTEXT_CHARS = 128000
    let apiMessages = newMessages.filter((m: any) => m.role !== 'tool_step')
    let totalChars = apiMessages.reduce((s: number, m: any) => s + (m.content?.length ?? 0), 0)
    while (totalChars > MAX_CONTEXT_CHARS && apiMessages.length > 4) {
      totalChars -= apiMessages.shift()!.content.length
    }
    if (apiMessages.length < newMessages.filter((m: any) => m.role !== 'tool_step').length) {
      apiMessages = [
        { role: 'system', content: `[${newMessages.length - apiMessages.length} earlier messages omitted — context window trimmed]` },
        ...apiMessages
      ]
    }

    const modelToUse = pickModel(content, activeModel)
    setLastRoutedModel(modelToUse)

    const customPrompt = localStorage.getItem('vortex-custom-prompt') ?? ''
    const searxngUrl = localStorage.getItem('vortex-searxng-url') ?? ''
    const ipc = orchestraMode
      ? (window as any).electron.ollamaOrchestrate
      : agentMode
        ? (window as any).electron.ollamaAgenticChat
        : (window as any).electron.ollamaChat
    const result = await ipc({ model: modelToUse, messages: apiMessages, customPrompt, searxngUrl, images })
    if (!result.success) {
      setError(result.error || 'Failed to start chat')
      setIsStreaming(false)
    }
  }, [messages, activeModel, isStreaming, agentMode, orchestraMode, renameSession])

  const cancelStream = useCallback(async () => {
    setIsStreaming(false)
    currentResponseRef.current = ''
    if ((window as any).electron) await (window as any).electron.ollamaCancel()
  }, [])

  const clearMessages = useCallback(async () => {
    await createSession()
  }, [createSession])

  const pullModel = useCallback(async (name: string) => {
    if (!window.electron) return
    setError(null)
    const result = await window.electron.ollamaPullModel({ name })
    if (!result.success) setError(result.error || `Failed to pull model ${name}`)
  }, [])

  return {
    models,
    activeModel,
    setActiveModel,
    messages,
    setMessages,
    sessions,
    currentSessionId,
    loadSession,
    createSession,
    renameSession,
    deleteSession,
    sendMessage,
    cancelStream,
    clearMessages,
    pullModel,
    pullProgress,
    isStreaming,
    error,
    smartRoute,
    setSmartRoute,
    lastRoutedModel,
    agentMode,
    setAgentMode,
    orchestraMode,
    setOrchestraMode,
    tokenUsage,
  }
}
