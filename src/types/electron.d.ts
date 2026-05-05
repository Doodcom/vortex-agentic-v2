export interface ElectronAPI {
  execCommand: (command: string) => Promise<{
    success: boolean
    stdout: string
    stderr: string
    exitCode: number
  }>
  getSystemStats: () => Promise<{
    cpu: {
      manufacturer: string
      brand: string
      speed: number
      cores: number
      load: number
    }
    memory: {
      total: number
      free: number
      used: number
      active: number
    }
    network: any
  }>
  windowControl: (action: 'minimize' | 'maximize' | 'close') => void
  
  // Ollama
  ollamaListModels: () => Promise<any[]>
  ollamaChat: (payload: { model: string, messages: any[] }) => Promise<{ success: boolean, error?: string }>
  ollamaAgenticChat: (payload: { model: string, messages: any[] }) => Promise<{ success: boolean, error?: string }>
  ollamaOrchestrate: (payload: { model: string, messages: any[], customPrompt?: string, searxngUrl?: string }) => Promise<{ success: boolean, error?: string }>
  ollamaCancel: () => Promise<{ success: boolean }>
  
  // System
  systemCheckUpdates: () => Promise<{ repo: string[]; aur: string[] }>
  systemUpgrade: () => Promise<{ success: boolean; output: string; error?: string }>
  aiUpdateComponents: () => Promise<{ success: boolean; log: string }>
  systemCleanup: (type: 'cache' | 'orphans' | 'logs' | 'all') => Promise<{ success: boolean; output: string; error?: string }>
  systemGetLogs: (lines?: number) => Promise<string>

  // DB / Persistence — Sessions
  dbGetSessions: () => Promise<{ id: number; name: string; created_at: number; updated_at: number }[]>
  dbCreateSession: (name?: string) => Promise<{ id: number; name: string }>
  dbRenameSession: (p: { id: number; name: string }) => Promise<{ success: boolean }>
  dbDeleteSession: (id: number) => Promise<{ success: boolean }>
  dbTouchSession: (id: number) => Promise<{ success: boolean }>
  // DB / Persistence — Messages
  dbGetMessages: (sessionId?: number) => Promise<{ role: string; content: string }[]>
  dbSaveMessage: (msg: { role: string; content: string; sessionId?: number }) => Promise<{ success: boolean }>
  dbClearMessages: (sessionId?: number) => Promise<{ success: boolean }>

  // PTY / Terminal
  ptyGetDefaultTab: () => Promise<string>
  ptyCreate: () => Promise<string>
  ptyClose: (tabId: string) => Promise<{ success: boolean }>
  ptySetActive: (tabId: string) => Promise<{ success: boolean }>
  ptyWrite: (payload: { tabId?: string; command: string } | string) => Promise<{ success: boolean; error?: string }>
  ptyGetBuffer: (tabId?: string) => Promise<string>

  // Packages
  packageDetectHelper: () => Promise<string>
  packageSearch: (query: string) => Promise<{ repo: string; name: string; version: string; description: string; installed: boolean; source: string }[]>
  packageListAur: () => Promise<{ name: string; version: string }[]>
  packageInfo: (name: string) => Promise<Record<string, string> | null>
  packageInstall: (p: { name: string; helper: string }) => Promise<{ success: boolean; output?: string; error?: string }>
  packageRemove: (name: string) => Promise<{ success: boolean; output?: string; error?: string }>

  // Network
  networkStats: () => Promise<any[]>
  networkConnections: () => Promise<any[]>

  // Processes
  processList: () => Promise<any[]>
  processKill: (p: { pid: number; signal?: string }) => Promise<{ success: boolean; error?: string }>

  // Systemd
  systemdListUnits: () => Promise<any[]>
  systemdControlUnit: (p: { unit: string; action: string }) => Promise<{ success: boolean; output?: string; error?: string }>
  systemdUnitLogs: (p: { unit: string; lines?: number }) => Promise<string>

  // Boot analyser
  systemAnalyzeBoot: () => Promise<{ summary: string; units: { time_ms: number; unit: string }[] }>

  // Disk monitor
  diskInfo: () => Promise<{ layout: any[]; filesystems: any[] }>
  diskSmart: (device: string) => Promise<{ health: string; temp: number | null; raw: string }>

  // Assets
  systemSaveAsset: (p: { url: string; type: 'image' | 'video'; filename?: string }) => Promise<{ success: boolean; path?: string; error?: string }>
  systemReadLocalImage: (path: string) => Promise<string | { error: string }>
  systemListAssets: () => Promise<{ name: string; path: string; type: 'image' | 'video'; size: number; mtime: number; url: string }[]>
  systemDeleteAsset: (path: string) => Promise<{ success: boolean; error?: string }>

  // Dependency tree
  packageDepTree: (name: string) => Promise<{ name: string; version: string; direct: string[]; optional: string[]; required: string[]; depDetails: Record<string, string[]> } | null>

  // Audit log
  dbLogCommand: (entry: { command: string; exit_code?: number; source?: string; session_id?: number }) => Promise<{ success: boolean }>
  dbGetAuditLog: (limit?: number) => Promise<{ id: number; command: string; exit_code: number | null; source: string; session_id: number | null; created_at: number }[]>
  dbClearAuditLog: () => Promise<{ success: boolean }>

  // Power profiles
  powerGetProfile: () => Promise<{ profile: string | null }>
  powerSetProfile: (profile: string) => Promise<{ success: boolean; error?: string }>

  // File picker
  dialogOpenFile: () => Promise<{ name: string; path: string; content: string; truncated: boolean } | { error: string } | null>

  // Journal log viewer
  journalGetLogs: (opts: { unit?: string; priority?: string; lines?: number; keyword?: string; since?: string }) => Promise<{ lines: string[]; error?: string }>

  // Startup apps manager
  startupList: () => Promise<{
    desktopEntries: { filename: string; path: string; name: string; exec: string; comment: string; icon: string; enabled: boolean }[]
    systemdServices: { unit: string; active: string; description: string }[]
  }>
  startupToggleDesktop: (p: { path: string; enabled: boolean }) => Promise<{ success: boolean; error?: string }>
  startupDeleteDesktop: (path: string) => Promise<{ success: boolean; error?: string }>
  startupToggleSystemd: (p: { unit: string; enable: boolean }) => Promise<{ success: boolean; error?: string }>

  // AI Memory
  memoryGetAll: () => Promise<{ id: number; fact: string; created_at: number }[]>
  memoryAdd: (fact: string) => Promise<{ success: boolean }>
  memoryDelete: (id: number) => Promise<{ success: boolean }>
  memoryClear: () => Promise<{ success: boolean }>

  // GPU VRAM
  gpuVramStats: () => Promise<{ success: boolean; used: number; total: number; free: number; gpuUtil: number }>

  // I/O tuning
  ioTuneForAi: (mode: 'ai' | 'default') => Promise<{ success: boolean; output?: string; error?: string }>

  // SCX sched-ext
  scxStatus: () => Promise<{ success: boolean; scheduler: string; mode: number; state: string; schedulers: string[]; error?: string }>
  scxSetScheduler: (p: { name: string; mode?: number }) => Promise<{ success: boolean; error?: string }>
  scxStop: () => Promise<{ success: boolean; error?: string }>
  scxMetrics: () => Promise<{ success: boolean; state: string; enableSeq: number; nrRejected: number; error?: string }>
  boreSetProfile: (profile: string) => Promise<{ success: boolean; output?: string; partial?: boolean; error?: string }>

  // Ollama VRAM & CPU tuning
  ollamaSetVramMode: (mode: 'max' | 'budget') => Promise<{ success: boolean; output?: string; error?: string }>
  ollamaPinVcache: () => Promise<{ success: boolean; output?: string; error?: string }>

  // CachyOS Hardware
  chwdDetect: () => Promise<{ success: boolean; output?: string; error?: string }>
  chwdInstall: (profile: string) => Promise<{ success: boolean; output?: string; error?: string }>
  cachyosRateMirrors: () => Promise<{ success: boolean; output?: string; error?: string }>
  fprintdStatus: () => Promise<{ success: boolean; active: boolean; devices: string }>

  on: (channel: string, callback: (...args: any[]) => void) => void
  removeListener: (channel: string) => void
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
