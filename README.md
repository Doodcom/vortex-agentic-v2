# Vortex Agentic V2

A unified Linux system management and AI creation suite built for CachyOS. All AI runs locally — no cloud, no subscription, no data leaving your machine.

![Electron](https://img.shields.io/badge/Electron-41-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-CachyOS%20%2F%20Arch-1793D1?logo=archlinux&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

### AI Assistant — Quantum
- Local Ollama inference with streaming markdown output
- **Agentic mode** — autonomous tool loop (exec commands, read/write files, search packages, fetch web pages)
- **Orchestra mode** — multi-agent pipeline: Planner → parallel Workers → Synthesizer
- Smart model routing, named sessions, file attachments, vision support
- Semantic RAG over local codebases (`nomic-embed-text` + SQLite)
- Web search via SearXNG (falls back to DuckDuckGo)
- Persistent AI memory injected into every session

### AI Image Generation
- Text-to-image and image-to-image via ComfyUI
- FLUX.1 Schnell (4-step, accurate text rendering)
- ControlNet (Depth / Canny / OpenPose)
- Face Detailer (YOLO inpaint pass for portrait quality)
- LoRA adapters (up to 2 simultaneous)
- 4K neural upscale (4x-UltraSharp)

### AI Video Generation
- **T2V** — AnimateDiff text-to-video
- **I2V** — Image-to-video with "Animate" shortcut from Image Gen
- **V2V** — Video-to-video FX with adjustable intensity slider
- RIFE frame interpolation (2×/3×/5×) for smooth 60fps output
- Live VRAM display polled from `nvidia-smi`

### System Management
- Dashboard with live CPU, RAM, GPU, network, storage stats
- Process manager, systemd service control, network monitor
- Package manager (pacman + AUR via paru/yay) with dependency graph
- System updates with streaming upgrade log
- Cleaner, optimiser, disk SMART monitor, boot analyser
- Docker container management, startup apps manager, log viewer
- Multi-tab PTY terminal with AI bridge

### CachyOS-Specific
- **Scheduler panel** — live SCX sched-ext control via `scx_loader` DBus (11 schedulers: lavd, bpfland, rusty, cake, p2dq, flash, and more)
- **BORE tuner** — burst-penalty preset profiles (Desktop / AI Heavy / Balanced / Gaming)
- **Ollama VRAM modes** — max/budget toggle writes systemd override and restarts service
- **V-Cache CPU pinning** — `taskset 0-7` + `renice -5` for 7800X3D L3 cache advantage
- **chwd** hardware detection and `cachyos-rate-mirrors` in Settings
- **Kyber I/O tuning** — adjustable NVMe latency targets for AI workloads
- Native `better-sqlite3` compiled with `-march=znver4` (AVX-512, 6040 SIMD instructions)

---

## Requirements

| Component | Requirement |
|---|---|
| OS | CachyOS or Arch Linux |
| GPU | NVIDIA 8GB+ VRAM (16GB+ for FLUX/video) |
| RAM | 32GB+ recommended |
| Node.js | 24.x |
| Ollama | Running at `localhost:11434` |
| ComfyUI | Headless at `~/.comfyui-headless` |

---

## Getting Started

```bash
# Install dependencies
npm install --legacy-peer-deps

# Rebuild native module for Electron (znver4 optimised)
npm run rebuild:native

# Launch dev mode
npm run dev
```

### Production Build

```bash
npm run build
npm run build:electron   # produces AppImage + .pkg.tar.xz in release/
# Restore native build after electron-builder overwrites it
npm run rebuild:native
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Shell | Electron 41 (Node 24) |
| UI | React 19, Vite 8, Tailwind 4, Framer Motion |
| AI | Ollama (local), ComfyUI (headless) |
| Database | better-sqlite3 (native, znver4) |
| Terminal | node-pty, xterm.js |
| Code highlighting | Shiki v4 |
| Packaging | electron-builder 26 |

---

## Project Structure

```
electron/       Main process — all IPC handlers, OS access, AI logic
  main.ts       Entry point
  ollama.ts     AI streaming, agentic loop, multi-agent orchestration
  system.ts     System IPC: stats, updates, packages, SCX, GPU, chwd...
  db.ts         SQLite: sessions, messages, audit log, memory, RAG
  pty.ts        PTY terminal sessions
  rag.ts        Semantic RAG chunking + retrieval

src/            Renderer — React UI
  components/   27 views
  hooks/        useOllama, useComfySocket
  lib/          ComfyUI API, notifications, models
  types/        Electron IPC type declarations
```

---

## Important Notes

- **Native rebuild**: always run `npm run rebuild:native` after `npm install`, Electron updates, or `npm run build:electron`. electron-builder's internal rebuild downloads precompiled Debian binaries that discard the native optimisations.
- **React 19**: use `--legacy-peer-deps` when installing packages.
- **Shiki v4**: use `codeToHtml(code, { lang, theme })` — `getHighlighter()` was removed.
- **BORE sysctls**: only present in `-bore`/`-eevdf-bore` CachyOS kernel variants, not `-lts`.
- **scx_loader**: run `systemctl enable --now scx_loader.service` to activate the Scheduler view.

---

## License

MIT
