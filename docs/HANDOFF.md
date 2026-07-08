# Vortex Agentic V2 — Handoff

**Version**: 2.0  
**Date**: 2026-05-05  
**State**: Fully functional — 20-task expansion complete, all features working, build clean

---

## Current Application State

Everything works. No known broken features. v2.0 (May 5) completed a 20-task expansion adding 10 new views, 7 new IPC handler groups, and a new "Automation" sidebar category. The v1.2 patch earlier the same day fixed all critical bugs found in the v1.1 audit:

**Critical bugs fixed:**
- `VortexGuardian.ts`: Removed corrupt duplicate export/orphaned code; added missing `runGameModeToggle` import → Guardian Auto-Pilot now actually starts
- `main.ts`: Added missing `import { guardian } from './VortexGuardian'` → Guardian wired up at startup
- `db.ts getProjectRag`: Fixed `.all()` called without argument binding → RAG now correctly isolates chunks per project
- Terminal "Ask AI" bridge: `TerminalView` now calls `setTerminalQuery(entry)` before navigating; `AssistantView` picks up query on `vortex-focus-ai` event (not just on mount) → end-to-end bridge works
- `useOllama`: VRAM purge no longer fires on initial mount (was triggering before any model loaded)
- `ThemeProvider`: Added missing `'error'` sound case (was silently producing no audio)
- `DashboardView`: Added `'guardian'` to `WIDGET_DEFS` and `DEFAULT_VISIBLE` → Auto-Pilot widget now visible and toggleable

**Security fixes:**
- `system-get-logs`/`system-get-error-logs`: `lines` argument now sanitised (`parseInt` + clamp 10–10000)
- `journal-get-logs`: `opts.since` now stripped of shell-injectable chars
- `system-delete-asset`, `startup-toggle-desktop`, `startup-delete-desktop`: path checks use `path.resolve()` before `startsWith` → symlink traversal blocked
- `ollama.ts read_file`: Replaced `cat "${p}"` shell injection vector with `fs.promises.readFile(p)`
- `pacman -Ss`: Query now properly quoted
- `preload.ts removeListener`: Fixed to remove specific listener (not all listeners on channel)
- `main.ts`: Replaced hardcoded `/home/doodcom` fallback with `os.homedir()`

**AI improvements:**
- Streaming: All Ollama stream handlers use a line-buffer accumulator (fixes token drop on TCP fragmentation)
- Agentic loop: Sends user-visible message when 6-iteration cap is hit
- Greeting detection removed: Full system prompt always included (CPU/RAM/OS context)
- RAG: `rag-select-project` now returns immediately and embeds in background with progress events (`rag-progress`, `rag-done`, `rag-error`)
- RAG: Clear error emitted if `nomic-embed-text` model not installed

**UI improvements:**
- GPU model string in Dashboard is now dynamic (no longer hardcodes "4070 Ti S")
- SchedulerView CPU info strip reads live from `getSystemStats()` 
- Header `Core_Status` label is now dynamic (Optimal / Elevated / Critical based on CPU+RAM load)
- CommandPalette expanded from 10 to 25 commands covering all views; keyboard shortcuts shown
- StatusBar model name is now reactive (updates live on model switch via `vortex-model-change` event)
- StatusBar shows live context token usage (`Ctx: 4.2k`) after each AI response
- HomeView "SECURE TUNNEL" label replaced with accurate "LIVE VIEW :: HOME ASSISTANT LOCAL STREAM"

**New features (v1.2):**
- Terminal hung-command detection: 30-second timeout banner with one-click Ctrl+C
- `system-rebuild-native`: Replaced hallucinated `cachyos-deb-build` with real `paru/yay --rebuild` command
- `rag-clear-cache` IPC now exposed in preload and electron.d.ts

---

## v2.0 Expansion (10 new views)

**New views added:**
- `AutomationsView` — drag-to-reorder named step sequences (Framer Motion Reorder), 10 preset step templates, localStorage persistence, abort mid-run
- `CronView` — visual crontab editor; reads `crontab -l`, writes via `echo | crontab -`; preset schedule chips
- `SshView` — SSH key pair manager (`~/.ssh/`); generate ED25519/RSA/ECDSA keys; two-step delete; copy public key
- `FirewallView` — UFW rule table; add/delete rules; enable/disable toggle; sanitised port/IP input validation
- `VaultView` — tar.gz backup/restore to `~/Vortex-Backups/`; editable path list; confirmation on restore/delete
- `BenchmarkView` — sequential CPU/Memory/Disk tests; animated score bars; localStorage run history
- `EnvView` — process environment browser; PATH expansion; search; copy; highlighted-vars tab
- `HealthReportView` — multi-stage data collection + Ollama AI analysis; ScoreRing SVG component; metric grid; recommendations
- `AppLauncherView` — `.desktop` file scanner (3 dirs); category chips; search; exec-field-code stripped before launch
- Arch News panel inline in `UpdatesView` — Arch Linux RSS; unread badge; breaking-keyword highlight; read state localStorage

**Settings addition:**
- `AlertThresholdsEditor` component in `SettingsPage` — CPU/RAM/GPU sliders; `ALERT_THRESHOLDS_KEY` / `AlertThresholds` / `DEFAULT_THRESHOLDS` exported; live alert checking in App.tsx stats loop with 5-min per-metric cooldown

**Sidebar update:**
- New "Automation" category between Diagnostics and Config: Workflows, Cron Jobs, SSH Keys, Firewall (UFW), Dotfile Vault
- New icons: `GitBranch`, `CalendarClock`, `KeyRound`, `FlameKindling`, `Gauge`, `Archive`, `Variable`, `AppWindow`, `HeartPulse`
- Total categories: 7 (was 6)
- Total views: 37 (was 27)

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
  components/      All views (37 total)
  hooks/           useOllama, useComfySocket
  lib/             comfyApi, notifications, models, utils
  types/           electron.d.ts (full IPC type declarations)
```

---

## Key IPC Channels

### v1.x Channels (historical)

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

### v2.0 New Channels

| Channel | What it does |
|---|---|
| `apps-list` | Scan `.desktop` files from `/usr/share/applications`, `/usr/local/share/applications`, `~/.local/share/applications`; dedup by name |
| `apps-launch` | Spawn app exec string (desktop field codes stripped) via `spawn(..., { detached: true })` |
| `arch-news-fetch` | axios GET Arch Linux RSS feed; regex XML parse; returns 10 items with title/link/date/summary |
| `vault-list-backups` | List `.tar.gz` archives in `~/Vortex-Backups/` sorted by mtime |
| `vault-create` | `tar -czf ~/Vortex-Backups/<timestamp>.tar.gz <paths...>` |
| `vault-restore` | `tar -xzf <archive> -C ~/` (overwrites existing files) |
| `vault-delete` | `rm` the specified archive filename from `~/Vortex-Backups/` |
| `benchmark-run` | Sequential test runner: sha256sum (CPU), /dev/urandom (memory), dd (disk read/write/io) |
| `ufw-status` | `ufw status numbered` parsed into enabled bool + rules array |
| `ufw-enable` | `pkexec ufw enable` / `pkexec ufw disable` |
| `ufw-add-rule` | `pkexec ufw allow/deny <port>/<proto> from <ip> comment '<comment>'` (sanitised inputs) |
| `ufw-delete-rule` | `pkexec ufw delete <number>` |
| `ssh-list-keys` | Read `~/.ssh/` for key pairs; `ssh-keygen -lf` for fingerprints |
| `ssh-generate-key` | `ssh-keygen -t <type> -b <bits> -C <comment> -f ~/.ssh/<filename> -N ""` |
| `ssh-delete-key` | `rm ~/.ssh/<name>` + `rm ~/.ssh/<name>.pub` |
| `cron-list` | `crontab -l` parsed into structured entries with comment/schedule/command fields |
| `cron-save` | Build crontab string from entries array; `echo "…" \| crontab -` |

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

1. **`homedir()` in system.ts**: `system.ts` uses named imports (`import { homedir } from 'os'`). Write `homedir()` — NOT `os.homedir()`. Writing `os.homedir()` will throw `TypeError: os.homedir is not a function` at runtime.
2. **After `npm install`, Electron version change, or `npm run build:electron`**: run `npm run rebuild:native` — electron-builder's internal `@electron/rebuild` step always overwrites the native binary with the precompiled Debian GCC-12 build from GitHub
3. **Shiki v4**: `codeToHtml(code, { lang, theme })` — no `getHighlighter()` factory
4. **React 19 installs**: always `--legacy-peer-deps`
5. **TypeScript interfaces**: always `import type { Foo }` — Vite strips interface declarations at runtime
6. **ComfyUI hung**: `fuser -k 8188/tcp`
7. **Ollama not responding**: `systemctl start ollama` — service is disabled by default
8. **scx_loader**: `systemctl enable --now scx_loader.service` — disabled by default
9. **BORE sysctls**: only present in `-bore`/`-eevdf-bore` kernel variants, not `-lts`
10. **UFW/SSH IPC**: requires polkit (`pkexec`) for privilege-elevated operations — polkit must be running
11. **Cron save**: rewrites the entire crontab — never partial; always read first, modify, then write back

---

## File Inventory (docs)

| File | Purpose |
|---|---|
| `VORTEX_MANUAL.md` | User-facing manual (v2.0, 40 sections) — keep updated |
| `PROGRESSION.md` | Full feature inventory, session log, known constraints, roadmap |
| `HANDOFF.md` | This file — dev context for next session |
| `RECOVERY_GUIDE.md` | Fresh machine / OS reinstall procedure |
| `README.md` | Project overview — tech stack, quick start, features summary |
| `scripts/rebuild-native.sh` | Native module rebuild bypassing prebuild-install |
