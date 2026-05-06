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
  ollamaPullModel: (payload: { name: string }) => Promise<{ success: boolean; error?: string }>
  ollamaDeleteModel: (payload: { name: string }) => Promise<{ success: boolean; error?: string }>
  ollamaCancel: () => Promise<{ success: boolean }>
  ollamaPurge: () => Promise<{ success: boolean }>

  // System
  systemCheckUpdates: () => Promise<{ repo: string[]; aur: string[] }>
  systemUpgrade: () => Promise<{ success: boolean; output: string; error?: string }>
  aiUpdateComponents: () => Promise<{ success: boolean; log: string }>
  systemCleanup: (type: 'cache' | 'orphans' | 'logs' | 'all') => Promise<{ success: boolean; output: string; error?: string }>
  systemOptimize: (type: 'ssd' | 'services' | 'performance') => Promise<{ success: boolean; output?: string; error?: string }>
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
  dbGetResourceHistory: (hours?: number) => Promise<{ ts: number; cpu: number; ram: number; gpu: number; disk: number; net_rx: number }[]>

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
  systemSnapperSnapshot: (desc?: string) => Promise<{ success: boolean; output?: string; error?: string }>
  systemSnapperList: () => Promise<{ success: boolean; snapshots: { id: string; type: string; date: string; description: string; usedSpace: string }[]; error?: string }>
  systemSnapperCreate: (p: { description: string }) => Promise<{ success: boolean; id?: string; error?: string }>
  systemSnapperDelete: (p: { id: string }) => Promise<{ success: boolean; error?: string }>
  systemSnapperRollback: (p: { id: string }) => Promise<{ success: boolean; output?: string; error?: string }>
  gpuVramSqueeze: () => Promise<{ success: boolean; output?: string; error?: string }>
  gameModeToggle: (enable: boolean) => Promise<{ success: boolean; log: string }>
  winboatDetect: () => Promise<{ success: boolean }>
  winboatRun: (path: string) => Promise<{ success: boolean; output?: string; error?: string }>
  systemAuditArch: () => Promise<{ success: boolean; packages: { name: string; repo: string; isGeneric: boolean }[]; error?: string }>
  systemRebuildNative: (pkg: string) => Promise<{ success: boolean; log: string }>
  guardianToggle: (enable: boolean) => Promise<{ success: boolean; enabled: boolean }>
  guardianStatus: () => Promise<{ enabled: boolean; activeOptimization: string }>

  // RAG
  ragSelectProject: () => Promise<{ path: string; fileCount: number; cached?: boolean; indexing?: boolean } | null>
  ragGetContext: (query: string) => Promise<string>
  ragStatus: () => Promise<{ path: string | null; fileCount: number }>
  ragClearCache: () => Promise<{ success: boolean }>

  // App Launcher
  appsList: () => Promise<{ success: boolean; apps: { name: string; exec: string; comment: string; categories: string; icon: string; path: string }[]; error?: string }>
  appsLaunch: (p: { exec: string }) => Promise<{ success: boolean; error?: string }>

  // Arch News
  archNewsFetch: () => Promise<{ success: boolean; items: { title: string; link: string; date: string; summary: string }[]; error?: string }>

  // Dotfile Vault
  vaultListBackups: () => Promise<{ success: boolean; backups: { filename: string; ts: number; path: string }[]; error?: string }>
  vaultCreate: (p: { paths: string[] }) => Promise<{ success: boolean; filename?: string; error?: string }>
  vaultRestore: (p: { filename: string }) => Promise<{ success: boolean; error?: string }>
  vaultDelete: (p: { filename: string }) => Promise<{ success: boolean; error?: string }>

  // Benchmark
  benchmarkRun: (payload: { tests: string[] }) => Promise<{ success: boolean; results: Record<string, { score: number; unit: string; detail: string }>; error?: string }>

  // UFW
  ufwStatus: () => Promise<{ success: boolean; enabled: boolean; rules: { to: string; action: string; from: string; comment: string }[]; raw: string; error?: string }>
  ufwEnable: (enable: boolean) => Promise<{ success: boolean; output?: string; error?: string }>
  ufwAddRule: (rule: { port: string; proto: string; action: string; from: string; comment: string }) => Promise<{ success: boolean; error?: string }>
  ufwDeleteRule: (num: number) => Promise<{ success: boolean; error?: string }>

  // SSH
  sshListKeys: () => Promise<{ success: boolean; keys: { name: string; pubFile: string; privFile: string; type: string; fingerprint: string; comment: string; pubKey: string }[]; error?: string }>
  sshGenerateKey: (p: { type: string; bits?: number; comment: string; filename: string }) => Promise<{ success: boolean; error?: string }>
  sshDeleteKey: (p: { name: string }) => Promise<{ success: boolean; error?: string }>

  // Cron
  cronList: () => Promise<{ success: boolean; entries: { id: string; min: string; hour: string; dom: string; month: string; dow: string; command: string; comment: string; enabled: boolean }[]; error?: string }>
  cronSave: (payload: { entries: { min: string; hour: string; dom: string; month: string; dow: string; command: string; comment: string }[] }) => Promise<{ success: boolean; error?: string }>

  on: (channel: string, callback: (...args: any[]) => void) => (() => void)
  removeListener: (channel: string, listener?: (...args: any[]) => void) => void
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
