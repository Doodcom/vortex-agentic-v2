import axios from 'axios'
import { ipcMain, BrowserWindow } from 'electron'
import { getMemoriesList, addMemoryFact, logAuditCommand } from './db'
import si from 'systeminformation'
import { exec } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, promises as fsPromises, appendFileSync } from 'node:fs'
import { promisify } from 'node:util'
import { homedir, userInfo } from 'node:os'

const execAsync = promisify(exec)
const OLLAMA_URL = 'http://127.0.0.1:11434'

const LOG_FILE = '/tmp/vortex-agent.log'
function logAgent(msg: string) {
  try { appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`) } catch {}
}

let activeStream: any = null
let lastLoadedModel: string | null = null
let cachedSystemPrompt = ''

// Per-model GPU/context config — validated on RTX 4070 Ti Super (16 GB VRAM).
// num_gpu = transformer layers in VRAM (rest spills to system RAM).
// num_ctx = KV-cache size; too large -> cudaMalloc OOM.
const MODEL_OPTIONS: Record<string, { num_gpu: number; num_ctx: number }> = {
  // num_ctx values tuned to coexist with ComfyUI in VRAM. KV cache scales linearly
  // with ctx — go too high and cudaMalloc fails when ComfyUI is also loaded.
  'qwen3:8b':           { num_gpu: 99, num_ctx: 16384 }, // ~5GB weights + ~4.5GB KV = ~10GB total
  'qwen3:14b':          { num_gpu: 99, num_ctx: 12288 }, // ~9GB weights + ~3.5GB KV = ~13GB total
  'qwen3-coder:30b':    { num_gpu: 30, num_ctx: 8192  }, // MoE — Ollama rejects num_gpu > ~35 here (memory layout); 30 verified on 16GB VRAM with ComfyUI loaded
  'deepseek-r1:14b':    { num_gpu: 99, num_ctx: 12288 }, // ~9GB weights + ~3.5GB KV = ~13GB total
  'gemma3:12b':         { num_gpu: 99, num_ctx: 4096  }, // ~8GB weights + 4k ctx (image tokens consume the rest)
}
const DEFAULT_OPTIONS = { num_gpu: 99, num_ctx: 12288 }

// Models confirmed to not support Ollama's tool-calling API (use text-based tool mode).
// qwen2.5-coder hangs on native tool API; DeepSeek-R1 has no tool API at all.
const NO_TOOL_MODELS = new Set<string>([
  'deepseek-r1:14b',
  'qwen2.5-coder:14b',
  'qwen2.5-coder:32b',
])

// Qwen3 family thinks by default — but interleaved <think> blocks break native tool-call
// emission, causing the agentic loop to spin without ever producing tool_calls. Force
// /no_think on the last user turn in agentic mode for these models.
const QWEN3_FAMILY_RE = /^qwen3/i

// Text-based tool prompt. Uses bare JSON format — Qwen2.5-Coder models follow this reliably
// (they tend to ignore XML-style <tool_call> tags and output prose+bash-blocks instead).
const TEXT_TOOL_PROMPT = `You have access to tools. To call a tool, output ONLY a single JSON object on its own line — no explanation, no markdown, nothing else:
{"name":"TOOL_NAME","arguments":{"param":"value"}}

Examples:
{"name":"exec_command","arguments":{"command":"mkdir /home/user/Desktop/myfolder"}}
{"name":"create_directory","arguments":{"path":"/home/user/Desktop/myfolder"}}
{"name":"read_file","arguments":{"path":"/etc/fstab"}}
{"name":"list_directory","arguments":{"path":"/home/user"}}
{"name":"web_search","arguments":{"query":"arch linux pacman tutorial"}}

Available tools:
- exec_command(command) — run a shell command
- read_file(path) — read file contents
- create_directory(path) — create a directory (absolute path)
- write_file(path, content) — write or overwrite a file
- edit_file(path, old_str, new_str) — surgical replacement; old_str must occur exactly once
- list_directory(path) — list directory entries
- get_system_stats() — CPU/RAM/process info
- search_packages(query) — search pacman packages
- remember_fact(fact) — save to long-term memory (ONLY when user explicitly asks)
- web_search(query) — search the web
- web_fetch(url) — fetch a URL

Output ONLY the JSON to call a tool. Once you have all results, give your final answer as normal text.`

function getModelOptions(model: string, ctxOverride?: number): { num_gpu: number; num_ctx: number } {
  const opts = MODEL_OPTIONS[model] ?? DEFAULT_OPTIONS
  if (!ctxOverride) return opts
  return { ...opts, num_ctx: Math.min(ctxOverride, opts.num_ctx) }
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'exec_command',
      description: 'Run a shell command on the host system.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The bash command to run.' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file from disk.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Full path to the file.' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_system_stats',
      description: 'Get real-time CPU, RAM, and top process information.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_packages',
      description: 'Search for system packages using pacman.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Package name or keyword.' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_directory',
      description: 'Create a new directory on disk.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to create.' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file with specific content.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path.' },
          content: { type: 'string', description: 'File content.' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Edit an existing file by replacing one specific string with another. The old_str must appear EXACTLY ONCE in the file (include enough surrounding context to make it unique). Safer than write_file because it preserves the rest of the file.',
      parameters: {
        type: 'object',
        properties: {
          path:    { type: 'string', description: 'Absolute path to the existing file.' },
          old_str: { type: 'string', description: 'The exact text to find. Must occur exactly once in the file.' },
          new_str: { type: 'string', description: 'The replacement text. Pass an empty string to delete the matched region.' }
        },
        required: ['path', 'old_str', 'new_str']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files in a specific directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path.' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remember_fact',
      description: 'Save a specific technical fact into long-term memory. ONLY call this when the user explicitly asks you to remember something (e.g. "remember that...", "save this for later"). NEVER call this for greetings, small talk, or routine interactions.',
      parameters: {
        type: 'object',
        properties: {
          fact: { type: 'string', description: 'The concise technical fact to remember.' }
        },
        required: ['fact']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information, documentation, news, or error solutions.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query.' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch and read the text content of a specific URL.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The full URL to fetch.' }
        },
        required: ['url']
      }
    }
  }
]

async function executeTool(name: string, args: any, ctx: { searxngUrl: string } = { searxngUrl: '' }): Promise<string> {
  logAgent(`TOOL_CALL: ${name} | ARGS: ${JSON.stringify(args)}`)
  switch (name) {
    case 'exec_command': {
      let cmd = String(args.command ?? '')
      if (cmd.includes('~')) cmd = cmd.replace(/~/g, homedir())
      try {
        const { stdout, stderr } = await execAsync(cmd, { timeout: 30000 })
        logAuditCommand(cmd, 0, 'agent')
        return (stdout + stderr).slice(0, 4000) || '(no output)'
      } catch (e: any) {
        logAuditCommand(cmd, 1, 'agent')
        return `Error: ${e.message}`
      }
    }
    case 'read_file': {
      let p = String(args.path ?? '')
      if (p.startsWith('~')) p = p.replace('~', homedir())
      try {
        const content = await fsPromises.readFile(p, 'utf8')
        return content.slice(0, 4000) || '(empty)'
      } catch (e: any) {
        return `Error: ${e.message}`
      }
    }
    case 'get_system_stats': {
      try {
        const [load, mem, procs] = await Promise.all([si.currentLoad(), si.mem(), si.processes()])
        const top5 = procs.list.sort((a: any, b: any) => b.cpu - a.cpu).slice(0, 5)
        return [
          `CPU: ${load.currentLoad.toFixed(1)}%`,
          `RAM: ${(mem.used / 1e9).toFixed(1)}GB / ${(mem.total / 1e9).toFixed(1)}GB`,
          'Top processes:',
          ...top5.map((p: any) => `  ${p.name} CPU:${p.cpu.toFixed(1)}% MEM:${p.memRss ? Math.round(p.memRss / 1e6) : 0}MB`)
        ].join('\n')
      } catch (e: any) {
        return `Error: ${e.message}`
      }
    }
    case 'search_packages': {
      const q = String(args.query ?? '').replace(/[^a-zA-Z0-9._\-+]/g, '')
      if (!q) return 'Error: Invalid query'
      try {
        const { stdout } = await execAsync(`pacman -Ss "${q}" 2>/dev/null`, { timeout: 10000 })
        return stdout.trim().split('\n').slice(0, 30).join('\n') || 'No packages found'
      } catch {
        return 'No packages found'
      }
    }
    case 'create_directory': {
      let p = String(args.path ?? '')
      if (p.startsWith('~')) p = p.replace('~', homedir())
      if (!p.startsWith('/') || p.includes('..')) return 'Error: Path must be absolute'
      try {
        mkdirSync(p, { recursive: true })
        return `Directory created: ${p}`
      } catch (e: any) {
        return `Error: ${e.message}`
      }
    }
    case 'write_file': {
      let p = String(args.path ?? '')
      if (p.startsWith('~')) p = p.replace('~', homedir())
      const content = String(args.content ?? '')
      if (!p.startsWith('/') || p.includes('..')) return 'Error: Path must be absolute'
      try {
        writeFileSync(p, content, 'utf8')
        return `File written: ${p}`
      } catch (e: any) {
        return `Error: ${e.message}`
      }
    }
    case 'edit_file': {
      let p = String(args.path ?? '')
      if (p.startsWith('~')) p = p.replace('~', homedir())
      const oldStr = String(args.old_str ?? '')
      const newStr = String(args.new_str ?? '')
      if (!p.startsWith('/') || p.includes('..')) return 'Error: Path must be absolute'
      if (!oldStr) return 'Error: old_str cannot be empty'
      try {
        const current = readFileSync(p, 'utf8')
        const first = current.indexOf(oldStr)
        if (first === -1) return `Error: old_str not found in ${p}`
        const second = current.indexOf(oldStr, first + 1)
        if (second !== -1) return `Error: old_str matches multiple locations in ${p}. Provide more surrounding context to make it unique.`
        const updated = current.slice(0, first) + newStr + current.slice(first + oldStr.length)
        writeFileSync(p, updated, 'utf8')
        return `File edited: ${p}`
      } catch (e: any) {
        return `Error: ${e.message}`
      }
    }
    case 'list_directory': {
      let p = String(args.path ?? '/')
      if (p.startsWith('~')) p = p.replace('~', homedir())
      try {
        // Limit to first 100 items to prevent huge data transfers
        const { stdout } = await execAsync(`ls -1 "${p}" | head -n 100`, { timeout: 5000 })
        return stdout || '(empty directory)'
      } catch (e: any) {
        return `Error: ${e.message}`
      }
    }
    case 'remember_fact': {
      addMemoryFact(String(args.fact))
      return 'Fact remembered.'
    }
    case 'web_search': {
      const query = String(args.query ?? '').trim()
      if (!query) return 'Error: No query provided'

      // Try SearXNG first
      const base = ctx.searxngUrl || 'http://localhost:8080'
      try {
        const res = await axios.get(`${base}/search`, {
          params: { q: query, format: 'json', language: 'en' },
          timeout: 6000
        })
        const results: any[] = res.data.results?.slice(0, 6) ?? []
        if (results.length > 0) {
          return results.map((r: any) =>
            `**${r.title}**\n${r.url}\n${r.content ?? ''}`
          ).join('\n\n').slice(0, 4000)
        }
      } catch {}

      // Fallback: DuckDuckGo Instant Answers
      try {
        const res = await axios.get('https://api.duckduckgo.com/', {
          params: { q: query, format: 'json', no_html: 1, skip_disambig: 1 },
          timeout: 8000,
          headers: { 'User-Agent': 'Vortex/2.0' }
        })
        const d = res.data
        const parts: string[] = []
        if (d.AbstractText) parts.push(`**${d.AbstractSource}**: ${d.AbstractText}`)
        if (d.RelatedTopics?.length) {
          parts.push(...d.RelatedTopics.slice(0, 5)
            .filter((t: any) => t.Text)
            .map((t: any) => `- ${t.Text} (${t.FirstURL})`))
        }
        if (parts.length > 0) return parts.join('\n').slice(0, 4000)
        return 'No results found. Try installing SearXNG locally for full web search.'
      } catch (e: any) {
        return `Search failed: ${e.message}`
      }
    }
    case 'web_fetch': {
      const url = String(args.url ?? '').trim()
      if (!url.startsWith('http')) return 'Error: URL must start with http/https'
      try {
        const res = await axios.get(url, {
          timeout: 12000,
          headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
          maxContentLength: 500_000
        })
        const html = String(res.data)
        const text = html
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim()
        return text.slice(0, 4000) || '(empty page)'
      } catch (e: any) {
        return `Fetch failed: ${e.message}`
      }
    }
    default: return 'Error: Unknown tool'
  }
}

async function buildSystemPrompt(model?: string): Promise<string> {
  try {
    const [osInfo, cpu, mem] = await Promise.all([si.osInfo(), si.cpu(), si.mem()])
    const ctxK = model ? Math.round(getModelOptions(model).num_ctx / 1024) : 16
    const home = homedir()
    const username = userInfo().username
    return `You are Quantum, an expert Linux administrator assistant.
OS: ${osInfo.distro} ${osInfo.release} | CPU: ${cpu.brand} | RAM: ${Math.round(mem.total / 1e9)}GB
USER: ${username} | HOME: ${home}
CONTEXT: ${ctxK}k tokens
RULES:
- ONLY use tools when necessary to fulfill a specific request. Do NOT use tools for greetings, thanks, or general conversation.
- When the user says "remember", "save this", "memorize", "note this for later", or any clear request to retain information across chats, CALL remember_fact IMMEDIATELY with the specific fact as the \`fact\` argument. Do not just acknowledge in prose.
- When creating files or directories, ALWAYS use the real home path "${home}".
- To run shell commands, you MUST use the \`exec_command\` tool. DO NOT write bash code blocks unless you are just showing the user code.
- Give complete answers. Never truncate mid-response.`
  } catch {
    return `You are Quantum, a Linux assistant. Home dir: ${homedir()}. To run commands, use the exec_command tool. Do NOT use tools for simple greetings.`
  }
}

function applyExtras(base: string, customPrompt?: string): string {
  const memories = getMemoriesList()
  let s = base
  if (customPrompt?.trim()) s += `\n\nUSER_INSTRUCTION: ${customPrompt}`
  if (memories.length > 0) s += `\n\nMEMORY: ${memories.join(' | ')}`
  return s
}

async function purgeVram(modelName: string) {
  try {
    await axios.post(`${OLLAMA_URL}/api/generate`, { model: modelName, keep_alive: 0 }, { timeout: 8000 })
    console.log(`[Ollama] Explicitly purged ${modelName} from VRAM`)
  } catch (e) {
    console.error(`[Ollama] Purge failed:`, e)
  }
}

// Called by main.ts on window hide and app quit — cancels any active stream and unloads model
export async function cancelAndPurge(): Promise<void> {
  if (activeStream) {
    try { activeStream.destroy() } catch {}
    activeStream = null
  }
  if (lastLoadedModel) {
    await purgeVram(lastLoadedModel)
    lastLoadedModel = null
  }
}

// Collect a full chat response using stream: true so the TCP connection stays alive during
// generation. stream: false makes Ollama buffer the entire response server-side before sending —
// this stalls or times out on large models with RAM spill. Tool calls arrive as complete
// structured objects in Ollama's stream format, so no fragment assembly is needed.
async function collectStream(model: string, messages: any[], extra: Record<string, any> = {}, ctxOverride?: number): Promise<any> {
  const res = await axios.post(`${OLLAMA_URL}/api/chat`, {
    model,
    messages,
    stream: true,
    keep_alive: -1,
    options: getModelOptions(model, ctxOverride),
    ...extra
  }, {
    responseType: 'stream',
    timeout: 300000
  })

  return new Promise((resolve, reject) => {
    const assembled: { role: string; content: string; tool_calls: any[] } = {
      role: 'assistant', content: '', tool_calls: []
    }
    let buf = '', settled = false
    const settle = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); fn() } }
    const timer = setTimeout(() => settle(() => reject(new Error('timeout of 300000ms exceeded'))), 295000)

    res.data.on('data', (chunk: Buffer) => {
      buf += chunk.toString()
      const lines = buf.split('\n')
      buf = lines.pop()!
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const j = JSON.parse(line)
          if (j.error) { settle(() => reject(new Error(j.error))); return }
          if (j.message?.content) assembled.content += j.message.content
          if (j.message?.tool_calls?.length) assembled.tool_calls.push(...j.message.tool_calls)
          if (j.done) settle(() => resolve(assembled))
        } catch {}
      }
    })
    res.data.on('error', (e: Error) => settle(() => reject(e)))
    res.data.on('end', () => settle(() => resolve(assembled)))
  })
}

// Pipe a streaming chat response to the renderer. Includes a 3-min safety timeout so
// ollama-done is always emitted even if the model stream stalls mid-response.
function pipeStreamToWindow(win: BrowserWindow, stream: any): void {
  activeStream = stream
  let buf = '', done = false
  // Modern Ollama emits reasoning in a sibling `thinking` field (DeepSeek-R1, Qwen3 /think).
  // The renderer extracts <think>...</think> from content, so we wrap thinking chunks with
  // synthetic tags to keep one code path.
  let inThinking = false
  const closeThink = () => {
    if (inThinking) { win.webContents.send('ollama-token', '</think>'); inThinking = false }
  }
  const finish = (usage?: { promptTokens: number; completionTokens: number }) => {
    if (done) return
    done = true
    closeThink()
    if (usage) win.webContents.send('ollama-token-usage', usage)
    win.webContents.send('ollama-done')
  }
  const timer = setTimeout(() => { stream.destroy(); finish() }, 180000)
  stream.on('data', (chunk: Buffer) => {
    buf += chunk.toString()
    const lines = buf.split('\n')
    buf = lines.pop()!
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const j = JSON.parse(line)
        const thinking: string | undefined = j.message?.thinking
        const content: string | undefined = j.message?.content
        if (thinking) {
          if (!inThinking) { win.webContents.send('ollama-token', '<think>'); inThinking = true }
          win.webContents.send('ollama-token', thinking)
        }
        if (content) {
          closeThink()
          win.webContents.send('ollama-token', content)
        }
        if (j.done) {
          clearTimeout(timer)
          finish(j.prompt_eval_count ? { promptTokens: j.prompt_eval_count, completionTokens: j.eval_count } : undefined)
        }
      } catch {}
    }
  })
  stream.on('error', () => { clearTimeout(timer); finish() })
  stream.on('end', () => { clearTimeout(timer); finish() })
}

// Agentic loop for models that don't support Ollama's native tool API.
// Injects tool instructions into the system prompt and parses <tool_call> tags from text output.
async function textToolLoop(
  win: BrowserWindow,
  model: string,
  loop: any[],
  toolCtx: { searxngUrl: string },
  maxIter = 6
): Promise<void> {
  try {
    // Inject tool instructions into system prompt
    if (loop[0]?.role === 'system') {
      const home = homedir()
      // Localize examples to use the actual user's home path instead of /home/user
      const localizedPrompt = TEXT_TOOL_PROMPT.replace(/\/home\/user/g, home)
      loop[0] = { ...loop[0], content: loop[0].content + '\n\n' + localizedPrompt }
    }
    let stepId = 0

    for (let iter = 0; iter < maxIter; iter++) {
      win.webContents.send('ollama-agent-step', { type: 'call', name: 'agent', args: { status: 'thinking…' }, stepId: ++stepId })
      const msg = await collectStream(model, loop).catch(e => {
        logAgent(`collectStream Error: ${e.message}`)
        throw e
      })
      if (!msg) break
      loop.push(msg)

      const content: string = msg.content || ''
      const nativeCalls: any[] = msg.tool_calls || []
      logAgent(`MODEL_REPLY [${iter}]: ${content}`)
      if (nativeCalls.length > 0) logAgent(`NATIVE_CALLS: ${JSON.stringify(nativeCalls)}`)
      
      // Always send prose to UI so the user sees what the model is thinking/saying
      if (content.trim()) {
        win.webContents.send('ollama-token', content.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim())
      }

      let toolJson: any = null

      // Pass 0: check native tool_calls (in case model ignores NO_TOOL_MODELS instruction)
      if (nativeCalls.length > 0) {
        const tc = nativeCalls[0]
        toolJson = { 
          name: tc.function?.name, 
          arguments: tc.function?.arguments,
          id: tc.id 
        }
      }

      // Pass 1: <tool_call> XML
      if (!toolJson) {
        const xmlMatch = content.match(/<tool_call>([\s\S]*?)<\/tool_call>/)
        if (xmlMatch) {
          try { toolJson = JSON.parse(xmlMatch[1].trim()) } catch {}
        }
      }

      // Pass 2: any JSON object in content — improved to skip "thought" JSONs
      if (!toolJson) {
        let searchPos = 0
        while (searchPos < content.length) {
          const first = content.indexOf('{', searchPos)
          if (first === -1) break
          
          let depth = 0, end = -1
          for (let i = first; i < content.length; i++) {
            if (content[i] === '{') depth++
            else if (content[i] === '}') {
              if (--depth === 0) { end = i; break }
            }
          }
          
          if (end !== -1) {
            try {
              const p = JSON.parse(content.slice(first, end + 1))
              // Only accept as tool call if it has a 'name' property
              if (p.name && typeof p.name === 'string') {
                toolJson = p
                break
              }
            } catch {}
            searchPos = end + 1
          } else {
            break
          }
        }
      }

      // Pass 3: bash/shell code block → exec_command
      if (!toolJson) {
        const bashMatch = content.match(/```(?:bash|sh|shell|zsh|console|cmd)?\s*\n([\s\S]*?)```/)
        if (bashMatch) {
          const cmd = bashMatch[1].trim()
          if (cmd) toolJson = { name: 'exec_command', arguments: { command: cmd } }
        }
      }

      if (!toolJson) {
        // No tool call detected — this was the final response
        win.webContents.send('ollama-done')
        return
      }

      try {
        const parsed = toolJson
        const fnName: string = parsed.name ?? ''
        const rawArgs = parsed.arguments ?? parsed.args ?? parsed.parameters ?? {}
        const fnArgs = typeof rawArgs === 'string'
          ? (() => { try { return JSON.parse(rawArgs) } catch { return {} } })()
          : rawArgs
        const id = ++stepId
        
        win.webContents.send('ollama-agent-step', { type: 'call', name: fnName, args: fnArgs, stepId: id })
        const result = await executeTool(fnName, fnArgs, toolCtx)
        win.webContents.send('ollama-agent-step', { type: 'result', name: fnName, result, stepId: id })
        
        if (parsed.id) {
          loop.push({ role: 'tool', content: result, tool_call_id: parsed.id })
        } else {
          loop.push({ role: 'user', content: `<tool_result name="${fnName}">${result}</tool_result>` })
        }
      } catch (e: any) {
        logAgent(`tool execution error: ${e.message}`)
        loop.push({ role: 'user', content: `<tool_result>Error: ${e.message}</tool_result>` })
      }
    }

    // Max iterations reached — stream final answer
    const finalRes = await axios.post(`${OLLAMA_URL}/api/chat`, {
      model, messages: loop, stream: true, keep_alive: -1, options: getModelOptions(model)
    }, { responseType: 'stream' })
    pipeStreamToWindow(win, finalRes.data)
  } catch (e: any) {
    logAgent(`textToolLoop Fatal Error: ${e.message}`)
    win.webContents.send('ollama-token', `\n\n[Agent Error: ${e.message}]`)
    win.webContents.send('ollama-done')
  }
}

export async function getEmbedding(model: string, text: string): Promise<number[]> {
  try {
    const res = await axios.post(`${OLLAMA_URL}/api/embeddings`, { model, prompt: text })
    return res.data.embedding
  } catch (e: any) {
    console.error(`[Ollama] Embedding failed:`, e.message)
    throw e
  }
}

export function setupOllamaHandlers(win: BrowserWindow) {
  ipcMain.handle('ollama-list-models', async () => {
    try {
      const response = await axios.get(`${OLLAMA_URL}/api/tags`)
      return response.data.models || []
    } catch { return [] }
  })

  ipcMain.handle('ollama-chat', async (event, { model, messages, customPrompt, images }) => {
    try {
      if (lastLoadedModel && lastLoadedModel !== model) {
        await purgeVram(lastLoadedModel)
      }
      lastLoadedModel = model

      const sysContent = applyExtras(await buildSystemPrompt(model), customPrompt)
      const fullMessages = [{ role: 'system', content: sysContent }, ...messages]

      // Attach images to the last message if it's from the user
      if (images && images.length > 0) {
        const lastMsg = fullMessages[fullMessages.length - 1]
        if (lastMsg && lastMsg.role === 'user') {
          lastMsg.images = images
        }
      }

      const response = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model,
        messages: fullMessages,
        stream: true,
        keep_alive: -1,
        options: getModelOptions(model)
      }, {
        responseType: 'stream'
      })

      pipeStreamToWindow(win, response.data)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.response?.data?.error ?? e.message }
    }
  })

  ipcMain.handle('ollama-agentic-chat', async (event, { model, messages, customPrompt, searxngUrl }) => {
    try {
      if (lastLoadedModel && lastLoadedModel !== model) await purgeVram(lastLoadedModel)
      lastLoadedModel = model

      const toolCtx = { searxngUrl: searxngUrl || 'http://localhost:8080' }
      const sysContent = applyExtras(await buildSystemPrompt(model), customPrompt)
      let baseMsgs = messages.filter((m: any) => m.role !== 'tool_step')
      // Force /no_think for Qwen3 in agentic mode — thinking breaks native tool_calls.
      if (QWEN3_FAMILY_RE.test(model) && baseMsgs.length > 0) {
        const lastIdx = baseMsgs.length - 1
        const last = baseMsgs[lastIdx]
        if (last?.role === 'user' && typeof last.content === 'string' && !/\/no_think\b/.test(last.content)) {
          baseMsgs = [...baseMsgs.slice(0, lastIdx), { ...last, content: `${last.content.replace(/\s*\/think\s*$/i, '')} /no_think`.trim() }]
        }
      }
      const loop: any[] = [{ role: 'system', content: sysContent }, ...baseMsgs]

      // Skip the agentic tool loop entirely for greetings and acknowledgements.
      // System-prompt rules alone are not enough — models still call exec_command/remember_fact
      // on "hi". Detecting at code level and bypassing tool plumbing is the only reliable fix.
      const lastUserMsg = (baseMsgs.filter((m: any) => m.role === 'user').slice(-1)[0]?.content ?? '').trim()
      const GREETING_RE = /^(hi+|hello|hey|sup|yo|howdy|hiya|greetings|good\s+(morning|afternoon|evening|day)|what'?s\s+up|how are you|how'?re you|thanks?(\s+you)?|ok+|okay|cool|nice|great|sure|got it|sounds good)\b[.!?,]?$/i
      if (GREETING_RE.test(lastUserMsg)) {
        const simpleRes = await collectStream(model, loop)
        win.webContents.send('ollama-token', simpleRes?.content || '')
        win.webContents.send('ollama-done')
        return { success: true }
      }

      // Models known to not support native tool API — use text-based tool loop directly
      if (NO_TOOL_MODELS.has(model)) {
        win.webContents.send('ollama-agent-step', {
          type: 'result', name: 'notice',
          result: `${model} uses text-based tool mode (no native tool API).`, stepId: 0
        })
        await textToolLoop(win, model, loop, toolCtx)
        return { success: true }
      }
      let stepId = 0

      for (let iter = 0; iter < 6; iter++) {
        let msg: any
        try {
          msg = await collectStream(model, loop, { tools: TOOLS })
        } catch (e: any) {
          // Any error (tool-unsupported, timeout, connection drop) → text-based fallback.
          // Re-throwing here would return { success: false } with an empty UI bubble.
          NO_TOOL_MODELS.add(model)
          win.webContents.send('ollama-agent-step', {
            type: 'result', name: 'notice',
            result: `${model} switching to text-based tool mode.`, stepId: 0
          })
          await textToolLoop(win, model, loop, toolCtx)
          return { success: true }
        }
        if (!msg) break
        loop.push(msg)

        const toolCalls: any[] = msg.tool_calls ?? []
        if (!toolCalls.length) {
          // Emit the already-complete response directly — making a second streaming call
          // with a conversation ending in an assistant turn causes Qwen models to hang.
          win.webContents.send('ollama-token', msg.content || '')
          win.webContents.send('ollama-done')
          return { success: true }
        }

        for (const tc of toolCalls) {
          const fnName: string = tc.function?.name ?? ''
          const rawArgs = tc.function?.arguments
          const fnArgs = typeof rawArgs === 'string'
            ? (() => { try { return JSON.parse(rawArgs) } catch { return {} } })()
            : (rawArgs ?? {})
          const id = ++stepId
          win.webContents.send('ollama-agent-step', { type: 'call', name: fnName, args: fnArgs, stepId: id })
          const result = await executeTool(fnName, fnArgs, toolCtx)
          win.webContents.send('ollama-agent-step', { type: 'result', name: fnName, result, stepId: id })
          loop.push({ role: 'tool', content: result })
        }
        // Stream final answer WITHOUT tools — prevents the model from chaining another
        // tool call instead of giving a text response, which caused empty bubbles on 8B.
        const finalRes = await axios.post(`${OLLAMA_URL}/api/chat`, {
          model, messages: loop, stream: true, keep_alive: -1, options: getModelOptions(model)
        }, { responseType: 'stream' })
        pipeStreamToWindow(win, finalRes.data)
        return { success: true }
      }
      win.webContents.send('ollama-token', '\n\n_[Max tool iterations reached]_')
      win.webContents.send('ollama-done')
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.response?.data?.error ?? e.message }
    }
  })

  ipcMain.handle('ollama-orchestrate', async (event, { model, messages, customPrompt, searxngUrl }) => {
    try {
      if (lastLoadedModel && lastLoadedModel !== model) await purgeVram(lastLoadedModel)
      lastLoadedModel = model

      const toolCtx = { searxngUrl: searxngUrl || 'http://localhost:8080' }
      const sysPrompt = applyExtras(await buildSystemPrompt(model), customPrompt)
      const userQuery = messages.filter((m: any) => m.role !== 'tool_step').slice(-1)[0]?.content ?? ''

      // Stage 1: Planner — decompose query into specialist subtasks
      const plannerMsg = await collectStream(model, [
        { role: 'system', content: 'You are a task planner. Decompose the user query into 2-3 focused subtasks for specialist agents. Respond ONLY with a JSON array, no markdown, no explanation. Format: [{"role":"Role Name","task":"specific task description"}]' },
        { role: 'user', content: userQuery }
      ], {}, 8192)

      let subtasks: Array<{ role: string; task: string }> = []
      try {
        const raw = plannerMsg?.content ?? ''
        const match = raw.match(/\[[\s\S]*\]/)
        if (match) subtasks = JSON.parse(match[0])
      } catch {}
      if (!subtasks.length || !Array.isArray(subtasks)) {
        subtasks = [{ role: 'Analyst', task: userQuery }]
      }

      win.webContents.send('ollama-orch-agent', {
        agentId: 0, role: 'Planner', status: 'done',
        output: `Delegating to: ${subtasks.map((s: any) => s.role).join(' → ')}`
      })

      // Stage 2: Workers — each runs a focused agentic mini-loop
      const workerOutputs: string[] = []
      for (let i = 0; i < subtasks.length; i++) {
        const { role, task } = subtasks[i]
        const agentId = i + 1
        win.webContents.send('ollama-orch-agent', { agentId, role, status: 'working' })

        const workerLoop: any[] = [
          {
            role: 'system',
            content: `${sysPrompt}\n\nYou are the ${role} specialist agent. Your task: ${task}\nBe concise and factual. Use tools to gather data if needed. Report findings directly.`
          },
          { role: 'user', content: task }
        ]

        let workerOutput = ''
        let workerUseTools = !NO_TOOL_MODELS.has(model)
        for (let iter = 0; iter < 4; iter++) {
          let msg: any
          try {
            msg = await collectStream(model, workerLoop, workerUseTools ? { tools: TOOLS } : {}, 16384)
          } catch (e: any) {
            const errMsg: string = (e.response?.data?.error ?? e.message ?? '').toLowerCase()
            if (workerUseTools && (errMsg.includes('tool') || errMsg.includes('not support'))) {
              NO_TOOL_MODELS.add(model)
              workerUseTools = false
              msg = await collectStream(model, workerLoop, {}, 16384)
            } else { throw e }
          }
          if (!msg) break
          workerLoop.push(msg)
          const toolCalls: any[] = msg.tool_calls ?? []
          if (!toolCalls.length) {
            workerOutput = msg.content || ''
            break
          }
          for (const tc of toolCalls) {
            const rawArgs = tc.function?.arguments
            const fnArgs = typeof rawArgs === 'string'
              ? (() => { try { return JSON.parse(rawArgs) } catch { return {} } })()
              : (rawArgs ?? {})
            const result = await executeTool(tc.function?.name ?? '', fnArgs, toolCtx)
            workerLoop.push({ role: 'tool', content: result })
          }
        }
        if (!workerOutput) {
          const last = workerLoop[workerLoop.length - 1]
          workerOutput = last?.content || '(no output)'
        }

        workerOutputs.push(`## ${role}\n${workerOutput}`)
        win.webContents.send('ollama-orch-agent', { agentId, role, status: 'done', output: workerOutput })
      }

      // Stage 3: Synthesizer — stream final unified response
      const synthMessages = [
        {
          role: 'system',
          content: `${sysPrompt}\n\nYou are synthesizing findings from multiple specialist agents into one clear, comprehensive answer for the user. Do not repeat agent labels; just write the final answer in your own voice.`
        },
        {
          role: 'user',
          content: `Original question: ${userQuery}\n\nAgent findings:\n${workerOutputs.join('\n\n')}`
        }
      ]
      const synthRes = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model, messages: synthMessages, stream: true, keep_alive: -1,
        options: getModelOptions(model)
      }, { responseType: 'stream' })
      pipeStreamToWindow(win, synthRes.data)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.response?.data?.error ?? e.message }
    }
  })

  ipcMain.handle('ollama-pull-model', async (event, { name }) => {
    try {
      const response = await axios.post(`${OLLAMA_URL}/api/pull`, { name, stream: true }, { responseType: 'stream' })
      let pullBuf = ''
      response.data.on('data', (chunk: Buffer) => {
        pullBuf += chunk.toString()
        const lines = pullBuf.split('\n')
        pullBuf = lines.pop()!
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const json = JSON.parse(line)
            win.webContents.send('ollama-pull-progress', { status: json.status, completed: json.completed, total: json.total })
          } catch {}
        }
      })
      return { success: true }
    } catch (e: any) { return { success: false, error: e.response?.data?.error ?? e.message } }
  })

  ipcMain.handle('ollama-delete-model', async (_, { name }) => {
    try {
      await axios.delete(`${OLLAMA_URL}/api/delete`, { data: { name } })
      return { success: true }
    } catch (e: any) { return { success: false, error: e.response?.data?.error ?? e.message } }
  })

  ipcMain.handle('ollama-cancel', async () => {
    if (activeStream) { try { activeStream.destroy() } catch {} }
    activeStream = null
    return { success: true }
  })

  ipcMain.handle('ollama-purge', async () => {
    if (lastLoadedModel) {
      await purgeVram(lastLoadedModel)
      lastLoadedModel = null
    }
    return { success: true }
  })

  // One-shot non-streaming chat — useful for prompt rewrites, classification,
  // and any synchronous helper that needs a single response without UI streaming.
  ipcMain.handle('ollama-quick-chat', async (_e, { model, system, user }: { model: string; system?: string; user: string }) => {
    try {
      if (lastLoadedModel && lastLoadedModel !== model) await purgeVram(lastLoadedModel)
      lastLoadedModel = model
      const messages = [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: user },
      ]
      const res = await collectStream(model, messages)
      return { success: true, content: res?.content || '' }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })
}
