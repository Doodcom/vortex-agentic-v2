import { useEffect, useRef, useState } from 'react'
import { X, Brush, Eraser, Undo2, Trash2, Check } from 'lucide-react'

interface MaskPainterProps {
  imageSrc: string
  onClose: () => void
  onSave: (maskDataUrl: string) => void
}

// Canvas-based mask painter. White pixels = inpaint, black = keep. Output is a grayscale
// PNG data URL with same dimensions as the source image. History is stored as ImageData
// snapshots; cheap enough at ~1024² resolutions to retain ~30 steps without lag.
export default function MaskPainter({ imageSrc, onClose, onSave }: MaskPainterProps) {
  const bgRef = useRef<HTMLCanvasElement>(null)
  const maskRef = useRef<HTMLCanvasElement>(null)
  const [brushSize, setBrushSize] = useState(60)
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush')
  const [imageDims, setImageDims] = useState<{ w: number; h: number; displayW: number; displayH: number } | null>(null)
  const drawingRef = useRef(false)
  const lastPosRef = useRef<{ x: number; y: number } | null>(null)
  const historyRef = useRef<ImageData[]>([])

  // Initialise canvases with image dimensions, scaled to fit the modal.
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const maxDisplay = 720
      const scale = Math.min(1, maxDisplay / Math.max(img.width, img.height))
      const displayW = Math.round(img.width * scale)
      const displayH = Math.round(img.height * scale)
      setImageDims({ w: img.width, h: img.height, displayW, displayH })
      const bg = bgRef.current!
      const mask = maskRef.current!
      bg.width = mask.width = img.width
      bg.height = mask.height = img.height
      bg.getContext('2d')!.drawImage(img, 0, 0)
      const mctx = mask.getContext('2d')!
      mctx.fillStyle = 'black'
      mctx.fillRect(0, 0, img.width, img.height)
      historyRef.current = [mctx.getImageData(0, 0, img.width, img.height)]
    }
    img.src = imageSrc
  }, [imageSrc])

  const pushHistory = () => {
    const mask = maskRef.current
    if (!mask) return
    const ctx = mask.getContext('2d')!
    historyRef.current.push(ctx.getImageData(0, 0, mask.width, mask.height))
    if (historyRef.current.length > 30) historyRef.current.shift()
  }

  const undo = () => {
    if (historyRef.current.length <= 1) return
    historyRef.current.pop()
    const last = historyRef.current[historyRef.current.length - 1]
    maskRef.current!.getContext('2d')!.putImageData(last, 0, 0)
  }

  const clearMask = () => {
    const mask = maskRef.current!
    const ctx = mask.getContext('2d')!
    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, mask.width, mask.height)
    historyRef.current = [ctx.getImageData(0, 0, mask.width, mask.height)]
  }

  const eventToCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!imageDims) return { x: 0, y: 0 }
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const scaleX = imageDims.w / rect.width
    const scaleY = imageDims.h / rect.height
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const drawStroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const mask = maskRef.current!
    const ctx = mask.getContext('2d')!
    ctx.strokeStyle = tool === 'brush' ? 'white' : 'black'
    ctx.lineWidth = brushSize * (imageDims!.w / imageDims!.displayW)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }

  const handleDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    pushHistory()
    drawingRef.current = true
    const pos = eventToCanvasCoords(e)
    lastPosRef.current = pos
    drawStroke(pos, pos)
  }

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !lastPosRef.current) return
    const pos = eventToCanvasCoords(e)
    drawStroke(lastPosRef.current, pos)
    lastPosRef.current = pos
  }

  const handleUp = () => {
    drawingRef.current = false
    lastPosRef.current = null
  }

  const save = () => {
    const mask = maskRef.current!
    onSave(mask.toDataURL('image/png'))
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>
      <div style={{
        background: '#0d0e11', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px',
        padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '90vw',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Brush size={16} style={{ color: '#a855f7' }} />
            <h3 style={{ fontSize: '12px', fontWeight: 'bold', color: '#f4f4f5', margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Paint Inpaint Mask
            </h3>
            <span style={{ fontSize: '10px', color: '#71717a', fontFamily: 'monospace' }}>
              Paint white where the new content goes
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', padding: '4px' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
          <canvas
            ref={bgRef}
            style={{
              display: imageDims ? 'block' : 'none',
              width: imageDims?.displayW, height: imageDims?.displayH,
              maxWidth: '100%',
            }}
          />
          <canvas
            ref={maskRef}
            onMouseDown={handleDown}
            onMouseMove={handleMove}
            onMouseUp={handleUp}
            onMouseLeave={handleUp}
            style={{
              display: imageDims ? 'block' : 'none',
              position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
              width: imageDims?.displayW, height: imageDims?.displayH,
              opacity: 0.5, mixBlendMode: 'screen', cursor: 'crosshair', touchAction: 'none',
            }}
          />
          {!imageDims && <div style={{ padding: '60px', color: '#71717a', fontFamily: 'monospace', fontSize: '11px' }}>Loading image…</div>}
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '8px' }}>
            <button
              onClick={() => setTool('brush')}
              style={{
                padding: '6px 10px', border: 'none', borderRadius: '6px', cursor: 'pointer',
                background: tool === 'brush' ? 'rgba(168,85,247,0.2)' : 'transparent',
                color: tool === 'brush' ? '#a855f7' : '#71717a',
                fontSize: '10px', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              <Brush size={11} /> Brush
            </button>
            <button
              onClick={() => setTool('eraser')}
              style={{
                padding: '6px 10px', border: 'none', borderRadius: '6px', cursor: 'pointer',
                background: tool === 'eraser' ? 'rgba(168,85,247,0.2)' : 'transparent',
                color: tool === 'eraser' ? '#a855f7' : '#71717a',
                fontSize: '10px', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              <Eraser size={11} /> Erase
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '180px' }}>
            <span style={{ fontSize: '10px', color: '#71717a', fontFamily: 'monospace' }}>Size</span>
            <input
              type="range" min={5} max={250} step={1} value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              style={{ flex: 1, accentColor: '#a855f7' }}
            />
            <span style={{ fontSize: '10px', color: '#a855f7', fontFamily: 'monospace', width: '32px', textAlign: 'right' }}>{brushSize}px</span>
          </div>

          <button
            onClick={undo}
            style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#71717a', cursor: 'pointer', fontSize: '10px', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <Undo2 size={11} /> Undo
          </button>
          <button
            onClick={clearMask}
            style={{ padding: '6px 10px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', color: '#f87171', cursor: 'pointer', fontSize: '10px', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <Trash2 size={11} /> Clear
          </button>
          <button
            onClick={save}
            style={{ padding: '6px 14px', background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.4)', borderRadius: '6px', color: '#c084fc', cursor: 'pointer', fontSize: '10px', fontFamily: 'monospace', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <Check size={11} /> Use Mask
          </button>
        </div>
      </div>
    </div>
  )
}
