import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Bell, Activity, Star, LogOut, Download, ChevronDown, Loader2 } from 'lucide-react'
import type { RingClip } from '../types/electron'

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // load history one week at a time

interface RingCamera { id: number; name: string; kind: string; battery: number | null }

const kindLabel = (kind: string) =>
  kind === 'ding' ? 'DING' : kind === 'motion' ? 'MOTION' : kind === 'on_demand' ? 'LIVE VIEW' : kind.toUpperCase().replace(/_/g, ' ')

const fmtTime = (ms: number) => {
  const d = new Date(ms)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const yesterday = new Date(today.getTime() - 86400000).toDateString() === d.toDateString()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return sameDay ? `Today ${time}` : yesterday ? `Yesterday ${time}` : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`
}

export default function RingClipsView() {
  const [authState, setAuthState] = useState<'loading' | 'unauthed' | 'need2fa' | 'authed'>('loading')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [prompt2fa, setPrompt2fa] = useState('')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

  const [cameras, setCameras] = useState<RingCamera[]>([])
  const [selectedCamera, setSelectedCamera] = useState<number | 'all'>('all')
  const [clips, setClips] = useState<RingClip[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [playingClip, setPlayingClip] = useState<RingClip | null>(null)
  // Oldest point in time already fetched — LOAD OLDER extends the window back from here
  const oldestRef = useRef(Date.now())

  useEffect(() => {
    (async () => {
      const status = await window.electron.ringAuthStatus()
      if (status.email) setEmail(status.email)
      setAuthState(status.authenticated ? 'authed' : 'unauthed')
    })()
  }, [])

  const loadClips = useCallback(async (cams: RingCamera[], dateFrom: number, dateTo: number, append: boolean) => {
    setLoading(true)
    setLoadError('')
    try {
      const results = await Promise.all(
        cams.map((c) => window.electron.ringGetHistory({ cameraId: c.id, dateFrom, dateTo }))
      )
      const merged = results.flat().sort((a, b) => b.createdAt - a.createdAt)
      setClips((prev) => (append ? [...prev, ...merged] : merged))
      oldestRef.current = dateFrom
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authState !== 'authed') return
    (async () => {
      setLoading(true)
      setLoadError('')
      try {
        const cams = await window.electron.ringListCameras()
        setCameras(cams)
        const now = Date.now()
        await loadClips(cams, now - WINDOW_MS, now, false)
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      }
    })()
  }, [authState, loadClips])

  const handleLogin = async () => {
    setAuthBusy(true)
    setAuthError('')
    try {
      const res = await window.electron.ringAuthStart({ email, password })
      if (res.ok) {
        setPassword('')
        setAuthState('authed')
      } else if (res.need2fa) {
        setPrompt2fa(res.prompt || 'Enter the 2FA code Ring sent you')
        setAuthState('need2fa')
      } else {
        setAuthError(res.error || 'Login failed')
      }
    } finally {
      setAuthBusy(false)
    }
  }

  const handle2fa = async () => {
    setAuthBusy(true)
    setAuthError('')
    try {
      const res = await window.electron.ringAuth2fa({ code })
      if (res.ok) {
        setPassword('')
        setCode('')
        setAuthState('authed')
      } else {
        setAuthError(res.error || 'Invalid code')
      }
    } finally {
      setAuthBusy(false)
    }
  }

  const handleLogout = async () => {
    await window.electron.ringLogout()
    setClips([])
    setCameras([])
    setAuthState('unauthed')
  }

  const handleLoadOlder = () => {
    const dateTo = oldestRef.current
    loadClips(cameras, dateTo - WINDOW_MS, dateTo, true)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '12px', outline: 'none',
  }
  const buttonStyle: React.CSSProperties = {
    padding: '10px 20px', borderRadius: '10px', background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.25)',
    color: '#22d3ee', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
  }

  if (authState === 'loading') {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#52525b', fontSize: '11px' }}>Checking Ring session...</div>
  }

  if (authState !== 'authed') {
    return (
      <div className="v-card" style={{ padding: '32px', maxWidth: '440px' }}>
        <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'white', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '6px' }}>
          Ring Account
        </div>
        <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '20px', lineHeight: 1.5 }}>
          Clip history comes straight from Ring&apos;s cloud — Home Assistant only keeps the latest recording.
          Sign in once; only the refresh token is stored, never your password.
        </div>
        {authState === 'unauthed' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input style={inputStyle} type="email" placeholder="Ring email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input style={inputStyle} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !authBusy && handleLogin()} />
            <button style={{ ...buttonStyle, justifyContent: 'center', opacity: authBusy ? 0.5 : 1 }} disabled={authBusy} onClick={handleLogin}>
              {authBusy && <Loader2 size={12} className="animate-spin" />} SIGN IN
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '10px', color: '#a1a1aa' }}>{prompt2fa}</div>
            <input style={inputStyle} inputMode="numeric" placeholder="2FA code" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !authBusy && handle2fa()} autoFocus />
            <button style={{ ...buttonStyle, justifyContent: 'center', opacity: authBusy ? 0.5 : 1 }} disabled={authBusy} onClick={handle2fa}>
              {authBusy && <Loader2 size={12} className="animate-spin" />} VERIFY
            </button>
          </div>
        )}
        {authError && <div style={{ marginTop: '12px', fontSize: '10px', color: '#ef4444' }}>{authError}</div>}
      </div>
    )
  }

  const visibleClips = selectedCamera === 'all' ? clips : clips.filter((c) => c.cameraId === selectedCamera)

  return (
    <div className="v-card" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setSelectedCamera('all')}
            style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: selectedCamera === 'all' ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)', color: selectedCamera === 'all' ? '#22d3ee' : '#52525b', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            ALL CAMERAS
          </button>
          {cameras.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCamera(c.id)}
              style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: selectedCamera === c.id ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)', color: selectedCamera === c.id ? '#22d3ee' : '#52525b', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', textTransform: 'uppercase' }}
            >
              {c.name}
            </button>
          ))}
        </div>
        <button onClick={handleLogout} title={`Sign out ${email}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#52525b', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}>
          <LogOut size={10} /> SIGN OUT
        </button>
      </div>

      {loadError && <div style={{ padding: '16px', fontSize: '10px', color: '#ef4444', fontFamily: 'monospace' }}>{loadError}</div>}

      {visibleClips.length === 0 && !loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#52525b', fontSize: '11px' }}>No clips in the loaded time range.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
          {visibleClips.map((clip) => (
            <div
              key={clip.id}
              onClick={() => setPlayingClip(clip)}
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', overflow: 'hidden', cursor: 'pointer' }}
            >
              <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000' }}>
                <ClipThumbnail clip={clip} />
                <div style={{ position: 'absolute', top: '8px', left: '8px', display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(0,0,0,0.65)', color: clip.kind === 'ding' ? '#fbbf24' : '#22d3ee', fontSize: '8px', fontWeight: 'bold' }}>
                  {clip.kind === 'ding' ? <Bell size={8} /> : <Activity size={8} />}
                  {kindLabel(clip.kind)}
                </div>
                {clip.favorite && <Star size={12} fill="#fbbf24" color="#fbbf24" style={{ position: 'absolute', top: '8px', right: '8px' }} />}
                {clip.duration > 0 && (
                  <div style={{ position: 'absolute', bottom: '8px', right: '8px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(0,0,0,0.65)', color: '#a1a1aa', fontSize: '8px', fontFamily: 'monospace' }}>
                    {clip.duration}s
                  </div>
                )}
              </div>
              <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: 'white', fontWeight: 'bold' }}>{fmtTime(clip.createdAt)}</span>
                <span style={{ fontSize: '9px', color: '#52525b', textTransform: 'uppercase' }}>{clip.cameraName}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
        <button onClick={handleLoadOlder} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 20px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: loading ? '#3f3f46' : '#71717a', fontSize: '10px', fontWeight: 'bold', cursor: loading ? 'default' : 'pointer' }}>
          {loading ? <Loader2 size={12} className="animate-spin" /> : <ChevronDown size={12} />}
          {loading ? 'LOADING' : 'LOAD OLDER'}
        </button>
      </div>

      {playingClip && <ClipPlayerOverlay clip={playingClip} onClose={() => setPlayingClip(null)} />}
    </div>
  )
}

// Ring thumbnail URLs point at raw H.264 keyframes, so the main process
// decodes them to JPEG data URLs (cached per event) instead of using <img src>.
function ClipThumbnail({ clip }: { clip: RingClip }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!clip.thumbnailUrl) { setFailed(true); return }
    let cancelled = false
    window.electron.ringGetThumbnail({ dingId: clip.id, url: clip.thumbnailUrl })
      .then((dataUrl) => { if (!cancelled) setSrc(dataUrl) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [clip.id, clip.thumbnailUrl])

  if (src) return <img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3f3f46' }}>
      {failed ? <Camera size={20} /> : <Loader2 size={16} className="animate-spin" />}
    </div>
  )
}

function ClipPlayerOverlay({ clip, onClose }: { clip: RingClip; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')

  // videoSearch URLs are signed and expire in minutes — always fetch fresh
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const fresh = await window.electron.ringGetRecordingUrl({ cameraId: clip.cameraId, dingId: clip.id })
        if (!cancelled) setUrl(fresh)
      } catch {
        // fall back to the (possibly still valid) search URL
        if (!cancelled) (clip.url ? setUrl(clip.url) : setError('No recording available for this event'))
      }
    })()
    return () => { cancelled = true }
  }, [clip])

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', width: '100%', maxWidth: '1100px', background: '#0d1525', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'white', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.15em' }}>{clip.cameraName}</span>
            <span style={{ fontSize: '9px', color: '#52525b', fontFamily: 'monospace' }}>{kindLabel(clip.kind)} · {fmtTime(clip.createdAt)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {url && (
              <button
                onClick={() => window.electron.openExternal(url)}
                title="Open in browser / download"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#a1a1aa', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                <Download size={10} /> DOWNLOAD
              </button>
            )}
            <button onClick={onClose} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', padding: '5px 14px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
              CLOSE
            </button>
          </div>
        </div>
        <div style={{ background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '16/9' }}>
          {url ? (
            <video src={url} controls autoPlay style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#52525b' }}>
              {error ? <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#ef4444' }}>{error}</span> : (
                <>
                  <Loader2 size={28} className="animate-spin" />
                  <span style={{ fontSize: '10px', fontFamily: 'monospace' }}>Fetching recording...</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
