import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  execCommand: (command: string) => ipcRenderer.invoke('exec-command', command),
  getSystemStats: () => ipcRenderer.invoke('get-system-stats'),
  windowControl: (action: 'minimize' | 'maximize' | 'close') => ipcRenderer.send('window-control', action),
  
  // Ollama
  ollamaListModels: () => ipcRenderer.invoke('ollama-list-models'),
  ollamaChat: (payload: { model: string, messages: any[], customPrompt?: string }) => ipcRenderer.invoke('ollama-chat', payload),
  ollamaAgenticChat: (payload: { model: string, messages: any[], customPrompt?: string }) => ipcRenderer.invoke('ollama-agentic-chat', payload),
  ollamaOrchestrate: (payload: { model: string, messages: any[], customPrompt?: string, searxngUrl?: string }) => ipcRenderer.invoke('ollama-orchestrate', payload),
  ollamaPullModel: (payload: { name: string }) => ipcRenderer.invoke('ollama-pull-model', payload),
  ollamaDeleteModel: (payload: { name: string }) => ipcRenderer.invoke('ollama-delete-model', payload),
  ollamaCancel: () => ipcRenderer.invoke('ollama-cancel'),
  ollamaPurge: () => ipcRenderer.invoke('ollama-purge'),
  ollamaServiceStart: () => ipcRenderer.invoke('ollama-service-start'),
  ollamaServiceStop: () => ipcRenderer.invoke('ollama-service-stop'),

  // System
  systemCheckUpdates: () => ipcRenderer.invoke('system-check-updates'),
  systemUpgrade: () => ipcRenderer.invoke('system-upgrade'),
  aiUpdateComponents: () => ipcRenderer.invoke('ai-update-components'),
  comfyPurge: () => ipcRenderer.invoke('comfy-purge'),
  systemCleanup: (type: 'cache' | 'orphans' | 'logs' | 'all') => ipcRenderer.invoke('system-cleanup', type),
  systemOptimize: (type: 'ssd' | 'services' | 'performance') => ipcRenderer.invoke('system-optimize', type),
  systemGetLogs: (lines?: number) => ipcRenderer.invoke('system-get-logs', lines),
  systemGetErrorLogs: (lines?: number) => ipcRenderer.invoke('system-get-error-logs', lines),

  // RAG
  ragSelectProject: () => ipcRenderer.invoke('rag-select-project'),
  ragGetContext: (query: string) => ipcRenderer.invoke('rag-get-context', query),
  ragStatus: () => ipcRenderer.invoke('rag-status'),
  ragClearCache: () => ipcRenderer.invoke('rag-clear-cache'),

  // DB / Audit Log
  dbLogCommand: (entry: { command: string; exit_code?: number; source?: string; session_id?: number }) => ipcRenderer.invoke('db-log-command', entry),
  dbGetAuditLog: (limit?: number) => ipcRenderer.invoke('db-get-audit-log', limit),
  dbClearAuditLog: () => ipcRenderer.invoke('db-clear-audit-log'),

  // DB / Persistence — Sessions
  dbGetSessions: () => ipcRenderer.invoke('db-get-sessions'),
  dbCreateSession: (name?: string) => ipcRenderer.invoke('db-create-session', name),
  dbRenameSession: (p: { id: number; name: string }) => ipcRenderer.invoke('db-rename-session', p),
  dbDeleteSession: (id: number) => ipcRenderer.invoke('db-delete-session', id),
  dbTouchSession: (id: number) => ipcRenderer.invoke('db-touch-session', id),
  // DB / Persistence — Messages
  dbGetMessages: (sessionId?: number) => ipcRenderer.invoke('db-get-messages', sessionId),
  dbSaveMessage: (msg: { role: string; content: string; sessionId?: number }) => ipcRenderer.invoke('db-save-message', msg),
  dbClearMessages: (sessionId?: number) => ipcRenderer.invoke('db-clear-messages', sessionId),

  // PTY / Terminal
  ptyGetDefaultTab: () => ipcRenderer.invoke('pty-get-default-tab'),
  ptyListTabs: () => ipcRenderer.invoke('pty-list-tabs'),
  ptyCreate: () => ipcRenderer.invoke('pty-create'),
  ptyClose: (tabId: string) => ipcRenderer.invoke('pty-close', tabId),
  ptySetActive: (tabId: string) => ipcRenderer.invoke('pty-set-active', tabId),
  ptyWrite: (payload: { tabId?: string; command: string } | string) => ipcRenderer.invoke('pty-write', payload),
  ptyGetBuffer: (tabId?: string) => ipcRenderer.invoke('pty-get-buffer', tabId),

  // Network
  networkStats: () => ipcRenderer.invoke('network-stats'),
  networkConnections: () => ipcRenderer.invoke('network-connections'),

  // Processes
  processList: () => ipcRenderer.invoke('process-list'),
  processKill: (p: { pid: number; signal?: string }) => ipcRenderer.invoke('process-kill', p),

  // Systemd
  systemdListUnits: () => ipcRenderer.invoke('systemd-list-units'),
  systemdControlUnit: (p: { unit: string; action: string }) => ipcRenderer.invoke('systemd-control-unit', p),
  systemdUnitLogs: (p: { unit: string; lines?: number }) => ipcRenderer.invoke('systemd-unit-logs', p),

  // Packages
  packageDetectHelper: () => ipcRenderer.invoke('package-detect-helper'),
  packageSearch: (query: string) => ipcRenderer.invoke('package-search', query),
  packageListAur: () => ipcRenderer.invoke('package-list-aur'),
  packageInfo: (name: string) => ipcRenderer.invoke('package-info', name),
  packageInstall: (p: { name: string; helper: string }) => ipcRenderer.invoke('package-install', p),
  packageRemove: (name: string) => ipcRenderer.invoke('package-remove', name),

  // Boot analyser
  systemAnalyzeBoot: () => ipcRenderer.invoke('system-analyze-boot'),

  // Disk monitor
  diskInfo: () => ipcRenderer.invoke('disk-info'),
  diskSmart: (device: string) => ipcRenderer.invoke('disk-smart', device),

  // Assets
  systemSaveAsset: (p: { url: string; type: 'image' | 'video'; filename?: string }) => ipcRenderer.invoke('system-save-asset', p),
  systemReadLocalImage: (path: string) => ipcRenderer.invoke('system-read-local-image', path),
  systemListAssets: () => ipcRenderer.invoke('system-list-assets'),
  systemDeleteAsset: (path: string) => ipcRenderer.invoke('system-delete-asset', path),

  // Dependency tree
  packageDepTree: (name: string) => ipcRenderer.invoke('package-dep-tree', name),
  packageGetTree: (name: string) => ipcRenderer.invoke('package-dep-tree', name),

  // Power profiles
  powerGetProfile: () => ipcRenderer.invoke('power-get-profile'),
  powerSetProfile: (profile: string) => ipcRenderer.invoke('power-set-profile', profile),

  // File picker
  dialogOpenFile: () => ipcRenderer.invoke('dialog-open-file'),

  // Journal log viewer
  journalGetLogs: (opts: { unit?: string; priority?: string; lines?: number; keyword?: string; since?: string }) =>
    ipcRenderer.invoke('journal-get-logs', opts),

  // Startup apps manager
  startupList: () => ipcRenderer.invoke('startup-list'),
  startupToggleDesktop: (p: { path: string; enabled: boolean }) => ipcRenderer.invoke('startup-toggle-desktop', p),
  startupDeleteDesktop: (path: string) => ipcRenderer.invoke('startup-delete-desktop', path),
  startupToggleSystemd: (p: { unit: string; enable: boolean }) => ipcRenderer.invoke('startup-toggle-systemd', p),

  // AI Memory
  memoryGetAll: () => ipcRenderer.invoke('memory-get-all'),
  memoryAdd: (fact: string) => ipcRenderer.invoke('memory-add', fact),
  memoryDelete: (id: number) => ipcRenderer.invoke('memory-delete', id),
  memoryClear: () => ipcRenderer.invoke('memory-clear'),
  dbGetResourceHistory: (hours?: number) => ipcRenderer.invoke('db-get-resource-history', hours),

  // Docker
  dockerList: () => ipcRenderer.invoke('docker-list'),
  dockerControl: (p: { id: string; action: string }) => ipcRenderer.invoke('docker-control', p),
  dockerLogs: (p: { id: string; lines?: number }) => ipcRenderer.invoke('docker-logs', p),
  gpuVramStats: () => ipcRenderer.invoke('gpu-vram-stats'),
  ioTuneForAi: (mode: 'ai' | 'default') => ipcRenderer.invoke('io-tune-for-ai', mode),
  scxStatus: () => ipcRenderer.invoke('scx-status'),
  scxSetScheduler: (p: { name: string; mode?: number }) => ipcRenderer.invoke('scx-set-scheduler', p),
  scxStop: () => ipcRenderer.invoke('scx-stop'),
  scxMetrics: () => ipcRenderer.invoke('scx-metrics'),
  boreSetProfile: (profile: string) => ipcRenderer.invoke('bore-set-profile', profile),
  ollamaSetVramMode: (mode: 'max' | 'budget') => ipcRenderer.invoke('ollama-set-vram-mode', mode),
  ollamaPinVcache: () => ipcRenderer.invoke('ollama-pin-vcache'),
  chwdDetect: () => ipcRenderer.invoke('chwd-detect'),
  chwdInstall: (profile: string) => ipcRenderer.invoke('chwd-install', profile),
  cachyosRateMirrors: () => ipcRenderer.invoke('cachyos-rate-mirrors'),
  fprintdStatus: () => ipcRenderer.invoke('fprintd-status'),
  systemSnapperSnapshot: (desc?: string) => ipcRenderer.invoke('system-snapper-snapshot', desc),
  systemSnapperList: () => ipcRenderer.invoke('system-snapper-list'),
  systemSnapperCreate: (p: { description: string }) => ipcRenderer.invoke('system-snapper-create', p),
  systemSnapperDelete: (p: { id: string }) => ipcRenderer.invoke('system-snapper-delete', p),
  systemSnapperRollback: (p: { id: string }) => ipcRenderer.invoke('system-snapper-rollback', p),
  gpuVramSqueeze: () => ipcRenderer.invoke('gpu-vram-squeeze'),
  gameModeToggle: (enable: boolean) => ipcRenderer.invoke('game-mode-toggle', enable),
  winboatDetect: () => ipcRenderer.invoke('winboat-detect'),
  winboatRun: (path: string) => ipcRenderer.invoke('winboat-run', path),
  systemAuditArch: () => ipcRenderer.invoke('system-audit-arch'),
  systemRebuildNative: (pkg: string) => ipcRenderer.invoke('system-rebuild-native', pkg),
  guardianToggle: (enable: boolean) => ipcRenderer.invoke('guardian-toggle', enable),
  guardianStatus: () => ipcRenderer.invoke('guardian-status'),

  on: (channel: string, callback: (...args: any[]) => void) => {
    const listener = (_: any, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
  removeListener: (channel: string, listener?: (...args: any[]) => void) => {
    if (listener) ipcRenderer.removeListener(channel, listener)
    else ipcRenderer.removeAllListeners(channel)
  },
  // App Launcher
  appsList: () => ipcRenderer.invoke('apps-list'),
  appsLaunch: (p: { exec: string }) => ipcRenderer.invoke('apps-launch', p),

  // Arch News
  archNewsFetch: () => ipcRenderer.invoke('arch-news-fetch'),

  // Dotfile Vault
  vaultListBackups: () => ipcRenderer.invoke('vault-list-backups'),
  vaultCreate: (p: { paths: string[] }) => ipcRenderer.invoke('vault-create', p),
  vaultRestore: (p: { filename: string }) => ipcRenderer.invoke('vault-restore', p),
  vaultDelete: (p: { filename: string }) => ipcRenderer.invoke('vault-delete', p),

  // Benchmark
  benchmarkRun: (payload: { tests: string[] }) => ipcRenderer.invoke('benchmark-run', payload),

  // UFW
  ufwStatus: () => ipcRenderer.invoke('ufw-status'),
  ufwEnable: (enable: boolean) => ipcRenderer.invoke('ufw-enable', enable),
  ufwAddRule: (rule: { port: string; proto: string; action: string; from: string; comment: string }) => ipcRenderer.invoke('ufw-add-rule', rule),
  ufwDeleteRule: (num: number) => ipcRenderer.invoke('ufw-delete-rule', num),

  // SSH
  sshListKeys: () => ipcRenderer.invoke('ssh-list-keys'),
  sshGenerateKey: (p: { type: string; bits?: number; comment: string; filename: string }) => ipcRenderer.invoke('ssh-generate-key', p),
  sshDeleteKey: (p: { name: string }) => ipcRenderer.invoke('ssh-delete-key', p),

  // Cron
  cronList: () => ipcRenderer.invoke('cron-list'),
  cronSave: (payload: { entries: any[] }) => ipcRenderer.invoke('cron-save', payload),

  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  showContextMenu: (props: any) => ipcRenderer.invoke('show-context-menu', props)
})
