import axios from 'axios'
import { ipcMain, BrowserWindow } from 'electron'
import { getMemoriesList, addMemoryFact, logAuditCommand } from './db'
import si from 'systeminformation'
import { exec } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { promisify } from 'node:util'

const execAsync = promisify(exec)
const OLLAMA_URL = 'http://127.0.0.1:11434'

let activeStream: any = null
let lastLoadedModel: string | null = null
let cachedSystemPrompt = ''

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
      description: 'Save a discovery or fact into long-term AI memory.',
      parameters: {
        type: 'object',
        properties: {
          fact: { type: 'string', description: 'The concise fact to remember.' }
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
  switch (name) {
    case 'exec_command': {
      const cmd = String(args.command ?? '')
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
      const p = String(args.path ?? '')
      try {
        const { stdout } = await execAsync(`cat "${p}"`, { timeout: 5000 })
        return stdout.slice(0, 4000) || '(empty)'
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
        const { stdout } = await execAsync(`pacman -Ss ${q} 2>/dev/null`, { timeout: 10000 })
        return stdout.trim().split('\n').slice(0, 30).join('\n') || 'No packages found'
      } catch {
        return 'No packages found'
      }
    }
    case 'create_directory': {
      const p = String(args.path ?? '')
      if (!p.startsWith('/') || p.includes('..')) return 'Error: Path must be absolute'
      try {
        mkdirSync(p, { recursive: true })
        return `Directory created: ${p}`
      } catch (e: any) {
        return `Error: ${e.message}`
      }
    }
    case 'write_file': {
      const p = String(args.path ?? '')
      const content = String(args.content ?? '')
      if (!p.startsWith('/') || p.includes('..')) return 'Error: Path must be absolute'
      try {
        writeFileSync(p, content, 'utf8')
        return `File written: ${p}`
      } catch (e: any) {
        return `Error: ${e.message}`
      }
    }
    case 'list_directory': {
      const p = String(args.path ?? '/')
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

async function buildSystemPrompt(isGreeting: boolean = false): Promise<string> {
  try {
    const [os, cpu, mem] = await Promise.all([si.osInfo(), si.cpu(), si.mem()])
    if (isGreeting) {
      return `You are Quantum, a concise AI assistant. You are running on a high-end Linux machine. Say hello and wait for instructions. No technical fluff.`
    }
    return `You are Quantum, an expert Linux administrator assistant.
SYSTEM: ${os.distro} ${os.release}, CPU: ${cpu.brand}, RAM: ${Math.round(mem.total / 1e9)}GB.
BEHAVIOUR: Give direct technical answers. You have a large 32k context window; you can handle long files and complex history. ALWAYS use markdown code blocks (\`\`\`) for commands, code snippets, image prompts (Positive/Negative), or any structured text you want the user to be able to copy easily. Use \`\`\`bash for shell commands. Be brief.`
  } catch {
    return 'You are Quantum, a concise AI assistant.'
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
    await axios.post(`${OLLAMA_URL}/api/generate`, { model: modelName, keep_alive: 0 })
    console.log(`[Ollama] Explicitly purged ${modelName} from VRAM`)
  } catch (e) {
    console.error(`[Ollama] Purge failed:`, e)
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
      const userText = messages[messages.length - 1]?.content ?? ''
      const isGreeting = userText.toLowerCase().trim() === 'hello' || userText.toLowerCase().trim() === 'hi'
      
      if (lastLoadedModel && lastLoadedModel !== model) {
        await purgeVram(lastLoadedModel)
      }
      lastLoadedModel = model

      const sysContent = applyExtras(await buildSystemPrompt(isGreeting), customPrompt)
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
        options: {
          num_gpu: 99,
          num_ctx: 32768
        }
      }, {
        responseType: 'stream'
      })

      activeStream = response.data
      response.data.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n')) {
          if (!line.trim()) continue
          try {
            const json = JSON.parse(line)
            if (json.message) win.webContents.send('ollama-token', json.message.content)
            if (json.done) {
              if (json.prompt_eval_count) win.webContents.send('ollama-token-usage', { promptTokens: json.prompt_eval_count, completionTokens: json.eval_count })
              win.webContents.send('ollama-done')
            }
          } catch {}
        }
      })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('ollama-agentic-chat', async (event, { model, messages, customPrompt, searxngUrl }) => {
    try {
      if (lastLoadedModel && lastLoadedModel !== model) await purgeVram(lastLoadedModel)
      lastLoadedModel = model

      const toolCtx = { searxngUrl: searxngUrl || 'http://localhost:8080' }
      const sysContent = applyExtras(await buildSystemPrompt(false), customPrompt)
      const loop: any[] = [{ role: 'system', content: sysContent }, ...messages.filter((m: any) => m.role !== 'tool_step')]
      let stepId = 0

      for (let iter = 0; iter < 6; iter++) {
        const res = await axios.post(`${OLLAMA_URL}/api/chat`, { 
          model, 
          messages: loop, 
          tools: TOOLS, 
          stream: false, 
          keep_alive: -1,
          options: {
            num_gpu: 99,
            num_ctx: 32768
          }
        })
        const msg = res.data.message
        loop.push(msg)

        if (!msg.tool_calls?.length) {
          const streamRes = await axios.post(`${OLLAMA_URL}/api/chat`, { 
            model, 
            messages: loop, 
            stream: true, 
            keep_alive: -1,
            options: {
              num_gpu: 99,
              num_ctx: 32768
            }
          }, { responseType: 'stream' })
          activeStream = streamRes.data
          streamRes.data.on('data', (chunk: Buffer) => {
            for (const line of chunk.toString().split('\n')) {
              if (!line.trim()) continue
              try {
                const j = JSON.parse(line)
                if (j.message?.content) win.webContents.send('ollama-token', j.message.content)
                if (j.done) {
                  if (j.prompt_eval_count) win.webContents.send('ollama-token-usage', { promptTokens: j.prompt_eval_count, completionTokens: j.eval_count })
                  win.webContents.send('ollama-done')
                }
              } catch {}
            }
          })
          return { success: true }
        }

        for (const tc of msg.tool_calls) {
          const id = ++stepId
          win.webContents.send('ollama-agent-step', { type: 'call', name: tc.function.name, args: tc.function.arguments, stepId: id })
          const result = await executeTool(tc.function.name, tc.function.arguments, toolCtx)
          win.webContents.send('ollama-agent-step', { type: 'result', name: tc.function.name, result, stepId: id })
          loop.push({ role: 'tool', content: result })
        }
      }
      win.webContents.send('ollama-done')
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('ollama-orchestrate', async (event, { model, messages, customPrompt, searxngUrl }) => {
    try {
      if (lastLoadedModel && lastLoadedModel !== model) await purgeVram(lastLoadedModel)
      lastLoadedModel = model

      const toolCtx = { searxngUrl: searxngUrl || 'http://localhost:8080' }
      const sysPrompt = applyExtras(await buildSystemPrompt(false), customPrompt)
      const userQuery = messages.filter((m: any) => m.role !== 'tool_step').slice(-1)[0]?.content ?? ''

      // Stage 1: Planner — decompose query into specialist subtasks
      const plannerRes = await axios.post(`${OLLAMA_URL}/api/chat`, {
        model,
        messages: [
          { role: 'system', content: 'You are a task planner. Decompose the user query into 2-3 focused subtasks for specialist agents. Respond ONLY with a JSON array, no markdown, no explanation. Format: [{"role":"Role Name","task":"specific task description"}]' },
          { role: 'user', content: userQuery }
        ],
        stream: false,
        keep_alive: -1,
        options: { num_gpu: 99, num_ctx: 8192 }
      })

      let subtasks: Array<{ role: string; task: string }> = []
      try {
        const raw = plannerRes.data.message.content
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
        for (let iter = 0; iter < 4; iter++) {
          const res = await axios.post(`${OLLAMA_URL}/api/chat`, {
            model, messages: workerLoop, tools: TOOLS, stream: false, keep_alive: -1,
            options: { num_gpu: 99, num_ctx: 16384 }
          })
          const msg = res.data.message
          workerLoop.push(msg)
          if (!msg.tool_calls?.length) {
            workerOutput = msg.content || ''
            break
          }
          for (const tc of msg.tool_calls) {
            const result = await executeTool(tc.function.name, tc.function.arguments, toolCtx)
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
        options: { num_gpu: 99, num_ctx: 32768 }
      }, { responseType: 'stream' })

      activeStream = synthRes.data
      synthRes.data.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n')) {
          if (!line.trim()) continue
          try {
            const j = JSON.parse(line)
            if (j.message?.content) win.webContents.send('ollama-token', j.message.content)
            if (j.done) {
              if (j.prompt_eval_count) win.webContents.send('ollama-token-usage', { promptTokens: j.prompt_eval_count, completionTokens: j.eval_count })
              win.webContents.send('ollama-done')
            }
          } catch {}
        }
      })
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('ollama-pull-model', async (event, { name }) => {
    try {
      const response = await axios.post(`${OLLAMA_URL}/api/pull`, { name, stream: true }, { responseType: 'stream' })
      response.data.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n')) {
          if (!line.trim()) continue
          try {
            const json = JSON.parse(line)
            win.webContents.send('ollama-pull-progress', { status: json.status, completed: json.completed, total: json.total })
          } catch {}
        }
      })
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
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
}
