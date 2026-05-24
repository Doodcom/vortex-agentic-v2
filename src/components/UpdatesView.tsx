import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { RefreshCcw, Package, ShieldCheck, AlertTriangle, Loader2, ChevronRight, Brain } from 'lucide-react'
import { notify } from '../lib/notifications'

export default function UpdatesView() {
  const [updates, setUpdates] = useState<{ repo: string[], aur: string[] }>({ repo: [], aur: [] })
  const [isChecking, setIsChecking] = useState(false)
  const [isUpgrading, setIsUpgrading] = useState(false)
  const [isSyncingAI, setIsSyncingAI] = useState(false)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [upgradeLog, setUpgradeLog] = useState<string[]>([])
  const logEndRef = useRef<HTMLDivElement>(null)

  const checkUpdates = async () => {
    setIsChecking(true)
    try {
      const result = await (window as any).electron.systemCheckUpdates()
      setUpdates(result)
      setLastChecked(new Date())
    } catch (e) {
      console.error('Failed to check updates:', e)
    } finally {
      setIsChecking(false)
    }
  }

  useEffect(() => {
    if ((window as any).electron) {
      (window as any).electron.on('update-log', (text: string) => {
        setUpgradeLog(prev => {
          const lines = text.split('\n').filter(l => l.trim())
          const newLog = [...prev, ...lines]
          // Keep only last 200 lines to prevent renderer lag/crash
          if (newLog.length > 200) return newLog.slice(-200)
          return newLog
        })
      })
    }
    return () => {
      if ((window as any).electron) (window as any).electron.removeListener('update-log')
    }
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [upgradeLog])

  const handleUpgrade = async () => {
    setIsUpgrading(true)
    setUpgradeLog(['> Starting system package upgrade...'])
    try {
      const sysRes = await (window as any).electron.systemUpgrade()
      if (sysRes.success) {
        setUpgradeLog(prev => [...prev, '> System upgrade complete.'])
        notify('Vortex Update', 'System upgrade completed successfully', 'success')
        await checkUpdates()
      } else {
        setUpgradeLog(prev => [...prev, `> Error: ${sysRes.error || 'Upgrade failed or cancelled.'}`])
        notify('Vortex Update', 'System upgrade failed', 'error')
      }
    } catch (e: any) {
      setUpgradeLog(prev => [...prev, `> Fatal: ${e.message}`])
    } finally {
      setIsUpgrading(false)
    }
  }

  const handleAISync = async () => {
    setIsSyncingAI(true)
    setUpgradeLog(['> Initializing AI component synchronization...'])
    try {
      const aiRes = await (window as any).electron.aiUpdateComponents()
      setUpgradeLog(prev => [...prev, `> ${aiRes.log}`])
      notify('AI Sync', 'AI component sync finished', 'success')
    } catch (e: any) {
      setUpgradeLog(prev => [...prev, `> Fatal: ${e.message}`])
    } finally {
      setIsSyncingAI(false)
    }
  }

  useEffect(() => {
    checkUpdates()
  }, [])

  const totalUpdates = updates.repo.length + updates.aur.length

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      
      {/* Header Info */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ 
            padding: '16px', borderRadius: '24px', 
            background: totalUpdates > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
            border: `1px solid ${totalUpdates > 0 ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)'}`,
            color: totalUpdates > 0 ? '#f59e0b' : '#10b981',
            boxShadow: `0 0 20px ${totalUpdates > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)'}`
          }}>
            {totalUpdates > 0 ? <AlertTriangle size={32} /> : <ShieldCheck size={32} />}
          </div>
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: '900', textTransform: 'uppercase', margin: 0, letterSpacing: '-0.02em' }}>
              {totalUpdates > 0 ? `${totalUpdates} Updates Available` : 'System Up To Date'}
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '11px', fontFamily: 'monospace', color: '#71717a', textTransform: 'uppercase' }}>
              Last scan: {lastChecked ? lastChecked.toLocaleTimeString() : 'Never'}
            </p>
          </div>
        </div>
        
        <button 
          onClick={checkUpdates}
          disabled={isChecking || isUpgrading}
          style={{ 
            display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 24px', 
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', 
            borderRadius: '16px', color: '#f4f4f5', fontSize: '11px', fontWeight: 'bold', 
            textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer', transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <RefreshCcw size={16} className={isChecking ? 'animate-spin' : ''} style={{ color: 'var(--crimson)' }} />
          <span>Rescan System</span>
        </button>
      </div>

      {/* Update Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
        
        <UpdatePanel
          title="Official Repositories"
          subtitle="Pacman sync channel"
          count={updates.repo.length}
          items={updates.repo}
          color="#f59e0b"
          isChecking={isChecking}
        />

        <UpdatePanel
          title="User Repositories"
          subtitle="AUR build channel"
          count={updates.aur.length}
          items={updates.aur}
          color="var(--signal)"
          isChecking={isChecking}
        />
      </div>

      {/* AI Neural Sync Section */}
      <div className="v-card" style={{ marginTop: '32px', padding: '24px', display: 'flex', alignItems: 'center', gap: '20px', background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.1)' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7' }}>
          <Brain size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', margin: 0, color: '#f4f4f5' }}>AI Neural Engines</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#71717a' }}>ComfyUI core, custom nodes, and Ollama model weights.</p>
        </div>
        <button
          onClick={handleAISync}
          disabled={isSyncingAI || isUpgrading}
          style={{
            padding: '10px 20px', background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)',
            borderRadius: '12px', color: '#a855f7', fontSize: '11px', fontWeight: 'bold',
            textTransform: 'uppercase', letterSpacing: '0.08em', cursor: isSyncingAI ? 'wait' : 'pointer'
          }}
        >
          {isSyncingAI ? 'Syncing...' : 'Sync AI'}
        </button>
      </div>

      {(totalUpdates > 0 || isUpgrading || isSyncingAI) && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="v-card"
          style={{ marginTop: '40px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', border: `1px solid ${isUpgrading ? 'var(--signal)' : 'rgba(239,68,68,0.2)'}` }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', textTransform: 'uppercase', margin: 0 }}>
                {isUpgrading ? 'Upgrade in Progress...' : isSyncingAI ? 'AI Sync in Progress...' : 'Apply Full System Upgrade?'}
              </h3>
              <p style={{ margin: '8px 0 0 0', color: '#71717a', fontSize: '14px' }}>{isSyncingAI ? 'Synchronizing ComfyUI and Ollama components.' : `Targeting ${totalUpdates} package${totalUpdates !== 1 ? 's' : ''} for upgrade.`}</p>
            </div>
            {!isUpgrading && !isSyncingAI && (
              <button 
                onClick={handleUpgrade}
                style={{ 
                  padding: '16px 40px', background: 'var(--crimson)', color: 'white', border: 'none', 
                  borderRadius: '16px', fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', 
                  letterSpacing: '0.1em', cursor: 'pointer', boxShadow: '0 0 20px rgba(239,68,68,0.4)'
                }}>
                Upgrade All
              </button>
            )}
          </div>

          {upgradeLog.length > 0 && (
            <div style={{ 
              background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '16px', 
              fontFamily: 'monospace', fontSize: '11px', color: '#10b981', 
              maxHeight: '300px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.05)' 
            }}>
              {upgradeLog.map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px' }}>
                  <span style={{ opacity: 0.3 }}>{(i + 1).toString().padStart(3, '0')}</span>
                  <span>{line}</span>
                </div>
              ))}
              {isUpgrading && <div className="animate-pulse">_</div>}
              <div ref={logEndRef} />
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}

function UpdatePanel({ title, subtitle, count, items, color, isChecking }: any) {
  return (
    <div className="v-card" style={{ padding: 0, height: '480px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)' }}>
        <div>
          <h3 style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#a1a1aa', margin: 0 }}>{title}</h3>
          <p style={{ fontSize: '9px', fontFamily: 'monospace', color: '#52525b', textTransform: 'uppercase', margin: '4px 0 0 0' }}>{subtitle}</p>
        </div>
        <div style={{ fontSize: '20px', fontWeight: '900', color: color, fontFamily: 'monospace' }}>
          {count.toString().padStart(2, '0')}
        </div>
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {isChecking ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.2, gap: '16px' }}>
            <Loader2 size={32} className="animate-spin" />
            <span style={{ fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase' }}>Scanning...</span>
          </div>
        ) : (!items || items.length === 0) ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.1, gap: '16px' }}>
            <ShieldCheck size={48} />
            <span style={{ fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>All Up To Date</span>
          </div>
        ) : (
          items.map((item: string, i: number) => (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              key={item} 
              style={{ 
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', 
                borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.03)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Package size={14} style={{ color: color, opacity: 0.5 }} />
                <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#d4d4d8' }}>{item}</span>
              </div>
              <ChevronRight size={12} style={{ color: '#3f3f46' }} />
            </motion.div>
          ))
        )}
      </div>
    </div>
  )
}
