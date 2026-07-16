import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Home, Shield, Bell, Lightbulb, Camera, Power, Activity, ExternalLink, RefreshCw, Volume2, VolumeX } from 'lucide-react'
import { useTheme } from './ThemeProvider'
import { notify } from '../lib/notifications'
import { kvGet, kvSet } from '../lib/kv'

interface HAEntity {
  entity_id: string
  state: string
  attributes: {
    friendly_name?: string
    [key: string]: unknown
  }
}

export default function HomeView() {
  const { playSound } = useTheme()
  const [haIp, setHaIp] = useState('http://localhost:8123')
  const [haToken, setHaToken] = useState('')
  const [haConfigLoaded, setHaConfigLoaded] = useState(false)
  const [isHaConnected, setIsHaConnected] = useState(false)
  const [entities, setEntities] = useState<HAEntity[]>([])
  const [isLoadingEntities, setIsLoadingEntities] = useState(false)
  const [cameraPreviews, setCameraPreviews] = useState<Record<string, string>>({})
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'devices' | 'portal'>('devices')

  const fetchCameraPreview = useCallback(async (entityId: string) => {
    if (!haToken || !haIp) return
    try {
      const resp = await window.electron.netFetch({
        url: `${haIp}/api/camera_proxy/${entityId}`,
        headers: { 'Authorization': `Bearer ${haToken}` },
        binary: true,
      })
      if (!resp.ok || !resp.base64) return
      const url = `data:${resp.contentType || 'image/jpeg'};base64,${resp.base64}`
      setCameraPreviews(prev => ({ ...prev, [entityId]: url }))
    } catch (e) {
      console.error(`Failed to fetch preview for ${entityId}`, e)
    }
  }, [haIp, haToken])

  const fetchEntities = useCallback(async () => {
    if (!haToken) return
    setIsLoadingEntities(true)
    try {
      const resp = await window.electron.netFetch({
        url: `${haIp}/api/states`,
        headers: { 'Authorization': `Bearer ${haToken}` },
      })
      if (!resp.ok || !resp.body) throw new Error(resp.error || `HTTP ${resp.status}`)
      const data = JSON.parse(resp.body)
      const filtered = data.filter((e: HAEntity) => 
        e.entity_id.includes('ring') || 
        e.entity_id.includes('camera') ||
        e.entity_id.includes('light') ||
        e.entity_id.includes('binary_sensor')
      )
      setEntities(filtered)

      // Refresh camera previews
      filtered.forEach((e: HAEntity) => {
        if (e.entity_id.startsWith('camera.')) {
          fetchCameraPreview(e.entity_id)
        }
      })
    } catch (e) {
      console.error('Failed to fetch entities', e)
    } finally {
      setIsLoadingEntities(false)
    }
  }, [haIp, haToken, fetchCameraPreview])

  const checkHaConnection = useCallback(async () => {
    if (!haIp) return
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (haToken) headers['Authorization'] = `Bearer ${haToken}`

      const resp = await window.electron.netFetch({ url: `${haIp}/api/config`, headers, timeoutMs: 2000 })
      setIsHaConnected(resp.ok)
      if (resp.ok && haToken) fetchEntities()
    } catch {
      setIsHaConnected(false)
    }
  }, [haIp, haToken, fetchEntities])

  // Load HA config from the durable kv store (migrates old localStorage values)
  useEffect(() => {
    (async () => {
      const ip = await kvGet('vortex-ha-ip')
      const token = await kvGet('vortex-ha-token')
      if (ip) setHaIp(ip)
      if (token) setHaToken(token)
      setHaConfigLoaded(true)
    })()
  }, [])

  useEffect(() => {
    if (!haConfigLoaded) return
    kvSet('vortex-ha-ip', haIp)
    kvSet('vortex-ha-token', haToken)
    checkHaConnection()
  }, [haConfigLoaded, haIp, haToken, checkHaConnection])

  const handleToggleHA = async () => {
    playSound('click')
    notify('Home Assistant', 'Sending Docker command...', 'info')
  }

  const handleOpenExternal = (url: string) => {
    playSound('click')
    if (window.electron?.openExternal) {
      window.electron.openExternal(url)
    } else {
      window.open(url, '_blank')
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: '#52525b',
    fontWeight: 'bold',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* View Switcher */}
      <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '4px', borderRadius: '12px', width: 'fit-content', border: '1px solid rgba(255,255,255,0.05)' }}>
        <button 
          onClick={() => { setViewMode('devices'); playSound('click'); }}
          style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: viewMode === 'devices' ? 'rgba(34,211,238,0.1)' : 'transparent', color: viewMode === 'devices' ? '#22d3ee' : '#52525b', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}
        >
          DEVICE FEED
        </button>
        <button 
          onClick={() => { setViewMode('portal'); playSound('click'); }}
          style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: viewMode === 'portal' ? 'rgba(34,211,238,0.1)' : 'transparent', color: viewMode === 'portal' ? '#22d3ee' : '#52525b', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}
        >
          HA PORTAL (LOGIN)
        </button>
      </div>

      {viewMode === 'portal' ? (
        <div className="v-card" style={{ padding: 0, height: '70vh', overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)' }}>
             <div style={{ fontSize: '10px', color: '#71717a', fontWeight: 'bold', fontFamily: 'monospace' }}>SECURE SESSION TERMINAL</div>
             <div style={{ fontSize: '9px', color: 'var(--signal)', opacity: 0.6 }}>Log in here once to enable in-app streaming</div>
          </div>
          <iframe 
            src={haIp}
            style={{ width: '100%', height: 'calc(100% - 40px)', border: 'none' }}
            title="HA Portal"
          />
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
            
            {/* Connection Status Card */}
            <div className="v-card" style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ 
                position: 'absolute', top: 0, right: 0, width: '100px', height: '100px', 
                background: isHaConnected ? 'radial-gradient(circle at top right, rgba(34,211,238,0.1), transparent)' : 'radial-gradient(circle at top right, rgba(239,68,68,0.1), transparent)',
                pointerEvents: 'none'
              }} />
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                <div style={{ 
                  width: '48px', height: '48px', borderRadius: '12px', 
                  background: isHaConnected ? 'rgba(34,211,238,0.1)' : 'rgba(239,68,68,0.1)', 
                  border: `1px solid ${isHaConnected ? 'rgba(34,211,238,0.2)' : 'rgba(239,68,68,0.2)'}`, 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: isHaConnected ? '#22d3ee' : '#ef4444' 
                }}>
                  <Home size={24} />
                </div>
                <div>
                  <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: 'white', margin: 0 }}>Home Assistant</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isHaConnected ? '#22d3ee' : '#ef4444', boxShadow: isHaConnected ? '0 0 8px #22d3ee' : 'none' }} />
                    <span style={{ fontSize: '10px', color: isHaConnected ? '#22d3ee' : '#ef4444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      {isHaConnected ? 'Connected' : 'Offline'}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Instance URL</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      type="text" 
                      value={haIp}
                      onChange={(e) => setHaIp(e.target.value)}
                      style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px', color: 'white', fontSize: '12px', outline: 'none' }}
                    />
                    <button 
                      onClick={() => handleOpenExternal(haIp)}
                      style={{ padding: '0 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer' }}
                    >
                      <ExternalLink size={16} />
                    </button>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Access Token</label>
                  <input 
                    type="password" 
                    value={haToken}
                    onChange={(e) => setHaToken(e.target.value)}
                    placeholder="Paste HA Access Token..."
                    style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px', color: 'white', fontSize: '12px', outline: 'none' }}
                  />
                </div>

                <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
                  <button 
                    onClick={handleToggleHA}
                    style={{ flex: 1, padding: '12px', borderRadius: '8px', background: isHaConnected ? 'rgba(239,68,68,0.1)' : '#0891b2', border: isHaConnected ? '1px solid rgba(239,68,68,0.2)' : 'none', color: 'white', fontWeight: 'bold', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}
                  >
                    <Power size={14} />
                    {isHaConnected ? 'STOP INSTANCE' : 'START INSTANCE'}
                  </button>
                </div>
              </div>
            </div>

            {/* Smart Integrations Card */}
            <div className="v-card" style={{ padding: '24px' }}>
              <label style={labelStyle}><Shield size={12} /> Pro Integrations</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.1)', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
                        <Camera size={18} />
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'white' }}>Ring Security</div>
                        <div style={{ fontSize: '9px', color: '#52525b' }}>Cameras & Doorbells</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleOpenExternal(`${haIp}/config/integrations/dashboard/add?domain=ring`)}
                      style={{ background: isHaConnected ? '#3b82f6' : 'rgba(255,255,255,0.05)', border: 'none', color: isHaConnected ? 'white' : '#52525b', fontSize: '9px', fontWeight: 'bold', padding: '4px 8px', borderRadius: '4px', cursor: isHaConnected ? 'pointer' : 'default' }}
                      disabled={!isHaConnected}
                    >
                      {isHaConnected ? 'LINK ACCOUNT' : 'HA OFFLINE'}
                    </button>
                  </div>
                  
                  {!isHaConnected && (
                    <div style={{ fontSize: '9px', color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.2)', marginTop: '8px' }}>
                      ⚠️ <strong>Home Assistant is Offline.</strong>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(251,191,36,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbbf24' }}>
                      <Lightbulb size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'white' }}>Smart Lighting</div>
                      <div style={{ fontSize: '9px', color: '#52525b' }}>Automated dimming</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '9px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', color: '#52525b' }}>CONFIGURED</div>
                </div>
              </div>
            </div>
          </div>

          {/* Live Device Feed Card */}
          {haToken && isHaConnected && (
            <div className="v-card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}><Activity size={12} /> Live Device Feed</label>
                <button onClick={fetchEntities} style={{ background: 'none', border: 'none', color: 'var(--signal)', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}>REFRESH DATA</button>
              </div>

              {isLoadingEntities ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#52525b', fontSize: '11px' }}>Polling...</div>
              ) : entities.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#52525b', fontSize: '11px' }}>No Ring devices found.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                  {entities.map((e) => {
                    const isCamera = e.entity_id.startsWith('camera.')
                    const previewUrl = cameraPreviews[e.entity_id]
                    
                    return (
                      <div key={e.entity_id} style={{ padding: '0', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        {isCamera && (
                          <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000' }}>
                            {previewUrl ? (
                              <img src={previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3f3f46' }}>
                                <Camera size={24} />
                              </div>
                            )}
                            <div style={{ position: 'absolute', top: '10px', left: '10px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '8px', fontWeight: 'bold' }}>LIVE PREVIEW</div>
                          </div>
                        )}
                        
                        <div style={{ padding: '16px' }}>
                          <div style={{ fontSize: '10px', color: '#52525b', marginBottom: '4px', textTransform: 'uppercase' }}>{e.entity_id.split('.')[0]}</div>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'white', marginBottom: '12px' }}>{e.attributes.friendly_name || e.entity_id}</div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: e.state === 'unavailable' ? '#ef4444' : 'var(--signal)', boxShadow: e.state === 'unavailable' ? 'none' : '0 0 8px var(--signal)' }} />
                              <span style={{ fontSize: '10px', color: e.state === 'unavailable' ? '#ef4444' : 'var(--signal)', fontWeight: 'bold' }}>{e.state.toUpperCase()}</span>
                            </div>
                            
                            {isCamera && (
                              <button 
                                onClick={() => setSelectedEntity(e.entity_id)}
                                style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)', color: '#22d3ee', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                              >
                                <Camera size={10} /> WATCH LIVE
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Live Stream Overlay */}
      {selectedEntity && (
        <LiveCameraOverlay
          entityId={selectedEntity}
          haIp={haIp}
          haToken={haToken}
          onClose={() => setSelectedEntity(null)}
          onOpenExternal={handleOpenExternal}
        />
      )}

      {/* PC Automation Logic Card */}
      <div className="v-card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}><Activity size={12} /> PC Automation Engine</label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          {[
            { trigger: 'Doorbell Rings', action: 'Dim Smart Lights', icon: Bell, active: true },
            { trigger: 'Motion Detected', action: 'Show HUD Notification', icon: Camera, active: true }
          ].map((automation, i) => (
            <div key={i} style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <automation.icon size={16} style={{ color: automation.active ? 'var(--signal)' : '#52525b' }} />
                <div style={{ width: '24px', height: '12px', borderRadius: '6px', background: automation.active ? 'var(--signal)' : '#333', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '2px', left: automation.active ? '13px' : '2px', width: '8px', height: '8px', borderRadius: '50%', background: 'white' }} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase' }}>IF {automation.trigger}</div>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'white' }}>THEN {automation.action}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Live view via HA's WebRTC signaling API (camera/webrtc/* over the websocket).
// Ring cameras are WebRTC-only: their MJPEG/HLS proxies replay the last recorded
// clip instead of going live, so this is the only path to a real live stream.
function useHaWebRtc(haIp: string, haToken: string, entityId: string, enabled: boolean) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<'connecting' | 'streaming' | 'failed'>('connecting')

  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let pc: RTCPeerConnection | null = null
    setStatus('connecting')
    setStream(null)

    const ws = new WebSocket(`${haIp.replace(/^http/, 'ws')}/api/websocket`)
    let msgId = 0
    let configId = 0
    let offerId = 0
    let sessionId: string | null = null
    const pendingCandidates: RTCIceCandidateInit[] = []
    const send = (msg: Record<string, unknown>) => { ws.send(JSON.stringify({ id: ++msgId, ...msg })); return msgId }

    const fail = (why: unknown) => {
      if (disposed) return
      console.error(`WebRTC stream failed for ${entityId}`, why)
      setStatus('failed')
    }
    const timeout = setTimeout(() => fail('timed out negotiating stream'), 15000)

    const sendCandidate = (candidate: RTCIceCandidateInit) =>
      send({ type: 'camera/webrtc/candidate', entity_id: entityId, session_id: sessionId, candidate })

    ws.onerror = () => fail('websocket error')
    ws.onmessage = async (ev) => {
      if (disposed) return
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'auth_required') {
          ws.send(JSON.stringify({ type: 'auth', access_token: haToken }))
        } else if (msg.type === 'auth_invalid') {
          fail('auth rejected')
        } else if (msg.type === 'auth_ok') {
          configId = send({ type: 'camera/webrtc/get_client_config', entity_id: entityId })
        } else if (msg.type === 'result' && msg.id === configId) {
          if (!msg.success) return fail(msg.error)
          pc = new RTCPeerConnection(msg.result.configuration)
          pc.addTransceiver('video', { direction: 'recvonly' })
          pc.addTransceiver('audio', { direction: 'recvonly' })
          pc.ontrack = (e) => {
            if (disposed) return
            clearTimeout(timeout)
            setStream(e.streams[0] ?? new MediaStream([e.track]))
            setStatus('streaming')
          }
          pc.onicecandidate = (e) => {
            if (!e.candidate?.candidate) return
            // HA rejects candidates until the 'session' event delivers a session_id
            if (sessionId) sendCandidate(e.candidate.toJSON())
            else pendingCandidates.push(e.candidate.toJSON())
          }
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          offerId = send({ type: 'camera/webrtc/offer', entity_id: entityId, offer: offer.sdp })
        } else if (msg.type === 'result' && msg.id === offerId && !msg.success) {
          fail(msg.error)
        } else if (msg.type === 'event' && msg.id === offerId) {
          const event = msg.event
          if (event.type === 'session') {
            sessionId = event.session_id
            pendingCandidates.splice(0).forEach(sendCandidate)
          } else if (event.type === 'answer') {
            await pc?.setRemoteDescription({ type: 'answer', sdp: event.answer })
          } else if (event.type === 'candidate') {
            await pc?.addIceCandidate(event.candidate)
          } else if (event.type === 'error') {
            fail(`${event.code}: ${event.message}`)
          }
        }
      } catch (e) { fail(e) }
    }

    return () => {
      disposed = true
      clearTimeout(timeout)
      pc?.close()
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
    }
  }, [haIp, haToken, entityId, enabled])

  return { stream, status }
}

function LiveCameraOverlay({ entityId, haIp, haToken, onClose, onOpenExternal }: {
  entityId: string
  haIp: string
  haToken: string
  onClose: () => void
  onOpenExternal: (url: string) => void
}) {
  const [playing, setPlaying] = useState(true)
  const [muted, setMuted] = useState(true)
  const { stream, status } = useHaWebRtc(haIp, haToken, entityId, playing)
  const streamFailed = status === 'failed'
  const [snapshotSrc, setSnapshotSrc] = useState<string | null>(null)
  const [snapshotKey, setSnapshotKey] = useState(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  // Snapshot fallback: poll camera_proxy via the main process → data URL.
  useEffect(() => {
    if (!streamFailed) return
    let cancelled = false
    const fetchFrame = async () => {
      try {
        const resp = await window.electron.netFetch({
          url: `${haIp}/api/camera_proxy/${entityId}`,
          headers: { Authorization: `Bearer ${haToken}` },
          binary: true,
        })
        if (!resp.ok || !resp.base64 || cancelled) return
        setSnapshotSrc(`data:${resp.contentType || 'image/jpeg'};base64,${resp.base64}`)
      } catch { /* network error — overlay stays on last frame */ }
    }
    fetchFrame()
    return () => { cancelled = true }
  }, [streamFailed, snapshotKey, entityId, haIp, haToken])

  useEffect(() => {
    if (!streamFailed || !playing) return
    const interval = setInterval(() => setSnapshotKey(k => k + 1), 1500)
    return () => clearInterval(interval)
  }, [streamFailed, playing])

  const isLive = playing && status === 'streaming'
  const statusText = !playing ? '· PAUSED' : streamFailed ? '· SNAPSHOT · 1.5s refresh' : status === 'streaming' ? '· LIVE · WebRTC' : '· CONNECTING'

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: '1200px', height: '85vh', background: '#0d1525', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
        {/* Header */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isLive ? '#ef4444' : '#52525b', boxShadow: isLive ? '0 0 10px #ef4444' : 'none', animation: isLive ? 'pulse-dot 2s infinite' : 'none' }} />
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'white', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
              {entityId.replace('camera.', '').replace(/_/g, ' ')}
            </span>
            <span style={{ fontSize: '8px', color: '#52525b', fontFamily: 'monospace' }}>
              {statusText}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isLive && (
              <button
                onClick={() => setMuted(v => !v)}
                title={muted ? 'Unmute audio' : 'Mute audio'}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '8px', background: muted ? 'rgba(255,255,255,0.05)' : 'rgba(34,211,238,0.1)', border: `1px solid ${muted ? 'rgba(255,255,255,0.1)' : 'rgba(34,211,238,0.25)'}`, color: muted ? '#71717a' : '#22d3ee', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
                {muted ? 'UNMUTE' : 'MUTE'}
              </button>
            )}
            <button
              onClick={() => setPlaying(v => !v)}
              title={playing ? 'Pause stream' : 'Resume live stream'}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '8px', background: playing ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${playing ? 'rgba(34,211,238,0.25)' : 'rgba(255,255,255,0.1)'}`, color: playing ? '#22d3ee' : '#71717a', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              <RefreshCw size={10} />
              {playing ? 'PAUSE' : 'RESUME'}
            </button>
            <button
              onClick={() => onOpenExternal(`${haIp}/lovelace/0`)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#a1a1aa', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              <ExternalLink size={10} />
              OPEN IN HA
            </button>
            <button
              onClick={onClose}
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', padding: '5px 14px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              CLOSE
            </button>
          </div>
        </div>

        {/* Camera stream */}
        <div style={{ flex: 1, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
          {!streamFailed && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={muted}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          )}
          {streamFailed && snapshotSrc && (
            <img
              src={snapshotSrc}
              alt={entityId}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          )}
          {((streamFailed && !snapshotSrc) || (!streamFailed && status !== 'streaming')) && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: '#52525b', pointerEvents: 'none' }}>
              <Camera size={32} />
              <span style={{ fontSize: '10px', fontFamily: 'monospace' }}>{playing ? 'Negotiating WebRTC session...' : 'Paused'}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 24px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', flexShrink: 0 }}>
          <span style={{ fontSize: '9px', color: '#3f3f46', fontFamily: 'monospace' }}>
            {streamFailed ? `${haIp}/api/camera_proxy/${entityId}` : `${haIp.replace(/^http/, 'ws')}/api/websocket · camera/webrtc/offer`}
          </span>
          <span style={{ fontSize: '9px', color: '#52525b', fontFamily: 'monospace' }}>
            {streamFailed ? `FRAME #${snapshotKey}` : 'WebRTC · peer-to-peer via Ring'}
          </span>
        </div>
      </div>
    </div>,
    document.body
  )
}
