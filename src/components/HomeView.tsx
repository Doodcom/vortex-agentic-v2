import { useState, useEffect } from 'react'
import { Home, Shield, Bell, Lightbulb, Camera, Power, Activity, ExternalLink } from 'lucide-react'
import { useTheme } from './ThemeProvider'
import { notify } from '../lib/notifications'

export default function HomeView() {
  const { playSound } = useTheme()
  const [haIp, setHaIp] = useState(() => localStorage.getItem('vortex-ha-ip') || 'http://localhost:8123')
  const [haToken, setHaToken] = useState(() => localStorage.getItem('vortex-ha-token') || '')
  const [isHaConnected, setIsHaConnected] = useState(false)
  const [entities, setEntities] = useState<any[]>([])
  const [isLoadingEntities, setIsLoadingEntities] = useState(false)
  const [cameraPreviews, setCameraPreviews] = useState<Record<string, string>>({})
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'devices' | 'portal'>('devices')

  useEffect(() => {
    localStorage.setItem('vortex-ha-ip', haIp)
    localStorage.setItem('vortex-ha-token', haToken)
    checkHaConnection()
  }, [haIp, haToken])

  const fetchCameraPreview = async (entityId: string) => {
    if (!haToken || !haIp) return
    try {
      const resp = await fetch(`${haIp}/api/camera_proxy/${entityId}`, {
        headers: { 'Authorization': `Bearer ${haToken}` }
      })
      if (!resp.ok) return
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      setCameraPreviews(prev => ({ ...prev, [entityId]: url }))
    } catch (e) {
      console.error(`Failed to fetch preview for ${entityId}`, e)
    }
  }

  const checkHaConnection = async () => {
    if (!haIp) return
    try {
      const controller = new AbortController()
      const id = setTimeout(() => controller.abort(), 2000)
      
      const headers: any = { 'Content-Type': 'application/json' }
      if (haToken) headers['Authorization'] = `Bearer ${haToken}`
      
      const resp = await fetch(`${haIp}/api/config`, { 
        headers,
        signal: controller.signal 
      })
      clearTimeout(id)
      setIsHaConnected(resp.ok)
      if (resp.ok && haToken) fetchEntities()
    } catch (e) {
      setIsHaConnected(false)
    }
  }

  const fetchEntities = async () => {
    if (!haToken) return
    setIsLoadingEntities(true)
    try {
      const resp = await fetch(`${haIp}/api/states`, {
        headers: { 'Authorization': `Bearer ${haToken}` }
      })
      const data = await resp.json()
      const filtered = data.filter((e: any) => 
        e.entity_id.includes('ring') || 
        e.entity_id.includes('camera') ||
        e.entity_id.includes('light') ||
        e.entity_id.includes('binary_sensor')
      )
      setEntities(filtered)

      // Refresh camera previews
      filtered.forEach((e: any) => {
        if (e.entity_id.startsWith('camera.')) {
          fetchCameraPreview(e.entity_id)
        }
      })
    } catch (e) {
      console.error('Failed to fetch entities', e)
    } finally {
      setIsLoadingEntities(false)
    }
  }

  const handleToggleHA = async () => {
    playSound('click')
    notify('Home Assistant', 'Sending Docker command...', 'info')
  }

  const handleOpenExternal = (url: string) => {
    playSound('click')
    if ((window as any).electron?.openExternal) {
      (window as any).electron.openExternal(url)
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
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '1200px', height: '85vh', background: '#0d1525', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 10px #ef4444', animation: 'pulse-dot 2s infinite' }} />
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'white', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
                   SYSTEM.LIVE_STREAM :: {selectedEntity.toUpperCase()}
                </span>
              </div>
              <button 
                onClick={() => setSelectedEntity(null)}
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', padding: '6px 16px', borderRadius: '8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}
              >
                DISCONNECT FEED
              </button>
            </div>
            
            <div style={{ flex: 1, position: 'relative', background: '#000' }}>
              <iframe 
                src={`${haIp}/lovelace/0?dialog=more-info&entity_id=${selectedEntity}`}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="HA Live View"
              />
            </div>
            
            <div style={{ padding: '10px 24px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
              <span style={{ fontSize: '9px', color: '#52525b', fontFamily: 'monospace', letterSpacing: '0.05em' }}>VORTEX SECURE LINK :: END-TO-END ENCRYPTED SMART TUNNEL</span>
            </div>
          </div>
        </div>
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
