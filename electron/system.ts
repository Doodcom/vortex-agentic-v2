import { ipcMain, dialog } from 'electron'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import { readFileSync, readdirSync, existsSync, unlinkSync, statSync, writeFileSync } from 'fs'
import { join, extname, resolve } from 'path'
import { homedir, tmpdir } from 'os'
import axios from 'axios'
import si from 'systeminformation'

const execPromise = promisify(exec)

async function detectAurHelper(candidates = ['paru', 'yay', 'trizen']): Promise<string> {
  for (const h of candidates) {
    try { await execPromise(`which ${h}`); return h } catch {}
  }
  return 'pacman'
}

export function setupSystemHandlers(win: any) {
  const notify = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    win.webContents.send('notification', { title, message, type })
  }

  const streamLog = (text: string) => {
    win.webContents.send('update-log', text)
  }

  ipcMain.handle('system-check-updates', async () => {
    const [repo, aur] = await Promise.all([
      execPromise('checkupdates')
        .then(({ stdout }) => stdout.trim().split('\n').filter(Boolean))
        .catch(() => [] as string[]),
      (async () => {
        for (const helper of ['paru', 'yay']) {
          try {
            const { stdout } = await execPromise(`${helper} -Qua`)
            return stdout.trim().split('\n').filter(Boolean)
          } catch {}
        }
        return [] as string[]
      })()
    ])
    return { repo, aur }
  })

  ipcMain.handle('system-save-asset', async (_, { url, type, filename }: { url: string; type: 'image' | 'video'; filename?: string }) => {
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' })
      const buffer = Buffer.from(response.data)
      const folder = type === 'image' ? 'AI Images' : 'AI Video'
      const ext = type === 'image' ? 'png' : 'mp4'
      const name = filename || `vortex-${type}-${Date.now()}.${ext}`
      const targetDir = join(homedir(), 'Pictures', folder)

      await execPromise(`mkdir -p "${targetDir}"`)

      const targetPath = join(targetDir, name)
      const tmpPath = join(tmpdir(), `vortex-asset-${Date.now()}.${ext}`)
      writeFileSync(tmpPath, buffer)
      // Move with idle I/O class so generation pipeline is not starved
      await execPromise(`ionice -c 3 -n 7 mv "${tmpPath}" "${targetPath}"`)

      return { success: true, path: targetPath }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('system-read-local-image', async (_, filePath: string) => {
    try {
      const cleanPath = filePath.replace(/^~/, homedir())
      const buffer = readFileSync(cleanPath)
      const ext = cleanPath.split('.').pop()?.toLowerCase() || 'png'
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png'
      return `data:${mime};base64,${buffer.toString('base64')}`
    } catch (e: any) {
      return { error: e.message }
    }
  })

  // Helper for streaming command execution
  const runStreamingCmd = (cmd: string, args: string[], options: any = {}) => {
    return new Promise<{ success: boolean; log: string }>((resolve) => {
      let fullLog = ''
      let pendingLog = ''
      let lastSend = Date.now()
      const MAX_LOG_SIZE = 100_000 // Prevent memory leaks

      const child = spawn(cmd, args, {
        ...options,
        env: { ...process.env, ...options.env, DISPLAY: process.env.DISPLAY || ':0' }
      })

      const flush = () => {
        if (pendingLog) {
          // Clean up progress bars and excessive noise
          const clean = pendingLog.replace(/\r/g, '\n').split('\n').filter(l => l.trim()).join('\n')
          if (clean) streamLog(clean)
          pendingLog = ''
          lastSend = Date.now()
        }
      }

      const MAX_PENDING = 8_000
      const throttleSend = (text: string) => {
        pendingLog += text
        // Prevent unbounded growth between flushes (e.g. ollama progress bursts)
        if (pendingLog.length > MAX_PENDING) pendingLog = pendingLog.slice(-MAX_PENDING)
        if (fullLog.length < MAX_LOG_SIZE) fullLog += text

        if (Date.now() - lastSend > 200) { // 5fps cap for UI updates
          flush()
        }
      }

      child.stdout?.on('data', (data) => throttleSend(data.toString()))
      child.stderr?.on('data', (data) => throttleSend(`[ERR] ${data.toString()}`))

      child.on('close', (code) => {
        flush()
        resolve({ success: code === 0, log: fullLog })
      })

      child.on('error', (err) => {
        flush()
        streamLog(`Fatal: ${err.message}`)
        resolve({ success: false, log: err.message })
      })
    })
  }

  ipcMain.handle('system-upgrade', async () => {
    // 2026 Best Practice: Auto-snapshot before full system upgrade
    try { await execPromise('pkexec snapper -c root create -t pre -p -d "Vortex system upgrade"') } catch {}

    const helper = await detectAurHelper()
    streamLog(`> Starting system upgrade via ${helper}...`)
    
    let cmd = 'pkexec'
    let args = ['pacman', '-Syu', '--noconfirm']

    if (helper === 'yay' || helper === 'paru') {
      cmd = helper
      args = ['-Syu', '--noconfirm', '--sudo', 'pkexec']
    }

    const res = await runStreamingCmd(cmd, args)
    return { success: res.success, log: res.success ? 'Upgrade completed.' : 'Upgrade failed or cancelled.' }
  })

  ipcMain.handle('ai-update-components', async () => {
    // Auto-snapshot before AI stack update
    try { await execPromise('pkexec snapper -c root create -t pre -p -d "Vortex AI update"') } catch {}

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

  // System Cleanup
  ipcMain.handle('system-cleanup', async (_, type: 'cache' | 'orphans' | 'logs' | 'all') => {
    const commands: Record<string, string> = {
      cache: 'paccache -r -k 1',
      orphans: 'pacman -Qtdq && pacman -Rns $(pacman -Qtdq) || echo "No orphans to remove"',
      logs: 'journalctl --vacuum-time=3d',
      all: 'paccache -r -k 1 && journalctl --vacuum-time=3d'
    }

    if (!Object.prototype.hasOwnProperty.call(commands, type)) {
      return { success: false, error: 'Invalid cleanup type' }
    }

    try {
      const { stdout, stderr } = await execPromise(`pkexec bash -c '${commands[type]}'`)
      return { success: true, output: stdout || stderr }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ComfyUI VRAM Purge
  ipcMain.handle('comfy-purge', async () => {
    try {
      await axios.post('http://127.0.0.1:8188/free', { unload_models: true, free_memory: true })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // System Optimization
  ipcMain.handle('system-optimize', async (_, type: 'ssd' | 'services' | 'performance') => {
    const commands: Record<string, string> = {
      ssd: 'fstrim -av',
      services: 'systemctl reset-failed',
      performance: 'cpupower frequency-set -g performance'
    }

    if (!Object.prototype.hasOwnProperty.call(commands, type)) {
      return { success: false, error: 'Invalid optimize type' }
    }

    try {
      const cmd = type === 'services' ? commands[type] : `pkexec ${commands[type]}`
      const { stdout, stderr } = await execPromise(cmd)
      return { success: true, output: stdout || stderr }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // AI Log Diagnosis (Get last logs)
  ipcMain.handle('system-get-logs', async (_, lines = 50) => {
    const safeLines = Math.max(10, Math.min(10000, parseInt(String(lines), 10) || 50))
    try {
      const { stdout } = await execPromise(`journalctl -n ${safeLines} --no-pager`)
      return stdout
    } catch (error: any) {
      return `Failed to fetch logs: ${error.message}`
    }
  })

  ipcMain.handle('system-get-error-logs', async (_, lines = 50) => {
    const safeLines = Math.max(10, Math.min(10000, parseInt(String(lines), 10) || 50))
    try {
      const { stdout } = await execPromise(`journalctl -p 3 -n ${safeLines} --no-pager`)
      return stdout
    } catch (error: any) {
      return `Failed to fetch error logs: ${error.message}`
    }
  })

  // ── Network ───────────────────────────────────────────────────────────────
  ipcMain.handle('network-stats', async () => {
    const [ifaces, stats] = await Promise.all([si.networkInterfaces(), si.networkStats()])
    const ifaceMap: Record<string, any> = {}
    const ifaceArr = Array.isArray(ifaces) ? ifaces : [ifaces]
    ifaceArr.forEach((i: any) => { ifaceMap[i.iface] = i })
    return (Array.isArray(stats) ? stats : [stats]).map((s: any) => ({
      iface:     s.iface,
      rx_sec:    s.rx_sec   ?? 0,
      tx_sec:    s.tx_sec   ?? 0,
      rx_bytes:  s.rx_bytes ?? 0,
      tx_bytes:  s.tx_bytes ?? 0,
      operstate: ifaceMap[s.iface]?.operstate ?? 'unknown',
      ip4:       ifaceMap[s.iface]?.ip4       ?? '',
      mac:       ifaceMap[s.iface]?.mac       ?? '',
      type:      ifaceMap[s.iface]?.type      ?? '',
    }))
  })

  ipcMain.handle('network-connections', async () => {
    const [conns, procs] = await Promise.all([si.networkConnections(), si.processes()])
    const pidMap: Record<number, string> = {}
    procs.list?.forEach((p: any) => { pidMap[p.pid] = p.name })
    return conns.map((c: any) => ({
      protocol:  c.protocol,
      localaddr: c.localAddress,
      localport: String(c.localPort),
      peeraddr:  c.peerAddress,
      peerport:  String(c.peerPort),
      state:     c.state,
      pid:       c.pid ?? 0,
      process:   pidMap[c.pid] ?? '',
    }))
  })

  // ── Processes ─────────────────────────────────────────────────────────────
  ipcMain.handle('process-list', async () => {
    const { list } = await si.processes()
    return list.map((p: any) => ({
      pid:    p.pid,
      name:   p.name,
      cpu:    p.cpu    ?? 0,
      mem:    p.mem    ?? 0,
      memRss: p.memRss ?? 0,
      command: p.command ?? p.name,
      user:   p.user   ?? '',
      state:  p.state  ?? '',
      started: p.started ?? '',
    }))
  })

  ipcMain.handle('process-kill', async (_, { pid, signal = 'SIGTERM' }: { pid: number; signal?: string }) => {
    try {
      await execPromise(`kill -${signal} ${pid}`)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // ── Systemd ───────────────────────────────────────────────────────────────
  ipcMain.handle('systemd-list-units', async () => {
    try {
      const { stdout } = await execPromise('systemctl list-units --type=service --all --no-pager --plain --no-legend')
      return stdout.trim().split('\n').filter(Boolean).map(line => {
        const parts = line.trim().split(/\s+/)
        return {
          unit:        parts[0] ?? '',
          load:        parts[1] ?? '',
          active:      parts[2] ?? '',
          sub:         parts[3] ?? '',
          description: parts.slice(4).join(' '),
        }
      })
    } catch (e: any) {
      return []
    }
  })

  ipcMain.handle('systemd-control-unit', async (_, { unit, action }: { unit: string; action: string }) => {
    try {
      const safe = unit.replace(/[^a-zA-Z0-9@._-]/g, '')
      const safeAction = ['start','stop','restart','enable','disable','reload'].includes(action) ? action : 'status'
      const { stdout, stderr } = await execPromise(`pkexec systemctl ${safeAction} ${safe}`)
      return { success: true, output: stdout || stderr }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('systemd-unit-logs', async (_, { unit, lines = 50 }: { unit: string; lines?: number }) => {
    try {
      const safe = unit.replace(/[^a-zA-Z0-9@._-]/g, '')
      const { stdout } = await execPromise(`journalctl -u ${safe} -n ${lines} --no-pager`)
      return stdout
    } catch (e: any) {
      return `Failed to fetch logs: ${e.message}`
    }
  })

  // ── Boot analyser ─────────────────────────────────────────────────────────
  ipcMain.handle('system-analyze-boot', async () => {
    try {
      const [summaryRes, blameRes] = await Promise.all([
        execPromise('systemd-analyze').catch(() => ({ stdout: '' })),
        execPromise('systemd-analyze blame --no-pager').catch(() => ({ stdout: '' }))
      ])
      const units: { time_ms: number; unit: string }[] = []
      blameRes.stdout.trim().split('\n').filter(Boolean).forEach(line => {
        const m = line.trim().match(/^([\d.]+)(ms|s|min)\s+(.+)/)
        if (!m) return
        let ms = parseFloat(m[1])
        if (m[2] === 's') ms *= 1000
        if (m[2] === 'min') ms *= 60000
        units.push({ time_ms: Math.round(ms), unit: m[3].trim() })
      })
      return { summary: summaryRes.stdout.trim(), units }
    } catch (e: any) {
      return { summary: e.message, units: [] }
    }
  })

  // ── Disk ──────────────────────────────────────────────────────────────────
  ipcMain.handle('disk-info', async () => {
    const [layout, fsSize] = await Promise.all([si.diskLayout(), si.fsSize()])
    return {
      layout: layout.map((d: any) => ({
        device:     d.device,
        name:       d.name,
        type:       d.type,
        size:       d.size,
        vendor:     d.vendor,
        model:      d.model,
        serial:     d.serialNum,
        firmwareRevision: d.firmwareRevision,
        smartStatus: d.smartStatus,
      })),
      filesystems: fsSize.map((f: any) => ({
        fs:    f.fs,
        type:  f.type,
        size:  f.size,
        used:  f.used,
        use:   f.use,
        mount: f.mount,
      })),
    }
  })

  ipcMain.handle('disk-smart', async (_, device: string) => {
    try {
      const safe = device.replace(/[^a-zA-Z0-9/_-]/g, '')
      const { stdout } = await execPromise(`pkexec smartctl -H -A ${safe}`)
      const health = /SMART overall-health.*: PASSED/i.test(stdout) ? 'PASSED'
                   : /SMART overall-health.*: FAILED/i.test(stdout) ? 'FAILED' : 'UNKNOWN'
      const tempMatch = stdout.match(/Temperature[^0-9]*(\d+)\s+\(/i)
      const temp = tempMatch ? parseInt(tempMatch[1]) : null
      return { health, temp }
    } catch {
      return { health: 'UNKNOWN', temp: null }
    }
  })

  // ── Assets / Gallery ──────────────────────────────────────────────────────
  ipcMain.handle('system-list-assets', async () => {
    const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
    const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.mkv'])
    const dirs = [
      { dir: join(homedir(), 'Pictures', 'AI Images'), type: 'image' },
      { dir: join(homedir(), 'Pictures', 'AI Video'),  type: 'video' },
    ]
    const assets: any[] = []
    for (const { dir, type } of dirs) {
      if (!existsSync(dir)) continue
      try {
        const files = readdirSync(dir)
        for (const f of files) {
          const ext = extname(f).toLowerCase()
          const isImg = IMAGE_EXTS.has(ext)
          const isVid = VIDEO_EXTS.has(ext)
          if (!isImg && !isVid) continue
          const fullPath = join(dir, f)
          const stat = statSync(fullPath)
          assets.push({
            name:  f,
            path:  fullPath,
            type:  isImg ? 'image' : 'video',
            size:  stat.size,
            mtime: stat.mtimeMs,
            url:   `vortex-asset://${fullPath}`,
          })
        }
      } catch { /* skip unreadable dirs */ }
    }
    assets.sort((a, b) => b.mtime - a.mtime)
    return assets
  })

  ipcMain.handle('system-delete-asset', async (_, filePath: string) => {
    try {
      const allowed = join(homedir(), 'Pictures')
      if (!resolve(filePath).startsWith(allowed)) return { success: false, error: 'Path outside allowed directory' }
      unlinkSync(filePath)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // ── Packages ──────────────────────────────────────────────────────────────
  ipcMain.handle('package-detect-helper', async () => detectAurHelper())

  ipcMain.handle('package-search', async (_, query: string) => {
    const q = query.replace(/[^a-zA-Z0-9._+-]/g, '')
    try {
      const { stdout } = await execPromise(`pacman -Ss ${q}`)
      const results: any[] = []
      const lines = stdout.trim().split('\n')
      let i = 0
      while (i < lines.length) {
        const header = lines[i++]
        const desc = (lines[i] || '').trim()
        if (!header.includes('/')) { i++; continue }
        const [repoPkg, versionRaw] = header.split(/\s+/)
        const [repo, name] = repoPkg.split('/')
        const installed = versionRaw?.includes('[installed]') || (lines[i - 1] || '').includes('[installed]')
        results.push({ repo: repo ?? 'repo', name: name ?? repoPkg, version: versionRaw?.replace(/\[.*?\]/g, '').trim() ?? '', description: desc, installed, source: 'repo' })
        i++
      }
      return results
    } catch { return [] }
  })

  ipcMain.handle('package-list-aur', async () => {
    for (const helper of ['paru', 'yay']) {
      try {
        const { stdout } = await execPromise(`${helper} -Qm`)
        return stdout.trim().split('\n').filter(Boolean).map(line => {
          const [name, version] = line.split(/\s+/)
          return { name, version: version ?? '' }
        })
      } catch {}
    }
    return []
  })

  ipcMain.handle('package-info', async (_, name: string) => {
    const safe = name.replace(/[^a-zA-Z0-9._+-]/g, '')
    try {
      const { stdout } = await execPromise(`pacman -Si ${safe}`).catch(() => execPromise(`pacman -Qi ${safe}`))
      const info: Record<string, string> = {}
      stdout.split('\n').forEach(line => {
        const m = line.match(/^([^:]+)\s*:\s*(.+)/)
        if (m) info[m[1].trim()] = m[2].trim()
      })
      return info
    } catch { return null }
  })

  ipcMain.handle('package-install', async (_, { name, helper }: { name: string; helper: string }) => {
    const safe = name.replace(/[^a-zA-Z0-9._+-]/g, '')
    
    // 2026 Shelly Integration: Try native CachyOS GUI first
    try {
      const { stdout: hasShelly } = await execPromise('which shelly 2>/dev/null || true')
      if (hasShelly.trim()) {
        // Invoke Shelly via D-Bus for themed progress GUI
        await execPromise(`busctl call io.cachyos.Shelly /io/cachyos/Shelly io.cachyos.Shelly Install s "${safe}"`)
        return { success: true, output: `Installation of ${safe} handed off to Shelly.` }
      }
    } catch (e) {
      console.log('[Vortex] Shelly D-Bus handoff failed, falling back to CLI:', e)
    }

    const safeHelper = ['paru', 'yay', 'pacman'].includes(helper) ? helper : 'pacman'
    const cmd = safeHelper === 'pacman'
      ? `pkexec pacman -S --noconfirm ${safe}`
      : `${safeHelper} -S --noconfirm ${safe}`
    const res = await runStreamingCmd('bash', ['-c', cmd])
    return { success: res.success, output: res.log }
  })

  ipcMain.handle('package-remove', async (_, name: string) => {
    const safe = name.replace(/[^a-zA-Z0-9._+-]/g, '')
    
    // Try Shelly for removal too
    try {
      const { stdout: hasShelly } = await execPromise('which shelly 2>/dev/null || true')
      if (hasShelly.trim()) {
        await execPromise(`busctl call io.cachyos.Shelly /io/cachyos/Shelly io.cachyos.Shelly Remove s "${safe}"`)
        return { success: true, output: `Removal of ${safe} handed off to Shelly.` }
      }
    } catch {}

    const res = await runStreamingCmd('bash', ['-c', `pkexec pacman -Rns --noconfirm ${safe}`])
    return { success: res.success, output: res.log }
  })

  ipcMain.handle('package-dep-tree', async (_, name: string) => {
    const safe = name.replace(/[^a-zA-Z0-9._+-]/g, '')
    try {
      const { stdout } = await execPromise(`pactree -l ${safe}`)
      const lines = stdout.trim().split('\n').filter(Boolean)
      if (!lines.length) return null
      const root = { name: lines[0], children: [] as any[] }
      const stack: any[] = [root]
      for (let i = 1; i < lines.length; i++) {
        const node = { name: lines[i].trim(), children: [] as any[] }
        if (stack.length > 1) stack[stack.length - 2].children.push(node)
        else root.children.push(node)
      }
      return root
    } catch { return null }
  })

  // ── Power profiles ─────────────────────────────────────────────────────────
  ipcMain.handle('power-get-profile', async () => {
    try {
      const { stdout } = await execPromise('powerprofilesctl get')
      return { profile: stdout.trim() }
    } catch {
      try {
        const { stdout } = await execPromise('cat /sys/firmware/acpi/platform_profile')
        return { profile: stdout.trim() }
      } catch { return { profile: 'balanced' } }
    }
  })

  ipcMain.handle('power-set-profile', async (_, profile: string) => {
    const safe = ['power-saver', 'balanced', 'performance'].includes(profile) ? profile : 'balanced'
    try {
      await execPromise(`powerprofilesctl set ${safe}`)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // ── Journal / Log viewer ──────────────────────────────────────────────────
  ipcMain.handle('journal-get-logs', async (_, opts: { unit?: string; priority?: string; lines?: number; keyword?: string; since?: string } = {}) => {
    try {
      const args = ['journalctl', '--no-pager', '--output=short-iso']
      if (opts.unit)     args.push('-u', opts.unit.replace(/[^a-zA-Z0-9@._-]/g, ''))
      if (opts.priority) args.push('-p', String(parseInt(opts.priority)))
      if (opts.since)    args.push(`--since="${opts.since.replace(/[^0-9a-zA-Z :.\-]/g, '')}"`)
      if (opts.lines)    args.push('-n', String(opts.lines))
      if (opts.keyword)  args.push(`-g`, opts.keyword.replace(/['"]/g, ''))
      const { stdout } = await execPromise(args.join(' '))
      return stdout.trim().split('\n').filter(Boolean)
    } catch { return [] }
  })

  // ── Startup apps manager ──────────────────────────────────────────────────
  ipcMain.handle('startup-list', async () => {
    const autostartDir = join(homedir(), '.config', 'autostart')
    const desktopEntries: any[] = []
    if (existsSync(autostartDir)) {
      try {
        readdirSync(autostartDir).filter(f => f.endsWith('.desktop')).forEach(file => {
          const path = join(autostartDir, file)
          try {
            const content = readFileSync(path, 'utf8')
            const get = (key: string) => content.match(new RegExp(`^${key}=(.*)`, 'm'))?.[1]?.trim() ?? ''
            const enabledRaw = get('X-GNOME-Autostart-enabled')
            desktopEntries.push({
              filename: file,
              path,
              name:    get('Name') || file,
              exec:    get('Exec'),
              comment: get('Comment'),
              icon:    get('Icon'),
              enabled: enabledRaw !== 'false',
            })
          } catch {}
        })
      } catch {}
    }

    let systemdServices: any[] = []
    try {
      const { stdout } = await execPromise('systemctl --user list-units --type=service --all --no-pager --plain --no-legend')
      systemdServices = stdout.trim().split('\n').filter(Boolean).map(line => {
        const parts = line.trim().split(/\s+/)
        return { unit: parts[0] ?? '', active: parts[2] ?? '', description: parts.slice(4).join(' ') }
      })
    } catch {}

    return { desktopEntries, systemdServices }
  })

  ipcMain.handle('startup-toggle-desktop', async (_, { path: filePath, enabled }: { path: string; enabled: boolean }) => {
    try {
      const allowed = join(homedir(), '.config', 'autostart')
      if (!resolve(filePath).startsWith(allowed)) return { success: false, error: 'Path outside allowed directory' }
      let content = readFileSync(filePath, 'utf8')
      if (content.includes('X-GNOME-Autostart-enabled=')) {
        content = content.replace(/^X-GNOME-Autostart-enabled=.*/m, `X-GNOME-Autostart-enabled=${enabled}`)
      } else {
        content = content.replace(/^\[Desktop Entry\]/m, `[Desktop Entry]\nX-GNOME-Autostart-enabled=${enabled}`)
      }
      writeFileSync(filePath, content, 'utf8')
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('startup-delete-desktop', async (_, filePath: string) => {
    try {
      const allowed = join(homedir(), '.config', 'autostart')
      if (!resolve(filePath).startsWith(allowed)) return { success: false, error: 'Path outside allowed directory' }
      unlinkSync(filePath)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('startup-toggle-systemd', async (_, { unit, enable }: { unit: string; enable: boolean }) => {
    try {
      const safe = unit.replace(/[^a-zA-Z0-9@._-]/g, '')
      await execPromise(`systemctl --user ${enable ? 'enable' : 'disable'} ${safe}`)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // ── Docker ────────────────────────────────────────────────────────────────
  ipcMain.handle('docker-list', async () => {
    try {
      const { stdout: psOut } = await execPromise(`docker ps -a --format '{{json .}}'`)
      const containers = psOut.trim().split('\n').filter(Boolean).map(line => {
        try { return JSON.parse(line) } catch { return null }
      }).filter(Boolean)

      let statsMap: Record<string, any> = {}
      try {
        const { stdout: statsOut } = await execPromise(`docker stats --no-stream --format '{{json .}}'`)
        statsOut.trim().split('\n').filter(Boolean).forEach(line => {
          try {
            const s = JSON.parse(line)
            statsMap[s.ID.slice(0, 12)] = s
          } catch {}
        })
      } catch {}

      return containers.map((c: any) => {
        const id12 = (c.ID || '').slice(0, 12)
        const stat = statsMap[id12] ?? {}
        const cpuStr: string = stat.CPUPerc ?? '0%'
        const cpu = parseFloat(cpuStr) || 0
        const memStr: string = stat.MemUsage ?? '0B / 0B'
        const [usedStr, limitStr] = memStr.split(' / ')
        const parseMem = (s: string) => {
          const m = s?.match(/([\d.]+)\s*(B|kB|MiB|GiB|MB|GB)/i)
          if (!m) return 0
          const v = parseFloat(m[1])
          const u = m[2].toLowerCase()
          if (u === 'gib' || u === 'gb') return v * 1024 * 1024 * 1024
          if (u === 'mib' || u === 'mb') return v * 1024 * 1024
          if (u === 'kb') return v * 1024
          return v
        }
        const netStr: string = stat.NetIO ?? '0B / 0B'
        const [rxStr, txStr] = netStr.split(' / ')
        return {
          id:         c.ID,
          name:       (c.Names || c.Name || '').replace(/^\//, ''),
          image:      c.Image,
          state:      c.State?.toLowerCase() ?? 'unknown',
          status:     c.Status,
          cpu_percent: cpu,
          mem_usage:   parseMem(usedStr),
          mem_limit:   parseMem(limitStr),
          net_io:     { rx: parseMem(rxStr), tx: parseMem(txStr) },
        }
      })
    } catch (e: any) {
      return { error: e.message }
    }
  })

  ipcMain.handle('docker-control', async (_, { id, action }: { id: string; action: string }) => {
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '')
    const safeAction = ['start', 'stop', 'restart', 'pause', 'unpause'].includes(action) ? action : 'stop'
    try {
      await execPromise(`docker ${safeAction} ${safeId}`)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('docker-logs', async (_, { id, lines = 100 }: { id: string; lines?: number }) => {
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '')
    try {
      const { stdout, stderr } = await execPromise(`docker logs --tail ${lines} ${safeId}`)
      return (stdout || '') + (stderr || '')
    } catch (e: any) {
      return `Failed to fetch logs: ${e.message}`
    }
  })

  // Kyber I/O scheduler tuning for AI workloads
  // Profiles: 'ai' = fast reads for model load, 'default' = stock Kyber values
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

  // SCX sched-ext scheduler control via scx_loader DBus
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
      const schedulers = (supported.stdout.match(/"([^"]+)"/g) || []).map((s: string) => s.replace(/"/g, ''))
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

  // BORE scheduler tuner — applies sysctl presets if available
  const BORE_PROFILES: Record<string, Record<string, number>> = {
    desktop:   { 'kernel.sched_burst_penalty_scale': 1280, 'kernel.sched_burst_smoothness_long': 1, 'kernel.sched_burst_smoothness_short': 0, 'kernel.sched_burst_fork_atavistic': 2, 'kernel.sched_burst_parity_threshold': 2, 'kernel.sched_burst_cache_lifetime': 60000000 },
    ai_heavy:  { 'kernel.sched_burst_penalty_scale': 320,  'kernel.sched_burst_smoothness_long': 1, 'kernel.sched_burst_smoothness_short': 0, 'kernel.sched_burst_fork_atavistic': 0, 'kernel.sched_burst_parity_threshold': 0, 'kernel.sched_burst_cache_lifetime': 120000000 },
    balanced:  { 'kernel.sched_burst_penalty_scale': 1024, 'kernel.sched_burst_smoothness_long': 1, 'kernel.sched_burst_smoothness_short': 0, 'kernel.sched_burst_fork_atavistic': 2, 'kernel.sched_burst_parity_threshold': 2, 'kernel.sched_burst_cache_lifetime': 60000000 },
    gaming:    { 'kernel.sched_burst_penalty_scale': 640,  'kernel.sched_burst_smoothness_long': 1, 'kernel.sched_burst_smoothness_short': 0, 'kernel.sched_burst_fork_atavistic': 0, 'kernel.sched_burst_parity_threshold': 2, 'kernel.sched_burst_cache_lifetime': 60000000 },
  }
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

  // Ollama VRAM budget modes — writes systemd override and restarts service
  // 'max'    : 0 overhead, 2 parallel, 2 models (current)
  // 'budget' : 2GB overhead reserved, 1 model, 1 parallel — preserves headroom for desktop
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

  // Pin Ollama to all cores (0-7) and raise priority — 7800X3D has single CCD V-Cache
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

  // CachyOS Hardware Detection (chwd)
  ipcMain.handle('chwd-detect', async () => {
    try {
      const { stdout } = await execPromise('chwd --list 2>&1')
      return { success: true, output: stdout }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('chwd-install', async (_, profile: string) => {
    // profile must contain only alphanum, dash, dot, underscore
    if (!/^[\w.\-]+$/.test(profile)) return { success: false, error: 'Invalid profile name' }
    try {
      const { stdout, stderr } = await execPromise(`pkexec chwd --install ${profile}`)
      return { success: true, output: stdout || stderr }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // CachyOS mirror ranking
  ipcMain.handle('cachyos-rate-mirrors', async () => {
    try {
      const { stdout, stderr } = await execPromise('pkexec cachyos-rate-mirrors')
      return { success: true, output: stdout || stderr }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // fprintd fingerprint status
  ipcMain.handle('fprintd-status', async () => {
    try {
      const { stdout: svcState } = await execPromise('systemctl is-active fprintd.service 2>&1 || true')
      const active = svcState.trim() === 'active'
      let devices = 'fprintd not installed'
      try {
        const { stdout: pkgCheck } = await execPromise('pacman -Q fprintd 2>/dev/null || true')
        if (pkgCheck.trim()) {
          devices = active ? 'Service active — no enrolled fingers detected' : 'Package installed but service inactive'
        }
      } catch {}
      return { success: true, active, devices }
    } catch (e: any) {
      return { success: true, active: false, devices: 'fprintd not installed' }
    }
  })

  // GPU VRAM stats via nvidia-smi
  ipcMain.handle('gpu-vram-stats', async () => {
    try {
      const { stdout } = await execPromise(
        'nvidia-smi --query-gpu=memory.used,memory.total,memory.free,utilization.gpu --format=csv,noheader,nounits'
      )
      const parts = stdout.trim().split(',').map(s => parseInt(s.trim(), 10))
      const [used, total, free, gpuUtil] = parts
      return { success: true, used, total, free, gpuUtil }
    } catch {
      return { success: false, used: 0, total: 0, free: 0, gpuUtil: 0 }
    }
  })

  // Snapper snapshot management
  ipcMain.handle('system-snapper-snapshot', async (_, desc?: string) => {
    const description = desc || 'Vortex pre-change snapshot'
    try {
      const { stdout } = await execPromise(`pkexec snapper -c root create -t pre -p -d "${description}"`)
      return { success: true, output: `Snapshot created: ${stdout.trim()}` }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('system-snapper-list', async () => {
    try {
      const { stdout } = await execPromise('snapper -c root list --columns number,type,date,description,used-space --separator "|"')
      const rows = stdout.trim().split('\n').filter(Boolean).map(line => {
        const parts = line.split('|')
        return {
          id:          (parts[0] ?? '').trim(),
          type:        (parts[1] ?? '').trim(),
          date:        (parts[2] ?? '').trim(),
          description: (parts[3] ?? '').trim(),
          usedSpace:   (parts[4] ?? '').trim(),
        }
      })
      return { success: true, snapshots: rows }
    } catch (e: any) {
      return { success: false, error: e.message, snapshots: [] }
    }
  })

  ipcMain.handle('system-snapper-create', async (_, { description }: { description: string }) => {
    const safe = description.replace(/"/g, "'")
    try {
      const { stdout } = await execPromise(`pkexec snapper -c root create -t single -d "${safe}"`)
      return { success: true, id: stdout.trim() }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('system-snapper-delete', async (_, { id }: { id: string }) => {
    if (!/^\d+$/.test(id)) return { success: false, error: 'Invalid snapshot ID' }
    try {
      await execPromise(`pkexec snapper -c root delete ${id}`)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('system-snapper-rollback', async (_, { id }: { id: string }) => {
    if (!/^\d+$/.test(id)) return { success: false, error: 'Invalid snapshot ID' }
    try {
      // Creates a new snapshot of current state, sets target as default subvol for next boot
      const { stdout, stderr } = await execPromise(`pkexec snapper rollback ${id}`)
      return { success: true, output: (stdout + stderr).trim() }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 2026 dmemcg-booster VRAM Squeeze
  ipcMain.handle('gpu-vram-squeeze', async () => {
    try {
      // Aggressively free VRAM from background processes using dmemcg-booster
      const { stdout } = await execPromise('pkexec dmemcg-booster --aggressive')
      return { success: true, output: stdout || 'VRAM squeeze complete.' }
    } catch (e: any) {
      // Fallback: log failure but don't crash, it might not be installed
      return { success: false, error: `dmemcg-booster failed or not installed: ${e.message}` }
    }
  })

  // 2026 Zero-Latency Game Mode Macro (7800X3D + 4070 Ti Super)
  ipcMain.handle('game-mode-toggle', async (_, enable: boolean) => {
    return await runGameModeToggle(enable)
  })

  // 2026 WinBoat Sandbox (Windows in Docker)
  ipcMain.handle('winboat-detect', async () => {
    try {
      const { stdout } = await execPromise('which winboat 2>/dev/null || echo ""')
      return { success: !!stdout.trim() }
    } catch { return { success: false } }
  })

  ipcMain.handle('winboat-run', async (_, exePath: string) => {
    if (!exePath) return { success: false, error: 'No EXE path provided' }
    try {
      // 2026 CachyOS WinBoat Orchestration
      // Mapping the EXE and enabling GPU + Xwayland for high-perf sandbox
      const cmd = `winboat run --gpu --xwayland "${exePath}"`
      // We run this in the background as it launches a window
      exec(cmd, (error, stdout, stderr) => {
        if (error) console.error(`[Vortex] WinBoat Error: ${error.message}`)
      })
      return { success: true, output: 'Sandbox session initialized.' }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 2026 x86-64-v4 Architecture Auditor
  ipcMain.handle('system-audit-arch', async () => {
    try {
      // Logic: List all installed packages and their repos.
      // Packages NOT in cachyos-v4 (or -v3) but present in generic repos are candidates.
      const { stdout } = await execPromise("pacman -Sl | grep -v '\[installed\]' -v 'cachyos-v4' -v 'cachyos-v3' | grep '\[installed\]' || true")
      const lines = stdout.trim().split('\n').filter(Boolean)
      
      const packages = lines.map(line => {
        const [repo, name] = line.split(/\s+/)
        return { name, repo, isGeneric: !repo.includes('v4') && !repo.includes('v3') }
      }).filter(p => p.isGeneric).slice(0, 15) // Limit to top 15 for UI clarity

      return { success: true, packages }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('system-rebuild-native', async (_, pkgName: string) => {
    try {
      const safePkg = pkgName.replace(/[^a-zA-Z0-9._\-+]/g, '')
      if (!safePkg) return { success: false, log: 'Invalid package name' }
      const helper = await detectAurHelper()
      const cmd = helper !== 'pacman'
        ? `${helper} -S --rebuild --noconfirm ${safePkg}`
        : `pacman -S --noconfirm ${safePkg}`
      const res = await runStreamingCmd('bash', ['-c', cmd])
      return { success: res.success, log: res.log }
    } catch (e: any) {
      return { success: false, log: e.message }
    }
  })

  // App Launcher
  ipcMain.handle('apps-list', async () => {
    try {
      const dirs = [
        `${homedir()}/.local/share/applications`,
        '/usr/share/applications',
        '/usr/local/share/applications',
      ]
      const apps: { name: string; exec: string; comment: string; categories: string; icon: string; path: string }[] = []
      const seen = new Set<string>()
      for (const dir of dirs) {
        try {
          const files = readdirSync(dir).filter(f => f.endsWith('.desktop'))
          for (const file of files) {
            try {
              const content = readFileSync(join(dir, file), 'utf-8')
              const get = (key: string) => {
                const m = content.match(new RegExp(`^${key}=(.+)$`, 'm'))
                return m ? m[1].trim() : ''
              }
              if (get('NoDisplay') === 'true' || get('Hidden') === 'true') continue
              const name = get('Name')
              if (!name || seen.has(name)) continue
              seen.add(name)
              apps.push({ name, exec: get('Exec'), comment: get('Comment'), categories: get('Categories'), icon: get('Icon'), path: join(dir, file) })
            } catch {}
          }
        } catch {}
      }
      apps.sort((a, b) => a.name.localeCompare(b.name))
      return { success: true, apps }
    } catch (e: any) {
      return { success: false, apps: [], error: e.message }
    }
  })

  ipcMain.handle('apps-launch', async (_, { exec }: { exec: string }) => {
    try {
      const clean = exec.replace(/%[uUfFdDnNickvm]/g, '').trim()
      spawn('bash', ['-c', clean], { detached: true, stdio: 'ignore' }).unref()
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  // Arch News Feed
  ipcMain.handle('arch-news-fetch', async () => {
    try {
      const { data } = await axios.get('https://archlinux.org/feeds/news/', { timeout: 8000, responseType: 'text' })
      const items: { title: string; link: string; date: string; summary: string }[] = []
      const itemRe = /<item>([\s\S]*?)<\/item>/g
      let m: RegExpExecArray | null
      while ((m = itemRe.exec(data)) !== null) {
        const block = m[1]
        const title = (block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/) ?? [])[1] ?? ''
        const link  = (block.match(/<link>(.*?)<\/link>/) ?? [])[1] ?? ''
        const date  = (block.match(/<pubDate>(.*?)<\/pubDate>/) ?? [])[1] ?? ''
        const desc  = (block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) ?? [])[1] ?? ''
        const summary = desc.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300)
        items.push({ title: title.trim(), link: link.trim(), date: date.trim(), summary })
      }
      return { success: true, items: items.slice(0, 10) }
    } catch (e: any) {
      return { success: false, items: [], error: e.message }
    }
  })

  // Dotfile Vault
  ipcMain.handle('vault-list-backups', async () => {
    try {
      const dir = `${homedir()}/Vortex-Backups`
      await execPromise(`mkdir -p "${dir}"`)
      const { stdout } = await execPromise(`ls -t "${dir}" 2>/dev/null || true`)
      const files = stdout.split('\n').map(f => f.trim()).filter(f => f.endsWith('.tar.gz'))
      const backups = files.map(f => {
        const m = f.match(/^vault_(.+)\.tar\.gz$/)
        const tsStr = m ? m[1].replace(/_/g, ':').replace('T', 'T') : ''
        const ts = new Date(tsStr).getTime()
        return { filename: f, ts: isNaN(ts) ? 0 : ts, path: `${dir}/${f}` }
      })
      return { success: true, backups }
    } catch (e: any) { return { success: false, backups: [], error: e.message } }
  })

  ipcMain.handle('vault-create', async (_, { paths }: { paths: string[] }) => {
    try {
      const dir = `${homedir()}/Vortex-Backups`
      await execPromise(`mkdir -p "${dir}"`)
      const ts = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '')
      const outFile = `${dir}/vault_${ts}.tar.gz`
      const expandedPaths = paths.map(p => p.replace(/^~/, homedir()))
      const safeList = expandedPaths.map(p => `"${p.replace(/"/g, '\\"')}"`).join(' ')
      await execPromise(`tar -czf "${outFile}" ${safeList} 2>/dev/null || tar -czf "${outFile}" ${safeList}`)
      return { success: true, filename: `vault_${ts}.tar.gz` }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('vault-restore', async (_, { filename }: { filename: string }) => {
    try {
      const dir = `${homedir()}/Vortex-Backups`
      const safeFile = filename.replace(/[^a-zA-Z0-9._\-]/g, '')
      const fullPath = `${dir}/${safeFile}`
      if (!fullPath.startsWith(dir)) throw new Error('Invalid filename')
      await execPromise(`tar -xzf "${fullPath}" -C /`)
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('vault-delete', async (_, { filename }: { filename: string }) => {
    try {
      const dir = `${homedir()}/Vortex-Backups`
      const safeFile = filename.replace(/[^a-zA-Z0-9._\-]/g, '')
      await execPromise(`rm -f "${dir}/${safeFile}"`)
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  // Benchmark
  ipcMain.handle('benchmark-run', async (_, { tests }: { tests: string[] }) => {
    const results: Record<string, { score: number; unit: string; detail: string }> = {}
    try {
      if (tests.includes('cpu')) {
        try {
          const t0 = Date.now()
          await execPromise(`bash -c "n=0; for i in $(seq 1 50000); do n=$((n+i)); done; echo $n"`)
          const ms = Date.now() - t0
          const score = Math.round(1000 / (ms / 1000) * 10) / 10
          results.cpu = { score, unit: 'ops/s (higher=better)', detail: `50k iterations in ${ms}ms` }
        } catch { results.cpu = { score: 0, unit: '', detail: 'failed' } }
      }
      if (tests.includes('disk_write')) {
        try {
          const tmpFile = `${tmpdir()}/vortex_bench_$$`
          const t0 = Date.now()
          await execPromise(`dd if=/dev/zero of="${tmpFile}" bs=1M count=256 conv=fdatasync 2>&1`)
          const ms = Date.now() - t0
          await execPromise(`rm -f "${tmpFile}"`)
          const mbps = Math.round(256 / (ms / 1000))
          results.disk_write = { score: mbps, unit: 'MB/s', detail: `256 MB sequential write in ${ms}ms` }
        } catch { results.disk_write = { score: 0, unit: 'MB/s', detail: 'failed' } }
      }
      if (tests.includes('disk_read')) {
        try {
          const tmpFile = `${tmpdir()}/vortex_bench_read_$$`
          await execPromise(`dd if=/dev/urandom of="${tmpFile}" bs=1M count=256 conv=fdatasync 2>/dev/null`)
          const t0 = Date.now()
          await execPromise(`dd if="${tmpFile}" of=/dev/null bs=1M 2>&1`)
          const ms = Date.now() - t0
          await execPromise(`rm -f "${tmpFile}"`)
          const mbps = Math.round(256 / (ms / 1000))
          results.disk_read = { score: mbps, unit: 'MB/s', detail: `256 MB sequential read in ${ms}ms` }
        } catch { results.disk_read = { score: 0, unit: 'MB/s', detail: 'failed' } }
      }
      if (tests.includes('ram')) {
        try {
          const { stdout } = await execPromise(`dd if=/dev/zero bs=1M count=512 | dd of=/dev/null 2>&1 || true`)
          const m = stdout.match(/([\d.]+)\s+MB\/s/)
          const mbps = m ? Math.round(parseFloat(m[1])) : 0
          results.ram = { score: mbps, unit: 'MB/s', detail: 'Memory throughput via dd' }
        } catch { results.ram = { score: 0, unit: 'MB/s', detail: 'failed' } }
      }
      return { success: true, results }
    } catch (e: any) {
      return { success: false, results, error: e.message }
    }
  })

  // UFW Firewall
  ipcMain.handle('ufw-status', async () => {
    try {
      const { stdout } = await execPromise('sudo ufw status verbose 2>/dev/null || ufw status verbose 2>/dev/null || echo "ufw not available"')
      const lines = stdout.split('\n')
      const statusLine = lines.find(l => l.toLowerCase().startsWith('status:'))
      const enabled = statusLine?.toLowerCase().includes('active') ?? false
      const rules: { to: string; action: string; from: string; comment: string }[] = []
      let inRules = false
      for (const line of lines) {
        if (line.startsWith('--')) { inRules = true; continue }
        if (!inRules) continue
        const trimmed = line.trim()
        if (!trimmed) continue
        const m = trimmed.match(/^(\S+(?:\s+\(v6\))?)\s+(ALLOW|DENY|REJECT|LIMIT)\s+(.*?)(?:\s+#\s*(.*))?$/)
        if (m) rules.push({ to: m[1], action: m[2], from: m[3].trim() || 'Anywhere', comment: m[4] ?? '' })
      }
      return { success: true, enabled, rules, raw: stdout }
    } catch (e: any) {
      return { success: false, enabled: false, rules: [], raw: '', error: e.message }
    }
  })

  ipcMain.handle('ufw-enable', async (_, enable: boolean) => {
    try {
      const cmd = enable ? 'pkexec ufw enable' : 'pkexec ufw disable'
      const { stdout } = await execPromise(cmd)
      return { success: true, output: stdout.trim() }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('ufw-add-rule', async (_, rule: { port: string; proto: string; action: string; from: string; comment: string }) => {
    try {
      const safePort = rule.port.replace(/[^0-9:]/g, '')
      const safeFrom = rule.from.replace(/[^0-9./: ]/g, '')
      const proto = ['tcp', 'udp', 'any'].includes(rule.proto) ? rule.proto : 'any'
      const action = ['allow', 'deny', 'reject', 'limit'].includes(rule.action.toLowerCase()) ? rule.action.toLowerCase() : 'allow'
      const portSpec = proto === 'any' ? safePort : `${safePort}/${proto}`
      const fromSpec = safeFrom && safeFrom !== 'Anywhere' ? `from ${safeFrom} to any port ${safePort}` : portSpec
      const commentFlag = rule.comment.trim() ? ` comment '${rule.comment.replace(/'/g, '')}'` : ''
      await execPromise(`pkexec ufw ${action} ${fromSpec}${commentFlag}`)
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('ufw-delete-rule', async (_, num: number) => {
    try {
      await execPromise(`pkexec bash -c "echo y | ufw delete ${Math.abs(Math.floor(num))}"`)
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  // SSH Keys
  ipcMain.handle('ssh-list-keys', async () => {
    try {
      const sshDir = `${homedir()}/.ssh`
      const { stdout: lsOut } = await execPromise(`ls "${sshDir}" 2>/dev/null || true`)
      const files = lsOut.split('\n').map(f => f.trim()).filter(Boolean)
      const pubFiles = files.filter(f => f.endsWith('.pub'))
      const keys: { name: string; pubFile: string; privFile: string; type: string; fingerprint: string; comment: string; pubKey: string }[] = []
      for (const pub of pubFiles) {
        const name = pub.replace(/\.pub$/, '')
        const privExists = files.includes(name)
        const fullPub = `${sshDir}/${pub}`
        const { stdout: content } = await execPromise(`cat "${fullPub}" 2>/dev/null || true`)
        const parts = content.trim().split(' ')
        const type = parts[0] ?? ''
        const comment = parts[2] ?? ''
        const { stdout: fp } = await execPromise(`ssh-keygen -lf "${fullPub}" 2>/dev/null || true`)
        const fingerprint = fp.trim().split(' ').slice(0, 2).join(' ')
        keys.push({ name, pubFile: pub, privFile: privExists ? name : '', type, fingerprint, comment, pubKey: content.trim() })
      }
      return { success: true, keys }
    } catch (e: any) {
      return { success: false, keys: [], error: e.message }
    }
  })

  ipcMain.handle('ssh-generate-key', async (_, { type, bits, comment, filename }: { type: string; bits?: number; comment: string; filename: string }) => {
    try {
      const sshDir = `${homedir()}/.ssh`
      const safeName = filename.replace(/[^a-zA-Z0-9_\-]/g, '_')
      const outFile = `${sshDir}/${safeName}`
      const bitsFlag = type === 'rsa' ? `-b ${bits ?? 4096}` : ''
      await execPromise(`ssh-keygen -t ${type} ${bitsFlag} -C "${comment.replace(/"/g, '')}" -f "${outFile}" -N ""`)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('ssh-delete-key', async (_, { name }: { name: string }) => {
    try {
      const sshDir = `${homedir()}/.ssh`
      const safeName = name.replace(/[^a-zA-Z0-9_\-]/g, '_')
      await execPromise(`rm -f "${sshDir}/${safeName}" "${sshDir}/${safeName}.pub"`)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // Cron
  ipcMain.handle('cron-list', async () => {
    try {
      const { stdout } = await execPromise('crontab -l 2>/dev/null || true')
      const lines = stdout.split('\n')
      const entries: { id: string; raw: string; min: string; hour: string; dom: string; month: string; dow: string; command: string; comment: string; enabled: boolean }[] = []
      let pendingComment = ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) { pendingComment = ''; continue }
        if (trimmed.startsWith('#')) {
          pendingComment = trimmed.slice(1).trim()
          continue
        }
        if (trimmed.includes('=') && !trimmed.match(/^\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+/)) { pendingComment = ''; continue }
        const m = trimmed.match(/^(@\S+|\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)$/)
        if (!m) { pendingComment = ''; continue }
        const schedule = m[1].trim()
        const command = m[2].trim()
        let min = '*', hour = '*', dom = '*', month = '*', dow = '*'
        if (schedule.startsWith('@')) {
          min = schedule
        } else {
          const parts = schedule.split(/\s+/)
          ;[min, hour, dom, month, dow] = parts
        }
        entries.push({ id: Math.random().toString(36).slice(2), raw: trimmed, min, hour, dom, month, dow, command, comment: pendingComment, enabled: true })
        pendingComment = ''
      }
      return { success: true, entries }
    } catch (e: any) {
      return { success: false, entries: [], error: e.message }
    }
  })

  ipcMain.handle('cron-save', async (_, { entries }: { entries: { min: string; hour: string; dom: string; month: string; dow: string; command: string; comment: string }[] }) => {
    try {
      const lines = entries.map(e => {
        const comment = e.comment.trim() ? `# ${e.comment.trim()}\n` : ''
        const schedule = e.min.startsWith('@') ? e.min : `${e.min} ${e.hour} ${e.dom} ${e.month} ${e.dow}`
        return `${comment}${schedule} ${e.command}`
      })
      const crontab = lines.join('\n') + '\n'
      await execPromise(`echo ${JSON.stringify(crontab)} | crontab -`)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })
}

/**
 * 2026 Zero-Latency Game Mode Orchestrator
 * Shared between UI and Agentic Guardian
 */
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
