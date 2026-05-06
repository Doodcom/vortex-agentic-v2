import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Video, Box, Wand2, Film, Loader2, Download, Clapperboard } from 'lucide-react'
import { useComfySocket } from '../hooks/useComfySocket'
import { getModels, createVideoWorkflow, createI2VWorkflow, createV2VWorkflow, queuePrompt, getModelInfo, uploadImage, uploadVideo } from '../lib/comfyApi'
import { notify } from '../lib/notifications'

interface VideoViewProps {
  i2vSource?: string | null
}

export default function VideoView({ i2vSource }: VideoViewProps) {
  const [prompt, setPrompt] = useState(() => localStorage.getItem('vortex-vid-prompt') || '')
  const [negativePrompt, setNegativePrompt] = useState(() => localStorage.getItem('vortex-vid-neg-prompt') || 'low quality, blurry, text, watermark')
  const [models, setModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('vortex-vid-model') || '')
  const [mode, setMode] = useState<'t2v' | 'i2v' | 'v2v'>('t2v')
  const [v2vSource, setV2vSource] = useState<string | null>(null)
  const [v2vDenoise, setV2vDenoise] = useState(() => Number(localStorage.getItem('vortex-vid-v2v-denoise')) || 0.5)
  const [duration, setDuration] = useState(() => Number(localStorage.getItem('vortex-vid-duration')) || 4)
  
  useEffect(() => {
    localStorage.setItem('vortex-vid-prompt', prompt)
  }, [prompt])

  useEffect(() => {
    localStorage.setItem('vortex-vid-neg-prompt', negativePrompt)
  }, [negativePrompt])

  useEffect(() => {
    if (selectedModel) {
      localStorage.setItem('vortex-vid-model', selectedModel);
      // Aggressive VRAM Purge on model change
      if ((window as any).electron?.comfyPurge) {
        console.log(`[Vortex] Video model changed to ${selectedModel}. Purging stale VRAM.`);
        (window as any).electron.comfyPurge();
      }
    }
  }, [selectedModel])

  useEffect(() => {
    localStorage.setItem('vortex-vid-duration', String(duration))
  }, [duration])
  const [resolution, setResolution] = useState('1024x1024')
  const [ultraQuality, setUltraQuality] = useState(false)
  const [useRife, setUseRife] = useState(false)
  const [rifeMultiplier, setRifeMultiplier] = useState(() => Number(localStorage.getItem('vortex-vid-rife-mult')) || 5)
  
  // Dynamic Limits for 16GB VRAM + 64GB RAM
  const maxSeconds = ultraQuality ? 12 : 4;

  useEffect(() => {
    if (duration > maxSeconds) {
      setDuration(maxSeconds);
    }
  }, [ultraQuality, maxSeconds])

  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null)
  const [vramStats, setVramStats] = useState<{ used: number; total: number; gpuUtil: number } | null>(null)

  const { status, progress, lastVideo, generationError, clientId } = useComfySocket()

  useEffect(() => {
    if (i2vSource) {
      setMode('i2v')
    }
  }, [i2vSource])

  useEffect(() => {
    getModels().then(m => {
      // Filter for SDXL models if possible, or just list all
      setModels(m)
      if (m.length > 0) setSelectedModel(m[0])
    }).catch(() => {
      notify('Engine', 'Failed to fetch ComfyUI models', 'error')
    })
  }, [])

  useEffect(() => {
    const poll = async () => {
      const res = await window.electron.gpuVramStats()
      if (res.success) setVramStats({ used: res.used, total: res.total, gpuUtil: res.gpuUtil })
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!generationError) return
    notify('Generation Failed', generationError, 'error')
    setIsGenerating(false)
  }, [generationError])

  useEffect(() => {
    if (lastVideo) {
      setGeneratedVideo(lastVideo)
      setIsGenerating(false)

      // Auto-save to Pictures/AI Video
      if ((window as any).electron?.systemSaveAsset) {
        (window as any).electron.systemSaveAsset({ url: lastVideo, type: 'video' })
          .then((res: any) => {
            if (res.success) console.log('[Vortex] Video auto-saved to:', res.path)
          })
      }
    }
  }, [lastVideo])

  const handleGenerate = async () => {
    if (!prompt || isGenerating || !selectedModel) return
    if (mode === 'v2v' && !v2vSource) { notify('V2V', 'Drop a source video first', 'error'); return }
    setIsGenerating(true)

    try {
      const [w, h] = resolution.split('x').map(Number)
      const fps = 12;
      const frames = duration * fps;

      let workflow;
      if (mode === 'i2v' && i2vSource) {
        notify('Motion Engine', 'Uploading source image...', 'info')
        const filename = await uploadImage(i2vSource)
        workflow = createI2VWorkflow(prompt, negativePrompt, selectedModel, filename, frames, fps, ultraQuality, useRife, rifeMultiplier)
      } else if (mode === 'v2v' && v2vSource) {
        notify('Motion Engine', 'Uploading source video...', 'info')
        const filename = await uploadVideo(v2vSource)
        workflow = createV2VWorkflow(prompt, negativePrompt, selectedModel, filename, v2vDenoise, fps, frames, ultraQuality, useRife, rifeMultiplier)
      } else {
        workflow = createVideoWorkflow(prompt, negativePrompt, selectedModel, w, h, frames, fps, ultraQuality, useRife, rifeMultiplier)
      }

      await queuePrompt(workflow, clientId)
    } catch (err: any) {
      console.error(err)
      notify('Generation Failed', err.message, 'error')
      setIsGenerating(false)
    }
  }

  const handleDownload = () => {
    if (!generatedVideo) return
    const a = document.createElement('a')
    a.href = generatedVideo
    a.download = `vortex-vid-${Date.now()}.mp4`
    a.click()
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: '#52525b',
    fontWeight: 'bold',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 180px)', gap: '24px' }}>
      {/* Sidebar Controls */}
      <div className="v-card" style={{ width: '320px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7' }}>
            <Video size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: 'white', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Motion Engine</h2>
            <div style={{ fontSize: '9px', color: '#a855f7', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.15em' }}>AnimateDiff V2</div>
          </div>
        </div>

        {/* Mode Toggle */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <button
            onClick={() => setMode('t2v')}
            style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: mode === 't2v' ? 'rgba(168,85,247,0.2)' : 'transparent', color: mode === 't2v' ? '#a855f7' : '#52525b', fontFamily: 'monospace', fontSize: '10px', fontWeight: 'bold' }}
          >
            T2V
          </button>
          <button
            onClick={() => setMode('i2v')}
            style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: mode === 'i2v' ? 'rgba(168,85,247,0.2)' : 'transparent', color: mode === 'i2v' ? '#a855f7' : '#52525b', fontFamily: 'monospace', fontSize: '10px', fontWeight: 'bold' }}
          >
            I2V
          </button>
          <button
            onClick={() => setMode('v2v')}
            style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: mode === 'v2v' ? 'rgba(168,85,247,0.2)' : 'transparent', color: mode === 'v2v' ? '#a855f7' : '#52525b', fontFamily: 'monospace', fontSize: '10px', fontWeight: 'bold' }}
          >
            V2V
          </button>
        </div>

        {mode === 'v2v' && (
          <div>
            <div
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
              onDrop={async e => {
                e.preventDefault();
                let url = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  const file = e.dataTransfer.files[0];
                  if (file.type.startsWith('video/')) url = URL.createObjectURL(file);
                }
                if (url) setV2vSource(url);
              }}
              style={{ padding: '12px', background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer' }}
            >
              <label style={{ fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.15em', color: '#52525b', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>Source Video</label>
              {v2vSource ? (
                <video src={v2vSource} style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }} muted />
              ) : (
                <div style={{ height: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#52525b', gap: '8px', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '4px' }}>
                  <Clapperboard size={20} opacity={0.2} />
                  <span style={{ fontSize: '9px', fontFamily: 'monospace' }}>DROP VIDEO HERE</span>
                </div>
              )}
            </div>
            <div style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.15em', color: '#52525b', fontWeight: 'bold' }}>FX Intensity</label>
                <span style={{ fontSize: '12px', color: 'white', fontWeight: 'bold', fontFamily: 'monospace' }}>{Math.round(v2vDenoise * 100)}%</span>
              </div>
              <input
                type="range" min="0.1" max="0.9" step="0.05" value={v2vDenoise}
                onChange={e => { const v = Number(e.target.value); setV2vDenoise(v); localStorage.setItem('vortex-vid-v2v-denoise', String(v)) }}
                style={{ width: '100%', accentColor: '#a855f7' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                <span style={{ fontSize: '9px', color: '#52525b', fontFamily: 'monospace' }}>Subtle</span>
                <span style={{ fontSize: '9px', color: '#52525b', fontFamily: 'monospace' }}>Heavy</span>
              </div>
            </div>
          </div>
        )}

        {mode === 'i2v' && (
          <div 
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
            onDrop={async e => {
              e.preventDefault();
              let url = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
              
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                if (file.type.startsWith('image/')) {
                  url = URL.createObjectURL(file);
                }
              }

              if (url) {
                window.dispatchEvent(new CustomEvent('vortex-set-i2v-source', { detail: url }));
              }
            }}
            style={{ padding: '12px', background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer' }}
          >
            <label style={labelStyle}>Source Image</label>
            {i2vSource ? (
              <img src={i2vSource} style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }} />
            ) : (
              <div style={{ height: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#52525b', gap: '8px', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '4px' }}>
                <Film size={24} opacity={0.2} />
                <span style={{ fontSize: '9px', fontFamily: 'monospace' }}>DROP IMAGE HERE</span>
              </div>
            )}
          </div>
        )}

        <div>
          <label style={labelStyle}><Box size={12} /> Neural Model</label>
          <select 
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px', color: 'white', fontSize: '12px', outline: 'none' }}
          >
            {models.length === 0 && <option value="">No models detected</option>}
            {models.map(m => (
              <option key={m} value={m} style={{ background: '#0d0e11' }}>{m}</option>
            ))}
          </select>
          {selectedModel && (
            <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.1)', borderRadius: '6px', fontSize: '10px', color: '#d8b4fe', lineHeight: 1.4, fontFamily: 'monospace' }}>
              {getModelInfo(selectedModel)}
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Resolution</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['1024x1024', '896x896', '768x768'].map(res => (
              <button
                key={res}
                onClick={() => setResolution(res)}
                style={{ flex: 1, padding: '8px', borderRadius: '6px', fontSize: '10px', fontFamily: 'monospace', background: resolution === res ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${resolution === res ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.1)'}`, color: resolution === res ? '#a855f7' : '#71717a', cursor: 'pointer', transition: 'all 0.2s' }}
              >
                {res}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={labelStyle}>Video Length</label>
            <span style={{ fontSize: '10px', color: ultraQuality ? '#a855f7' : '#52525b', fontFamily: 'monospace', fontWeight: 'bold' }}>
              {ultraQuality ? 'EXTENDED MODE' : 'VRAM SAFE MODE'}
            </span>
          </div>
          <input 
            type="range" min="1" max={maxSeconds} step="1" value={duration}
            onChange={e => setDuration(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#a855f7' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ fontSize: '10px', color: '#52525b', fontFamily: 'monospace' }}>1s</span>
            <span style={{ fontSize: '14px', color: 'white', fontWeight: 'bold', fontFamily: 'monospace' }}>{duration} SECONDS</span>
            <span style={{ fontSize: '10px', color: '#52525b', fontFamily: 'monospace' }}>{maxSeconds}s</span>
          </div>
          <div style={{ fontSize: '8px', color: '#3f3f46', textAlign: 'center', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {ultraQuality ? 'Using System RAM for long render' : 'Strictly GPU Render (Fastest)'}
          </div>
        </div>


        <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(168,85,247,0.05)', padding: '10px', borderRadius: '10px', border: '1px solid rgba(168,85,247,0.1)' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '10px', color: '#f4f4f5', fontWeight: 'bold', fontFamily: 'monospace' }}>ULTRA QUALITY</span>
              <span style={{ fontSize: '8px', color: '#a855f7', opacity: 0.7, fontFamily: 'monospace' }}>Uses System RAM Fallback</span>
            </div>
            <button 
              onClick={() => setUltraQuality(!ultraQuality)}
              style={{ width: '32px', height: '16px', borderRadius: '8px', background: ultraQuality ? '#a855f7' : '#333', border: 'none', cursor: 'pointer', position: 'relative' }}
            >
              <div style={{ position: 'absolute', top: '2px', left: ultraQuality ? '18px' : '2px', width: '12px', height: '12px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
            </button>
          </div>

          <div style={{ background: 'rgba(168,85,247,0.05)', padding: '10px', borderRadius: '10px', border: '1px solid rgba(168,85,247,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '10px', color: '#f4f4f5', fontWeight: 'bold', fontFamily: 'monospace' }}>RIFE Interpolation</span>
                <span style={{ fontSize: '8px', color: '#a855f7', opacity: 0.7, fontFamily: 'monospace' }}>Smooth motion upscale</span>
              </div>
              <button
                onClick={() => setUseRife(!useRife)}
                style={{ width: '32px', height: '16px', borderRadius: '8px', background: useRife ? '#a855f7' : '#333', border: 'none', cursor: 'pointer', position: 'relative' }}
              >
                <div style={{ position: 'absolute', top: '2px', left: useRife ? '18px' : '2px', width: '12px', height: '12px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
              </button>
            </div>
            {useRife && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                {[2, 3, 5].map(m => (
                  <button
                    key={m}
                    onClick={() => { setRifeMultiplier(m); localStorage.setItem('vortex-vid-rife-mult', String(m)) }}
                    style={{
                      flex: 1, padding: '4px', borderRadius: '6px', border: `1px solid ${rifeMultiplier === m ? '#a855f7' : 'rgba(255,255,255,0.08)'}`,
                      background: rifeMultiplier === m ? 'rgba(168,85,247,0.2)' : 'transparent',
                      color: rifeMultiplier === m ? '#a855f7' : '#52525b', fontSize: '9px',
                      fontFamily: 'monospace', fontWeight: 'bold', cursor: 'pointer'
                    }}
                  >
                    {m}x{m === 2 ? ' Fast' : m === 3 ? ' Balanced' : ' Ultra'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Positive Prompt</label>
          <textarea 
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A cyberpunk street at night, neon lights, high detail..."
            style={{ width: '100%', height: '100px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '12px', color: 'white', fontSize: '13px', resize: 'none', outline: 'none' }}
          />
        </div>

        <div>
          <label style={labelStyle}>Negative Prompt</label>
          <textarea 
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            style={{ width: '100%', height: '60px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '12px', color: '#71717a', fontSize: '12px', resize: 'none', outline: 'none' }}
          />
        </div>

        <button 
          onClick={handleGenerate}
          disabled={isGenerating || !prompt || !selectedModel}
          style={{ 
            width: '100%', padding: '14px', borderRadius: '8px', background: isGenerating ? 'rgba(255,255,255,0.05)' : '#9333ea', 
            color: isGenerating ? '#3f3f46' : 'white', border: 'none', fontWeight: 'bold', textTransform: 'uppercase', 
            letterSpacing: '0.1em', cursor: isGenerating ? 'default' : 'pointer', display: 'flex', alignItems: 'center', 
            justifyContent: 'center', gap: '12px', transition: 'all 0.2s',
            boxShadow: isGenerating ? 'none' : '0 0 20px rgba(147,51,234,0.2)'
          }}
        >
          <Wand2 size={18} className={isGenerating ? 'animate-spin' : ''} />
          {isGenerating ? 'Synthesizing...' : 'Generate Motion'}
        </button>

        <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '9px', color: vramStats ? (vramStats.used / vramStats.total > 0.85 ? '#ef4444' : '#3f3f46') : '#3f3f46', fontWeight: 'bold', letterSpacing: '0.1em' }}>
              {vramStats ? `VRAM ${vramStats.used}/${vramStats.total}MB · GPU ${vramStats.gpuUtil}%` : 'VRAM: —'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={async () => {
                  const res = await (window as any).electron?.gpuVramSqueeze?.()
                  if (res?.success) notify('VRAM', 'Background VRAM squeezed', 'success')
                }}
                style={{ background: 'none', border: '1px solid rgba(168,85,247,0.3)', borderRadius: '4px', color: '#a855f7', fontSize: '8px', padding: '2px 6px', cursor: 'pointer', fontFamily: 'monospace' }}
              >
                SQUEEZE
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '9px', color: status === 'connected' ? '#a855f7' : '#ef4444' }}>{status.toUpperCase()}</span>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: status === 'connected' ? '#a855f7' : '#ef4444', boxShadow: status === 'connected' ? '0 0 5px #a855f7' : 'none' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Player Area */}
      <div className="v-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {/* Internal Header */}
        <div style={{ height: '48px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', paddingLeft: '24px', paddingRight: '24px', background: 'rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '24px' }}>
            <div style={{ width: '2px', height: '12px', background: '#a855f7' }} />
            <span style={{ fontSize: '10px', color: '#52525b', fontWeight: 'bold', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Motion Buffer View</span>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', position: 'relative' }}>
           {/* Grid Background */}
          <div style={{ 
            position: 'absolute', inset: 0, opacity: 0.05, pointerEvents: 'none',
            backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '30px 30px' 
          }} />

          <AnimatePresence mode="wait">
            {!generatedVideo && !isGenerating ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'rgba(255,255,255,0.05)' }}
              >
                <Film size={80} strokeWidth={1} />
                <p style={{ marginTop: '16px', textTransform: 'uppercase', letterSpacing: '0.3em', fontSize: '12px', fontWeight: 'bold' }}>Buffer Empty</p>
              </motion.div>
            ) : isGenerating && !generatedVideo ? (
              <motion.div 
                key="generating"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
              >
                <div style={{ width: '256px', height: '256px', border: '1px solid rgba(168,85,247,0.2)', borderRadius: '4px', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <motion.div 
                    style={{ position: 'absolute', inset: 0, background: 'rgba(168,85,247,0.05)' }}
                    animate={{ top: ['0%', '100%', '0%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  />
                  <Loader2 size={48} className="animate-spin" style={{ color: '#a855f7' }} />
                </div>
                <p style={{ marginTop: '24px', color: '#a855f7', fontWeight: 'bold', letterSpacing: '0.2em', textTransform: 'uppercase', fontSize: '10px' }}>
                  Synthesizing: {Math.round(progress)}%
                </p>
              </motion.div>
            ) : (
              <motion.div 
                key="result"
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <video 
                  src={generatedVideo!} 
                  autoPlay loop controls
                  style={{ borderRadius: '4px', boxShadow: '0 0 50px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
                />
                
                <div style={{ position: 'absolute', top: '16px', right: '16px' }}>
                  <button 
                    onClick={handleDownload}
                    style={{ padding: '12px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer', transition: 'background 0.2s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#9333ea')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.6)')}
                  >
                    <Download size={20} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Progress Bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: 'rgba(255,255,255,0.05)' }}>
          <motion.div 
            style={{ height: '100%', background: '#a855f7', boxShadow: '0 0 10px #a855f7' }}
            animate={{ width: `${isGenerating ? progress : 0}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        {/* Frame accents */}
        <div style={{ position: 'absolute', top: '48px', left: 0, width: '40px', height: '40px', borderTop: '2px solid rgba(168,85,247,0.2)', borderLeft: '2px solid rgba(168,85,247,0.2)', margin: '24px' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: '40px', height: '40px', borderBottom: '2px solid rgba(168,85,247,0.2)', borderRight: '2px solid rgba(168,85,247,0.2)', margin: '24px' }} />
      </div>
    </div>
  )
}
