/* eslint-disable @typescript-eslint/no-explicit-any, no-empty, @typescript-eslint/no-unused-vars, no-useless-escape */
import { ipcMain, dialog } from 'electron'
import { join, extname, resolve } from 'path'
import { homedir, tmpdir } from 'os'
import axios from 'axios'
import { readFileSync, readdirSync, existsSync, unlinkSync, statSync, writeFileSync } from 'fs'
import { execPromise, createSystemHelpers } from './system-common'

export function setupMediaHandlers(win: any) {
  const { notify, streamLog, runStreamingCmd } = createSystemHelpers(win)

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

  // Speech-to-text via local whisper.cpp. Accepts base64 audio (any format ffmpeg can
  // decode — WebM/Opus from MediaRecorder is the common case), converts to 16 kHz mono
  // WAV, then runs whisper-cli. Falls back gracefully when whisper isn't installed.
  ipcMain.handle('voice-transcribe', async (_, { audioBase64, mimeType }: { audioBase64: string; mimeType?: string }) => {
    const whisperBin = `${homedir()}/whisper.cpp/build/bin/whisper-cli`
    const modelPath = `${homedir()}/whisper.cpp/models/ggml-base.en.bin`
    if (!existsSync(whisperBin) || !existsSync(modelPath)) {
      return { success: false, error: 'whisper.cpp not built. See README for setup.' }
    }
    const stamp = Date.now()
    const inPath = `${tmpdir()}/vortex-stt-${stamp}.${mimeType?.includes('webm') ? 'webm' : 'audio'}`
    const wavPath = `${tmpdir()}/vortex-stt-${stamp}.wav`
    try {
      writeFileSync(inPath, Buffer.from(audioBase64, 'base64'))
      await execPromise(`ffmpeg -y -i "${inPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}"`, { timeout: 20000 })
      const { stdout } = await execPromise(`"${whisperBin}" -m "${modelPath}" -f "${wavPath}" -nt -np 2>/dev/null`, { timeout: 60000 })
      try { unlinkSync(inPath); unlinkSync(wavPath) } catch {}
      return { success: true, text: stdout.trim() }
    } catch (e: any) {
      try { unlinkSync(inPath); unlinkSync(wavPath) } catch {}
      return { success: false, error: e.message }
    }
  })

  // Text-to-speech via Piper. Returns base64 WAV the renderer plays via Audio().
  // Piper is optional; if not installed the renderer silently skips TTS.
  ipcMain.handle('voice-speak', async (_, { text }: { text: string }) => {
    const voiceModel = `${homedir()}/.local/share/piper-voices/en_US-amy-medium.onnx`
    try {
      // Verify piper-tts exists in PATH (Arch piper-tts-bin installs as `piper-tts`, not `piper`).
      await execPromise(`which piper-tts`, { timeout: 2000 })
    } catch {
      return { success: false, error: 'piper-tts not installed' }
    }
    if (!existsSync(voiceModel)) {
      return { success: false, error: `Voice model not found at ${voiceModel}` }
    }
    const wavPath = `${tmpdir()}/vortex-tts-${Date.now()}.wav`
    try {
      const safe = text.replace(/'/g, "'\\''")
      await execPromise(`echo '${safe}' | piper-tts --model "${voiceModel}" --output_file "${wavPath}"`, { timeout: 30000 })
      const buf = readFileSync(wavPath)
      try { unlinkSync(wavPath) } catch {}
      return { success: true, audioBase64: buf.toString('base64') }
    } catch (e: any) {
      try { unlinkSync(wavPath) } catch {}
      return { success: false, error: e.message }
    }
  })

  // Convert HEIC/HEIF (and other unsupported formats) to JPEG so the renderer can
  // display them. Browsers don't decode HEIC natively. heif-convert from libheif
  // handles iPhone HEIC files; ImageMagick is a fallback for other oddball formats.
  ipcMain.handle('system-convert-heic', async (_, { base64, ext }: { base64: string; ext: string }) => {
    try {
      const stamp = Date.now()
      const inPath = `${tmpdir()}/vortex-heic-${stamp}.${ext || 'heic'}`
      const outPath = `${tmpdir()}/vortex-heic-${stamp}.jpg`
      writeFileSync(inPath, Buffer.from(base64, 'base64'))
      try {
        await execPromise(`heif-convert -q 92 "${inPath}" "${outPath}"`, { timeout: 20000 })
      } catch {
        // Fallback to ImageMagick for AVIF/TIFF/etc.
        await execPromise(`magick "${inPath}" -quality 92 "${outPath}"`, { timeout: 20000 })
      }
      const buf = readFileSync(outPath)
      try { unlinkSync(inPath); unlinkSync(outPath) } catch {}
      return { success: true, dataUrl: `data:image/jpeg;base64,${buf.toString('base64')}` }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('system-read-text-file', async (_, filePath: string) => {
    try {
      const cleanPath = filePath.replace(/^~/, homedir())
      const content = readFileSync(cleanPath, 'utf-8')
      // Cap at 1MB to avoid blowing up the renderer with huge files.
      if (content.length > 1_000_000) {
        return { success: false, error: 'File too large to diff (>1MB)' }
      }
      return { success: true, content }
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
}
