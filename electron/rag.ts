import { ipcMain, dialog } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getEmbedding } from './ollama'
import { saveRagChunks, clearProjectRag, getProjectRag } from './db'

const CHUNK_SIZE = 1500   // chars per chunk
const CHUNK_OVERLAP = 300 // overlap between consecutive chunks
const TOP_K = 6           // max chunks returned per query
const MAX_PER_FILE = 2    // max chunks from any single file
const EMBED_MODEL = 'nomic-embed-text' // standard embedding model

interface ProjectFile {
  path: string
  name: string
  content: string
}

interface Chunk {
  filePath: string
  fileName: string
  chunkIndex: number
  content: string
  embedding?: number[]
}

let fileIndex: string[] = []
let currentProjectPath: string | null = null

function buildChunks(file: ProjectFile): Chunk[] {
  const chunks: Chunk[] = []
  let start = 0
  while (start < file.content.length) {
    chunks.push({
      filePath: file.path,
      fileName: file.name,
      chunkIndex: chunks.length,
      content: file.content.slice(start, start + CHUNK_SIZE)
    })
    start += CHUNK_SIZE - CHUNK_OVERLAP
  }
  return chunks
}

function cosineSimilarity(a: number[], b: Float32Array): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB))
  return isNaN(similarity) ? 0 : similarity
}

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.c', '.cpp', '.h',
  '.rs', '.go', '.md', '.txt', '.css', '.html', '.json',
  '.yaml', '.yml', '.toml', '.sh', '.bash', '.env.example'
])

const IGNORE_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', 'vendor', 'venv', '__pycache__', '.next', 'out'
])

async function scanDirectory(dir: string, baseDir: string): Promise<ProjectFile[]> {
  const files: ProjectFile[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.name.startsWith('.') || IGNORE_DIRS.has(entry.name)) continue
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await scanDirectory(fullPath, baseDir)))
    } else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      try {
        const content = await fs.readFile(fullPath, 'utf8')
        files.push({
          path: path.relative(baseDir, fullPath),
          name: entry.name,
          content: content.slice(0, 60000)
        })
      } catch { /* skip unreadable */ }
    }
  }
  return files
}

export function setupRagHandlers() {
  ipcMain.handle('rag-select-project', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (canceled || filePaths.length === 0) return null

    currentProjectPath = filePaths[0]
    
    // Check cache
    const existing = getProjectRag(currentProjectPath)
    if (existing.length > 0) {
      fileIndex = [...new Set(existing.map((e: any) => e.filePath))]
      return { path: currentProjectPath, fileCount: fileIndex.length, cached: true }
    }

    const files = await scanDirectory(currentProjectPath, currentProjectPath)
    fileIndex = files.map(f => f.path)
    
    const chunks: any[] = []
    for (const file of files) {
      const fileChunks = buildChunks(file)
      for (const chunk of fileChunks) {
        try {
          const embedding = await getEmbedding(EMBED_MODEL, chunk.content)
          chunks.push({ ...chunk, embedding })
        } catch (e) {
          console.error(`[RAG] Failed to embed chunk in ${chunk.filePath}`)
        }
      }
    }

    if (chunks.length > 0) {
      saveRagChunks(currentProjectPath, chunks)
    }

    return { path: currentProjectPath, fileCount: files.length, cached: false }
  })

  ipcMain.handle('rag-get-context', async (_, query: string) => {
    if (!currentProjectPath) return ''

    const existing = getProjectRag(currentProjectPath)
    if (!existing.length) return ''

    try {
      const queryVector = await getEmbedding(EMBED_MODEL, query)
      
      const scored = existing.map((row: any) => {
        const chunkVector = new Float32Array(row.embedding.buffer)
        return {
          filePath: row.filePath,
          chunkIndex: row.chunkIndex,
          content: row.content,
          score: cosineSimilarity(queryVector, chunkVector)
        }
      })
      .filter(item => item.score > 0.4) // threshold
      .sort((a, b) => b.score - a.score)

      const fileCounts = new Map<string, number>()
      const selected: any[] = []
      for (const item of scored) {
        const count = fileCounts.get(item.filePath) ?? 0
        if (count >= MAX_PER_FILE) continue
        fileCounts.set(item.filePath, count + 1)
        selected.push(item)
        if (selected.length >= TOP_K) break
      }

      if (!selected.length) return ''

      const projectName = path.basename(currentProjectPath)
      const header = `Project Context: ${projectName} (${fileIndex.length} files)\n`
      const body = selected
        .map(c => `--- ${c.filePath}${c.chunkIndex > 0 ? ` (part ${c.chunkIndex + 1})` : ''} ---\n${c.content}`)
        .join('\n\n')

      return header + '\n' + body
    } catch (e) {
      console.error('[RAG] Retrieval failed:', e)
      return ''
    }
  })

  ipcMain.handle('rag-status', () => ({
    path: currentProjectPath,
    fileCount: fileIndex.length
  }))

  ipcMain.handle('rag-clear-cache', () => {
    if (currentProjectPath) {
      clearProjectRag(currentProjectPath)
      return { success: true }
    }
    return { success: false }
  })
}
