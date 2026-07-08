import { ipcMain } from 'electron'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import axios from 'axios'
import { execPromise, createSystemHelpers } from './system-common'

const BORE_PROFILES: Record<string, Record<string, number>> = {
  desktop:   { 'kernel.sched_burst_penalty_scale': 1280, 'kernel.sched_burst_smoothness_long': 1, 'kernel.sched_burst_smoothness_short': 0, 'kernel.sched_burst_fork_atavistic': 2, 'kernel.sched_burst_parity_threshold': 2, 'kernel.sched_burst_cache_lifetime': 60000000 },
  ai_heavy:  { 'kernel.sched_burst_penalty_scale': 320,  'kernel.sched_burst_smoothness_long': 1, 'kernel.sched_burst_smoothness_short': 0, 'kernel.sched_burst_fork_atavistic': 0, 'kernel.sched_burst_parity_threshold': 0, 'kernel.sched_burst_cache_lifetime': 120000000 },
  balanced:  { 'kernel.sched_burst_penalty_scale': 1024, 'kernel.sched_burst_smoothness_long': 1, 'kernel.sched_burst_smoothness_short': 0, 'kernel.sched_burst_fork_atavistic': 2, 'kernel.sched_burst_parity_threshold': 2, 'kernel.sched_burst_cache_lifetime': 60000000 },
  gaming:    { 'kernel.sched_burst_penalty_scale': 640,  'kernel.sched_burst_smoothness_long': 1, 'kernel.sched_burst_smoothness_short': 0, 'kernel.sched_burst_fork_atavistic': 0, 'kernel.sched_burst_parity_threshold': 2, 'kernel.sched_burst_cache_lifetime': 60000000 },
}

export async function runGameModeToggle(enable: boolean) {
  const logs: string[] = []
  try {
    if (enable) {
      // 1. VRAM Squeeze
      logs.push('> Squeezing background VRAM...')
      await execPromise('pkexec dmemcg-booster --aggressive').catch(() => {})

      // 2. SCX Scheduler (lavd for gaming)
      logs.push('> Switching to LAVD gaming scheduler...')
      await execPromise('busctl call org.scx.Loader /org/scx/Loader org.scx.Loader SwitchScheduler su "lavd" 0').catch(() => {})

      // 3. V-Cache Isolation: Pin AI to cores 8-15 (non-L3 CCD)
      logs.push('> Isolating AI tasks to non-V-Cache cores (8-15)...')
      const { stdout: pidsRaw } = await execPromise('pgrep -x ollama || true; pgrep -f "python.*comfyui" || true')
      const pids = pidsRaw.trim().split('\n').filter(Boolean)
      for (const pid of pids) {
        await execPromise(`taskset -cp 8-15 ${pid}`).catch(() => {})
      }
      logs.push(`> Isolated ${pids.length} AI processes. System optimized for Gaming.`)
    } else {
      // 1. Stop SCX Scheduler
      logs.push('> Reverting to default scheduler...')
      await execPromise('busctl call org.scx.Loader /org/scx/Loader org.scx.Loader StopScheduler').catch(() => {})

      // 2. Restore Core Affinity to all cores (0-15)
      logs.push('> Restoring AI affinity to all cores (0-15)...')
      const { stdout: pidsRaw } = await execPromise('pgrep -x ollama || true; pgrep -f "python.*comfyui" || true')
      const pids = pidsRaw.trim().split('\n').filter(Boolean)
      for (const pid of pids) {
        await execPromise(`taskset -cp 0-15 ${pid}`).catch(() => {})
      }
      logs.push('> System restored to Balanced mode.')
    }
    return { success: true, log: logs.join('\n') }
  } catch (e: any) {
    return { success: false, log: `Game Mode Error: ${e.message}` }
  }
}

export function setupAiHandlers(win: any) {
  const { notify, streamLog, runStreamingCmd } = createSystemHelpers(win)

  ipcMain.handle('ai-update-components', async () => {
    // Auto-snapshot before AI stack update
    try { await execPromise('pkexec snapper --no-dbus -c root create -t pre -p -d "Vortex AI update"') } catch { /* ignore */ }

    streamLog('> Initializing AI Component synchronization...')

    const comfyDir = join(homedir(), '.comfyui-headless')
    if (existsSync(comfyDir)) {
      streamLog('> Updating ComfyUI Core...')
      await runStreamingCmd('git', ['pull'], { cwd: comfyDir })
    } else {
      streamLog('> ComfyUI not found, skipping.')
    }

    try {
      const nodesDir = join(homedir(), '.comfyui-headless', 'custom_nodes')
      const dirs = readdirSync(nodesDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== '__pycache__')
        .map(d => d.name)
      
      dirs.forEach(node => streamLog(`> Updating Node: ${node}...`))
      await Promise.all(dirs.map(node => runStreamingCmd('git', ['pull'], { cwd: join(nodesDir, node) })))
    } catch (e: any) {
      streamLog(`Nodes Scan Error: ${e.message}`)
    }

    try {
      const { stdout: statusOut } = await execPromise('systemctl is-active ollama').catch(() => ({ stdout: 'inactive' }))
      if (statusOut.trim() !== 'active') {
        streamLog('> Ollama service is inactive. Skipping neural weights sync.')
      } else {
        const { stdout: listOut } = await execPromise('ollama list --format json || ollama list')
        streamLog('> Synchronizing Ollama Neural Weights...')
        
        let modelNames: string[] = []
        try {
          const json = JSON.parse(listOut)
          modelNames = json.models?.map((m: any) => m.name) || []
        } catch {
          const lines = listOut.trim().split('\n')
          const startIdx = lines[0].toLowerCase().includes('name') ? 1 : 0
          modelNames = lines.slice(startIdx)
            .map(l => l.split(/\s+/)[0])
            .filter(n => n && n !== 'NAME')
        }

        for (const model of modelNames) {
          streamLog(`> Pulling weights for [${model}]...`)
          await runStreamingCmd('ollama', ['pull', model])
        }
      }
    } catch (e: any) {
      streamLog(`Ollama Sync Error: ${e.message}`)
    }

    notify('AI Update', 'AI Component synchronization finished', 'success')
    return { success: true, log: 'AI Components sync finished.' }
  })

  ipcMain.handle('comfy-purge', async () => {
    try {
      await axios.post('http://127.0.0.1:8188/free', { unload_models: true, free_memory: true })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('io-tune-for-ai', async (_, mode: 'ai' | 'default') => {
    const profiles = {
      ai:      { read_lat_nsec: 1000000, write_lat_nsec: 20000000 },
      default: { read_lat_nsec: 2000000, write_lat_nsec: 10000000 },
    }
    if (!Object.prototype.hasOwnProperty.call(profiles, mode)) {
      return { success: false, error: 'Invalid mode' }
    }
    const { read_lat_nsec, write_lat_nsec } = profiles[mode]
    const results: string[] = []
    try {
      const { stdout: blockDevs } = await execPromise('ls /sys/block/')
      const nvmes = blockDevs.trim().split('\n').filter(d => d.startsWith('nvme'))
      for (const dev of nvmes) {
        const base = `/sys/block/${dev}/queue/iosched`
        try {
          await execPromise(`echo ${read_lat_nsec} | pkexec tee ${base}/read_lat_nsec`)
          await execPromise(`echo ${write_lat_nsec} | pkexec tee ${base}/write_lat_nsec`)
          results.push(`${dev}: ok`)
        } catch (e: any) {
          results.push(`${dev}: ${e.message}`)
        }
      }
      return { success: true, output: results.join('\n') }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('scx-status', async () => {
    try {
      const [curSched, curMode, state] = await Promise.all([
        execPromise("busctl get-property org.scx.Loader /org/scx/Loader org.scx.Loader CurrentScheduler 2>/dev/null || echo 's \"unknown\"'"),
        execPromise("busctl get-property org.scx.Loader /org/scx/Loader org.scx.Loader SchedulerMode 2>/dev/null || echo 'u 0'"),
        execPromise('cat /sys/kernel/sched_ext/state 2>/dev/null || echo "disabled"'),
      ])
      const schedulerName = (curSched.stdout.match(/"([^"]+)"/) || [])[1] ?? 'unknown'
      const modeVal = parseInt((curMode.stdout.match(/\d+/) || ['0'])[0], 10)
      const stateStr = state.stdout.trim()
      const { stdout: supported } = await execPromise("busctl get-property org.scx.Loader /org/scx/Loader org.scx.Loader SupportedSchedulers 2>/dev/null || echo 'as 0'")
      const schedulers = (supported.match(/"([^"]+)"/g) || []).map((s: string) => s.replace(/"/g, ''))
      return { success: true, scheduler: schedulerName, mode: modeVal, state: stateStr, schedulers }
    } catch (e: any) {
      return { success: false, scheduler: 'unknown', mode: 0, state: 'disabled', schedulers: [], error: e.message }
    }
  })

  ipcMain.handle('scx-set-scheduler', async (_, { name, mode = 0 }: { name: string; mode?: number }) => {
    if (!/^[\w]+$/.test(name)) return { success: false, error: 'Invalid scheduler name' }
    const safeMode = Math.max(0, Math.min(3, parseInt(String(mode), 10)))
    try {
      await execPromise(`busctl call org.scx.Loader /org/scx/Loader org.scx.Loader SwitchScheduler su "${name}" ${safeMode}`)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('scx-stop', async () => {
    try {
      await execPromise('busctl call org.scx.Loader /org/scx/Loader org.scx.Loader StopScheduler')
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('scx-metrics', async () => {
    try {
      const { stdout: state } = await execPromise('cat /sys/kernel/sched_ext/state 2>/dev/null || echo "disabled"')
      const { stdout: seq } = await execPromise('cat /sys/kernel/sched_ext/enable_seq 2>/dev/null || echo "0"')
      const { stdout: rejected } = await execPromise('cat /sys/kernel/sched_ext/nr_rejected 2>/dev/null || echo "0"')
      return { success: true, state: state.trim(), enableSeq: parseInt(seq.trim(), 10), nrRejected: parseInt(rejected.trim(), 10) }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('bore-set-profile', async (_, profile: string) => {
    if (!Object.prototype.hasOwnProperty.call(BORE_PROFILES, profile)) {
      return { success: false, error: 'Invalid profile' }
    }
    const params = BORE_PROFILES[profile]
    const results: string[] = []
    let anyApplied = false
    for (const [key, val] of Object.entries(params)) {
      try {
        await execPromise(`sysctl -w ${key}=${val}`)
        results.push(`${key}=${val}`)
        anyApplied = true
      } catch {
        results.push(`${key}: not available`)
      }
    }
    return { success: anyApplied, output: results.join('\n'), partial: results.some(r => r.includes('not available')) }
  })

  ipcMain.handle('ollama-set-vram-mode', async (_, mode: 'max' | 'budget') => {
    const configs: Record<string, string> = {
      max: [
        '[Service]',
        'Environment="OLLAMA_GPU_OVERHEAD=0"',
        'Environment="OLLAMA_MAX_LOADED_MODELS=2"',
        'Environment="OLLAMA_NUM_PARALLEL=2"',
        'Environment="OLLAMA_FLASH_ATTENTION=1"',
        'Environment="OLLAMA_KEEP_ALIVE=30m"',
        'Environment="OLLAMA_HOST=0.0.0.0"',
        'Environment="OLLAMA_NUM_GPU=40"',
      ].join('\n'),
      budget: [
        '[Service]',
        'Environment="OLLAMA_GPU_OVERHEAD=2147483648"',
        'Environment="OLLAMA_MAX_LOADED_MODELS=1"',
        'Environment="OLLAMA_NUM_PARALLEL=1"',
        'Environment="OLLAMA_FLASH_ATTENTION=1"',
        'Environment="OLLAMA_KEEP_ALIVE=10m"',
        'Environment="OLLAMA_HOST=0.0.0.0"',
        'Environment="OLLAMA_NUM_GPU=40"',
      ].join('\n'),
    }
    if (!Object.prototype.hasOwnProperty.call(configs, mode)) {
      return { success: false, error: 'Invalid mode' }
    }
    try {
      const overridePath = '/etc/systemd/system/ollama.service.d/override.conf'
      const content = configs[mode]
      await execPromise(`echo '${content}' | pkexec tee ${overridePath}`)
      await execPromise('pkexec systemctl daemon-reload')
      await execPromise('pkexec systemctl restart ollama.service')
      return { success: true, output: `VRAM mode set to ${mode}` }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('ollama-pin-vcache', async () => {
    try {
      const { stdout } = await execPromise('pgrep -x ollama || pgrep -f "ollama serve"')
      const pids = stdout.trim().split('\n').filter(Boolean)
      if (pids.length === 0) return { success: false, error: 'Ollama process not found' }
      const results: string[] = []
      for (const pid of pids) {
        const safePid = parseInt(pid, 10)
        if (isNaN(safePid)) continue
        await execPromise(`taskset -cp 0-7 ${safePid}`)
        await execPromise(`renice -n -5 -p ${safePid}`)
        results.push(`PID ${safePid}: pinned 0-7, renice -5`)
      }
      return { success: true, output: results.join('\n') }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('game-mode-toggle', async (_, enable: boolean) => {
    return await runGameModeToggle(enable)
  })

}
