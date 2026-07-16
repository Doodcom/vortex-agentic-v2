import { ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import { kvGetSync, kvSetSync, kvDeleteSync } from './db'

// Ring clip history via ring-client-api (direct Ring cloud API).
// HA only exposes each camera's most recent recording, and past clips' signed
// URLs expire in 15 minutes — full history requires talking to Ring directly.
// The refresh token lives in kv_store and rotates on every API session.

const TOKEN_KEY = 'vortex-ring-refresh-token'
const EMAIL_KEY = 'vortex-ring-email'

type RingApiType = InstanceType<typeof import('ring-client-api').RingApi>
type RingRestClientType = InstanceType<typeof import('ring-client-api/rest-client').RingRestClient>

let ringApi: RingApiType | null = null
// Login in progress: kept between the password step and the 2FA code step
let pendingLogin: RingRestClientType | null = null

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function getApi(): Promise<RingApiType> {
  if (ringApi) return ringApi
  const refreshToken = kvGetSync(TOKEN_KEY)
  if (!refreshToken) throw new Error('Not signed in to Ring')
  // Lazy ESM import — pulls in werift/rxjs etc., so only load when Ring is used
  const { RingApi } = await import('ring-client-api')
  ringApi = new RingApi({ refreshToken, controlCenterDisplayName: 'Vortex Agentic' })
  ringApi.onRefreshTokenUpdated.subscribe(({ newRefreshToken }) => kvSetSync(TOKEN_KEY, newRefreshToken))
  return ringApi
}

export function setupRingHandlers() {
  ipcMain.handle('ring-auth-status', () => ({
    authenticated: !!kvGetSync(TOKEN_KEY),
    email: kvGetSync(EMAIL_KEY),
  }))

  ipcMain.handle('ring-auth-start', async (_, { email, password }: { email: string; password: string }) => {
    const { RingRestClient } = await import('ring-client-api/rest-client')
    pendingLogin = new RingRestClient({ email, password })
    try {
      const auth = await pendingLogin.getCurrentAuth()
      kvSetSync(TOKEN_KEY, auth.refresh_token)
      kvSetSync(EMAIL_KEY, email)
      pendingLogin = null
      ringApi = null
      return { ok: true }
    } catch (e) {
      if (pendingLogin?.using2fa) {
        kvSetSync(EMAIL_KEY, email)
        return { ok: false, need2fa: true, prompt: pendingLogin.promptFor2fa || 'Enter the 2FA code Ring sent you' }
      }
      pendingLogin = null
      return { ok: false, error: errMsg(e) }
    }
  })

  ipcMain.handle('ring-auth-2fa', async (_, { code }: { code: string }) => {
    if (!pendingLogin) return { ok: false, error: 'No login in progress — start over' }
    try {
      const auth = await pendingLogin.getAuth(code)
      kvSetSync(TOKEN_KEY, auth.refresh_token)
      pendingLogin = null
      ringApi = null
      return { ok: true }
    } catch (e) {
      return { ok: false, error: errMsg(e) }
    }
  })

  ipcMain.handle('ring-logout', () => {
    kvDeleteSync(TOKEN_KEY)
    ringApi = null
    pendingLogin = null
    return { ok: true }
  })

  ipcMain.handle('ring-list-cameras', async () => {
    const api = await getApi()
    const cameras = await api.getCameras()
    return cameras.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.deviceType,
      battery: c.batteryLevel,
    }))
  })

  // Clip history for one camera in a [dateFrom, dateTo] ms window (newest first).
  ipcMain.handle('ring-get-history', async (_, { cameraId, dateFrom, dateTo }: { cameraId: number; dateFrom: number; dateTo: number }) => {
    const api = await getApi()
    const cameras = await api.getCameras()
    const camera = cameras.find((c) => c.id === cameraId)
    if (!camera) throw new Error(`Unknown Ring camera id ${cameraId}`)
    const res = await camera.videoSearch({ dateFrom, dateTo, order: 'desc' })
    return res.video_search.map((v) => ({
      id: v.ding_id,
      cameraId: camera.id,
      cameraName: camera.name,
      kind: v.kind,
      createdAt: v.created_at,
      duration: v.duration,
      url: v.hq_url || v.untranscoded_url || v.lq_url,
      thumbnailUrl: v.thumbnail_url,
      favorite: v.favorite,
    }))
  })

  // Ring thumbnails are raw H.264 keyframes (content-type image/h264), which
  // <img> can't render — decode to JPEG via ffmpeg and cache per event.
  const thumbCache = new Map<string, string>()

  const h264FrameToJpeg = (input: Buffer): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', ['-loglevel', 'error', '-i', 'pipe:0', '-frames:v', '1', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1'])
      const out: Buffer[] = []
      const err: Buffer[] = []
      ff.stdout.on('data', (d) => out.push(d))
      ff.stderr.on('data', (d) => err.push(d))
      ff.on('close', (code) =>
        code === 0 && out.length ? resolve(Buffer.concat(out)) : reject(new Error(Buffer.concat(err).toString() || `ffmpeg exited ${code}`))
      )
      ff.on('error', reject)
      ff.stdin.on('error', () => {}) // EPIPE if ffmpeg exits before consuming stdin
      ff.stdin.end(input)
    })

  ipcMain.handle('ring-get-thumbnail', async (_, { dingId, url }: { dingId: string; url: string }) => {
    const cached = thumbCache.get(dingId)
    if (cached) return cached
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`Thumbnail fetch failed: HTTP ${resp.status}`)
    const raw = Buffer.from(await resp.arrayBuffer())
    const contentType = resp.headers.get('content-type') || ''
    const isRealImage = contentType.startsWith('image/') && !contentType.includes('h264')
    const jpeg = isRealImage ? raw : await h264FrameToJpeg(raw)
    const dataUrl = `data:image/jpeg;base64,${jpeg.toString('base64')}`
    thumbCache.set(dingId, dataUrl)
    return dataUrl
  })

  // videoSearch URLs expire — fetch a fresh one right before playback
  ipcMain.handle('ring-get-recording-url', async (_, { cameraId, dingId }: { cameraId: number; dingId: string }) => {
    const api = await getApi()
    const cameras = await api.getCameras()
    const camera = cameras.find((c) => c.id === cameraId)
    if (!camera) throw new Error(`Unknown Ring camera id ${cameraId}`)
    return camera.getRecordingUrl(dingId, { transcoded: true })
  })
}
