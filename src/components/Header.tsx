import { useState, useEffect } from 'react'
import WindowControls from './WindowControls'
import NotificationCentre from './NotificationCentre'

export default function Header() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <header className="v-header relative" style={{ zIndex: 100 }}>
      {/* Left Info: Non-draggable */}
      <div className="no-drag" style={{ display: 'flex', alignItems: 'center', padding: '0 16px', gap: '12px', position: 'relative', zIndex: 10 }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--signal)', boxShadow: '0 0 8px var(--signal)' }} className="animate-pulse" />
        <div style={{ height: '16px', width: '1px', background: 'rgba(255,255,255,0.1)' }} />
        <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Core_Status: <span style={{ color: 'var(--signal)' }}>Optimal</span>
        </span>
      </div>

      {/* Center: Dedicated DRAG Region */}
      <div className="drag" style={{ flex: 1, height: '100%', cursor: 'default' }} />

      {/* Right Controls: Non-draggable */}
      <div className="no-drag" style={{ display: 'flex', alignItems: 'center', height: '100%', gap: '0', position: 'relative', zIndex: 10 }}>
        <div style={{ padding: '0 16px', display: 'flex', alignItems: 'center' }}>
          <NotificationCentre />
        </div>
        <div style={{ padding: '0 16px', fontSize: '10px', fontFamily: 'monospace', color: '#52525b', textTransform: 'uppercase', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', height: '100%', display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)' }}>
          {time.toLocaleTimeString([], { hour12: false })}
        </div>
        <WindowControls />
      </div>
    </header>
  )
}
