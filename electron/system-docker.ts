import { ipcMain } from 'electron'
import { writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import { execPromise, createSystemHelpers } from './system-common'

function parseServicesFromYaml(yaml: string): string[] {
  const lines = yaml.split('\n')
  const services: string[] = []
  let inServices = false
  let servicesIndent = -1

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const matchServices = line.match(/^(\s*)services\s*:/)
    if (matchServices) {
      inServices = true
      servicesIndent = -1
      continue
    }

    if (inServices) {
      const matchKey = line.match(/^(\s*)([a-zA-Z0-9_-]+)\s*:/)
      if (matchKey) {
        const indent = matchKey[1].length
        const key = matchKey[2]

        if (servicesIndent === -1) {
          if (indent > 0) {
            servicesIndent = indent
            services.push(key)
          } else {
            inServices = false
          }
        } else {
          if (indent === servicesIndent) {
            services.push(key)
          } else if (indent < servicesIndent) {
            inServices = false
          }
        }
      } else {
        const indent = line.search(/\S/)
        if (indent !== -1 && indent < (servicesIndent !== -1 ? servicesIndent : 2)) {
          inServices = false
        }
      }
    }
  }
  return services
}

export function setupDockerHandlers(win: any) {
  const { runStreamingCmd } = createSystemHelpers(win)

  ipcMain.handle('docker-list', async () => {
    try {
      const { stdout: psOut } = await execPromise(`docker ps -a --format '{{json .}}'`)
      const containers = psOut.trim().split('\n').filter(Boolean).map(line => {
        try { return JSON.parse(line) } catch { return null }
      }).filter(Boolean)

      const statsMap: Record<string, any> = {}
      try {
        const { stdout: statsOut } = await execPromise(`docker stats --no-stream --format '{{json .}}'`)
        statsOut.trim().split('\n').filter(Boolean).forEach(line => {
          try {
            const s = JSON.parse(line)
            statsMap[s.ID.slice(0, 12)] = s
          } catch { /* ignore */ }
        })
      } catch { /* ignore */ }

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

  ipcMain.handle('docker-compose-deploy', async (_, { projectName, yamlContent }: { projectName: string; yamlContent: string }) => {
    const projectDir = join(homedir(), 'Vortex-Compose', projectName)
    const resolvedPath = resolve(projectDir)
    const allowedBase = resolve(join(homedir(), 'Vortex-Compose'))
    if (!resolvedPath.startsWith(allowedBase)) {
      return { success: false, error: 'Access denied: project name leads outside allowed directory.' }
    }
    try {
      mkdirSync(projectDir, { recursive: true })
      writeFileSync(join(projectDir, 'docker-compose.yml'), yamlContent, 'utf-8')
      const res = await runStreamingCmd('docker', ['compose', 'up', '-d'], { cwd: projectDir })
      return { success: res.success, log: res.log }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('docker-compose-down', async (_, { projectName }: { projectName: string }) => {
    const projectDir = join(homedir(), 'Vortex-Compose', projectName)
    const resolvedPath = resolve(projectDir)
    const allowedBase = resolve(join(homedir(), 'Vortex-Compose'))
    if (!resolvedPath.startsWith(allowedBase)) {
      return { success: false, error: 'Access denied: project name leads outside allowed directory.' }
    }
    try {
      if (!existsSync(projectDir)) {
        return { success: false, error: 'Project directory does not exist.' }
      }
      const res = await runStreamingCmd('docker', ['compose', 'down'], { cwd: projectDir })
      return { success: res.success, log: res.log }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('docker-compose-delete', async (_, { projectName }: { projectName: string }) => {
    const projectDir = join(homedir(), 'Vortex-Compose', projectName)
    const resolvedPath = resolve(projectDir)
    const allowedBase = resolve(join(homedir(), 'Vortex-Compose'))
    if (!resolvedPath.startsWith(allowedBase)) {
      return { success: false, error: 'Access denied: project name leads outside allowed directory.' }
    }
    try {
      if (existsSync(projectDir)) {
        try {
          await execPromise('docker compose down', { cwd: projectDir })
        } catch { /* ignore */ }
        rmSync(projectDir, { recursive: true, force: true })
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('docker-compose-list', async () => {
    try {
      const composeBaseDir = join(homedir(), 'Vortex-Compose')
      if (!existsSync(composeBaseDir)) {
        return { success: true, projects: [] }
      }

      const files = readdirSync(composeBaseDir, { withFileTypes: true })
      const projects = []

      for (const file of files) {
        if (file.isDirectory()) {
          const projectDir = join(composeBaseDir, file.name)
          const ymlPath = join(projectDir, 'docker-compose.yml')
          const yamlPath = join(projectDir, 'docker-compose.yaml')
          let configPath = ''
          if (existsSync(ymlPath)) {
            configPath = ymlPath
          } else if (existsSync(yamlPath)) {
            configPath = yamlPath
          }

          if (configPath) {
            let yamlContent = ''
            try {
              yamlContent = readFileSync(configPath, 'utf-8')
            } catch { /* ignore */ }

            const services = parseServicesFromYaml(yamlContent)

            let status = 'stopped'
            try {
              const { stdout } = await execPromise('docker compose ps', { cwd: projectDir })
              const lines = stdout.trim().split('\n').filter(l => l.trim())
              if (lines.length > 1) {
                const hasRunning = lines.slice(1).some(line => line.includes('Up') || line.includes('running') || line.includes('running (healthy)'))
                status = hasRunning ? 'running' : 'stopped'
              } else {
                status = 'stopped'
              }
            } catch (_e: any) {
              status = 'stopped'
            }

            projects.push({
              name: file.name,
              path: projectDir,
              status,
              services
            })
          }
        }
      }

      return { success: true, projects }
    } catch (e: any) {
      return { success: false, error: e.message, projects: [] }
    }
  })
}
