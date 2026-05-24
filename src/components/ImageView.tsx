import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Box, Wand2, ImageIcon, Loader2, Download, Film, Upload, X, Layers, SlidersHorizontal, Shuffle, BookmarkPlus, Bookmark, Trash2, Check } from 'lucide-react'
import { useComfySocket } from '../hooks/useComfySocket'
import {
  getModels, getLoraNames, createWorkflow, createFluxWorkflow, createImg2ImgWorkflow,
  createFluxImg2ImgWorkflow, createFluxControlNetWorkflow, createFluxFillWorkflow,
  createControlNetWorkflow, queuePrompt, getModelInfo, stripUnetTag,
  uploadImage, createUpscaleWorkflow, cancelGeneration
} from '../lib/comfyApi'
import type { LoraEntry } from '../lib/comfyApi'
import { useTheme } from './ThemeProvider'
import MaskPainter from './MaskPainter'
import { notify } from '../lib/notifications'

interface ComfyPreset {
  id: string
  name: string
  prompt: string
  negativePrompt: string
  model: string
  resolution: string
  steps: number
  cfg: number
  sampler: string
  seed: number
  loras: LoraEntry[]
  createdAt: number
}

const PRESETS_KEY = 'vortex-comfy-presets'

function loadPresets(): ComfyPreset[] {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '[]') } catch { return [] }
}
function savePresets(p: ComfyPreset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(p))
}

interface ImageViewProps {
  onAnimate?: (url: string) => void
}

interface ImagePreset {
  label: string
  desc: string
  prompt: string
  neg: string
  loras: Array<{ name: string; modelStr: number; clipStr: number }>
  resolution: string
  steps: number
  cfg: number
  sampler: string
}

// Curated LoRA-aware presets. Each one applies prompt tags, LoRA stack, resolution
// and sampler settings in one click. LoRA filenames must match what's in
// ~/.comfyui-headless/models/loras (case-insensitive lookup happens at click time).
const IMAGE_PRESETS: ImagePreset[] = [
  {
    label: 'Photoreal Cinematic',
    desc: 'Mid-shot film-grade scenes — character + environment, action shots, indoor scenes.',
    prompt: 'cinematic film still, dramatic lighting, shallow depth of field, 35mm anamorphic, color graded, masterpiece, highly detailed',
    neg: 'cartoon, anime, illustration, painting, low quality, blurry, watermark, flat lighting, soap opera lighting',
    loras: [
      { name: 'CinematicLighting.safetensors',    modelStr: 0.6, clipStr: 0.6 },
      { name: 'PhotorealisticSlider.safetensors', modelStr: 0.5, clipStr: 0.5 },
      { name: 'ExtremelyDetailed.safetensors',    modelStr: 0.6, clipStr: 0.6 },
    ],
    resolution: '1216x832', steps: 28, cfg: 7, sampler: 'dpmpp_2m',
  },
  {
    label: 'Photoreal Landscape',
    desc: 'Sweeping outdoor vistas — trees, mountains, fields, nature scenes. No people.',
    prompt: 'landscape photography, atmospheric haze, golden hour lighting, rich textures, deep depth of field, ultra-wide composition, 24mm lens, masterpiece, 8k, sharp focus',
    neg: 'people, person, figure, character, building, vehicle, road, fence, sign, cartoon, anime, illustration, painting, low quality, blurry, watermark, soft focus',
    loras: [
      { name: 'ExtremelyDetailed.safetensors',    modelStr: 0.8, clipStr: 0.8 },
      { name: 'CinematicLighting.safetensors',    modelStr: 0.5, clipStr: 0.5 },
      { name: 'PhotorealisticSlider.safetensors', modelStr: 0.4, clipStr: 0.4 },
    ],
    resolution: '1344x768', steps: 30, cfg: 7, sampler: 'dpmpp_2m',
  },
  {
    label: 'Hyperreal Portrait',
    desc: 'Sharp photoreal headshots / product shots. Maximum detail. Best on juggernaut.',
    prompt: 'professional portrait photography, ultra sharp, perfect skin, 85mm lens, studio lighting, 8k',
    neg: 'cartoon, anime, painting, soft focus, low quality',
    loras: [
      { name: 'PhotorealisticSlider.safetensors', modelStr: 0.8, clipStr: 0.8 },
      { name: 'ExtremelyDetailed.safetensors',    modelStr: 0.7, clipStr: 0.7 },
    ],
    resolution: '832x1216', steps: 30, cfg: 7, sampler: 'dpmpp_2m',
  },
  {
    label: 'Fast Draft',
    desc: 'Lightning 4-step generation — quick prompt iteration. ~6× faster, slight quality drop.',
    prompt: 'highly detailed, masterpiece',
    neg: 'low quality, blurry',
    loras: [
      { name: 'sdxl_lightning_4step_lora.safetensors', modelStr: 1.0, clipStr: 1.0 },
    ],
    resolution: '1024x1024', steps: 4, cfg: 1, sampler: 'dpmpp_2m',
  },
  {
    label: 'Studio Ghibli',
    desc: 'Soft painterly anime style — pastoral scenes, gentle palette. Best on pony.',
    prompt: 'studio ghibli style, hand drawn, soft pastels, painterly background, cozy',
    neg: 'photorealistic, 3d render, harsh shadows, low quality',
    loras: [
      { name: 'StudioGhibliRedmond.safetensors', modelStr: 0.85, clipStr: 0.85 },
      { name: 'ExtremelyDetailed.safetensors',   modelStr: 0.4,  clipStr: 0.4  },
    ],
    resolution: '1216x832', steps: 28, cfg: 7, sampler: 'dpmpp_2m',
  },
  {
    label: 'Manga Lineart',
    desc: 'Comic panels and manga pages — strong outlines, flat ink shading. Best on pony.',
    prompt: 'lineart, manga panel, ink illustration, dynamic composition, expressive linework',
    neg: 'photorealistic, painterly, soft, blurry',
    loras: [
      { name: 'LineAniRedmond.safetensors',    modelStr: 0.85, clipStr: 0.85 },
      { name: 'ExtremelyDetailed.safetensors', modelStr: 0.4,  clipStr: 0.4  },
    ],
    resolution: '832x1216', steps: 28, cfg: 7, sampler: 'dpmpp_2m',
  },
  {
    label: 'Storybook',
    desc: 'Cute children\'s-book illustrations — round shapes, gentle palette, whimsical.',
    prompt: 'tinies, cute storybook illustration, gentle pastel palette, whimsical',
    neg: 'photorealistic, dark, gritty, scary',
    loras: [
      { name: 'LittleTinies.safetensors', modelStr: 0.85, clipStr: 0.85 },
    ],
    resolution: '1024x1024', steps: 25, cfg: 7, sampler: 'dpmpp_2m',
  },
  {
    label: 'Pixel Art',
    desc: 'Retro game sprites and scenes — pixelated edges, limited palette.',
    prompt: 'pixel art, 16-bit style, limited palette, sharp pixels',
    neg: 'realistic, smooth, blurry, anti-aliased',
    loras: [
      { name: 'PixelArtRedmond.safetensors', modelStr: 0.95, clipStr: 0.95 },
    ],
    resolution: '768x768', steps: 25, cfg: 7, sampler: 'dpmpp_2m',
  },
  {
    label: 'Cinematic Sketch',
    desc: 'Hybrid — manga linework with cinematic lighting. Unique stylized look.',
    prompt: 'cinematic film still, lineart accents, dramatic chiaroscuro lighting',
    neg: 'low quality, blurry, washed out',
    loras: [
      { name: 'LineAniRedmond.safetensors',    modelStr: 0.6, clipStr: 0.6 },
      { name: 'CinematicLighting.safetensors', modelStr: 0.7, clipStr: 0.7 },
    ],
    resolution: '1216x832', steps: 28, cfg: 7, sampler: 'dpmpp_2m',
  },
]

export default function ImageView({ onAnimate }: ImageViewProps) {
  const { playSound } = useTheme()

  // Prompts
  const [prompt, setPrompt] = useState(() => localStorage.getItem('vortex-img-prompt') || '')
  const [negativePrompt, setNegativePrompt] = useState(() => localStorage.getItem('vortex-img-neg-prompt') || 'low quality, blurry, text, watermark')
  const [autoEnhance, setAutoEnhance] = useState(() => localStorage.getItem('vortex-img-auto-enhance') === 'true')
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  useEffect(() => { localStorage.setItem('vortex-img-auto-enhance', String(autoEnhance)) }, [autoEnhance])

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
  // True when the user has manually clicked the toggle this session — disables auto-detection
  // so we don't keep flipping their choice back. Reset on app restart.
  const [faceDetailerManual, setFaceDetailerManual] = useState(false)
  const [faceDetailerAuto, setFaceDetailerAuto] = useState(false)

  // Auto-enable Face Detailer when the prompt mentions a face/person.
  // Heuristic: triggers on portrait/headshot/face/character/person/etc. Skips when prompt
  // is empty or the user has manually overridden the toggle.
  useEffect(() => {
    if (faceDetailerManual) return
    const FACE_RE = /\b(portrait|headshot|face|facial|selfie|character|person|people|man|woman|girl|boy|child|baby|model|actor|actress|human|cosplay)\b/i
    const shouldEnable = FACE_RE.test(prompt)
    setIsFaceDetailerEnabled(shouldEnable)
    setFaceDetailerAuto(shouldEnable)
  }, [prompt, faceDetailerManual])

  // LoRA
  const [loras, setLoras] = useState<LoraEntry[]>([])
  const [availableLoras, setAvailableLoras] = useState<string[]>([])

  // ── LoRA classification + smart defaults ─────────────────────────────────────
  // Speed LoRAs need radically different sampler settings — CFG must drop to ~1
  // and steps to 4-8 or you get blown-out noise.
  const speedLoras = /lightning|lcm|hyper|turbo|dmd2/i
  const styleLoras = /ghibli|lineani|tinies|pixelart|anime|cartoon|illustration/i
  const sliderLoras = /slider|extremely|detailed|cinematic-lighting|photorealistic-slider/i

  const classify = (name: string): 'speed' | 'style' | 'slider' | 'other' => {
    if (speedLoras.test(name)) return 'speed'
    if (sliderLoras.test(name)) return 'slider'
    if (styleLoras.test(name)) return 'style'
    return 'other'
  }

  // Plain-language description per LoRA. Matched on filename substring so it works
  // regardless of extension/case. Falls back to a generic line by classification.
  const LORA_DESCRIPTIONS: Array<{ match: RegExp; desc: string; tip?: string }> = [
    { match: /lightning_4step/i,        desc: '4-step fast gen — turns any SDXL checkpoint into a Lightning sampler.', tip: 'Auto-sets Steps=4, CFG=1' },
    { match: /extremelydetailed/i,      desc: 'Universal sharpness/detail booster. Stack with anything.',              tip: 'Try 0.5–0.8' },
    { match: /cinematiclighting/i,      desc: 'Adds dramatic film lighting — moody shadows, key light, atmosphere.',    tip: 'Try 0.4–0.8' },
    { match: /photorealisticslider/i,   desc: 'Pushes any checkpoint toward sharper photoreal output.',                 tip: 'Best on juggernaut' },
    { match: /pixelartredmond/i,        desc: 'Retro pixel-art style — pixelated edges, limited palette.',              tip: 'Use 0.8–1.0' },
    { match: /studioghibli/i,           desc: 'Studio Ghibli animation style — soft pastels, painterly backgrounds.',   tip: 'Trigger: "studio ghibli style"' },
    { match: /lineani/i,                desc: 'Manga / comic lineart — strong outlines, flat ink shading.',             tip: 'Trigger: "lineart"' },
    { match: /littletinies/i,           desc: 'Cute storybook illustrations — round shapes, gentle palette.',           tip: 'Trigger: "tinies"' },
  ]

  const describe = (name: string): { desc: string; tip?: string } => {
    const match = LORA_DESCRIPTIONS.find(d => d.match.test(name))
    if (match) return { desc: match.desc, tip: match.tip }
    const cls = classify(name)
    if (cls === 'speed')  return { desc: 'Speed LoRA — radically reduces sampling steps.' }
    if (cls === 'style')  return { desc: 'Style LoRA — applies a visual style.' }
    if (cls === 'slider') return { desc: 'Slider LoRA — additive quality/attribute control.' }
    return { desc: 'Custom LoRA.' }
  }

  // Auto-tune sampler when a speed LoRA is added/removed.
  const prevSpeedCount = useRef(0)
  useEffect(() => {
    const speedCount = loras.filter(l => classify(l.name) === 'speed' && l.modelStr > 0.1).length
    if (speedCount > 0 && prevSpeedCount.current === 0) {
      setSteps(4); setCfg(1)
    } else if (speedCount === 0 && prevSpeedCount.current > 0) {
      setSteps(25); setCfg(7)
    }
    prevSpeedCount.current = speedCount
  }, [loras])

  // Build human-readable clash warnings for current LoRA stack.
  const loraWarnings: string[] = (() => {
    const warns: string[] = []
    const speedActive = loras.filter(l => classify(l.name) === 'speed' && l.modelStr > 0.1)
    const styleActive = loras.filter(l => classify(l.name) === 'style' && l.modelStr > 0.4)
    if (speedActive.length > 0 && cfg > 2) {
      warns.push(`Speed LoRA active with CFG ${cfg.toFixed(1)} — drop CFG to 1.0 or expect blown-out noise.`)
    }
    if (speedActive.length > 0 && steps > 8) {
      warns.push(`Speed LoRA active with ${steps} steps — drop to 4-8 for clean output.`)
    }
    if (styleActive.length >= 2) {
      warns.push(`${styleActive.length} style LoRAs at high strength — risk of muddy/conflicted output. Drop one or lower strengths below 0.7.`)
    }
    if (speedActive.length >= 2) {
      warns.push(`Multiple speed LoRAs stacked — they fight each other. Use only one.`)
    }
    return warns
  })()

  // Resolution & generation state
  const [resolution, setResolution] = useState(() => localStorage.getItem('vortex-img-res') || '1024x1024')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isUpscaling, setIsUpscaling] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)

  const { status, progress, lastImage, generationError, clientId } = useComfySocket()

  const isFirstModelMount = useRef(true)
  // FLUX detection — also catches `unet::flux1-krea-dev_*` style entries that come
  // from the diffusion_models folder (split-file FLUX setups).
  const isFlux = selectedModel.toLowerCase().includes('flux')
  // FLUX-Fill (inpainting) variant — uses InpaintModelConditioning + mask painter.
  const isFluxFill = isFlux && selectedModel.toLowerCase().includes('fill')

  // Inpaint mask state — captures the painted mask as a PNG data URL until generation.
  const [maskOpen, setMaskOpen] = useState(false)
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null)

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
    if (isFirstModelMount.current) { isFirstModelMount.current = false; return }
    if ((window as any).electron?.comfyPurge) {
      (window as any).electron.comfyPurge()
    }
  }, [selectedModel])

  // Reset to T2I when FLUX selected (no img2img support)
  useEffect(() => {
    // FLUX img2img now works via the split-file workflow's i2i variant — no need to
    // force t2i. Leaving the user's mode choice alone.
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

  // Presets
  const [presets, setPresets]         = useState<ComfyPreset[]>(loadPresets)
  const [presetName, setPresetName]   = useState('')
  const [showPresets, setShowPresets] = useState(false)
  const [savedFlash, setSavedFlash]   = useState(false)
  const presetInputRef = useRef<HTMLInputElement>(null)

  const handleSavePreset = () => {
    const name = presetName.trim() || `Preset ${presets.length + 1}`
    const p: ComfyPreset = {
      id: `${Date.now()}`,
      name, prompt, negativePrompt, model: selectedModel,
      resolution, steps, cfg, sampler: samplerName, seed, loras,
      createdAt: Date.now(),
    }
    const next = [...presets, p]
    setPresets(next)
    savePresets(next)
    setPresetName('')
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1800)
  }

  const handleLoadPreset = (p: ComfyPreset) => {
    setPrompt(p.prompt)
    setNegativePrompt(p.negativePrompt)
    setSelectedModel(p.model)
    setResolution(p.resolution)
    setSteps(p.steps)
    setCfg(p.cfg)
    setSamplerName(p.sampler)
    setSeed(p.seed)
    setLoras(p.loras)
    notify('Preset Loaded', p.name, 'success')
  }

  const handleDeletePreset = (id: string) => {
    const next = presets.filter(p => p.id !== id)
    setPresets(next)
    savePresets(next)
  }

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
    const wasUpscaling = isUpscaling
    setGeneratedImage(lastImage)
    setIsGenerating(false)
    setIsUpscaling(false)
    if (wasUpscaling) {
      const img = new Image()
      img.onload = () => notify('Upscale Complete', `${img.naturalWidth} × ${img.naturalHeight}`, 'success')
      img.src = lastImage
    }
    if ((window as any).electron?.systemSaveAsset) {
      (window as any).electron.systemSaveAsset({ url: lastImage, type: 'image' })
        .then((res: any) => { if (res.success) console.log('[Vortex] Image auto-saved to:', res.path) })
    }
  }, [lastImage])

  // Convert HEIC/HEIF/AVIF/TIFF to a browser-displayable JPEG via the main process.
  // For PNG/JPEG/WebP/GIF, just returns a blob URL directly.
  const fileToDisplayableUrl = async (file: File): Promise<string | null> => {
    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    const browserOk = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)
    if (browserOk) return URL.createObjectURL(file)

    // Non-native format — convert via main process. Use FileReader to base64-encode
    // since String.fromCharCode(...new Uint8Array(buf)) blows the stack on >~65KB files.
    notify('Converting', `${ext.toUpperCase()} → JPEG (one-time conversion)…`, 'info')
    try {
      const base64: string = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => {
          const result = r.result as string
          // result is "data:<mime>;base64,XXXX" — strip the prefix.
          const comma = result.indexOf(',')
          resolve(comma >= 0 ? result.slice(comma + 1) : result)
        }
        r.onerror = () => reject(new Error('File read failed'))
        r.readAsDataURL(file)
      })
      const res = await (window as any).electron?.systemConvertHeic?.({ base64, ext })
      if (!res?.success) {
        notify('Conversion failed', res?.error || `Couldn't convert ${ext}`, 'error')
        return null
      }
      return res.dataUrl as string
    } catch (e: any) {
      notify('Conversion failed', e.message || 'Unknown error', 'error')
      return null
    }
  }

  const handleControlImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await fileToDisplayableUrl(file)
    if (!url) return
    setControlImage(url)
    setIsControlNetEnabled(true)
    notify('ControlNet', 'Reference image loaded', 'success')
  }

  const handleI2iImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await fileToDisplayableUrl(file)
    if (!url) return
    setI2iImage(url)
  }

  const enhancePrompt = async (raw: string): Promise<string> => {
    const ipc = (window as any).electron?.ollamaQuickChat
    if (!ipc) return raw
    const system = isFlux
      ? `You are an expert FLUX.1 prompt writer. Rewrite the user's idea as a vivid, natural-language scene description with rich detail about composition, lighting, color, mood, and style. Output ONLY the improved prompt, no quotes, no preamble.`
      : `You are an expert Stable Diffusion XL prompt writer. Rewrite the user's idea as a comma-separated tag-style prompt that maximises image quality. Include subject, style, lighting, composition, and quality tags (masterpiece, highly detailed, 8k, sharp focus). Output ONLY the improved prompt, no quotes, no preamble.`
    const res = await ipc({ model: 'qwen3:8b', system, user: raw })
    if (!res?.success || !res.content?.trim()) return raw
    // Strip any <think> reasoning blocks Qwen3 may emit.
    return res.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  }

  const handleGenerate = async () => {
    if (!prompt || isGenerating || !selectedModel) return
    if (imgMode === 'i2i' && !i2iImage) {
      notify('Img2Img', 'Upload a reference image first', 'error')
      return
    }
    setLastError(null)
    setIsGenerating(true)

    let finalPrompt = prompt
    if (autoEnhance) {
      try {
        setIsEnhancing(true)
        notify('Enhancing', 'Rewriting prompt via qwen3:8b…', 'info')
        finalPrompt = await enhancePrompt(prompt)
      } catch (e: any) {
        notify('Enhance failed', e.message || 'Continuing with original prompt', 'error')
      } finally {
        setIsEnhancing(false)
      }
    }

    // Free Ollama VRAM so ComfyUI has the full GPU
    if ((window as any).electron?.ollamaPurge) {
      await (window as any).electron.ollamaPurge()
    }

    try {
      const [w, h] = resolution.split('x').map(Number)

      let workflow;
      if (isFluxFill && i2iImage && maskDataUrl) {
        notify('Processing', 'Uploading source + mask...', 'info')
        const imgFilename = await uploadImage(i2iImage)
        const maskFilename = await uploadImage(maskDataUrl)
        workflow = createFluxFillWorkflow(finalPrompt, stripUnetTag(selectedModel), imgFilename, maskFilename, seed)
      } else if (isFluxFill && i2iImage && !maskDataUrl) {
        notify('Mask required', 'Paint an inpaint mask before generating.', 'error')
        setIsGenerating(false)
        return
      } else if (isFlux && imgMode === 'i2i' && i2iImage) {
        notify('Processing', 'Uploading reference image...', 'info')
        const filename = await uploadImage(i2iImage)
        workflow = createFluxImg2ImgWorkflow(finalPrompt, selectedModel, filename, denoiseStrength, seed)
      } else if (isFlux && isControlNetEnabled && controlImage) {
        notify('Processing', 'Uploading reference image...', 'info')
        const filename = await uploadImage(controlImage)
        // Map the existing SDXL controlnet selector (depth/canny/openpose filenames)
        // to the FLUX Union Pro control type enum.
        const fluxControlType = controlNetModel.includes('canny') ? 'canny'
          : controlNetModel.includes('openpose') ? 'openpose'
          : 'depth'
        workflow = createFluxControlNetWorkflow(finalPrompt, selectedModel, filename, fluxControlType, w, h, seed)
      } else if (isFlux) {
        workflow = createFluxWorkflow(finalPrompt, selectedModel, w, h, seed)
      } else if (imgMode === 'i2i' && i2iImage) {
        notify('Processing', 'Uploading reference image...', 'info')
        const filename = await uploadImage(i2iImage)
        workflow = createImg2ImgWorkflow(finalPrompt, negativePrompt, selectedModel, filename, denoiseStrength, seed, steps, cfg, samplerName, 'karras', loras)
      } else if (isControlNetEnabled && controlImage) {
        notify('Processing', 'Uploading reference image...', 'info')
        const filename = await uploadImage(controlImage)
        workflow = createControlNetWorkflow(finalPrompt, negativePrompt, selectedModel, filename, controlNetModel, w, h, isFaceDetailerEnabled, seed, steps, cfg, samplerName, 'karras', loras)
      } else {
        workflow = createWorkflow(finalPrompt, negativePrompt, selectedModel, w, h, seed, steps, cfg, samplerName, 'karras', loras, isFaceDetailerEnabled)
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

  const handleCancel = useCallback(async () => {
    await cancelGeneration()
    setIsGenerating(false)
    setIsUpscaling(false)
  }, [])

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

        {/* Mode Toggle */}
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

        {/* Neural Model */}
        <div>
          <label style={labelStyle}><Box size={12} /> Neural Model</label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px', color: 'white', fontSize: '12px', outline: 'none' }}
          >
            {models.length === 0 && <option value="">No models detected</option>}
            {models.map(m => {
              const isUnet = m.startsWith('unet::')
              const display = isUnet ? `${m.slice(6)} ⟨FLUX⟩` : m
              return <option key={m} value={m} style={{ background: '#0d0e11' }}>{display}</option>
            })}
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

              {/* Advanced: Sampler choice (defaults work 95% of the time) */}
              <button
                onClick={() => setShowAdvanced(v => !v)}
                style={{
                  marginTop: '4px', width: '100%', background: 'none', border: 'none',
                  color: '#52525b', fontSize: '9px', fontFamily: 'monospace',
                  textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer',
                  textAlign: 'left', padding: '4px 0',
                }}
              >
                {showAdvanced ? '▾' : '▸'} Advanced · {samplerName}
              </button>
              {showAdvanced && (
                <select
                  value={samplerName}
                  onChange={(e) => setSamplerName(e.target.value)}
                  style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', padding: '8px', color: '#a1a1aa', fontSize: '11px', outline: 'none', marginTop: '6px' }}
                >
                  <option value="dpmpp_2m">DPM++ 2M (default)</option>
                  <option value="euler">Euler</option>
                  <option value="dpmpp_3m_sde">DPM++ 3M SDE</option>
                  <option value="dpmpp_2s_a">DPM++ 2S Ancestral</option>
                  <option value="lcm">LCM (fast)</option>
                  <option value="ddim">DDIM</option>
                </select>
              )}
            </>
          )}
        </div>

        {/* Reference Image Section — also available for FLUX now (img2img + ControlNet) */}
        {(
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
                    <input type="file" hidden onChange={handleI2iImageUpload} accept="image/*,.heic,.heif,.avif,.tiff,.tif" />
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

              {/* Inpaint mask painter — only shown for FLUX-Fill model. Replaces the
                  denoise slider since Fill always uses denoise=1 on the masked region. */}
              {isFluxFill && i2iImage && (
                <div style={{ marginTop: '12px' }}>
                  <button
                    onClick={() => setMaskOpen(true)}
                    style={{
                      width: '100%', padding: '10px', borderRadius: '8px',
                      background: maskDataUrl ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${maskDataUrl ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.1)'}`,
                      color: maskDataUrl ? '#c084fc' : '#a1a1aa', cursor: 'pointer',
                      fontSize: '10px', fontFamily: 'monospace', fontWeight: 'bold',
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    }}
                  >
                    {maskDataUrl ? '✓ Mask Painted · Click to Edit' : '🖌 Paint Inpaint Mask'}
                  </button>
                  {maskDataUrl && (
                    <button
                      onClick={() => setMaskDataUrl(null)}
                      style={{ width: '100%', marginTop: '6px', padding: '4px', background: 'transparent', border: 'none', color: '#52525b', fontSize: '9px', cursor: 'pointer', fontFamily: 'monospace' }}
                    >
                      Clear mask
                    </button>
                  )}
                  <div style={{ marginTop: '8px', fontSize: '9px', color: '#3f3f46', fontFamily: 'monospace', lineHeight: 1.4 }}>
                    Paint white where you want new content added. Rest of the photo stays untouched.
                  </div>
                </div>
              )}
              {/* Denoise / Creativity slider — hidden for Fill (always denoise=1 on mask) */}
              {!isFluxFill && (
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
              )}
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
                  <input type="file" hidden onChange={handleControlImageUpload} accept="image/*,.heic,.heif,.avif,.tiff,.tif" />
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

        {/* Face Detailer — auto-enabled from prompt keywords, manual override possible */}
        {!isFlux && (
          <div style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Sparkles size={14} style={{ color: isFaceDetailerEnabled ? '#fbbf24' : '#52525b' }} />
                <span style={{ fontSize: '11px', color: isFaceDetailerEnabled ? 'white' : '#71717a', fontWeight: 'bold' }}>Face Detailer</span>
                {faceDetailerAuto && !faceDetailerManual && (
                  <span style={{ fontSize: '8px', fontFamily: 'monospace', color: '#fbbf24', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', padding: '2px 6px', borderRadius: '4px', letterSpacing: '0.1em' }}>
                    AUTO
                  </span>
                )}
                {faceDetailerManual && (
                  <button
                    onClick={() => { setFaceDetailerManual(false); playSound('click') }}
                    title="Resume automatic detection based on prompt keywords"
                    style={{ fontSize: '8px', fontFamily: 'monospace', color: '#71717a', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px', letterSpacing: '0.1em', cursor: 'pointer' }}
                  >
                    MANUAL · RESET
                  </button>
                )}
              </div>
              <input
                type="checkbox"
                checked={isFaceDetailerEnabled}
                onChange={(e) => {
                  setIsFaceDetailerEnabled(e.target.checked)
                  setFaceDetailerManual(true)
                  setFaceDetailerAuto(false)
                }}
                style={{ accentColor: '#fbbf24' }}
              />
            </div>
            <div style={{ fontSize: '9px', color: '#3f3f46', fontFamily: 'monospace', marginTop: '6px', lineHeight: 1.4 }}>
              {faceDetailerAuto && !faceDetailerManual
                ? 'Detected face keyword in prompt — enabled automatically.'
                : faceDetailerManual
                  ? 'Manual override active. Click MANUAL · RESET to re-enable auto detection.'
                  : 'Auto-enables when prompt mentions portrait, face, character, person, etc.'}
            </div>
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
              loras.map((lora, i) => {
                const cls = classify(lora.name)
                const tag = cls === 'speed' ? 'SPEED' : cls === 'style' ? 'STYLE' : cls === 'slider' ? 'SLIDER' : ''
                const tagColor = cls === 'speed' ? '#fbbf24' : cls === 'style' ? '#a855f7' : cls === 'slider' ? '#34d399' : '#52525b'
                const info = describe(lora.name)
                return (
                <div key={i} style={{ marginBottom: i < loras.length - 1 ? '8px' : 0, padding: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                  {tag && (
                    <div style={{ fontSize: '8px', fontFamily: 'monospace', color: tagColor, letterSpacing: '0.15em', marginBottom: '6px' }}>● {tag}</div>
                  )}
                  <div style={{ fontSize: '10px', color: '#a1a1aa', fontFamily: 'monospace', lineHeight: 1.45, marginBottom: '6px' }}>
                    {info.desc}
                    {info.tip && <div style={{ color: '#52525b', marginTop: '2px', fontSize: '9px' }}>↳ {info.tip}</div>}
                  </div>
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
                )
              })
            )}

            {loraWarnings.length > 0 && (
              <div style={{ marginTop: '10px', padding: '8px 10px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: '6px' }}>
                {loraWarnings.map((w, i) => (
                  <div key={i} style={{ fontSize: '10px', color: '#fcd34d', fontFamily: 'monospace', lineHeight: 1.45, marginBottom: i < loraWarnings.length - 1 ? '4px' : 0 }}>
                    ⚠ {w}
                  </div>
                ))}
              </div>
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
            {['1344x768', '1216x832', '1024x1024', '832x1216', '768x768'].map(res => (
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

        {/* Style Presets — apply a full LoRA stack + sampler config in one click.
            Hidden for FLUX since SDXL LoRAs and CFG=7 settings don't apply. */}
        {isFlux ? (
          <div style={{ padding: '10px 12px', background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: '8px', fontSize: '10px', color: '#d8b4fe', fontFamily: 'monospace', lineHeight: 1.5 }}>
            <div style={{ fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>FLUX mode</div>
            Style presets are SDXL-only. FLUX gets its style from natural-language prompts alone — describe the scene like you'd describe it to a photographer.
          </div>
        ) : (
        <div>
          <label style={labelStyle}>Style Presets</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {IMAGE_PRESETS.map(preset => {
              // Only enable presets whose LoRAs are actually installed.
              const missing = preset.loras.filter(l =>
                !availableLoras.some(a => a.toLowerCase() === l.name.toLowerCase())
              )
              const isMissing = missing.length > 0
              return (
                <button
                  key={preset.label}
                  disabled={isMissing}
                  onClick={() => {
                    // Apply LoRAs (re-resolve filenames to whatever case is on disk).
                    const resolved = preset.loras.map(l => {
                      const actual = availableLoras.find(a => a.toLowerCase() === l.name.toLowerCase()) ?? l.name
                      return { name: actual, modelStr: l.modelStr, clipStr: l.clipStr }
                    })
                    setLoras(resolved)
                    setPrompt(preset.prompt)
                    setNegativePrompt(preset.neg)
                    setResolution(preset.resolution)
                    setSteps(preset.steps)
                    setCfg(preset.cfg)
                    setSamplerName(preset.sampler)
                    playSound('click')
                  }}
                  style={{
                    textAlign: 'left', padding: '10px 12px', borderRadius: '8px',
                    background: isMissing ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isMissing ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)'}`,
                    color: isMissing ? '#3f3f46' : '#d4d4d8', cursor: isMissing ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: '4px',
                  }}
                  onMouseEnter={e => { if (!isMissing) { e.currentTarget.style.borderColor = 'rgba(34,211,238,0.35)'; e.currentTarget.style.background = 'rgba(34,211,238,0.04)' } }}
                  onMouseLeave={e => { if (!isMissing) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)' } }}
                  title={isMissing ? `Missing LoRA(s): ${missing.map(m => m.name).join(', ')}` : `Click to apply ${preset.loras.length} LoRA(s) + sampler config`}
                >
                  <div style={{ fontSize: '11px', fontWeight: 'bold', fontFamily: 'monospace', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{preset.label}</span>
                    <span style={{ fontSize: '8px', color: '#52525b', fontWeight: 'normal' }}>
                      {preset.resolution} · {preset.steps}st · CFG {preset.cfg}
                    </span>
                  </div>
                  <div style={{ fontSize: '10px', color: isMissing ? '#3f3f46' : '#71717a', fontFamily: 'monospace', lineHeight: 1.4 }}>
                    {preset.desc}
                  </div>
                  {isMissing && (
                    <div style={{ fontSize: '9px', color: '#f59e0b', fontFamily: 'monospace', marginTop: '2px' }}>
                      Missing: {missing.map(m => m.name.replace('.safetensors', '')).join(', ')}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
        )}

        {/* Presets */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <label style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }} onClick={() => setShowPresets(v => !v)}>
              <Bookmark size={12} /> Presets
              <span style={{ fontSize: '8px', color: '#3f3f46', marginLeft: '4px' }}>({presets.length})</span>
            </label>
            <button
              onClick={() => { setShowPresets(true); setTimeout(() => presetInputRef.current?.focus(), 50) }}
              title="Save current settings as preset"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 9px', borderRadius: '6px', background: savedFlash ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${savedFlash ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.08)'}`, color: savedFlash ? 'var(--signal)' : '#52525b', fontSize: '9px', fontFamily: 'monospace', cursor: 'pointer', transition: 'all 0.2s' }}
            >
              {savedFlash ? <Check size={10} /> : <BookmarkPlus size={10} />}
              {savedFlash ? 'Saved' : 'Save'}
            </button>
          </div>

          <AnimatePresence>
            {showPresets && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  <input
                    ref={presetInputRef}
                    value={presetName}
                    onChange={e => setPresetName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSavePreset()}
                    placeholder="Preset name..."
                    style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '6px 10px', color: '#f4f4f5', fontSize: '11px', fontFamily: 'monospace', outline: 'none' }}
                  />
                  <button
                    onClick={handleSavePreset}
                    style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)', color: 'var(--signal)', fontSize: '10px', fontFamily: 'monospace', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    + Save
                  </button>
                </div>

                {presets.length === 0 ? (
                  <div style={{ padding: '10px', textAlign: 'center', fontSize: '10px', fontFamily: 'monospace', color: '#3f3f46', fontStyle: 'italic', border: '1px dashed rgba(255,255,255,0.04)', borderRadius: '6px' }}>
                    No saved presets yet
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
                    {presets.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 10px', borderRadius: '7px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontSize: '11px', color: '#d4d4d8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                          <div style={{ fontSize: '8px', fontFamily: 'monospace', color: '#3f3f46', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.model.split('/').pop()?.split('.')[0] ?? p.model} · {p.resolution} · {p.steps}s
                          </div>
                        </div>
                        <button
                          onClick={() => handleLoadPreset(p)}
                          style={{ padding: '3px 9px', borderRadius: '5px', background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.15)', color: 'var(--signal)', fontSize: '8px', fontFamily: 'monospace', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          Load
                        </button>
                        <button
                          onClick={() => handleDeletePreset(p.id)}
                          style={{ padding: '3px 6px', borderRadius: '5px', background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: '#52525b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        >
                          <Trash2 size={9} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Positive Prompt */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={labelStyle}>Positive Prompt</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <button
                onClick={() => setAutoEnhance(v => !v)}
                title="Auto-enhance: route prompt through qwen3:8b for richer SD/FLUX tags before generation"
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '6px',
                  background: autoEnhance ? 'rgba(168,85,247,0.12)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${autoEnhance ? 'rgba(168,85,247,0.35)' : 'rgba(255,255,255,0.06)'}`,
                  color: autoEnhance ? '#c084fc' : '#52525b', fontSize: '9px', fontFamily: 'monospace',
                  textTransform: 'uppercase', cursor: 'pointer',
                }}
              >
                <Sparkles size={9} />
                <span>{isEnhancing ? 'Enhancing…' : 'Auto-Enhance'}</span>
              </button>
              <button onClick={() => setPrompt('')} style={{ background: 'none', border: 'none', color: '#3f3f46', fontSize: '9px', fontFamily: 'monospace', cursor: 'pointer' }}>[ CLEAR ]</button>
            </div>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={isFlux ? "Describe your scene (FLUX is great at text in quotes like 'Hello Vortex')..." : "A cyberpunk street at night, neon lights, high detail..."}
            style={{ width: '100%', height: '100px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '12px', color: 'white', fontSize: '13px', resize: 'none', outline: 'none' }}
          />
        </div>

        {/* Negative Prompt — hidden for FLUX which doesn't use it */}
        {!isFlux && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={labelStyle}>Negative Prompt</label>
              <button
                onClick={() => setNegativePrompt('')}
                style={{ background: 'none', border: 'none', color: '#3f3f46', fontSize: '9px', fontFamily: 'monospace', cursor: 'pointer', marginBottom: '8px' }}
              >
                [ CLEAR ]
              </button>
            </div>
            <textarea
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="low quality, blurry..."
              style={{ width: '100%', height: '72px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '12px', color: '#71717a', fontSize: '12px', resize: 'none', outline: 'none' }}
            />
          </div>
        )}

        {/* Generate / Cancel Button */}
        {isGenerating || isUpscaling ? (
          <button
            onClick={handleCancel}
            style={{
              width: '100%', padding: '14px', borderRadius: '8px',
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
              color: '#f87171', fontWeight: 'bold', textTransform: 'uppercase',
              letterSpacing: '0.1em', cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '12px', transition: 'all 0.2s'
            }}
          >
            <X size={18} />
            Cancel
          </button>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={!prompt || !selectedModel}
            style={{
              width: '100%', padding: '14px', borderRadius: '8px',
              background: isFlux ? '#9333ea' : '#0891b2',
              color: 'white', border: 'none', fontWeight: 'bold', textTransform: 'uppercase',
              letterSpacing: '0.1em', cursor: (!prompt || !selectedModel) ? 'default' : 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '12px', transition: 'all 0.2s',
              boxShadow: isFlux ? '0 0 20px rgba(147,51,234,0.3)' : '0 0 20px rgba(8,145,178,0.2)'
            }}
          >
            <Wand2 size={18} style={{ color: isFlux ? '#d8b4fe' : 'inherit' }} />
            {imgMode === 'i2i' ? 'Img2Img Synthesize' : (isFlux ? 'Flux Synthesize' : 'Synthesize')}
          </button>
        )}

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
                <div style={{ display: 'flex', gap: '8px' }}>
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
                    Purge VRAM
                  </button>
                  <button
                    onClick={async () => {
                      if ((window as any).electron?.gpuVramSqueeze) {
                        const res = await (window as any).electron.gpuVramSqueeze()
                        notify('VRAM Squeeze', res.success ? 'Background apps compressed' : res.error, res.success ? 'success' : 'error')
                      }
                    }}
                    style={{ padding: '8px 20px', background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)', borderRadius: '8px', color: '#22d3ee', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer' }}
                  >
                    Squeeze VRAM
                  </button>
                </div>
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

      {/* Inpaint mask painter modal */}
      {maskOpen && i2iImage && (
        <MaskPainter
          imageSrc={i2iImage}
          onClose={() => setMaskOpen(false)}
          onSave={(dataUrl) => { setMaskDataUrl(dataUrl); setMaskOpen(false); playSound('click') }}
        />
      )}
    </div>
  )
}
