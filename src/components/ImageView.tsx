import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Box, Wand2, ImageIcon, Loader2, Download, Film, Upload, X, Layers, SlidersHorizontal, Shuffle } from 'lucide-react'
import { useComfySocket } from '../hooks/useComfySocket'
import {
  getModels, getLoraNames, createWorkflow, createFluxWorkflow, createImg2ImgWorkflow,
  createControlNetWorkflow, createDetailedWorkflow, queuePrompt, getModelInfo,
  uploadImage, createUpscaleWorkflow
} from '../lib/comfyApi'
import type { LoraEntry } from '../lib/comfyApi'
import { useTheme } from './ThemeProvider'
import { notify } from '../lib/notifications'

interface ImageViewProps {
  onAnimate?: (url: string) => void
}

const STYLE_PRESETS = [
  { label: 'Cinematic', pos: ', cinematic, film grain, anamorphic lens, dramatic lighting', neg: ', cartoon, anime, illustration' },
  { label: 'Anime', pos: ', anime style, cel shaded, detailed lineart, vibrant', neg: ', realistic, photo, 3d render' },
  { label: 'Oil Paint', pos: ', oil painting, impasto, thick brushstrokes, canvas texture', neg: ', photo, digital art, smooth' },
  { label: 'Watercolour', pos: ', watercolour painting, soft washes, paper texture, delicate', neg: ', photo, digital, sharp edges' },
  { label: 'Neon Noir', pos: ', neon noir, cyberpunk, neon lights, rain reflections, dark moody', neg: '' },
  { label: 'Studio Photo', pos: ', professional studio photography, perfect lighting, high quality, sharp', neg: ', art, painting, illustration' },
  { label: 'Fantasy Art', pos: ', fantasy art, magical, epic composition, intricate details, concept art', neg: ', photo, realistic, modern' },
  { label: 'Macro Photo', pos: ', macro photography, extreme close-up, shallow depth of field, bokeh', neg: ', wide angle, landscape, portrait' }
]

export default function ImageView({ onAnimate }: ImageViewProps) {
  const { playSound } = useTheme()

  // Prompts
  const [prompt, setPrompt] = useState(() => localStorage.getItem('vortex-img-prompt') || '')
  const [negativePrompt, setNegativePrompt] = useState(() => localStorage.getItem('vortex-img-neg-prompt') || 'low quality, blurry, text, watermark')

  // Model
  const [models, setModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('vortex-img-model') || '')

  // Sampling
  const [seed, setSeed] = useState(() => Number(localStorage.getItem('vortex-img-seed') ?? -1))
  const [steps, setSteps] = useState(() => {
    const s = localStorage.getItem('vortex-img-steps'); return s !== null ? Number(s) : 25
  })
  const [cfg, setCfg] = useState(() => {
    const s = localStorage.getItem('vortex-img-cfg'); return s !== null ? Number(s) : 7
  })
  const [samplerName, setSamplerName] = useState(() => localStorage.getItem('vortex-img-sampler') ?? 'dpmpp_2m')

  // Mode & Img2Img
  const [imgMode, setImgMode] = useState<'t2i' | 'i2i'>('t2i')
  const [i2iImage, setI2iImage] = useState<string | null>(null)
  const [denoiseStrength, setDenoiseStrength] = useState(0.75)

  // ControlNet
  const [controlImage, setControlImage] = useState<string | null>(null)
  const [controlNetModel, setControlNetModel] = useState('controlnet-depth-sdxl-1.0.safetensors')
  const [isControlNetEnabled, setIsControlNetEnabled] = useState(false)

  // Face Detailer
  const [isFaceDetailerEnabled, setIsFaceDetailerEnabled] = useState(false)

  // LoRA
  const [loras, setLoras] = useState<LoraEntry[]>([])
  const [availableLoras, setAvailableLoras] = useState<string[]>([])

  // Resolution & generation state
  const [resolution, setResolution] = useState(() => localStorage.getItem('vortex-img-res') || '1024x1024')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isUpscaling, setIsUpscaling] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)

  const { status, progress, lastImage, generationError, clientId } = useComfySocket()

  const isFlux = selectedModel.toLowerCase().includes('flux')

  // LocalStorage persistence
  useEffect(() => { localStorage.setItem('vortex-img-prompt', prompt) }, [prompt])
  useEffect(() => { localStorage.setItem('vortex-img-neg-prompt', negativePrompt) }, [negativePrompt])
  useEffect(() => { localStorage.setItem('vortex-img-res', resolution) }, [resolution])
  useEffect(() => { localStorage.setItem('vortex-img-seed', String(seed)) }, [seed])
  useEffect(() => { localStorage.setItem('vortex-img-steps', String(steps)) }, [steps])
  useEffect(() => { localStorage.setItem('vortex-img-cfg', String(cfg)) }, [cfg])
  useEffect(() => { localStorage.setItem('vortex-img-sampler', samplerName) }, [samplerName])

  useEffect(() => {
    if (!selectedModel) return
    localStorage.setItem('vortex-img-model', selectedModel)
    if ((window as any).electron?.comfyPurge) {
      (window as any).electron.comfyPurge()
    }
  }, [selectedModel])

  // Reset to T2I when FLUX selected (no img2img support)
  useEffect(() => {
    if (isFlux) setImgMode('t2i')
  }, [isFlux])

  // Fetch models + LoRAs
  useEffect(() => {
    Promise.all([getModels(), getLoraNames()]).then(([m, l]) => {
      setModels(m)
      if (m.length > 0) setSelectedModel(m[0])
      setAvailableLoras(l)
    }).catch(() => {
      notify('Engine', 'Failed to fetch ComfyUI models', 'error')
    })
  }, [])

  const [lastError, setLastError] = useState<string | null>(null)

  // Generation error
  useEffect(() => {
    if (!generationError) return
    notify('Generation Failed', generationError, 'error')
    setLastError(generationError)
    setIsGenerating(false)
    setIsUpscaling(false)
  }, [generationError])

  // New image result
  useEffect(() => {
    if (!lastImage) return
    setGeneratedImage(lastImage)
    setIsGenerating(false)
    setIsUpscaling(false)
    if ((window as any).electron?.systemSaveAsset) {
      (window as any).electron.systemSaveAsset({ url: lastImage, type: 'image' })
        .then((res: any) => { if (res.success) console.log('[Vortex] Image auto-saved to:', res.path) })
    }
  }, [lastImage])

  const handleControlImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setControlImage(URL.createObjectURL(file))
    setIsControlNetEnabled(true)
    notify('ControlNet', 'Reference image loaded', 'success')
  }

  const handleI2iImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setI2iImage(URL.createObjectURL(file))
  }

  const handleGenerate = async () => {
    if (!prompt || isGenerating || !selectedModel) return
    if (imgMode === 'i2i' && !i2iImage) {
      notify('Img2Img', 'Upload a reference image first', 'error')
      return
    }
    setLastError(null)
    setIsGenerating(true)

    try {
      const [w, h] = resolution.split('x').map(Number)

      let workflow;
      if (isFlux) {
        workflow = createFluxWorkflow(prompt, selectedModel, w, h, seed)
      } else if (imgMode === 'i2i' && i2iImage) {
        notify('Processing', 'Uploading reference image...', 'info')
        const filename = await uploadImage(i2iImage)
        workflow = createImg2ImgWorkflow(prompt, negativePrompt, selectedModel, filename, denoiseStrength, seed, steps, cfg, samplerName, 'karras', loras)
      } else if (isControlNetEnabled && controlImage) {
        notify('Processing', 'Uploading reference image...', 'info')
        const filename = await uploadImage(controlImage)
        workflow = createControlNetWorkflow(prompt, negativePrompt, selectedModel, filename, controlNetModel, w, h, isFaceDetailerEnabled, seed, steps, cfg, samplerName, 'karras', loras)
      } else if (isFaceDetailerEnabled) {
        workflow = createDetailedWorkflow(prompt, negativePrompt, selectedModel, w, h, seed, steps, cfg, samplerName, 'karras', loras)
      } else {
        workflow = createWorkflow(prompt, negativePrompt, selectedModel, w, h, seed, steps, cfg, samplerName, 'karras', loras)
      }

      await queuePrompt(workflow, clientId)
    } catch (err: any) {
      console.error(err)
      notify('Generation Failed', err.message, 'error')
      setIsGenerating(false)
    }
  }

  const handleUpscale = async () => {
    if (!generatedImage || isUpscaling) return
    setIsUpscaling(true)
    try {
      notify('Enhancing', 'Preparing 4K Neural Upscale...', 'info')
      const filename = await uploadImage(generatedImage)
      const workflow = createUpscaleWorkflow(filename)
      await queuePrompt(workflow, clientId)
    } catch (err: any) {
      console.error(err)
      notify('Upscale Failed', err.message, 'error')
      setIsUpscaling(false)
    }
  }

  const handleDownload = () => {
    if (!generatedImage) return
    const a = document.createElement('a')
    a.href = generatedImage
    a.download = `vortex-${Date.now()}.png`
    a.click()
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em',
    color: '#52525b', fontWeight: 'bold', marginBottom: '8px',
    display: 'flex', alignItems: 'center', gap: '8px'
  }

  const sliderLabelStyle: React.CSSProperties = {
    fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#52525b'
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 180px)', gap: '24px' }}>
      {/* Sidebar Controls */}
      <div className="v-card" style={{ width: '320px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22d3ee' }}>
            <Sparkles size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: 'white', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Image Engine</h2>
            <div style={{ fontSize: '9px', color: '#22d3ee', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Neural Synthesizer</div>
          </div>
        </div>

        {/* Mode Toggle (non-FLUX only) */}
        {!isFlux && (
          <div style={{ display: 'flex', gap: '4px', padding: '4px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            {(['t2i', 'i2i'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setImgMode(mode)}
                style={{
                  flex: 1, padding: '8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold',
                  textTransform: 'uppercase', letterSpacing: '0.08em', border: 'none', cursor: 'pointer',
                  background: imgMode === mode ? 'rgba(34,211,238,0.15)' : 'transparent',
                  color: imgMode === mode ? '#22d3ee' : '#52525b', transition: 'all 0.2s'
                }}
              >
                {mode === 't2i' ? 'Text → Image' : 'Image → Image'}
              </button>
            ))}
          </div>
        )}

        {/* Neural Model */}
        <div>
          <label style={labelStyle}><Box size={12} /> Neural Model</label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px', color: 'white', fontSize: '12px', outline: 'none' }}
          >
            {models.length === 0 && <option value="">No models detected</option>}
            {models.map(m => <option key={m} value={m} style={{ background: '#0d0e11' }}>{m}</option>)}
          </select>
          {selectedModel && (
            <div style={{
              marginTop: '10px', padding: '10px',
              background: isFlux ? 'rgba(168,85,247,0.1)' : 'rgba(34,211,238,0.05)',
              border: `1px solid ${isFlux ? 'rgba(168,85,247,0.3)' : 'rgba(34,211,238,0.1)'}`,
              borderRadius: '6px', fontSize: '10px',
              color: isFlux ? '#d8b4fe' : '#a5f3fc', lineHeight: 1.4, fontFamily: 'monospace'
            }}>
              {getModelInfo(selectedModel)}
            </div>
          )}
        </div>

        {/* Sampler Controls */}
        <div>
          <label style={labelStyle}><SlidersHorizontal size={12} /> Sampler Controls</label>

          {/* Seed */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              placeholder="-1 = random"
              style={{
                flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px', padding: '8px 10px', color: 'white', fontSize: '11px',
                outline: 'none', fontFamily: 'monospace'
              }}
            />
            <button
              onClick={() => setSeed(-1)}
              title="Random seed"
              style={{
                padding: '8px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px', color: '#71717a', cursor: 'pointer', display: 'flex', alignItems: 'center'
              }}
            >
              <Shuffle size={14} />
            </button>
          </div>

          {!isFlux && (
            <>
              {/* Steps */}
              <div style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={sliderLabelStyle}>Steps</span>
                  <span style={{ fontSize: '10px', color: '#71717a', fontFamily: 'monospace' }}>{steps}</span>
                </div>
                <input type="range" min={4} max={50} value={steps} onChange={(e) => setSteps(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--signal)' }} />
              </div>

              {/* CFG */}
              <div style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={sliderLabelStyle}>CFG Scale</span>
                  <span style={{ fontSize: '10px', color: '#71717a', fontFamily: 'monospace' }}>{cfg.toFixed(1)}</span>
                </div>
                <input type="range" min={1} max={15} step={0.5} value={cfg} onChange={(e) => setCfg(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--signal)' }} />
              </div>

              {/* Sampler */}
              <select
                value={samplerName}
                onChange={(e) => setSamplerName(e.target.value)}
                style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', padding: '8px', color: '#a1a1aa', fontSize: '11px', outline: 'none' }}
              >
                <option value="dpmpp_2m">DPM++ 2M (default)</option>
                <option value="euler">Euler</option>
                <option value="dpmpp_3m_sde">DPM++ 3M SDE</option>
                <option value="dpmpp_2s_a">DPM++ 2S Ancestral</option>
                <option value="lcm">LCM (fast)</option>
                <option value="ddim">DDIM</option>
              </select>
            </>
          )}
        </div>

        {/* Reference Image Section */}
        {!isFlux && (
          imgMode === 'i2i' ? (
            /* Img2Img zone */
            <div>
              <label style={labelStyle}><Upload size={12} /> Reference Image</label>
              {!i2iImage ? (
                <div>
                  <label style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    height: '90px', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer',
                    background: 'rgba(255,255,255,0.02)', color: '#52525b', fontSize: '10px', gap: '6px', transition: 'all 0.2s'
                  }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(34,211,238,0.3)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                  >
                    <Upload size={18} />
                    <span>Upload or Drop Image</span>
                    <input type="file" hidden onChange={handleI2iImageUpload} accept="image/*" />
                  </label>
                  {generatedImage && (
                    <button
                      onClick={() => setI2iImage(generatedImage)}
                      style={{
                        width: '100%', marginTop: '6px', padding: '6px', background: 'rgba(34,211,238,0.08)',
                        border: '1px solid rgba(34,211,238,0.2)', borderRadius: '6px', color: '#22d3ee',
                        fontSize: '10px', cursor: 'pointer', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.08em'
                      }}
                    >
                      Use Last Result
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ position: 'relative', height: '90px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(34,211,238,0.2)' }}>
                  <img src={i2iImage} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}>
                    <button
                      onClick={() => setI2iImage(null)}
                      style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '4px', padding: '4px 8px', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                    >
                      <X size={10} /> REMOVE
                    </button>
                  </div>
                </div>
              )}

              {/* Denoise / Creativity slider */}
              <div style={{ marginTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={sliderLabelStyle}>Creativity</span>
                  <span style={{ fontSize: '10px', color: '#71717a', fontFamily: 'monospace' }}>
                    {denoiseStrength.toFixed(2)}
                    {denoiseStrength <= 0.35 ? ' (subtle)' : denoiseStrength >= 0.9 ? ' (full regen)' : ''}
                  </span>
                </div>
                <input type="range" min={0.1} max={1.0} step={0.05} value={denoiseStrength} onChange={(e) => setDenoiseStrength(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--signal)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                  <span style={{ fontSize: '8px', color: '#3f3f46', fontFamily: 'monospace' }}>subtle</span>
                  <span style={{ fontSize: '8px', color: '#3f3f46', fontFamily: 'monospace' }}>full regen</span>
                </div>
              </div>
            </div>
          ) : (
            /* ControlNet zone (T2I mode) */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}><Layers size={12} /> ControlNet</label>
                <input type="checkbox" checked={isControlNetEnabled} onChange={(e) => setIsControlNetEnabled(e.target.checked)} style={{ accentColor: 'var(--signal)' }} />
              </div>
              {!controlImage ? (
                <label style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  height: '72px', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer',
                  background: 'rgba(255,255,255,0.02)', color: '#52525b', fontSize: '10px', gap: '6px', transition: 'all 0.2s'
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(34,211,238,0.3)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                >
                  <Upload size={14} />
                  <span>Upload Pose / Depth Map</span>
                  <input type="file" hidden onChange={handleControlImageUpload} accept="image/*" />
                </label>
              ) : (
                <div style={{ position: 'relative', height: '72px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(34,211,238,0.2)' }}>
                  <img src={controlImage} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}>
                    <button
                      onClick={() => { setControlImage(null); setIsControlNetEnabled(false) }}
                      style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '4px', padding: '4px 8px', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                    >
                      <X size={10} /> REMOVE
                    </button>
                  </div>
                </div>
              )}
              {isControlNetEnabled && (
                <select
                  value={controlNetModel}
                  onChange={(e) => setControlNetModel(e.target.value)}
                  style={{ width: '100%', marginTop: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px', padding: '6px', color: '#71717a', fontSize: '9px', outline: 'none' }}
                >
                  <option value="controlnet-depth-sdxl-1.0.safetensors">Depth (SDXL)</option>
                  <option value="controlnet-canny-sdxl-1.0.safetensors">Canny (SDXL)</option>
                  <option value="controlnet-openpose-sdxl-1.0.safetensors">OpenPose (SDXL)</option>
                </select>
              )}
            </div>
          )
        )}

        {/* Face Detailer */}
        {!isFlux && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Sparkles size={14} style={{ color: isFaceDetailerEnabled ? '#fbbf24' : '#52525b' }} />
              <span style={{ fontSize: '11px', color: isFaceDetailerEnabled ? 'white' : '#71717a', fontWeight: 'bold' }}>Face Detailer</span>
            </div>
            <input type="checkbox" checked={isFaceDetailerEnabled} onChange={(e) => setIsFaceDetailerEnabled(e.target.checked)} style={{ accentColor: '#fbbf24' }} />
          </div>
        )}

        {/* LoRA Adapters */}
        {!isFlux && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>LoRA Adapters</label>
              {loras.length < 2 && availableLoras.length > 0 && (
                <button
                  onClick={() => setLoras(prev => [...prev, { name: availableLoras[0], modelStr: 1, clipStr: 1 }])}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '3px 8px', color: '#71717a', fontSize: '10px', cursor: 'pointer' }}
                >
                  + Add
                </button>
              )}
            </div>

            {availableLoras.length === 0 ? (
              <div style={{ padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '10px', color: '#3f3f46', textAlign: 'center', fontFamily: 'monospace' }}>
                No LoRAs detected
              </div>
            ) : loras.length === 0 ? (
              <div
                style={{ padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '10px', color: '#3f3f46', textAlign: 'center', fontFamily: 'monospace', cursor: 'pointer', border: '1px dashed rgba(255,255,255,0.04)' }}
                onClick={() => setLoras([{ name: availableLoras[0], modelStr: 1, clipStr: 1 }])}
              >
                Click + Add to select a LoRA
              </div>
            ) : (
              loras.map((lora, i) => (
                <div key={i} style={{ marginBottom: i < loras.length - 1 ? '8px' : 0, padding: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                    <select
                      value={lora.name}
                      onChange={(e) => setLoras(prev => prev.map((l, j) => j === i ? { ...l, name: e.target.value } : l))}
                      style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '6px', color: '#a1a1aa', fontSize: '10px', outline: 'none' }}
                    >
                      {availableLoras.map(n => <option key={n} value={n} style={{ background: '#0d0e11' }}>{n}</option>)}
                    </select>
                    <button
                      onClick={() => setLoras(prev => prev.filter((_, j) => j !== i))}
                      style={{ padding: '6px 8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', color: '#ef4444', fontSize: '14px', cursor: 'pointer', lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ fontSize: '9px', color: '#3f3f46', textTransform: 'uppercase' }}>Model</span>
                        <span style={{ fontSize: '9px', color: '#52525b', fontFamily: 'monospace' }}>{lora.modelStr.toFixed(2)}</span>
                      </div>
                      <input type="range" min={0} max={2} step={0.05} value={lora.modelStr} onChange={(e) => setLoras(prev => prev.map((l, j) => j === i ? { ...l, modelStr: Number(e.target.value) } : l))} style={{ width: '100%', accentColor: '#a855f7' }} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ fontSize: '9px', color: '#3f3f46', textTransform: 'uppercase' }}>CLIP</span>
                        <span style={{ fontSize: '9px', color: '#52525b', fontFamily: 'monospace' }}>{lora.clipStr.toFixed(2)}</span>
                      </div>
                      <input type="range" min={0} max={2} step={0.05} value={lora.clipStr} onChange={(e) => setLoras(prev => prev.map((l, j) => j === i ? { ...l, clipStr: Number(e.target.value) } : l))} style={{ width: '100%', accentColor: '#a855f7' }} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Resolution */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={labelStyle}>Resolution</label>
            {resolution.includes('1440') && (
              <span style={{ fontSize: '8px', color: '#f59e0b', fontWeight: 'bold', border: '1px solid rgba(245,158,11,0.3)', padding: '2px 4px', borderRadius: '4px' }}>⚠️ Duplication Risk</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {['2560x1440', '1440x1440', '1024x1024', '896x896', '768x768'].map(res => (
              <button
                key={res}
                onClick={() => { setResolution(res); playSound('click') }}
                style={{
                  flex: '1 1 30%', padding: '8px', borderRadius: '6px', fontSize: '9px', fontFamily: 'monospace',
                  background: resolution === res ? (isFlux ? 'rgba(168,85,247,0.2)' : 'rgba(34,211,238,0.2)') : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${resolution === res ? (isFlux ? 'rgba(168,85,247,0.3)' : 'rgba(34,211,238,0.3)') : 'rgba(255,255,255,0.1)'}`,
                  color: resolution === res ? (isFlux ? '#d8b4fe' : 'var(--signal)') : '#71717a',
                  cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                {res === '2560x1440' ? '1440p' : res === '1440x1440' ? '1440px' : res}
              </button>
            ))}
          </div>
          {resolution.includes('1440') && (
            <p style={{ fontSize: '9px', color: '#52525b', marginTop: '8px', lineHeight: 1.4 }}>
              * High resolutions can cause "Split Subjects". Use 1024x1024 + <b>Sparkles Upscale</b> for best results.
            </p>
          )}
        </div>

        {/* Style Presets */}
        <div>
          <label style={labelStyle}>Style Presets</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {STYLE_PRESETS.map(preset => (
              <button
                key={preset.label}
                onClick={() => {
                  setPrompt(p => p ? p + preset.pos : preset.pos.replace(/^, /, ''))
                  if (preset.neg) setNegativePrompt(n => n ? n + preset.neg : preset.neg.replace(/^, /, ''))
                }}
                style={{
                  padding: '5px 9px', borderRadius: '20px', fontSize: '9px', fontWeight: 'bold',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                  color: '#71717a', cursor: 'pointer', transition: 'all 0.15s',
                  textTransform: 'uppercase', letterSpacing: '0.05em'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(34,211,238,0.3)'; e.currentTarget.style.color = '#22d3ee' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#71717a' }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Positive Prompt */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={labelStyle}>Positive Prompt</label>
            <button onClick={() => setPrompt('')} style={{ background: 'none', border: 'none', color: '#3f3f46', fontSize: '9px', fontFamily: 'monospace', cursor: 'pointer', marginBottom: '8px' }}>[ CLEAR ]</button>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={isFlux ? "Describe your scene (FLUX is great at text in quotes like 'Hello Vortex')..." : "A cyberpunk street at night, neon lights, high detail..."}
            style={{ width: '100%', height: '100px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '12px', color: 'white', fontSize: '13px', resize: 'none', outline: 'none' }}
          />
        </div>

        {/* Negative Prompt */}
        <div style={{ opacity: isFlux ? 0.4 : 1, transition: 'opacity 0.3s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={labelStyle}>Negative Prompt</label>
            <button
              onClick={() => setNegativePrompt('')}
              disabled={isFlux}
              style={{ background: 'none', border: 'none', color: '#3f3f46', fontSize: '9px', fontFamily: 'monospace', cursor: isFlux ? 'default' : 'pointer', marginBottom: '8px' }}
            >
              [ CLEAR ]
            </button>
          </div>
          <textarea
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            disabled={isFlux}
            placeholder={isFlux ? "FLUX does not require a negative prompt..." : "low quality, blurry..."}
            style={{ width: '100%', height: '72px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '12px', color: '#71717a', fontSize: '12px', resize: 'none', outline: 'none' }}
          />
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt || !selectedModel}
          style={{
            width: '100%', padding: '14px', borderRadius: '8px',
            background: isGenerating ? 'rgba(255,255,255,0.05)' : (isFlux ? '#9333ea' : '#0891b2'),
            color: isGenerating ? '#3f3f46' : 'white', border: 'none', fontWeight: 'bold', textTransform: 'uppercase',
            letterSpacing: '0.1em', cursor: isGenerating ? 'default' : 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: '12px', transition: 'all 0.2s',
            boxShadow: isGenerating ? 'none' : (isFlux ? '0 0 20px rgba(147,51,234,0.3)' : '0 0 20px rgba(8,145,178,0.2)')
          }}
        >
          <Wand2 size={18} className={isGenerating ? 'animate-spin' : ''} style={{ color: isFlux ? '#d8b4fe' : 'inherit' }} />
          {isGenerating ? 'Synthesizing...' : imgMode === 'i2i' ? 'Img2Img Synthesize' : (isFlux ? 'Flux Synthesize' : 'Synthesize')}
        </button>

        {/* Backend Status */}
        <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '9px', color: '#3f3f46', fontWeight: 'bold', letterSpacing: '0.1em' }}>BACKEND STATUS</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '9px', color: status === 'connected' ? '#22c55e' : '#ef4444' }}>{status.toUpperCase()}</span>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: status === 'connected' ? '#22c55e' : '#ef4444', boxShadow: status === 'connected' ? '0 0 5px #22c55e' : 'none' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="v-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        <div style={{ height: '48px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', paddingLeft: '24px', paddingRight: '24px', background: 'rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '24px' }}>
            <div style={{ width: '2px', height: '12px', background: '#22d3ee' }} />
            <span style={{ fontSize: '10px', color: '#52525b', fontWeight: 'bold', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Neural Buffer View</span>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.05, pointerEvents: 'none', backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '30px 30px' }} />

          <AnimatePresence mode="wait">
            {!generatedImage && !isGenerating && lastError ? (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', maxWidth: '360px', textAlign: 'center' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                  <Wand2 size={24} />
                </div>
                <div>
                  <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Generation Failed</p>
                  <p style={{ fontSize: '11px', color: '#71717a', marginTop: '8px', lineHeight: 1.5 }}>{lastError}</p>
                </div>
                <button
                  onClick={async () => {
                    setLastError(null)
                    if ((window as any).electron?.comfyPurge) {
                      await (window as any).electron.comfyPurge()
                      notify('VRAM', 'ComfyUI VRAM purged — ready to retry', 'success')
                    }
                  }}
                  style={{ padding: '8px 20px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer' }}
                >
                  Purge VRAM & Dismiss
                </button>
              </motion.div>
            ) : !generatedImage && !isGenerating ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'rgba(255,255,255,0.05)' }}>
                <ImageIcon size={80} strokeWidth={1} />
                <p style={{ marginTop: '16px', textTransform: 'uppercase', letterSpacing: '0.3em', fontSize: '12px', fontWeight: 'bold' }}>Buffer Empty</p>
              </motion.div>
            ) : isGenerating && !generatedImage ? (
              <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '256px', height: '256px', border: '1px solid rgba(34,211,238,0.2)', borderRadius: '4px', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <motion.div style={{ position: 'absolute', inset: 0, background: 'rgba(34,211,238,0.05)' }} animate={{ top: ['0%', '100%', '0%'] }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} />
                  <Loader2 size={48} className="animate-spin" style={{ color: '#22d3ee' }} />
                </div>
                <p style={{ marginTop: '24px', color: '#22d3ee', fontWeight: 'bold', letterSpacing: '0.2em', textTransform: 'uppercase', fontSize: '10px' }}>
                  Synthesizing: {Math.round(progress)}%
                </p>
              </motion.div>
            ) : (
              <motion.div key="result" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={generatedImage!} alt="Generated" style={{ borderRadius: '4px', boxShadow: '0 0 50px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
                <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '10px' }}>
                  <button onClick={handleDownload} style={{ padding: '12px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => (e.currentTarget.style.background = '#0891b2')} onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.6)')} title="Download Image">
                    <Download size={20} />
                  </button>
                  <button onClick={handleUpscale} disabled={isUpscaling} style={{ padding: '12px', background: isUpscaling ? 'rgba(34,211,238,0.2)' : 'rgba(34,211,238,0.6)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: isUpscaling ? 'default' : 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => !isUpscaling && (e.currentTarget.style.background = '#0ea5e9')} onMouseLeave={e => !isUpscaling && (e.currentTarget.style.background = 'rgba(34,211,238,0.6)')} title="Neural 4K Upscale">
                    <Sparkles size={20} className={isUpscaling ? 'animate-spin' : ''} />
                  </button>
                  {onAnimate && (
                    <button onClick={() => onAnimate(generatedImage!)} style={{ padding: '12px', background: 'rgba(168,85,247,0.6)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer', transition: 'background 0.2s' }} title="Send to Animator">
                      <Film size={20} />
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Progress Bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: 'rgba(255,255,255,0.05)' }}>
          <motion.div style={{ height: '100%', background: '#22d3ee', boxShadow: '0 0 10px #22d3ee' }} animate={{ width: `${isGenerating ? progress : 0}%` }} transition={{ duration: 0.3 }} />
        </div>

        {/* Frame accents */}
        <div style={{ position: 'absolute', top: '48px', left: 0, width: '40px', height: '40px', borderTop: '2px solid rgba(34,211,238,0.2)', borderLeft: '2px solid rgba(34,211,238,0.2)', margin: '24px' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: '40px', height: '40px', borderBottom: '2px solid rgba(34,211,238,0.2)', borderRight: '2px solid rgba(34,211,238,0.2)', margin: '24px' }} />
      </div>
    </div>
  )
}
