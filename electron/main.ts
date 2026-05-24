import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { exec, spawn } from 'node:child_process'
import { readFileSync, openSync } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import si from 'systeminformation'
import { setupOllamaHandlers, cancelAndPurge } from './ollama'
import { setupSystemHandlers } from './system'
import { setupRagHandlers } from './rag'
import { setupDbHandlers, startResourcePoller } from './db'
import { setupPtyHandlers } from './pty'
import { guardian } from './VortexGuardian'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null
let tray: Tray | null = null
let comfyProcess: any = null

async function startComfyUI() {
  const comfyDir = path.join(process.env.HOME || os.homedir(), '.comfyui-headless')
  const comfyPath = path.join(comfyDir, 'start-engine.sh')
  const logPath = path.join(app.getPath('userData'), 'comfyui.log')

  // If ComfyUI is already running, skip spawn — avoids broken stdout pipe on app restart
  try {
    await new Promise<void>((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: 8188, path: '/system_stats', method: 'GET', timeout: 1500 }, (res) => {
        res.resume()
        res.statusCode === 200 ? resolve() : reject(new Error('bad status'))
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
      req.end()
    })
    console.log('[Main] ComfyUI already running on :8188 — skipping spawn')
    return
  } catch { /* not running, proceed to spawn */ }

  console.log('[Main] Starting ComfyUI backend in:', comfyDir)
  // Use a file descriptor (not a pipe) so ComfyUI logs survive Vortex restarts without broken pipe
  const logFd = openSync(logPath, 'a')
  comfyProcess = spawn('bash', [comfyPath], {
    cwd: comfyDir,
    detached: true,
    stdio: ['ignore', logFd, logFd]
  })
  comfyProcess.unref()
}

function createTray() {
  const iconPath = path.join(
    process.env.HOME || os.homedir(),
    '.local/share/icons/hicolor/48x48/apps/vortex-agentic.png'
  )
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('Vortex Agentic')

  const menu = Menu.buildFromTemplate([
    {
      label: 'Show Vortex',
      click: () => {
        if (win) { win.show(); win.focus() }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        tray?.destroy()
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)

  tray.on('click', () => {
    if (!win) return
    win.isVisible() ? win.hide() : win.show()
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false,
    backgroundColor: '#08090b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  })

  win.webContents.on('before-input-event', (_, input) => {
    if (input.type === 'keyDown' && input.key === 'F5') win?.webContents.reload()
    if (input.type === 'keyDown' && input.key === 'F12') win?.webContents.toggleDevTools()
  })

  // Hide to tray on close instead of quitting — purge VRAM so GPU is freed while minimised
  win.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault()
      cancelAndPurge().catch(() => {})
      win?.hide()
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(process.env.DIST, 'index.html'))
  }

  if (win) {
    setupOllamaHandlers(win)
    setupSystemHandlers(win)
    setupRagHandlers(win)
    setupDbHandlers()
    startResourcePoller()
    setupPtyHandlers(win)
    guardian.init(win)
  }
}

// IPC Handlers
ipcMain.handle('exec-command', async (_, command: string) => {
  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      resolve({
        success: !error,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: error?.code || 0
      })
    })
  })
})

ipcMain.handle('open-external', async (_, url: string) => {
  await shell.openExternal(url)
  return { success: true }
})

ipcMain.handle('get-system-stats', async () => {
  const [cpu, mem, load, fsSize, networkStats, graphics] = await Promise.all([
    si.cpu(),
    si.mem(),
    si.currentLoad(),
    si.fsSize(),
    si.networkStats(),
    si.graphics()
  ])

  const mainDisk = fsSize.find((d: any) => d.mount === '/') || fsSize[0]
  const gpu = graphics.controllers[0] ?? null

  return {
    cpu: {
      manufacturer: cpu.manufacturer,
      brand: cpu.brand,
      speed: cpu.speed,
      cores: cpu.cores,
      load: load.currentLoad
    },
    memory: {
      total: mem.total,
      free: mem.free,
      used: mem.used,
      active: mem.active
    },
    storage: {
      used: mainDisk?.used || 0,
      size: mainDisk?.size || 0,
      use: mainDisk?.use || 0
    },
    network: {
      rx_sec: networkStats[0]?.rx_sec || 0,
      tx_sec: networkStats[0]?.tx_sec || 0,
      iface: networkStats[0]?.iface || 'detecting'
    },
    gpu: gpu ? {
      model:            gpu.model ?? gpu.name ?? 'GPU',
      utilizationGpu:   gpu.utilizationGpu   ?? 0,
      utilizationMemory: gpu.utilizationMemory ?? 0,
      memoryTotal:      gpu.memoryTotal ?? gpu.vram ?? 0,
      memoryUsed:       gpu.memoryUsed  ?? 0,
      temperatureGpu:   gpu.temperatureGpu ?? 0,
      powerDraw:        gpu.powerDraw   ?? 0,
      powerLimit:       gpu.powerLimit  ?? 0,
      fanSpeed:         gpu.fanSpeed    ?? 0,
      clockCore:        gpu.clockCore   ?? 0,
    } : null
  }
})

ipcMain.handle('dialog-open-file', async () => {
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [
      { name: 'Text / Code', extensions: ['txt','md','json','yaml','yml','toml','sh','bash','py','js','ts','tsx','jsx','rs','go','c','cpp','h','css','html','xml','csv','log','conf','cfg','ini','env'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  try {
    const raw = readFileSync(filePath, 'utf8')
    const MAX = 20_000
    return { name: path.basename(filePath), path: filePath, content: raw.slice(0, MAX), truncated: raw.length > MAX }
  } catch (e: any) {
    return { error: e.message }
  }
})

ipcMain.on('window-control', (_, action: 'minimize' | 'maximize' | 'close') => {
  if (!win) return
  switch (action) {
    case 'minimize': win.minimize(); break
    case 'maximize': win.isMaximized() ? win.unmaximize() : win.maximize(); break
    case 'close': win.hide(); break  // hide to tray instead of closing
  }
})

app.on('window-all-closed', () => {
  // Do not quit — app lives in the tray
})

app.on('before-quit', (event) => {
  if (!(app as any).isQuiting) {
    (app as any).isQuiting = true
    event.preventDefault()
    // Unload model from VRAM before exit; 3s cap so a stuck Ollama can't block shutdown
    Promise.race([cancelAndPurge(), new Promise(r => setTimeout(r, 3000))])
      .catch(() => {})
      .finally(() => app.quit())
  }
})

ipcMain.handle('show-context-menu', (event, props) => {
  const contents = event.sender
  const menu = Menu.buildFromTemplate([
    { label: 'Cut', role: 'cut', enabled: props.editFlags?.canCut },
    { label: 'Copy', role: 'copy', enabled: props.editFlags?.canCopy },
    { label: 'Paste', role: 'paste', enabled: props.editFlags?.canPaste },
    { type: 'separator' },
    { label: 'Select All', role: 'selectAll' },
    { type: 'separator' },
    {
      label: 'Inspect Element',
      click: () => contents.inspectElement(props.x, props.y)
    }
  ])
  menu.popup()
})

app.on('web-contents-created', (_, contents) => {
  contents.on('context-menu', (_, props) => {
    const menu = Menu.buildFromTemplate([
      { label: 'Cut', role: 'cut', enabled: props.editFlags.canCut },
      { label: 'Copy', role: 'copy', enabled: props.editFlags.canCopy },
      { label: 'Paste', role: 'paste', enabled: props.editFlags.canPaste },
      { type: 'separator' },
      { label: 'Select All', role: 'selectAll' },
      { type: 'separator' },
      {
        label: 'Inspect Element',
        click: () => contents.inspectElement(props.x, props.y)
      }
    ])
    menu.popup()
  })
})

// Called when user enters an AI tab — starts service if not already running
ipcMain.handle('ollama-service-start', async () => {
  try {
    const resp = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(1500) })
    if (resp.ok) return { ok: true, already: true }
  } catch { /* not running */ }
  return new Promise((resolve) => {
    exec('sudo systemctl start ollama', (err) => {
      if (err) {
        console.log('[Vortex] Ollama service start failed:', err.message)
        resolve({ ok: false, error: err.message })
      } else {
        console.log('[Vortex] Ollama service started')
        resolve({ ok: true, already: false })
      }
    })
  })
})

// Called when user leaves all AI tabs — stops service to fully free VRAM
ipcMain.handle('ollama-service-stop', async () => {
  return new Promise((resolve) => {
    exec('sudo systemctl stop ollama', (err) => {
      if (err) console.log('[Vortex] Ollama service stop failed:', err.message)
      else console.log('[Vortex] Ollama service stopped')
      resolve({ ok: !err })
    })
  })
})

app.whenReady().then(async () => {
  await startComfyUI()
  createWindow()
  createTray()
})
