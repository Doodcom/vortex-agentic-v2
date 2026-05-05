import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HardDrive, Shield, Loader2, Zap } from 'lucide-react'
import { cn } from '../lib/utils'

export default function OptimizerView() {
  const [isOptimizing, setIsOptimizing] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, any>>({})

  const runOptimize = async (id: string) => {
    setIsOptimizing(id)
    try {
      const res = await (window as any).electron.systemOptimize(id as any)
      setResults(prev => ({ ...prev, [id]: res }))
    } catch (e: any) {
      setResults(prev => ({ ...prev, [id]: { success: false, error: e.message } }))
    } finally {
      setIsOptimizing(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="grid grid-cols-1 gap-6 mb-8">
        <OptCard 
          id="ssd"
          icon={HardDrive}
          title="SSD TRIM Optimization"
          description="Send TRIM commands to all mounted filesystems to maintain SSD performance."
          onClick={() => runOptimize('ssd')}
          loading={isOptimizing === 'ssd'}
          result={results['ssd']}
          color="text-signal"
        />
        <OptCard 
          id="services"
          icon={Shield}
          title="Service State Reset"
          description="Reset failed systemd services to clear error states in system status."
          onClick={() => runOptimize('services')}
          loading={isOptimizing === 'services'}
          result={results['services']}
          color="text-amber-500"
        />
        <OptCard 
          id="performance"
          icon={Zap}
          title="Performance Governor"
          description="Set CPU frequency scaling governor to 'performance' for maximum throughput."
          onClick={() => runOptimize('performance')}
          loading={isOptimizing === 'performance'}
          result={results['performance']}
          color="text-crimson"
        />
      </div>
    </div>
  )
}

function OptCard({ icon: Icon, title, description, onClick, loading, result, color }: any) {
  return (
    <div className="glass rounded-3xl border border-white/5 overflow-hidden transition-all hover:border-white/10">
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <div className={cn("p-4 rounded-2xl bg-black/40 border border-white/5", color)}>
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-lg uppercase italic">{title}</h3>
            <p className="text-zinc-500 text-xs">{description}</p>
          </div>
        </div>
        <button 
          onClick={onClick}
          disabled={loading}
          className={cn(
            "px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all",
            loading ? "bg-zinc-800 text-zinc-500" : "bg-white/5 hover:bg-white/10 text-white border border-white/10"
          )}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Execute"}
        </button>
      </div>

      <AnimatePresence>
        {result && (
          <motion.div 
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            className="px-6 pb-6"
          >
            <div className={cn(
              "p-4 rounded-xl border font-mono text-[10px] whitespace-pre-wrap",
              result.success ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-500/70" : "bg-crimson/5 border-crimson/10 text-crimson/70"
            )}>
              {result.success ? (result.output || "Command executed successfully") : (result.error || "Execution failed")}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
