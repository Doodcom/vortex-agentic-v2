import Database from 'better-sqlite3'
import path from 'node:path'
import { app, ipcMain } from 'electron'
import si from 'systeminformation'

export let db: Database.Database

export function setupDbHandlers() {
  const dbPath = path.join(app.getPath('userData'), 'vortex.db')
  db = new Database(dbPath)

  db.exec(`
    CREATE TABLE IF NOT EXISTS vault_sync_config (
      id          INTEGER PRIMARY KEY CHECK (id = 1),
      remote_name TEXT NOT NULL,
      remote_path TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_memory (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      fact       TEXT    NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      command    TEXT    NOT NULL,
      exit_code  INTEGER,
      source     TEXT    NOT NULL DEFAULT 'terminal',
      session_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL DEFAULT 'New Chat',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL DEFAULT 1,
      role       TEXT    NOT NULL,
      content    TEXT    NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS rag_chunks (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      project_path TEXT    NOT NULL,
      file_path    TEXT    NOT NULL,
      chunk_index  INTEGER NOT NULL,
      content      TEXT    NOT NULL,
      embedding    BLOB,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS resource_history (
      ts     INTEGER NOT NULL,
      cpu    REAL    NOT NULL DEFAULT 0,
      ram    REAL    NOT NULL DEFAULT 0,
      gpu    REAL    NOT NULL DEFAULT 0,
      disk   REAL    NOT NULL DEFAULT 0,
      net_rx REAL    NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_rh_ts ON resource_history (ts);
  `)

  // Migrate: add session_id column if it doesn't exist yet
  try {
    db.exec('ALTER TABLE messages ADD COLUMN session_id INTEGER NOT NULL DEFAULT 1')
  } catch { /* column already exists */ }

  // Ensure at least one default session exists
  const count = (db.prepare('SELECT COUNT(*) as n FROM sessions').get() as any).n
  if (count === 0) db.prepare("INSERT INTO sessions (name) VALUES ('Default Chat')").run()

  // ── Sessions ──────────────────────────────────────────────────────────────
  ipcMain.handle('db-get-sessions', () =>
    db.prepare('SELECT id, name, created_at, updated_at FROM sessions ORDER BY updated_at DESC').all()
  )

  ipcMain.handle('db-create-session', (_, name = 'New Chat') => {
    const res = db.prepare("INSERT INTO sessions (name) VALUES (?)").run(name)
    return { id: res.lastInsertRowid, name }
  })

  ipcMain.handle('db-rename-session', (_, { id, name }: { id: number; name: string }) => {
    db.prepare('UPDATE sessions SET name = ? WHERE id = ?').run(name, id)
    return { success: true }
  })

  ipcMain.handle('db-delete-session', (_, id: number) => {
    db.prepare('DELETE FROM messages WHERE session_id = ?').run(id)
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
    return { success: true }
  })

  ipcMain.handle('db-touch-session', (_, id: number) => {
    db.prepare('UPDATE sessions SET updated_at = unixepoch() WHERE id = ?').run(id)
    return { success: true }
  })

  // ── Messages ──────────────────────────────────────────────────────────────
  ipcMain.handle('db-get-messages', (_, sessionId?: number) => {
    if (sessionId != null) {
      return db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC').all(sessionId)
    }
    // Legacy: return latest session messages
    const latest = db.prepare('SELECT id FROM sessions ORDER BY updated_at DESC LIMIT 1').get() as any
    if (!latest) return []
    return db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC').all(latest.id)
  })

  ipcMain.handle('db-save-message', (_, msg: { role: string; content: string; sessionId?: number }) => {
    const sid = msg.sessionId ?? 1
    db.prepare('INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)').run(sid, msg.role, msg.content)
    db.prepare('UPDATE sessions SET updated_at = unixepoch() WHERE id = ?').run(sid)
    return { success: true }
  })

  ipcMain.handle('db-clear-messages', (_, sessionId?: number) => {
    if (sessionId != null) {
      db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId)
    } else {
      db.prepare('DELETE FROM messages').run()
    }
    return { success: true }
  })

  // ── Audit Log ─────────────────────────────────────────────────────────────
  ipcMain.handle('db-log-command', (_, entry: { command: string; exit_code?: number; source?: string; session_id?: number }) => {
    db.prepare('INSERT INTO audit_log (command, exit_code, source, session_id) VALUES (?, ?, ?, ?)').run(
      entry.command, entry.exit_code ?? null, entry.source ?? 'terminal', entry.session_id ?? null
    )
    return { success: true }
  })

  ipcMain.handle('db-get-audit-log', (_, limit = 300) => {
    return db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit)
  })

  ipcMain.handle('db-clear-audit-log', () => {
    db.prepare('DELETE FROM audit_log').run()
    return { success: true }
  })

  // ── AI Memory ─────────────────────────────────────────────────────────────
  ipcMain.handle('memory-get-all', () =>
    db.prepare('SELECT id, fact, created_at FROM ai_memory ORDER BY id DESC').all()
  )
  ipcMain.handle('memory-add', (_, fact: string) => {
    if (!fact.trim()) return { success: false }
    db.prepare('INSERT INTO ai_memory (fact) VALUES (?)').run(fact.trim())
    return { success: true }
  })
  ipcMain.handle('memory-delete', (_, id: number) => {
    db.prepare('DELETE FROM ai_memory WHERE id = ?').run(id)
    return { success: true }
  })
  ipcMain.handle('memory-clear', () => {
    db.prepare('DELETE FROM ai_memory').run()
    return { success: true }
  })

  // ── Resource History ───────────────────────────────────────────────────────
  ipcMain.handle('db-get-resource-history', (_, hours: number = 24) => {
    const since = Math.floor(Date.now() / 1000) - hours * 3600
    return db.prepare('SELECT ts, cpu, ram, gpu, disk, net_rx FROM resource_history WHERE ts >= ? ORDER BY ts ASC').all(since)
  })
}

export function getMemoriesList(): string[] {
  if (!db) return []
  return (db.prepare('SELECT fact FROM ai_memory ORDER BY id ASC').all() as any[]).map((r: any) => r.fact)
}

export function addMemoryFact(fact: string): void {
  if (!db || !fact.trim()) return
  db.prepare('INSERT INTO ai_memory (fact) VALUES (?)').run(fact.trim())
}

export function logAuditCommand(command: string, exitCode: number | null, source: string): void {
  if (!db) return
  db.prepare('INSERT INTO audit_log (command, exit_code, source) VALUES (?, ?, ?)').run(command, exitCode, source)
}

export function logResourceSample(cpu: number, ram: number, gpu: number, disk: number, net_rx: number): void {
  if (!db) return
  const ts = Math.floor(Date.now() / 1000)
  db.prepare('INSERT INTO resource_history (ts, cpu, ram, gpu, disk, net_rx) VALUES (?, ?, ?, ?, ?, ?)').run(ts, cpu, ram, gpu, disk, net_rx)
  // Prune entries older than 25h to keep DB lean
  db.prepare('DELETE FROM resource_history WHERE ts < ?').run(ts - 90000)
}

let _pollerTimer: ReturnType<typeof setInterval> | null = null

export function startResourcePoller(): void {
  if (_pollerTimer) return
  const collect = async () => {
    try {
      const [cpuLoad, mem, fsSize, netStats, gpu] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.networkStats(),
        si.graphics(),
      ])
      const cpu    = cpuLoad.currentLoad ?? 0
      const ram    = mem.total ? (mem.used / mem.total) * 100 : 0
      const rootFs = fsSize.find((f: any) => f.mount === '/') ?? fsSize[0]
      const disk   = rootFs?.use ?? 0
      const net_rx = (netStats[0]?.rx_sec ?? 0) / 1_000_000
      const gpuCtl = gpu?.controllers?.[0]
      const gpuPct = gpuCtl?.utilizationGpu ?? 0
      logResourceSample(cpu, ram, gpuPct, disk, net_rx)
    } catch { /* ignore collection errors */ }
  }
  collect()
  _pollerTimer = setInterval(collect, 30_000)
}

// ── RAG persistence ────────────────────────────────────────────────────────
export function saveRagChunks(projectPath: string, chunks: { filePath: string, chunkIndex: number, content: string, embedding: number[] }[]) {
  const insert = db.prepare('INSERT INTO rag_chunks (project_path, file_path, chunk_index, content, embedding) VALUES (?, ?, ?, ?, ?)')
  const transaction = db.transaction((data: any[]) => {
    for (const item of data) {
      insert.run(projectPath, item.filePath, item.chunkIndex, item.content, Buffer.from(new Float32Array(item.embedding).buffer))
    }
  })
  transaction(chunks)
}

export function clearProjectRag(projectPath: string) {
  db.prepare('DELETE FROM rag_chunks WHERE project_path = ?').run(projectPath)
}

export function getProjectRag(projectPath: string) {
  return db.prepare('SELECT file_path as filePath, chunk_index as chunkIndex, content, embedding FROM rag_chunks WHERE project_path = ?').all(projectPath) as any[]
}
