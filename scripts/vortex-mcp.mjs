#!/usr/bin/env node
// Vortex MCP server — exposes the machine through Vortex's hardened exec layer
// over the Model Context Protocol (stdio transport, newline-delimited JSON-RPC).
//
// Register with any MCP client, e.g. Claude Code:
//   claude mcp add vortex -- node "/home/doodcom/Documents/Vortex Agentic V2/scripts/vortex-mcp.mjs"
//
// Runs unprivileged: no pkexec/sudo flows, and destructive commands are blocked
// by the same denylist the in-app AI agent uses (electron/ollama.ts).

import { exec } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import readline from 'node:readline'

const SERVER_INFO = { name: 'vortex-agentic', version: '1.0.0' }
const PROTOCOL_VERSION = '2025-06-18'
const AUDIT_DIR = path.join(homedir(), '.config', 'vortex-agentic-v2')
const AUDIT_LOG = path.join(AUDIT_DIR, 'mcp-audit.log')

// Mirror of EXEC_DENYLIST in electron/ollama.ts — keep the two in sync.
const EXEC_DENYLIST = [
  { re: /\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+(\/|~|\$HOME|"?\/home)/, label: 'recursive delete of home or root paths' },
  { re: /\bmkfs\b/, label: 'filesystem format' },
  { re: /\bdd\b[^|;&]*\bof=\/dev\//, label: 'raw write to block device' },
  { re: /\b(shutdown|reboot|poweroff|halt)\b/, label: 'power control' },
  { re: /\bchmod\s+(-[a-zA-Z]+\s+)*[0-7]*777\s+\//, label: 'chmod 777 on root paths' },
  { re: /\b(curl|wget)\b[^|;&]*\|\s*(ba|z|fi)?sh\b/, label: 'pipe download to shell' },
  { re: />\s*\/etc\//, label: 'overwrite of /etc' },
  { re: /\bpacman\s+(-[a-zA-Z]*R|-[a-zA-Z]*S(?:yu)?[a-zA-Z]*)\b[^|;&]*--noconfirm/, label: 'unattended package install/removal' },
  { re: /:\s*\(\)\s*\{\s*:\s*\|\s*:/, label: 'fork bomb' },
  { re: /\b(userdel|groupdel|passwd)\b/, label: 'account modification' },
  { re: /\b(sudo|pkexec|doas)\b/, label: 'privilege escalation (run Vortex GUI for privileged actions)' },
]

function audit(line) {
  try {
    mkdirSync(AUDIT_DIR, { recursive: true })
    appendFileSync(AUDIT_LOG, `${new Date().toISOString()} ${line}\n`)
  } catch { /* auditing must never break the tool */ }
}

function sh(cmd, timeoutMs = 30_000) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, shell: '/bin/bash' }, (error, stdout, stderr) => {
      resolve({
        exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout: String(stdout).trim(),
        stderr: String(stderr).trim(),
      })
    })
  })
}

function textResult(text, isError = false) {
  return { content: [{ type: 'text', text: text || '(no output)' }], isError }
}

const TOOLS = [
  {
    name: 'system_stats',
    description: 'Snapshot of CPU load, memory, root disk usage and the top CPU-consuming processes on this Linux machine.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => {
      const [up, mem, disk, ps] = await Promise.all([
        sh('uptime'),
        sh('free -h'),
        sh('df -h / /home 2>/dev/null'),
        sh('ps -eo pid,comm,%cpu,%mem --sort=-%cpu | head -8'),
      ])
      return textResult(`# uptime\n${up.stdout}\n\n# memory\n${mem.stdout}\n\n# disk\n${disk.stdout}\n\n# top processes\n${ps.stdout}`)
    },
  },
  {
    name: 'check_updates',
    description: 'List pending Arch repo package updates (checkupdates) and AUR updates (paru/yay) without installing anything.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => {
      const repo = await sh('checkupdates 2>/dev/null; true')
      const aur = await sh('command -v paru >/dev/null && paru -Qua 2>/dev/null || (command -v yay >/dev/null && yay -Qua 2>/dev/null); true')
      const repoList = repo.stdout || '(none)'
      const aurList = aur.stdout || '(none)'
      return textResult(`# repo updates\n${repoList}\n\n# AUR updates\n${aurList}`)
    },
  },
  {
    name: 'failed_units',
    description: 'List failed systemd units (system and user scope).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => {
      const sys = await sh('systemctl --failed --no-legend --plain; true')
      const user = await sh('systemctl --user --failed --no-legend --plain; true')
      return textResult(`# system\n${sys.stdout || '(none)'}\n\n# user\n${user.stdout || '(none)'}`)
    },
  },
  {
    name: 'service_status',
    description: 'Show systemd status for one unit.',
    inputSchema: {
      type: 'object',
      properties: { unit: { type: 'string', description: 'Unit name, e.g. ollama.service' } },
      required: ['unit'],
      additionalProperties: false,
    },
    handler: async ({ unit }) => {
      if (!/^[\w@.\-]+$/.test(String(unit))) return textResult('Invalid unit name.', true)
      const res = await sh(`systemctl status ${unit} --no-pager -l | head -40; true`)
      return textResult(res.stdout || res.stderr)
    },
  },
  {
    name: 'journal_logs',
    description: 'Read systemd journal logs, optionally filtered by unit and priority.',
    inputSchema: {
      type: 'object',
      properties: {
        unit: { type: 'string', description: 'Optional unit filter, e.g. NetworkManager.service' },
        lines: { type: 'number', description: 'Number of lines (default 50, max 500)' },
        priority: { type: 'string', description: 'Max priority 0-7 (e.g. "3" for errors and worse)' },
      },
      additionalProperties: false,
    },
    handler: async ({ unit, lines, priority }) => {
      const n = Math.min(Math.max(parseInt(lines, 10) || 50, 1), 500)
      const parts = ['journalctl', '--no-pager', `-n ${n}`]
      if (unit) {
        if (!/^[\w@.\-]+$/.test(String(unit))) return textResult('Invalid unit name.', true)
        parts.push(`-u ${unit}`)
      }
      if (priority !== undefined && priority !== '') {
        if (!/^[0-7]$/.test(String(priority))) return textResult('Priority must be 0-7.', true)
        parts.push(`-p ${priority}`)
      }
      const res = await sh(`${parts.join(' ')}; true`)
      return textResult(res.stdout || res.stderr)
    },
  },
  {
    name: 'exec_command',
    description: 'Run an unprivileged shell command through Vortex\'s hardened exec layer. Destructive patterns (recursive home/root deletes, mkfs, dd to block devices, power control, privilege escalation, ...) are denied. Output capped at 30s / 16k chars.',
    inputSchema: {
      type: 'object',
      properties: { command: { type: 'string', description: 'The shell command to run' } },
      required: ['command'],
      additionalProperties: false,
    },
    handler: async ({ command }) => {
      const cmd = String(command ?? '').trim()
      if (!cmd) return textResult('Empty command.', true)
      for (const { re, label } of EXEC_DENYLIST) {
        if (re.test(cmd)) {
          audit(`DENIED (${label}): ${cmd}`)
          return textResult(`Denied by Vortex exec policy: ${label}`, true)
        }
      }
      audit(`EXEC: ${cmd}`)
      const res = await sh(cmd)
      audit(`EXIT ${res.exitCode}: ${cmd}`)
      const out = [res.stdout, res.stderr ? `[stderr]\n${res.stderr}` : ''].filter(Boolean).join('\n\n')
      return textResult(`exit code: ${res.exitCode}\n\n${out}`.slice(0, 16_000), res.exitCode !== 0)
    },
  },
]

// ── Minimal MCP stdio transport (newline-delimited JSON-RPC 2.0) ─────────────

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result })
}

function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } })
}

async function handle(msg) {
  const { id, method, params } = msg
  switch (method) {
    case 'initialize':
      reply(id, {
        protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      })
      break
    case 'notifications/initialized':
      break // notification, no response
    case 'ping':
      reply(id, {})
      break
    case 'tools/list':
      reply(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) })
      break
    case 'tools/call': {
      const tool = TOOLS.find(t => t.name === params?.name)
      if (!tool) { replyError(id, -32602, `Unknown tool: ${params?.name}`); break }
      try {
        reply(id, await tool.handler(params?.arguments ?? {}))
      } catch (e) {
        reply(id, textResult(`Tool failed: ${e?.message ?? e}`, true))
      }
      break
    }
    default:
      if (id !== undefined) replyError(id, -32601, `Method not found: ${method}`)
  }
}

const pending = new Set()
const rl = readline.createInterface({ input: process.stdin, terminal: false })
rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  let msg
  try { msg = JSON.parse(trimmed) } catch { return }
  const p = handle(msg).catch(e => {
    if (msg.id !== undefined) replyError(msg.id, -32603, `Internal error: ${e?.message ?? e}`)
  })
  pending.add(p)
  p.finally(() => pending.delete(p))
})
// Let in-flight tool calls finish before exiting on stdin EOF
rl.on('close', () => { Promise.allSettled([...pending]).then(() => process.exit(0)) })
