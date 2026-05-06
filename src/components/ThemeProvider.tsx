import React, { createContext, useContext, useState, useEffect } from 'react'

type ThemeType = 'vortex-red' | 'cyber-blue' | 'neon-gold' | 'matrix-green'

interface Theme {
  name: ThemeType
  primary: string
  primaryGlow: string
  bg: string
  card: string
}

const THEMES: Record<ThemeType, Theme> = {
  'vortex-red': {
    name: 'vortex-red',
    primary: '#ef4444',
    primaryGlow: 'rgba(239, 68, 68, 0.5)',
    bg: '#08090b',
    card: 'rgba(13, 14, 17, 0.7)'
  },
  'cyber-blue': {
    name: 'cyber-blue',
    primary: '#22d3ee',
    primaryGlow: 'rgba(34, 211, 238, 0.5)',
    bg: '#080b0d',
    card: 'rgba(13, 17, 20, 0.7)'
  },
  'neon-gold': {
    name: 'neon-gold',
    primary: '#f59e0b',
    primaryGlow: 'rgba(245, 158, 11, 0.5)',
    bg: '#0b0a08',
    card: 'rgba(17, 15, 13, 0.7)'
  },
  'matrix-green': {
    name: 'matrix-green',
    primary: '#10b981',
    primaryGlow: 'rgba(16, 185, 129, 0.5)',
    bg: '#080d0a',
    card: 'rgba(13, 20, 15, 0.7)'
  }
}

interface ThemeContextType {
  theme: Theme
  setTheme: (name: ThemeType) => void
  playSound: (type: 'click' | 'hover' | 'success' | 'error' | 'done') => void
  soundEnabled: boolean
  setSoundEnabled: (v: boolean) => void
  animationsEnabled: boolean
  setAnimationsEnabled: (v: boolean) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<ThemeType>(
    () => (localStorage.getItem('vortex-theme') as ThemeType) ?? 'vortex-red'
  )
  const [soundEnabled, setSoundEnabledState] = useState(
    () => localStorage.getItem('vortex-sound') !== 'false'
  )
  const [animationsEnabled, setAnimationsEnabledState] = useState(
    () => localStorage.getItem('vortex-animations') !== 'false'
  )

  const setSoundEnabled = (v: boolean) => {
    setSoundEnabledState(v)
    localStorage.setItem('vortex-sound', String(v))
  }
  const setAnimationsEnabled = (v: boolean) => {
    setAnimationsEnabledState(v)
    localStorage.setItem('vortex-animations', String(v))
  }

  const setTheme = (name: ThemeType) => {
    setCurrentTheme(name)
    localStorage.setItem('vortex-theme', name)
  }

  useEffect(() => {
    const root = document.documentElement
    const theme = THEMES[currentTheme]
    root.style.setProperty('--crimson', theme.primary)
    root.style.setProperty('--crimson-glow', theme.primaryGlow)
    root.style.setProperty('--ink-900', theme.bg)
    root.style.setProperty('--card-bg', theme.card)
  }, [currentTheme])

  const playSound = (type: 'click' | 'hover' | 'success' | 'error' | 'done') => {
    if (!soundEnabled) return
    // Simple UI sounds using Web Audio API or pre-defined frequencies
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    
    osc.connect(gain)
    gain.connect(ctx.destination)
    
    const now = ctx.currentTime
    
    switch (type) {
      case 'click':
        osc.frequency.setValueAtTime(800, now)
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1)
        gain.gain.setValueAtTime(0.1, now)
        gain.gain.linearRampToValueAtTime(0, now + 0.1)
        osc.start(now)
        osc.stop(now + 0.1)
        break
      case 'hover':
        osc.frequency.setValueAtTime(400, now)
        gain.gain.setValueAtTime(0.02, now)
        gain.gain.linearRampToValueAtTime(0, now + 0.05)
        osc.start(now)
        osc.stop(now + 0.05)
        break
      case 'success':
        osc.frequency.setValueAtTime(600, now)
        osc.frequency.setValueAtTime(800, now + 0.1)
        gain.gain.setValueAtTime(0.1, now)
        gain.gain.linearRampToValueAtTime(0, now + 0.2)
        osc.start(now)
        osc.stop(now + 0.2)
        break
      case 'done':
        osc.frequency.setValueAtTime(1000, now)
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1)
        gain.gain.setValueAtTime(0.05, now)
        gain.gain.linearRampToValueAtTime(0, now + 0.3)
        osc.start(now)
        osc.stop(now + 0.3)
        break
      case 'error':
        osc.frequency.setValueAtTime(440, now)
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.2)
        gain.gain.setValueAtTime(0.12, now)
        gain.gain.linearRampToValueAtTime(0, now + 0.2)
        osc.start(now)
        osc.stop(now + 0.2)
        break
    }
  }

  return (
    <ThemeContext.Provider value={{
      theme: THEMES[currentTheme], setTheme, playSound,
      soundEnabled, setSoundEnabled,
      animationsEnabled, setAnimationsEnabled
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
