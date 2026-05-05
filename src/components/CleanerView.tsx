import { useState } from 'react'
import { motion } from 'framer-motion'
import { Trash2, Shield, Clock, Zap, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '../lib/utils'

export default function CleanerView() {
  const [isCleaning, setIsCleaning] = useState(false)
  const [result, setResult] = useState<{ success: boolean, output?: string, error?: string } | null>(null)

  const runCleanup = async (type: 'cache' | 'orphans' | 'logs' | 'all') => {
    setIsCleaning(true)
    setResult(null)
    try {
      const res = await (window as any).electron.systemCleanup(type)
      setResult(res)
    } catch (e: any) {
      setResult({ success: false, error: e.message })
    } finally {
      setIsCleaning(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <CleanupCard 
          icon={Clock}
          title="System Logs"
          description="Vacuum journalctl logs older than 3 days to reclaim space."
          onClick={() => runCleanup('logs')}
          loading={isCleaning}
          color="text-signal"
        />
        <CleanupCard 
          icon={Zap}
          title="Package Cache"
          description="Clear old versions of installed packages using paccache."
          onClick={() => runCleanup('cache')}
          loading={isCleaning}
          color="text-amber-500"
        />
        <CleanupCard 
          icon={Shield}
          title="Orphaned Packages"
          description="Remove packages that were installed as dependencies but no longer needed."
          onClick={() => runCleanup('orphans')}
          loading={isCleaning}
          color="text-crimson"
        />
        <CleanupCard 
          icon={Trash2}
          title="Deep Cleanup"
          description="Perform all cleaning operations at once for maximum efficiency."
          onClick={() => runCleanup('all')}
          loading={isCleaning}
          color="text-white"
          featured
        />
      </div>

      <AnimatePresence>
        {result && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "p-6 rounded-3xl border flex flex-col space-y-4",
              result.success ? "bg-emerald-500/10 border-emerald-500/20" : "bg-crimson/10 border-crimson/20"
            )}
          >
            <div className="flex items-center space-x-3">
              {result.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-crimson" />
              )}
              <h3 className={cn("font-bold uppercase tracking-wider", result.success ? "text-emerald-500" : "text-crimson")}>
                {result.success ? "Cleanup Protocol Successful" : "Cleanup Protocol Failed"}
              </h3>
            </div>
            <pre className="text-[10px] font-mono text-zinc-400 bg-black/40 p-4 rounded-xl overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
              {result.output || result.error}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CleanupCard({ icon: Icon, title, description, onClick, loading, color, featured }: any) {
  return (
    <button 
      onClick={onClick}
      disabled={loading}
      className={cn(
        "p-6 rounded-3xl border transition-all text-left relative group overflow-hidden",
        featured ? "bg-crimson/10 border-crimson/30 hover:bg-crimson/20" : "bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/[0.08]"
      )}
    >
      <div className={cn("p-3 rounded-xl bg-black/40 border border-white/5 w-fit mb-4", color)}>
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="font-bold text-lg mb-2 uppercase italic">{title}</h3>
      <p className="text-zinc-500 text-xs leading-relaxed">{description}</p>
      
      {loading && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-white" />
        </div>
      )}
    </button>
  )
}

import { AnimatePresence } from 'framer-motion'
