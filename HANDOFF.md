# Vortex Agentic V2 — Handoff

**Version**: 1.1  
**Date**: 2026-05-05  
**State**: Fully functional — all features working, build clean

---

## Current Application State

Everything works. There are no known broken features. The "black window" issue from the Updates tab (documented in old repair logs) was resolved when the streaming IPC layer was rewritten.

---

## Quick Start

```bash
cd ~/Documents/Vortex\ Agentic\ V2
npm run dev
```

Electron launches, Vite serves the renderer, ComfyUI starts automatically in `~/.comfyui-headless`.

For a production build:
```bash
npm run build
npm run build:electron   # produces release/
```

---

## Architecture

```
electron/          Main process (Node 24 / Electron 41)
  main.ts          Entry point — registers all IPC handlers
  ollama.ts        Ollama streaming, agentic loop, orchestration
  system.ts        All OS IPC: stats, updates, packages, docker, SCX, VRAM, chwd...
  db.ts            SQLite via better-sqlite3 (messages, sessions, audit_log, ai_memory, rag_chunks)
  pty.ts           Multi-tab PTY sessions
  rag.ts           Semantic RAG: chunking, embedding, cosine retrieval
  preload.ts       contextBridge — exposes all IPC to renderer

src/               Renderer (React 19 / Vite 8 / Tailwind 4)
  App.tsx          Root: sidebar nav, view routing, keyboard shortcuts
  components/      All views (27 total)
  hooks/           useOllama, useComfySocket
  lib/             comfyApi, notifications, models, utils
  types/           electron.d.ts (full IPC type declarations)
```

---

## Key IPC Channels (added since last handoff)

| Channel | What it does |
|---|---|
| `ollama-orchestrate` | 3-stage multi-agent pipeline (Planner/Workers/Synthesizer) |
| `scx-status` | Get current SCX scheduler + supported list from scx_loader DBus |
| `scx-set-scheduler` | Switch scheduler via `busctl call ... SwitchScheduler su` |
| `scx-stop` | Revert to EEVDF default |
| `scx-metrics` | Read `/sys/kernel/sched_ext/` state files |
| `bore-set-profile` | Apply `kernel.sched_burst_*` sysctl presets |
| `ollama-set-vram-mode` | Write systemd override.conf + restart ollama.service |
| `ollama-pin-vcache` | `taskset -cp 0-7` + `renice -5` on Ollama PIDs |
| `gpu-vram-stats` | nvidia-smi VRAM + utilisation |
| `io-tune-for-ai` | Tune Kyber read/write latency targets on all NVMe blocks |
| `chwd-detect` | `chwd --list` — scan PCI hardware profiles |
| `chwd-install` | `pkexec chwd --install <profile>` |
| `cachyos-rate-mirrors` | `pkexec cachyos-rate-mirrors` |
| `fprintd-status` | Check fprintd service state + package presence |

---

## Native Module

`better-sqlite3` is compiled natively against Electron 41 headers using `-march=znver4`.

**Do not use `npx electron-rebuild`** — it downloads precompiled Debian GCC-12 binaries from GitHub, discarding the native compile.

Use instead:
```bash
npm run rebuild:native       # runs scripts/rebuild-native.sh
```

The script:
1. Reads Electron headers from `~/.cache/node-gyp/41.3.0/`
2. Runs `node-gyp configure --nodedir=~/.cache/node-gyp/41.3.0`
3. Runs `make -j$(nproc)` (produces 6040 SIMD instructions with GCC 16.1.1)

The `~/.gyp/include.gypi` file adds `-march=znver4 -O3` to all node-gyp builds globally.

---

## Critical Gotchas

1. **After `npm install`, Electron version change, or `npm run build:electron`**: run `npm run rebuild:native` — electron-builder's internal `@electron/rebuild` step always overwrites the native binary with the precompiled Debian GCC-12 build from GitHub
2. **Shiki v4**: `codeToHtml(code, { lang, theme })` — no `getHighlighter()` factory
3. **React 19 installs**: always `--legacy-peer-deps`
4. **TypeScript interfaces**: always `import type { Foo }` — Vite strips interface declarations at runtime
5. **ComfyUI hung**: `fuser -k 8188/tcp`
6. **Ollama not responding**: `systemctl start ollama` — service is disabled by default
7. **scx_loader**: `systemctl enable --now scx_loader.service` — disabled by default
8. **BORE sysctls**: only present in `-bore`/`-eevdf-bore` kernel variants, not `-lts`

---

## File Inventory (docs)

| File | Purpose |
|---|---|
| `VORTEX_MANUAL.md` | User-facing manual (v1.1) — keep updated |
| `PROGRESSION.md` | Feature inventory and roadmap |
| `HANDOFF.md` | This file — dev context for next session |
| `RECOVERY_GUIDE.md` | Fresh machine / OS reinstall procedure |
| `scripts/rebuild-native.sh` | Native module rebuild bypassing prebuild-install |
