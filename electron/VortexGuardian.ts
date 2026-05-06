import { exec } from 'child_process'
import { promisify } from 'util'
import { ipcMain } from 'electron'
import { runGameModeToggle } from './system'

const execPromise = promisify(exec)

class VortexGuardian {
  private isEnabled: boolean = false
  private interval: NodeJS.Timeout | null = null
  private lastGameState: boolean = false
  private win: any = null

  // Common gaming related processes to watch for
  private GAME_PROCESSES = [
    'steam', 'steamwebhelper', 'lutris', 'heroic', 'bottles', 
    'wine-preloader', 'gamescope', 'mangohud', 'retroarch'
  ]

  constructor() {}

  public init(window: any) {
    this.win = window
    this.setupIpc()
    console.log('[Guardian] Agentic Watchdog Initialized')
  }

  private setupIpc() {
    ipcMain.handle('guardian-toggle', (_, enable: boolean) => {
      this.isEnabled = enable
      if (enable) this.start()
      else this.stop()
      return { success: true, enabled: this.isEnabled }
    })

    ipcMain.handle('guardian-status', () => ({
      enabled: this.isEnabled,
      activeOptimization: this.lastGameState ? 'Gaming' : 'Balanced'
    }))
  }

  private start() {
    if (this.interval) return
    console.log('[Guardian] Auto-Pilot Engaged')
    this.interval = setInterval(() => this.checkSystem(), 5000) // Check every 5 seconds
    this.checkSystem() // Immediate check
  }

  private stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    console.log('[Guardian] Auto-Pilot Disengaged')
  }

  private async checkSystem() {
    if (!this.isEnabled) return

    try {
      // 1. Detect Gaming Activity
      const { stdout: psOut } = await execPromise('ps -e -o comm=')
      const runningProcs = psOut.split('\n').map(p => p.trim().toLowerCase())
      
      const isGaming = this.GAME_PROCESSES.some(game => runningProcs.includes(game))

      if (isGaming && !this.lastGameState) {
        console.log('[Guardian] Game Detected! Activating Zero-Latency Mode...')
        this.notifyRenderer('Guardian: Game Detected', 'Optimizing hardware for Zero-Latency gaming...', 'success')
        
        await runGameModeToggle(true)
        this.lastGameState = true
      } 
      else if (!isGaming && this.lastGameState) {
        console.log('[Guardian] Game Closed. Reverting to Balanced Mode...')
        this.notifyRenderer('Guardian: Session Ended', 'Restoring AI tasks to all cores.', 'info')
        
        await runGameModeToggle(false)
        this.lastGameState = false
      }

      // 2. Thermal/Stress Check (Optional: Could expand to throttle Ollama if CPU > 85C)
      // This is a placeholder for 2026 Thermal Throttling logic
    } catch (e) {
      console.error('[Guardian] Error during check:', e)
    }
  }

  private notifyRenderer(title: string, message: string, type: 'success' | 'info' | 'error') {
    if (this.win) {
      this.win.webContents.send('notification', { title, message, type })
    }
  }
}

export const guardian = new VortexGuardian()
