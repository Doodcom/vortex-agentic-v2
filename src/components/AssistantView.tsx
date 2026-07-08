import { useState, useRef, useEffect, useMemo, memo, type ComponentPropsWithoutRef } from 'react'
import { createPortal } from 'react-dom'
import { useOllama, type Session, type OllamaUiMessage } from '../hooks/useOllama'
import { notify } from '../lib/notifications'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Square, Bot, User, Loader2, AlertCircle, Activity, FolderOpen, RotateCcw, MessageSquare, Plus, Trash2, Check, X, Zap, Wrench, ChevronDown, ChevronRight, Terminal, Paperclip, Layers, Wand2, Copy, Network, Brain, Mic, MicOff, Volume2, VolumeX } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import ArtifactView from './ArtifactView'
import { useTheme } from './ThemeProvider'
import { consumeTerminalQuery } from '../lib/terminalBridge'




export default function AssistantView() {
  const { playSound } = useTheme()
  const {
    models,
    activeModel,
    setActiveModel,
    messages,
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
    thinkMode,
    setThinkMode,
    tokenUsage,
  } = useOllama()

  const [showSessions, setShowSessions] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [showContextPicker, setShowContextPicker] = useState(false)
  const contextBtnRef = useRef<HTMLButtonElement | null>(null)
  const [contextPickerPos, setContextPickerPos] = useState({ top: 0, left: 0 })
  useEffect(() => {
    if (!showContextPicker || !contextBtnRef.current) return
    const reposition = () => {
      const r = contextBtnRef.current?.getBoundingClientRect()
      if (r) setContextPickerPos({ top: r.bottom + 6, left: r.left })
    }
    reposition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [showContextPicker])
  
  const [input, setInput] = useState(() => localStorage.getItem('vortex-ai-input') || consumeTerminalQuery() || '')

  useEffect(() => {
    localStorage.setItem('vortex-ai-input', input)
  }, [input])
  const [isDiagnosing, setIsDiagnosing] = useState(false)
  const [project, setProject] = useState<{ path: string, fileCount: number } | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [showNodeManager, setShowNodeManager] = useState(false)
  const [contextFlags, setContextFlags] = useState<{ rag: boolean; terminal: boolean; memory: boolean }>(() => {
    const s = localStorage.getItem('vortex-context-flags')
    return s ? JSON.parse(s) : { rag: true, terminal: true, memory: true }
  })
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string; truncated?: boolean; type: 'text' | 'image' } | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(() => localStorage.getItem('vortex-tts') === 'true')
  useEffect(() => { localStorage.setItem('vortex-tts', String(ttsEnabled)) }, [ttsEnabled])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      const rec = new MediaRecorder(stream, { mimeType: mime })
      mediaRecorderRef.current = rec
      recordedChunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(recordedChunksRef.current, { type: mime })
        const arr = await blob.arrayBuffer()
        const b64 = btoa(String.fromCharCode(...new Uint8Array(arr)))
        setIsTranscribing(true)
        try {
          const res = await window.electron.voiceTranscribe?.({ audioBase64: b64, mimeType: mime })
          if (res?.success && res.text) setInput(prev => (prev ? prev + ' ' : '') + res.text)
          else notify('Transcription failed', res?.error || 'Whisper not available', 'error')
        } finally { setIsTranscribing(false) }
      }
      rec.start()
      setIsRecording(true)
    } catch (e) {
      notify('Microphone unavailable', e instanceof Error ? e.message : String(e), 'error')
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }

  // Auto-TTS: when streaming ends, speak the last assistant message via Piper.
  const lastSpokenRef = useRef<string>('')
  const wasStreamingRef = useRef(false)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const stopSpeech = () => {
    const a = currentAudioRef.current
    if (a) { try { a.pause(); a.currentTime = 0 } catch (err) { void err } }
    currentAudioRef.current = null
    setIsSpeaking(false)
  }
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming && ttsEnabled) {
      const last = [...messages].reverse().find(m => m.role === 'assistant' && m.content)
      if (last && last.content !== lastSpokenRef.current) {
        lastSpokenRef.current = last.content
        // Strip code blocks, markdown, and <think> reasoning — TTS only needs prose.
        const clean = last.content
          .replace(/<think>[\s\S]*?<\/think>/g, '')
          .replace(/```[\s\S]*?```/g, '')
          .replace(/`[^`]*`/g, '')
          .replace(/[*_#>]/g, '')
          .trim()
          .slice(0, 800)
        if (clean) {
          window.electron.voiceSpeak?.({ text: clean }).then((res) => {
            if (res?.success && res.audioBase64) {
              try {
                stopSpeech() // interrupt any previous playback first
                const audio = new Audio(`data:audio/wav;base64,${res.audioBase64}`)
                currentAudioRef.current = audio
                audio.onended = () => { currentAudioRef.current = null; setIsSpeaking(false) }
                audio.onerror = () => { currentAudioRef.current = null; setIsSpeaking(false) }
                setIsSpeaking(true)
                audio.play().catch(() => { setIsSpeaking(false) })
              } catch { setIsSpeaking(false) }
            }
          }).catch(() => {})
        }
      }
    }
    wasStreamingRef.current = isStreaming
  }, [isStreaming, ttsEnabled, messages])

  const toggleFlag = (key: 'rag' | 'terminal' | 'memory') => {
    setContextFlags(prev => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem('vortex-context-flags', JSON.stringify(next))
      return next
    })
  }

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const focus = () => {
      const q = consumeTerminalQuery()
      if (q) setInput(q)
      inputRef.current?.focus()
    }
    const newChat = () => clearMessages()
    window.addEventListener('vortex-focus-ai', focus)
    window.addEventListener('vortex-new-chat', newChat)
    return () => {
      window.removeEventListener('vortex-focus-ai', focus)
      window.removeEventListener('vortex-new-chat', newChat)
    }
  }, [clearMessages])

  useEffect(() => {
    async function checkProject() {
      const status = await window.electron.ragStatus()
      if (status.path) setProject({ path: status.path, fileCount: status.fileCount })
    }
    checkProject()
  }, [])

  // Auto-scroll to bottom when new tokens arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSelectProject = async () => {
    setIsScanning(true)
    try {
      const res = await window.electron.ragSelectProject()
      if (res) setProject(res)
    } finally {
      setIsScanning(false)
    }
  }

  const buildPrompt = async (text: string, isImage: boolean) => {
    let finalPrompt = text
    const isGreeting = text.trim().length < 15

    if (attachedFile && !isImage) {
      finalPrompt = `Attached file — \`${attachedFile.name}\`${attachedFile.truncated ? ' (truncated to 20k chars)' : ''}:\n\`\`\`\n${attachedFile.content}\n\`\`\`\n\n${finalPrompt}`
    }

    // Only inject heavy system context if the user is asking a real question (not just saying hi)
    if (!isGreeting) {
      if (contextFlags.memory) {
        const memories = await window.electron.memoryGetAll()
        if (memories && memories.length > 0) {
          const facts = memories.map((m) => `- ${m.fact}`).join('\n')
          finalPrompt = `Persistent Memory (Learned Facts):\n${facts}\n\n${finalPrompt}`
        }
      }

      if (project && contextFlags.rag) {
        const context = await window.electron.ragGetContext(text)
        if (context) finalPrompt = `${context}\n\nUser Question: ${finalPrompt}`
      }

      if (contextFlags.terminal) {
        const termBuffer: string = await window.electron.ptyGetBuffer?.() ?? ''
        if (termBuffer.trim().length > 80) {
          finalPrompt = `Recent terminal output:\n\`\`\`\n${termBuffer.slice(-2000)}\n\`\`\`\n\n${finalPrompt}`
        }
      }
    }

    return finalPrompt
  }

  const handleSend = async () => {
    if ((!input.trim() && !attachedFile) || isStreaming) return
    playSound('click')

    let images: string[] | undefined = undefined
    let finalInput = input

    if (attachedFile?.type === 'image') {
      images = [attachedFile.content.split(',')[1]]
      if (!finalInput.trim()) finalInput = "Describe this image."
    }

    const prompt = await buildPrompt(finalInput, !!images)
    sendMessage(prompt, images)
    
    setInput('')
    setAttachedFile(null)
  }

  const handleQuickSend = async (text: string) => {
    if (isStreaming) return
    playSound('click')
    sendMessage(await buildPrompt(text, false))
  }

  const handleAttachFile = async () => {
    const result = await window.electron.dialogOpenFile()
    if (!result || 'error' in result) return

    const ext = result.name.split('.').pop()?.toLowerCase()
    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext || '')

    if (isImage) {
      const base64 = await window.electron.systemReadLocalImage(result.path)
      if (base64 && typeof base64 === 'string') {
        setAttachedFile({ name: result.name, content: base64, type: 'image' })
      }
    } else {
      setAttachedFile({ name: result.name, content: result.content, truncated: result.truncated, type: 'text' })
    }
    playSound('click')
  }

  const handleDiagnose = async () => {
    if (isStreaming || isDiagnosing) return
    setIsDiagnosing(true)
    try {
      const logs = await window.electron.systemGetErrorLogs(20)
      const prompt = `I am experiencing some system issues. Here are the last 20 critical entries from my journalctl logs:\n\n\`\`\`\n${logs}\n\`\`\`\n\nPlease analyze these logs, explain what might be going wrong, and suggest a fix.`
      sendMessage(prompt)
    } catch (e) {
      console.error('Diagnosis failed:', e)
    } finally {
      setIsDiagnosing(false)
    }
  }

  const startRename = (s: Session) => {
    setEditingSessionId(s.id)
    setEditingName(s.name)
  }
  const commitRename = async () => {
    if (editingSessionId !== null && editingName.trim()) {
      await renameSession(editingSessionId, editingName.trim())
    }
    setEditingSessionId(null)
  }

  return (
    <div style={{ display: 'flex', gap: '16px', height: 'calc(100vh - 220px)', overflow: 'hidden' }}>

      {/* Sessions panel */}
      <AnimatePresence>
        {showSessions && (
          <motion.div
            initial={{ opacity: 0, x: -20, width: 0 }}
            animate={{ opacity: 1, x: 0, width: 220 }}
            exit={{ opacity: 0, x: -20, width: 0 }}
            style={{ flexShrink: 0, overflow: 'hidden' }}
          >
            <div className="v-card" style={{ width: 220, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
              {/* Panel header */}
              <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#52525b' }}>Sessions</span>
                <button
                  onClick={() => { createSession(); playSound('click'); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--signal)', padding: '2px' }}
                  title="New session"
                >
                  <Plus size={12} />
                </button>
              </div>
              {/* Session list */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {sessions.map(s => (
                  <div
                    key={s.id}
                    onClick={() => { if (editingSessionId !== s.id) { loadSession(s.id); playSound('click'); } }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
                      cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.02)',
                      background: s.id === currentSessionId ? 'var(--crimson-07)' : 'transparent',
                      borderLeft: `2px solid ${s.id === currentSessionId ? 'var(--crimson)' : 'transparent'}`,
                    }}
                  >
                    {editingSessionId === s.id ? (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingSessionId(null); }}
                        onClick={e => e.stopPropagation()}
                        style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#f4f4f5', fontSize: '11px', fontFamily: 'monospace', padding: '2px 6px', outline: 'none' }}
                      />
                    ) : (
                      <span
                        onDoubleClick={e => { e.stopPropagation(); startRename(s); }}
                        style={{ flex: 1, fontSize: '11px', fontFamily: 'monospace', color: s.id === currentSessionId ? '#f4f4f5' : '#71717a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={s.name}
                      >
                        {s.name}
                      </span>
                    )}
                    {editingSessionId === s.id ? (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={e => { e.stopPropagation(); commitRename(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--signal)', padding: '2px' }}><Check size={10} /></button>
                        <button onClick={e => { e.stopPropagation(); setEditingSessionId(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52525b', padding: '2px' }}><X size={10} /></button>
                      </div>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); deleteSession(s.id); playSound('click'); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3f3f46', padding: '2px', opacity: sessions.length <= 1 ? 0.2 : 1 }}
                        disabled={sessions.length <= 1}
                        title="Delete session"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main chat column */}
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, maxWidth: '900px', margin: '0 auto', position: 'relative', overflow: 'hidden' }}>
      
      {/* Node Switching Panel */}
      <div className="v-card" style={{ padding: '16px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Activity size={18} className="text-crimson" />
            <h3 style={{ fontSize: '11px', fontFamily: 'monospace', color: '#f4f4f5', textTransform: 'uppercase', letterSpacing: '0.15em', margin: 0 }}>
              Model Management
            </h3>
          </div>
          <button 
            onClick={() => { setShowNodeManager(!showNodeManager); playSound('hover'); }}
            style={{ fontSize: '9px', fontFamily: 'monospace', color: '#71717a', background: 'none', border: 'none', cursor: 'pointer', textTransform: 'uppercase' }}
          >
            {showNodeManager ? '[ Close ]' : '[ Expand ]'}
          </button>
        </div>

        {showNodeManager && (
          <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '12px' }}>
            <QuickModelBtn
              label="8B Fast"
              name="qwen3:8b"
              isAvailable={models.find(m => m.name === 'qwen3:8b')?.installed}
              onSelect={(n: string) => { setActiveModel(n); playSound('click'); }}
              onPull={(n: string) => { pullModel(n); playSound('click'); }}
              isActive={activeModel === 'qwen3:8b'}
            />
            <QuickModelBtn
              label="14B Thinker"
              name="qwen3:14b"
              isAvailable={models.find(m => m.name === 'qwen3:14b')?.installed}
              onSelect={(n: string) => { setActiveModel(n); playSound('click'); }}
              onPull={(n: string) => { pullModel(n); playSound('click'); }}
              isActive={activeModel === 'qwen3:14b'}
            />
            <QuickModelBtn
              label="30B Coder"
              name="qwen3-coder:30b"
              isAvailable={models.find(m => m.name === 'qwen3-coder:30b')?.installed}
              onSelect={(n: string) => { setActiveModel(n); playSound('click'); }}
              onPull={(n: string) => { pullModel(n); playSound('click'); }}
              isActive={activeModel === 'qwen3-coder:30b'}
            />
            <QuickModelBtn
              label="14B Reasoner"
              name="deepseek-r1:14b"
              isAvailable={models.find(m => m.name === 'deepseek-r1:14b')?.installed}
              onSelect={(n: string) => { setActiveModel(n); playSound('click'); }}
              onPull={(n: string) => { pullModel(n); playSound('click'); }}
              isActive={activeModel === 'deepseek-r1:14b'}
            />
            <QuickModelBtn
              label="12B Vision"
              name="gemma3:12b"
              isAvailable={models.find(m => m.name === 'gemma3:12b')?.installed}
              onSelect={(n: string) => { setActiveModel(n); playSound('click'); }}
              onPull={(n: string) => { pullModel(n); playSound('click'); }}
              isActive={activeModel === 'gemma3:12b'}
            />
          </div>
          {/* Context & Project controls moved here to keep the model bar compact */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            {/* Context selector */}
            <div style={{ position: 'relative' }}>
              <button
                ref={contextBtnRef}
                onClick={() => {
                  if (!showContextPicker && contextBtnRef.current) {
                    const r = contextBtnRef.current.getBoundingClientRect()
                    setContextPickerPos({ top: r.bottom + 6, left: r.left })
                  }
                  setShowContextPicker(v => !v); playSound('hover')
                }}
                title="Context injected with each message"
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '6px',
                  background: showContextPicker ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${showContextPicker ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  color: showContextPicker ? '#a855f7' : '#52525b', fontSize: '9px', fontFamily: 'monospace',
                  textTransform: 'uppercase', cursor: 'pointer',
                }}
              >
                <Layers size={9} />
                <span>Context ({[contextFlags.rag && !!project, contextFlags.terminal].filter(Boolean).length})</span>
              </button>
              {showContextPicker && createPortal((
                <div
                  className="context-picker-container"
                  style={{
                    // Portal to body avoids ancestors with backdrop-filter (which create a containing
                    // block for fixed positioning and would otherwise push this off-screen).
                    position: 'fixed',
                    top: contextPickerPos.top, left: contextPickerPos.left, zIndex: 9999,
                    background: '#0d0e11', border: '1px solid rgba(168,85,247,0.4)', borderRadius: '12px',
                    padding: '14px', minWidth: '240px', boxShadow: '0 8px 48px rgba(0,0,0,0.8)',
                    maxHeight: '60vh', overflowY: 'auto'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ fontSize: '8px', fontFamily: 'monospace', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Context Injection</div>
                    <button onClick={() => setShowContextPicker(false)} style={{ background: 'none', border: 'none', color: '#3f3f46', cursor: 'pointer' }}><X size={10} /></button>
                  </div>
                  {([
                    { key: 'rag' as const,      label: 'RAG Project',     sub: project ? (project.path.split('/').pop() ?? 'project') : 'No project indexed', available: !!project },
                    { key: 'terminal' as const,  label: 'Terminal Buffer', sub: 'Last 2000 chars of output',   available: true },
                    { key: 'memory' as const,    label: 'AI Memory',       sub: 'Persistent learned facts',    available: true },
                  ]).map(({ key, label, sub, available }) => (
                    <div key={key} onClick={() => available && toggleFlag(key)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: available ? 'pointer' : 'default', opacity: available ? 1 : 0.35 }}
                    >
                      <div>
                        <div style={{ fontSize: '10px', fontFamily: 'monospace', color: contextFlags[key] && available ? '#f4f4f5' : '#71717a' }}>{label}</div>
                        <div style={{ fontSize: '8px', color: '#3f3f46', marginTop: '1px' }}>{sub}</div>
                      </div>
                      <div style={{ width: '28px', height: '16px', borderRadius: '8px', background: contextFlags[key] && available ? '#a855f7' : 'rgba(255,255,255,0.08)', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                        <div style={{ position: 'absolute', top: '2px', left: contextFlags[key] && available ? '14px' : '2px', width: '12px', height: '12px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                      </div>
                    </div>
                  ))}
                </div>
              ), document.body)}
            </div>
            <button
               onClick={() => { handleSelectProject(); playSound('click'); }}
               disabled={isScanning}
               title={project ? `Project: ${project.path}` : "Index Local Project"}
               style={{
                 display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', borderRadius: '6px',
                 background: project ? 'rgba(34,211,238,0.05)' : 'transparent',
                 border: `1px solid ${project ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.06)'}`,
                 color: project ? 'var(--signal)' : '#52525b', fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase',
                 cursor: isScanning ? 'default' : 'pointer'
               }}
             >
               <FolderOpen size={10} />
               <span>{project ? `Project: ${project.path.split('/').pop()}` : 'No Project'}</span>
             </button>
          </div>
          </>
        )}

        {pullProgress && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', fontFamily: 'monospace', color: 'var(--signal)', marginBottom: '4px' }}>
              <span>Pulling: {pullProgress.status}</span>
              <span>{pullProgress.percent}%</span>
            </div>
            <div style={{ height: '2px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${pullProgress.percent}%` }}
                style={{ height: '100%', background: 'var(--signal)' }}
              />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: '6px', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Bot size={16} className="text-zinc-500" />
            <select
              value={activeModel}
              onChange={(e) => { setActiveModel(e.target.value); playSound('click'); }}
              style={{ background: 'transparent', color: '#f4f4f5', fontSize: '11px', fontWeight: 'bold', border: 'none', outline: 'none', cursor: 'pointer', fontFamily: 'monospace' }}
            >
              {models
                .filter(m => !/embed|embedding|bge-|all-minilm/i.test(m.name))
                .map(m => (
                  <option key={m.name} value={m.name} style={{ background: '#0d0e11', color: '#f4f4f5' }}>
                    {m.label || m.name.split(':')[0]}
                  </option>
                ))}
            </select>
            <button
              onClick={() => { setSmartRoute(!smartRoute); playSound('click'); }}
              title="Auto-route: simple queries go to smallest model"
              style={{
                display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '6px',
                background: smartRoute ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${smartRoute ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.06)'}`,
                color: smartRoute ? '#f59e0b' : '#52525b', fontSize: '9px', fontFamily: 'monospace',
                textTransform: 'uppercase', cursor: 'pointer',
              }}
            >
              <Zap size={9} />
              <span>Auto</span>
            </button>
            {smartRoute && lastRoutedModel && !isStreaming && (
              <span style={{ fontSize: '8px', fontFamily: 'monospace', color: '#f59e0b', opacity: 0.7 }}>
                → {lastRoutedModel.split(':')[0]}
              </span>
            )}
            <button
              onClick={() => { setAgentMode(!agentMode); playSound('click'); }}
              title="Agent mode: AI can run commands, read files, and query system state"
              style={{
                display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '6px',
                background: agentMode ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${agentMode ? 'rgba(34,211,238,0.25)' : 'rgba(255,255,255,0.06)'}`,
                color: agentMode ? 'var(--signal)' : '#52525b', fontSize: '9px', fontFamily: 'monospace',
                textTransform: 'uppercase', cursor: 'pointer',
              }}
            >
              <Wrench size={9} />
              <span>Agent</span>
            </button>
            <button
              onClick={() => { setOrchestraMode(!orchestraMode); playSound('click'); }}
              title="Orchestra mode: multiple specialist agents collaborate on complex tasks"
              style={{
                display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '6px',
                background: orchestraMode ? 'rgba(251,146,60,0.1)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${orchestraMode ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.06)'}`,
                color: orchestraMode ? '#fb923c' : '#52525b', fontSize: '9px', fontFamily: 'monospace',
                textTransform: 'uppercase', cursor: 'pointer',
              }}
            >
              <Network size={9} />
              <span>Orchestra</span>
            </button>
            <button
              onClick={() => { setThinkMode(!thinkMode); playSound('click'); }}
              title="Think Deep: Qwen3 enters extended reasoning mode (/think). DeepSeek-R1 always thinks regardless."
              style={{
                display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '6px',
                background: thinkMode ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${thinkMode ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.06)'}`,
                color: thinkMode ? '#a855f7' : '#52525b', fontSize: '9px', fontFamily: 'monospace',
                textTransform: 'uppercase', cursor: 'pointer',
              }}
            >
              <Brain size={9} />
              <span>Think</span>
            </button>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
             <button
               onClick={() => { handleDiagnose(); playSound('click'); }}
               disabled={isStreaming || isDiagnosing}
               style={{
                 display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', borderRadius: '6px',
                 background: 'var(--crimson-05)', border: '1px solid var(--crimson-10)',
                 color: 'var(--crimson)', fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase',
                 cursor: (isStreaming || isDiagnosing) ? 'default' : 'pointer', opacity: (isStreaming || isDiagnosing) ? 0.5 : 1
               }}
             >
               {isDiagnosing ? <Loader2 size={10} className="animate-spin" /> : <Activity size={10} />}
               <span>Diagnose</span>
             </button>

             <button
               onClick={() => { clearMessages(); playSound('click'); }}
               disabled={isStreaming}
               title="New chat session"
               style={{
                 display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', borderRadius: '6px',
                 background: 'transparent', border: '1px solid rgba(255,255,255,0.05)',
                 color: '#52525b', fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase',
                 cursor: isStreaming ? 'default' : 'pointer',
                 opacity: isStreaming ? 0.3 : 1
               }}
             >
               <RotateCcw size={10} />
               <span>New Chat</span>
             </button>

             <button
               onClick={() => { setShowSessions(v => !v); playSound('click'); }}
               title="Toggle sessions"
               style={{
                 display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', borderRadius: '6px',
                 background: showSessions ? 'rgba(34,211,238,0.07)' : 'transparent',
                 border: `1px solid ${showSessions ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.05)'}`,
                 color: showSessions ? 'var(--signal)' : '#52525b', fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase',
                 cursor: 'pointer'
               }}
             >
               <MessageSquare size={10} />
               <span>History ({sessions.length})</span>
             </button>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={scrollRef}
        className="v-assistant-messages"
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginBottom: '24px', paddingRight: '16px', display: 'flex', flexDirection: 'column', gap: '24px' }}
      >
        <AnimatePresence initial={false}>
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '28px' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', opacity: 0.25 }}>
                <Bot size={40} />
                <p style={{ margin: 0, fontStyle: 'italic', fontFamily: 'monospace', fontSize: '12px' }}>
                  Initialize protocol for system assistance...
                </p>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', maxWidth: '520px' }}>
                {[
                  { label: 'Diagnose system errors',    action: () => handleDiagnose() },
                  { label: 'Top resource hogs',         action: () => handleQuickSend('Which processes are currently using the most CPU and memory? List the top 10 with their resource usage.') },
                  { label: 'Check failed services',     action: () => handleQuickSend('Show me any failed systemd services and explain what likely went wrong for each one.') },
                  { label: "What's eating disk space?", action: () => handleQuickSend('Analyse my disk usage. What directories or files are consuming the most space? Give me actionable suggestions to free up space.') },
                  { label: 'System health summary',     action: () => handleQuickSend('Give me a comprehensive health summary of this system: CPU, RAM, disk, GPU, network, and any warnings or anomalies I should know about.') },
                  { label: 'Optimise startup time',     action: () => handleQuickSend('Analyse my boot time and suggest which services I can safely disable or delay to make startup faster.') },
                ].map(chip => (
                  <button
                    key={chip.label}
                    onClick={chip.action}
                    disabled={isStreaming}
                    style={{
                      padding: '7px 14px', borderRadius: '20px', fontSize: '11px', fontFamily: 'monospace',
                      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                      color: '#71717a', cursor: isStreaming ? 'default' : 'pointer',
                      transition: 'all 0.15s', letterSpacing: '0.02em',
                    }}
                    onMouseEnter={e => { if (!isStreaming) { (e.target as HTMLElement).style.borderColor = 'var(--crimson-30)'; (e.target as HTMLElement).style.color = '#f4f4f5'; (e.target as HTMLElement).style.background = 'var(--crimson-06)' } }}
                    onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'; (e.target as HTMLElement).style.color = '#71717a'; (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
          {messages.map((msg: OllamaUiMessage, i: number) => {
            if (msg.role === 'tool_step') {
              return (
                <motion.div key={`ts-${msg.stepId}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  <ToolStepCard name={msg.name} args={msg.args} result={msg.result} />
                </motion.div>
              )
            }
            if (msg.role === 'orch_agent') {
              return (
                <motion.div key={`oa-${msg.agentId}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  <OrchestraAgentCard agentId={msg.agentId} role={msg.agentRole} status={msg.status} output={msg.output} />
                </motion.div>
              )
            }
            if (msg.role === 'system') return null
            const isStreamingThis = isStreaming && i === messages.length - 1
            return (
              <motion.div
                key={i}
                initial={isStreamingThis ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}
              >
                <div style={{ display: 'flex', maxWidth: '85%', gap: '16px', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', position: 'relative' }}>
                  {msg.role === 'assistant' && !isStreamingThis && msg.content && (
                    <button 
                      onClick={() => { navigator.clipboard.writeText(msg.content); playSound('click'); }}
                      style={{ position: 'absolute', top: '-8px', right: '-8px', zIndex: 10, background: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717a', cursor: 'pointer', transition: 'all 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--signal)'}
                      onMouseLeave={e => e.currentTarget.style.color = '#71717a'}
                      title="Copy full message"
                    >
                      <Copy size={12} />
                    </button>
                  )}
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '4px',
                    background: msg.role === 'user' ? 'rgba(255,255,255,0.05)' : 'var(--crimson-10)',
                    border: `1px solid ${msg.role === 'user' ? 'rgba(255,255,255,0.1)' : 'var(--crimson-20)'}`
                  }}>
                    {msg.role === 'user' ? <User size={16} style={{ color: '#a1a1aa' }} /> : <Bot size={16} style={{ color: 'var(--crimson)' }} />}
                  </div>
                  <div style={{
                    borderRadius: '16px', padding: '16px 24px', fontSize: '14px', lineHeight: '1.6',
                    background: msg.role === 'user' ? 'rgba(255,255,255,0.03)' : 'rgba(13,14,17,0.7)',
                    border: `1px solid ${msg.role === 'user' ? 'rgba(255,255,255,0.05)' : 'var(--crimson-10)'}`,
                    color: msg.role === 'user' ? '#e4e4e7' : '#d4d4d8',
                    backdropFilter: 'blur(12px)',
                    overflow: 'hidden'
                  }}>
                    <MessageContent content={msg.content} isStreaming={isStreamingThis} />
                    {msg.images && msg.images.length > 0 && (
                      <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {msg.images.map((img: string, idx: number) => (
                          <img 
                            key={idx} 
                            src={`data:image/png;base64,${img}`} 
                            style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} 
                          />
                        ))}
                      </div>
                    )}
                    {isStreaming && i === messages.length - 1 && !msg.content && (
                      <Loader2 size={16} className="animate-spin" style={{ opacity: 0.5 }} />
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--crimson)', background: 'var(--crimson-10)', border: '1px solid var(--crimson-20)', padding: '16px', borderRadius: '16px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={20} />
                <span style={{ fontSize: '12px', fontFamily: 'monospace', textTransform: 'uppercase' }}>
                  {error.includes('ECONNREFUSED') || error.includes('connect') ? 'Ollama is not running' : error}
                </span>
              </div>
              {(error.includes('ECONNREFUSED') || error.includes('connect')) && (
                <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#a1a1aa', paddingLeft: '28px' }}>
                  Run: <code style={{ color: '#22d3ee' }}>sudo systemctl start ollama</code>
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input Area */}
      <div className="v-card" style={{ padding: '16px', borderRadius: '24px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '1px', background: 'linear-gradient(to right, transparent, var(--crimson-30), transparent)' }} />
        {tokenUsage && (
          <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '8px', fontFamily: 'monospace', color: '#3f3f46', textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 }}>Context</span>
            <div style={{ flex: 1, height: '2px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
              <motion.div
                animate={{ width: `${Math.min(100, Math.round(tokenUsage.promptTokens / 8192 * 100))}%` }}
                transition={{ duration: 0.4 }}
                style={{ height: '100%', background: tokenUsage.promptTokens > 7000 ? 'var(--crimson)' : tokenUsage.promptTokens > 5000 ? '#f59e0b' : 'var(--signal)' }}
              />
            </div>
            <span style={{ fontSize: '8px', fontFamily: 'monospace', color: tokenUsage.promptTokens > 7000 ? 'var(--crimson)' : tokenUsage.promptTokens > 5000 ? '#f59e0b' : 'var(--signal)', flexShrink: 0 }}>
              {tokenUsage.promptTokens.toLocaleString()} / 8,192 tok
            </span>
            <span style={{ fontSize: '8px', fontFamily: 'monospace', color: '#3f3f46', flexShrink: 0 }}>+{tokenUsage.completionTokens.toLocaleString()} gen</span>
          </div>
        )}
        {attachedFile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', padding: '6px 10px', borderRadius: '8px', background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.2)' }}>
            {attachedFile.type === 'image' ? (
              <img src={attachedFile.content} style={{ width: '24px', height: '24px', borderRadius: '4px', objectFit: 'cover' }} />
            ) : (
              <Paperclip size={10} style={{ color: '#a855f7', flexShrink: 0 }} />
            )}
            <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#a855f7', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachedFile.name}</span>
            {attachedFile.truncated && <span style={{ fontSize: '8px', color: '#52525b', flexShrink: 0 }}>truncated</span>}
            <button onClick={() => setAttachedFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#52525b', padding: 0, display: 'flex', flexShrink: 0 }}><X size={10} /></button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px' }}>
          <button
            onClick={handleAttachFile}
            title="Attach a file"
            style={{ padding: '8px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', color: '#52525b', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)'; e.currentTarget.style.color = '#a855f7' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#52525b' }}
          >
            <Paperclip size={16} />
          </button>
          <button
            onClick={() => {
              if (isRecording) {
                stopRecording()
              } else {
                startRecording()
              }
              playSound('click')
            }}
            title={isRecording ? 'Stop & transcribe' : 'Speak (whisper.cpp)'}
            disabled={isTranscribing}
            style={{
              padding: '8px', borderRadius: '10px',
              border: `1px solid ${isRecording ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.06)'}`,
              background: isRecording ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.02)',
              color: isRecording ? '#f87171' : '#52525b',
              cursor: isTranscribing ? 'wait' : 'pointer',
              flexShrink: 0, display: 'flex', alignItems: 'center', transition: 'all 0.15s'
            }}
          >
            {isTranscribing ? <Loader2 size={16} className="animate-spin" /> : isRecording ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <button
            onClick={() => {
              if (isSpeaking) { stopSpeech(); playSound('click'); return }
              setTtsEnabled(v => !v); playSound('click')
            }}
            title={isSpeaking ? 'Stop speech' : ttsEnabled ? 'TTS on (Piper) — click to disable' : 'TTS off — click to enable'}
            style={{
              padding: '8px', borderRadius: '10px',
              border: `1px solid ${isSpeaking ? 'rgba(244,63,94,0.4)' : ttsEnabled ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.06)'}`,
              background: isSpeaking ? 'rgba(244,63,94,0.12)' : ttsEnabled ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.02)',
              color: isSpeaking ? '#fb7185' : ttsEnabled ? '#a855f7' : '#52525b',
              cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', transition: 'all 0.15s'
            }}
          >
            {isSpeaking ? <Square size={16} fill="currentColor" /> : ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="System query... (Ctrl+K to focus)"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#f4f4f5', fontSize: '14px', resize: 'none', padding: '8px 0', height: '40px', fontFamily: 'inherit' }}
          />
          {isStreaming ? (
            <button
              onClick={() => { cancelStream(); playSound('click'); }}
              style={{
                padding: '12px', borderRadius: '16px', border: '1px solid var(--crimson-40)', cursor: 'pointer',
                background: 'var(--crimson-12)', color: 'var(--crimson)', transition: 'all 0.2s',
                boxShadow: '0 0 12px var(--crimson-20)', flexShrink: 0,
              }}
              title="Stop generation"
            >
              <Square size={20} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              style={{
                padding: '12px', borderRadius: '16px', border: 'none', cursor: input.trim() ? 'pointer' : 'default',
                transition: 'all 0.2s', flexShrink: 0,
                background: input.trim() ? 'var(--crimson)' : '#27272a',
                color: input.trim() ? 'white' : '#52525b',
                boxShadow: input.trim() ? '0 0 15px var(--crimson-40)' : 'none',
              }}
            >
              <Send size={20} />
            </button>
          )}
        </div>
      </div>
    </div>
    </div>
  )
}

interface QuickModelBtnProps {
  label: string
  name: string
  isAvailable?: boolean
  onSelect: (name: string) => void
  onPull: (name: string) => void
  isActive: boolean
}

function QuickModelBtn({ label, name, isAvailable, onSelect, onPull, isActive }: QuickModelBtnProps) {
  return (
    <button
      onClick={() => isAvailable ? onSelect(name) : onPull(name)}
      style={{
        padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)',
        background: isActive ? 'var(--crimson-10)' : 'rgba(255,255,255,0.02)',
        cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: '4px',
        borderColor: isActive ? 'var(--crimson)' : 'rgba(255,255,255,0.05)',
        textAlign: 'left'
      }}
    >
      <span style={{ fontSize: '10px', fontWeight: 'bold', color: isActive ? 'var(--crimson)' : '#f4f4f5', fontFamily: 'monospace' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: isAvailable ? 'var(--signal)' : '#3f3f46' }} />
        <span style={{ fontSize: '8px', color: '#71717a', textTransform: 'uppercase' }}>
          {isAvailable ? 'Online' : 'Not Downloaded'}
        </span>
      </div>
    </button>
  )
}

function ToolStepCard({ name, args, result }: { name: string; args: unknown; result?: string }) {
  const [open, setOpen] = useState(!!result)
  const typedArgs = args as Record<string, string> | undefined
  const argStr = name === 'exec_command' ? typedArgs?.command
    : name === 'read_file' ? typedArgs?.path
    : name === 'search_packages' ? typedArgs?.query
    : name === 'list_directory' ? typedArgs?.path
    : JSON.stringify(args ?? {})

  const TOOL_ICONS: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
    exec_command: Terminal,
    read_file: FolderOpen,
    get_system_stats: Activity,
    search_packages: Bot,
    list_directory: FolderOpen,
    create_directory: Plus,
    write_file: Wand2,
  }
  const Icon = TOOL_ICONS[name] ?? Wrench

  return (
    <div style={{ maxWidth: '75%', marginLeft: '48px' }}>
      <div
        onClick={() => result && setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px', borderRadius: open ? '10px 10px 0 0' : '10px',
          background: 'rgba(34,211,238,0.04)', border: '1px solid rgba(34,211,238,0.12)',
          borderBottom: open ? '1px solid rgba(34,211,238,0.06)' : undefined,
          cursor: result ? 'pointer' : 'default', userSelect: 'none',
        }}
      >
        <Icon size={11} style={{ color: 'var(--signal)', flexShrink: 0 }} />
        <span style={{ fontSize: '9px', fontFamily: 'monospace', color: 'var(--signal)', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>{name}</span>
        <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#71717a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{argStr}</span>
        {!result && <Loader2 size={10} className="animate-spin" style={{ color: '#52525b', flexShrink: 0 }} />}
        {result && (open ? <ChevronDown size={10} style={{ color: '#52525b', flexShrink: 0 }} /> : <ChevronRight size={10} style={{ color: '#52525b', flexShrink: 0 }} />)}
      </div>
      {open && result && (
        <div style={{
          padding: '10px 14px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(34,211,238,0.12)',
          borderTop: 'none', borderRadius: '0 0 10px 10px', maxHeight: '200px', overflowY: 'auto',
        }}>
          <pre style={{ margin: 0, fontSize: '10px', fontFamily: 'monospace', color: '#a1a1aa', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {result}
          </pre>
        </div>
      )}
    </div>
  )
}

function OrchestraAgentCard({ agentId, role, status, output }: { agentId: number; role: string; status: string; output?: string }) {
  const [open, setOpen] = useState(false)
  const isPlanner = agentId === 0
  const color = isPlanner ? '#a855f7' : '#fb923c'
  const borderColor = isPlanner ? 'rgba(168,85,247,0.2)' : 'rgba(251,146,60,0.2)'
  const bgColor = isPlanner ? 'rgba(168,85,247,0.05)' : 'rgba(251,146,60,0.05)'

  return (
    <div style={{ maxWidth: '75%', marginLeft: '48px' }}>
      <div
        onClick={() => output && setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px',
          borderRadius: open ? '10px 10px 0 0' : '10px',
          background: bgColor, border: `1px solid ${borderColor}`,
          borderBottom: open ? `1px solid ${borderColor.replace('0.2', '0.1')}` : undefined,
          cursor: output ? 'pointer' : 'default', userSelect: 'none',
        }}
      >
        <Network size={11} style={{ color, flexShrink: 0 }} />
        <span style={{ fontSize: '9px', fontFamily: 'monospace', color, textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>{role}</span>
        {output && <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#71717a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{output.slice(0, 80)}</span>}
        {status === 'working' && <Loader2 size={10} className="animate-spin" style={{ color: '#52525b', flexShrink: 0 }} />}
        {status === 'done' && output && (open ? <ChevronDown size={10} style={{ color: '#52525b', flexShrink: 0 }} /> : <ChevronRight size={10} style={{ color: '#52525b', flexShrink: 0 }} />)}
      </div>
      {open && output && (
        <div style={{
          padding: '10px 14px', background: 'rgba(0,0,0,0.3)', border: `1px solid ${borderColor}`,
          borderTop: 'none', borderRadius: '0 0 10px 10px', maxHeight: '200px', overflowY: 'auto',
        }}>
          <pre style={{ margin: 0, fontSize: '10px', fontFamily: 'monospace', color: '#a1a1aa', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {output}
          </pre>
        </div>
      )}
    </div>
  )
}

function ThinkBlock({ content, streaming }: { content: string; streaming: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ margin: '0 0 10px', borderRadius: '8px', border: '1px solid rgba(168,85,247,0.25)', background: 'rgba(168,85,247,0.04)' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#a855f7' }}
      >
        <Brain size={10} />
        <span>{streaming ? 'Thinking…' : 'Thought'}</span>
        {open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
      </div>
      {open && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(168,85,247,0.15)', maxHeight: '240px', overflowY: 'auto' }}>
          <pre style={{ margin: 0, fontSize: '11px', fontFamily: 'monospace', color: '#a1a1aa', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{content.trim()}</pre>
        </div>
      )}
    </div>
  )
}

const MessageContent = memo(function MessageContent({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  if (!content) return null
  // Extract <think>...</think> blocks (Qwen3, DeepSeek-R1 reasoning traces).
  // Handle unclosed block during streaming.
  const thinkParts: string[] = []
  let rest = content
  rest = rest.replace(/<think>([\s\S]*?)<\/think>/g, (_, body) => { thinkParts.push(body); return '' })
  // Unclosed trailing block while streaming
  const openIdx = rest.indexOf('<think>')
  let streamingThink: string | null = null
  if (openIdx !== -1) {
    streamingThink = rest.slice(openIdx + '<think>'.length)
    rest = rest.slice(0, openIdx)
  }
  return (
    <>
      {thinkParts.map((t, i) => <ThinkBlock key={`tp-${i}`} content={t} streaming={false} />)}
      {streamingThink !== null && <ThinkBlock content={streamingThink} streaming={true} />}
      {rest && <MessageMarkdown content={rest} isStreaming={isStreaming} />}
    </>
  )
})

// Reasoning models (DeepSeek-R1, Qwen3 /think) emit LaTeX bracket delimiters \[...\] and \(...\),
// but CommonMark escape rules strip the backslash before remark-math runs. Convert to the
// dollar-delimiter form remark-math actually parses.
function normaliseMathDelimiters(src: string): string {
  return src
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `\n$$\n${m.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m.trim()}$`)
}

const MessageMarkdown = memo(function MessageMarkdown({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const prepared = useMemo(() => normaliseMathDelimiters(content), [content])
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        // Code blocks → ArtifactView
        code({ className, children, ...props }: ComponentPropsWithoutRef<'code'> & { inline?: boolean }) {
          const isBlock = !props.inline
          const lang = (className ?? '').replace('language-', '')
          if (isBlock) {
            return <ArtifactView code={String(children).replace(/\n$/, '')} language={lang || 'text'} isStreaming={isStreaming} />
          }
          return (
            <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', color: 'var(--crimson)', fontFamily: 'monospace', fontSize: '0.875em' }}>
              {children}
            </code>
          )
        },
        p({ children }: ComponentPropsWithoutRef<'p'>) {
          return <p style={{ margin: '0 0 8px', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{children}</p>
        },
        h1({ children }: ComponentPropsWithoutRef<'h1'>) {
          return <h1 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--crimson)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '16px 0 8px', borderBottom: '1px solid var(--crimson-20)', paddingBottom: '6px' }}>{children}</h1>
        },
        h2({ children }: ComponentPropsWithoutRef<'h2'>) {
          return <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: '#f4f4f5', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '14px 0 6px' }}>{children}</h2>
        },
        h3({ children }: ComponentPropsWithoutRef<'h3'>) {
          return <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#a1a1aa', fontFamily: 'monospace', margin: '12px 0 4px' }}>{children}</h3>
        },
        ul({ children }: ComponentPropsWithoutRef<'ul'>) {
          return <ul style={{ margin: '6px 0 10px', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>{children}</ul>
        },
        ol({ children }: ComponentPropsWithoutRef<'ol'>) {
          return <ol style={{ margin: '6px 0 10px', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>{children}</ol>
        },
        li({ children }: ComponentPropsWithoutRef<'li'>) {
          return <li style={{ fontSize: '14px', color: '#d4d4d8', lineHeight: 1.6 }}>{children}</li>
        },
        blockquote({ children }: ComponentPropsWithoutRef<'blockquote'>) {
          return <blockquote style={{ borderLeft: '3px solid var(--crimson)', paddingLeft: '12px', margin: '8px 0', color: '#71717a', fontStyle: 'italic' }}>{children}</blockquote>
        },
        table({ children }: ComponentPropsWithoutRef<'table'>) {
          return (
            <div style={{ overflowX: 'auto', margin: '10px 0' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px', fontFamily: 'monospace' }}>{children}</table>
            </div>
          )
        },
        th({ children }: ComponentPropsWithoutRef<'th'>) {
          return <th style={{ padding: '6px 12px', background: 'var(--crimson-08)', border: '1px solid rgba(255,255,255,0.07)', color: 'var(--crimson)', textAlign: 'left', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{children}</th>
        },
        td({ children }: ComponentPropsWithoutRef<'td'>) {
          return <td style={{ padding: '6px 12px', border: '1px solid rgba(255,255,255,0.05)', color: '#d4d4d8' }}>{children}</td>
        },
        hr() {
          return <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.07)', margin: '12px 0' }} />
        },
        strong({ children }: ComponentPropsWithoutRef<'strong'>) {
          return <strong style={{ color: '#f4f4f5', fontWeight: 'bold' }}>{children}</strong>
        },
        a({ href, children }: ComponentPropsWithoutRef<'a'>) {
          return <a href={href} style={{ color: 'var(--crimson)', textDecoration: 'underline', textUnderlineOffset: '3px' }} target="_blank" rel="noreferrer">{children}</a>
        },
      }}
    >
      {prepared}
    </ReactMarkdown>
  )
})
