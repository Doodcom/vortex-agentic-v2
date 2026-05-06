# Vortex Agentic V2 — Progression

**Status**: v2.0 — Full feature expansion complete (40 sections, 37 views)  
**Last updated**: 2026-05-05  
**Hardware**: Ryzen 7 7800X3D · RTX 4070 Ti Super (16 GB VRAM) · 64 GB RAM · CachyOS

---

## Feature Inventory

### AI Assistant (Quantum)
- Streaming Ollama chat with markdown rendering (Shiki v4 code highlighting)
- Agentic mode — 6-iteration tool loop, 10 tools: `exec_command`, `read_file`, `write_file`, `create_directory`, `list_directory`, `get_system_stats`, `search_packages`, `remember_fact`, `web_search`, `web_fetch`
- **Orchestra mode** — 3-stage multi-agent pipeline: Planner → Workers (4-iter each) → Synthesizer (streaming); OrchestraAgentCard UI
- Smart model routing — keyword heuristics pick fastest suitable model
- Named sessions (SQLite), session browser sidebar
- File attachment (text + vision)
- RAG context — semantic vector search via `nomic-embed-text`, chunks stored in SQLite; embedding runs in background with progress events, clear error if model missing
- Terminal context bridge — Ask AI button sends full command + output to Quantum; works whether AssistantView is already mounted or not
- AI Memory (persistent facts injected into system prompt)
- Web search — SearXNG primary, DuckDuckGo fallback
- Dynamic system prompt (OS, kernel, CPU, RAM injected every message — greeting detection removed, full context always present)
- Streaming line-buffer accumulator — no token drop on TCP fragmentation
- Agentic loop cap notification — user informed when 6-iteration limit is hit

### Image Generation
- Text-to-Image (SDXL checkpoints)
- FLUX.1 Schnell mode (4-step, natural language prompts, text rendering)
- Image-to-Image with creativity slider
- ControlNet (Depth / Canny / OpenPose)
- Face Detailer (YOLO + inpaint pass)
- LoRA adapters (up to 2 simultaneous)
- 4K neural upscale (4x-UltraSharp)
- Style presets (8 chips)
- Auto VRAM purge on model change (skips initial mount — no spurious purge on launch)

### Video Generation
- **T2V** — AnimateDiff text-to-video
- **I2V** — Image-to-video, with "Animate" shortcut from Image Gen
- **V2V** — Video-to-video FX; drag-drop source, FX Intensity slider (10–90%)
- RIFE frame interpolation (2×/3×/5×)
- Tiled VAE for high-res generation
- Live VRAM display (nvidia-smi, 5-second poll, red at >85%)
- Asset saves via `ionice -c 3` (idle I/O class)

### System Management
- Dashboard — CPU, RAM, storage, network, GPU live stats; GPU model string reads from system (not hardcoded)
- Processes — live list, kill, filter
- Services — systemd unit control, enable/disable, inline logs
- Updates — `checkupdates` (repo) + paru/yay (AUR), full upgrade with streaming log, separate AI sync
- Cleaner — paccache, orphans, journal vacuum
- Optimiser — fstrim, reset-failed, cpupower governor
- Packages — search repo+AUR, install, remove, dep graph (SVG radial)
- Network — per-interface stats, active connections
- Boot Analyser — `systemd-analyze blame` bar chart
- Disk Monitor — filesystem usage + SMART health per drive
- Log Viewer — `journalctl` with unit/priority/keyword/time filters (inputs sanitised)
- Startup Manager — `~/.config/autostart/` and systemd user units
- Docker — container list, start/stop/restart/remove, image list, pull, logs

### Terminal
- Multi-tab PTY (bash), ANSI passthrough
- Split panes (vertical/horizontal)
- Scrollback, search (Ctrl+F)
- Ask AI button — sends command + output to Quantum (fully wired end-to-end)
- **Hung-command detection** — 30-second timeout banner with one-click Ctrl+C if `VORTEX_DONE` sentinel never arrives

### CachyOS-Specific Features
- **Scheduler view** — live SCX scheduler control via scx_loader DBus, BORE burst-penalty preset profiles (Desktop / AI Heavy / Balanced / Gaming); CPU info strip reads live from system stats (not hardcoded)
- **Ollama VRAM modes** — max/budget toggle writes systemd override.conf and restarts service
- **V-Cache pin** — `taskset 0-7` + `renice -5` on Ollama PID
- **chwd** — hardware detection scan in Settings
- **cachyos-rate-mirrors** — mirror ranking in Settings
- **Kyber I/O tuning** — `io-tune-for-ai` IPC, switches latency targets on all NVMe Kyber queues
- **native build** — `better-sqlite3` compiled with `-march=znver4` (6040 ymm/zmm SIMD instructions, GCC 16.1.1) via `scripts/rebuild-native.sh`

### 2026 Expansion — Autonomous Hardware
- **Vortex Agentic Guardian (Auto-Pilot)** — background watchdog detects game launches (steam, lutris, heroic, wine, gamescope, etc.), auto-engages Zero-Latency mode, restores Balanced on exit. Dashboard widget now correctly visible and toggleable.
- **Zero-Latency Game Mode Macro** — `runGameModeToggle` orchestrator: switches kernel to SCX LAVD, triggers `dmemcg-booster` for VRAM squeeze, V-Cache isolation pins AI to CCD2 (cores 8–15) leaving CCD0 (3D V-Cache, cores 0–7) exclusively for the game
- **x86-64-v4 Architecture Auditor** — Optimiser scans for generic `x86_64` binaries, offers 1-click native rebuilds using `paru/yay --rebuild` (real Arch toolchain)
- **VRAM Squeeze** — `dmemcg-booster --aggressive` available manually and automatically in Image / Video views (graceful error if not installed)
- **WinBoat Sandbox** — drag-drop `.exe` / `.msi` into isolated GPU-accelerated Docker container (Sandbox view)
- **Snapper Btrfs Safety Net** — auto `pre` snapshots before system upgrades, AI updates, or VRAM mode changes

### Security / Audit
- Audit Log — every shell command logged (source: `terminal` or `agent`)
- Runtime allowlist guards on all `system-cleanup` and `system-optimize` IPC handlers
- AI `exec_command` auto-logs to audit DB via `logAuditCommand()`
- Destructive command guard (regex, confirm modal before execution)
- Sudo UI (inline password modal, never stored in history)
- Shell input sanitisation — `lines` param clamped, `opts.since` stripped, path traversal blocked via `resolve()`
- `read_file` agent tool uses `fs.promises.readFile` (no shell, no injection)
- `preload.ts` IPC listener cleanup uses per-listener `removeListener` (not `removeAllListeners`)

### UI / UX
- **Categorised Sidebar** — 7 sections: Overview · AI Suite · Performance · System · Diagnostics · Automation · Config
- **Dashboard Data Zones** — Resource Metrics · Agentic Control · Modules Suite · Audit Trail
- **View Registry Pattern** — `VIEW_MAP` in `App.tsx` keeps routing declarative
- **Wayland-native notifications** — browser `Notification` API with `VORTEX:` prefix, falls back to in-app toast
- **Command Palette** — 25 commands covering all views with keyboard shortcut hints (Ctrl+1–9)
- **Header status** — `Core_Status` reads live CPU/RAM load (Optimal / Elevated / Critical, dot colour matches)
- **StatusBar** — model name updates live on switch; context token usage indicator (`Ctx: 4.2k`) after each response
- **Error sound** — descending 440→220 Hz tone (was missing, silently produced nothing)

### Automation Suite (new in v2.0)
- **Cron Job Manager** — visual crontab editor with preset schedule chips, dirty-state save, full read/write via `crontab -l` / `echo | crontab -`
- **SSH Key Manager** — lists `~/.ssh/` key pairs with type-coloured badges, fingerprint, copy-public-key, expandable raw key, generate new key (ED25519/RSA/ECDSA), two-step delete
- **UFW Firewall** — enable/disable toggle, rules table with `ALLOW`/`DENY`/`LIMIT` colour coding, add-rule form with input validation, raw output toggle, delete by rule number
- **Dotfile Vault** — creates `.tar.gz` archives to `~/Vortex-Backups/`; editable path list with defaults (`~/.bashrc`, `~/.zshrc`, `~/.config/`, `~/.ssh/`, etc.); restore and delete with confirmation
- **Automation Workflows** — custom named sequences of system steps, drag-to-reorder (Framer Motion Reorder), 10 preset step templates, sequential execution with per-step status, abort mid-run, localStorage persistence

### Performance Tools (new in v2.0)
- **Benchmark** — sequential test runner: CPU sha256sum, Memory bandwidth, Disk Read, Disk Write, I/O Throughput; animated score bars with colour thresholds; localStorage run history

### Diagnostics (new in v2.0)
- **Environment Variables** — browse process `env`; tabs for All / PATH (expanded one-per-line) / Highlighted (`XDG_*`, `DISPLAY`, `WAYLAND_DISPLAY`, `SHELL`, etc.); search; copy KEY=VALUE
- **Health Report** — multi-stage data collection (CPU/RAM/Disk/journal errors/failed services/pending updates) → AI analysis via Ollama → scored ring (0–100), metric grid, numbered recommendations
- **System History** — 24-hour resource trending graphs (CPU, RAM, GPU, Disk, Net) via SQLite polling

### Overview (new in v2.0)
- **App Launcher** — scans `.desktop` files from 3 dirs, category chip filter, search, launch with exec-field-code stripping

### Settings Additions (new in v2.0)
- **Resource Alert Thresholds** — sliders for CPU/RAM/GPU VRAM alert percentages; per-metric 5-minute cooldown; persisted to localStorage

### System Updates Additions (new in v2.0)
- **Arch News Feed** — collapsible panel fetching official Arch Linux RSS; unread badge; breaking-keyword highlighting; read state in localStorage

### Other
- AI Memory view — manage persistent facts
- Gallery — browse/delete AI images and videos
- Home Assistant view
- Audit Log view
- Settings — theme, sound, animations, default model, custom system prompt, SearXNG URL, Ollama VRAM/CPU, CachyOS Hardware, resource alert thresholds

---

## Known Constraints

- `better-sqlite3` must be rebuilt after any Electron or Node version change: `npm run rebuild:native`
- `npm install` requires `--legacy-peer-deps` (React 19 peer conflicts)
- Shiki v4: use `codeToHtml(code, { lang, theme })` — no `getHighlighter()` factory
- All TypeScript `export interface` / `export type` must be imported with `import type`
- BORE sysctls (`kernel.sched_burst_*`) only present in `-bore` / `-eevdf-bore` kernel variants, not `-lts`
- `scx_loader` requires `systemctl enable --now scx_loader.service` to activate
- `dmemcg-booster` and `winboat` are optional CachyOS packages — install from repo if needed; app shows graceful error if absent
- `nomic-embed-text` must be pulled via Ollama for RAG to work: `ollama pull nomic-embed-text`

---

## Known Constraints (Additions v2.0)

- `homedir()` from `{ homedir } from 'os'` — NOT `os.homedir()` (system.ts uses named exports)
- Framer Motion `Reorder.Group`/`Reorder.Item` requires `value` prop on each item
- UFW operations require `pkexec` elevation — polkit must be running
- Cron saves rewrite the entire crontab — no partial update; always round-trip via `crontab -l`
- Benchmark scores use reference maximums from `/tmp` dd tests — absolute numbers vary by hardware
- Health Report requires Ollama running; score is AI-generated heuristic (not a hard metric)
- App Launcher strips `.desktop` field codes (`%u`, `%f`, etc.) before spawning — commands expecting them won't receive values

## Roadmap (Not Yet Started)

- 3D AI Memory graph (D3.js visualisation of SQLite facts as node graph inside MemoryView)
- Command Palette: add entries for all new v2.0 views (Cron, SSH, Firewall, Vault, Benchmark, Env, Health, App Launcher)

---

## Session Log

### 2026-05-05 — Build unblock (post-2026-expansion)
Stale `dist/` (01:03) was masking the new categorised sidebar at runtime. Rebuild was failing on four pre-existing TypeScript errors:
- `OptimizerView.tsx` — unused `Rocket` import
- `SandboxView.tsx` — `File.path` (Electron-only) needed `(exe as any).path` cast
- `SettingsPage.tsx` — missing `notify` import and `ShieldCheck` icon
- `electron/main.ts` — stray `()` / orphaned `createTray()` after `app.whenReady()` block

All resolved; `npm run build` clean → fresh `dist/` (02:37) → categories now render after relaunch.

### 2026-05-05 — v2.0 Feature Expansion (Sonnet 4.6) — 20 tasks, 10 new views

Second major expansion session. Added 10 new full-featured views and wired up all supporting IPC:

**New views:** App Launcher (`.desktop` file scanner + grid launcher), Cron Job Manager (visual crontab editor), SSH Key Manager (key pair browser/generator), UFW Firewall (rule management UI), Dotfile Vault (tar.gz backup/restore), Benchmark (CPU/Memory/Disk sequential tests), Environment Variables (process env browser), Health Report (AI-scored multi-source system analysis), Automation Workflows (drag-to-reorder named step sequences).

**Settings additions:** Resource Alert Thresholds (CPU/RAM/GPU sliders with 5-min cooldown); alerts now fire live during the stats polling interval.

**Updates view addition:** Arch News Feed panel (Arch Linux RSS, unread badge, breaking-keyword highlight).

**IPC additions in system.ts:** `apps-list`, `apps-launch`, `arch-news-fetch`, `vault-list-backups`, `vault-create`, `vault-restore`, `vault-delete`, `benchmark-run`, `ufw-status`, `ufw-enable`, `ufw-add-rule`, `ufw-delete-rule`, `ssh-list-keys`, `ssh-generate-key`, `ssh-delete-key`, `cron-list`, `cron-save`.

**Key fix during session:** `os.homedir()` not available in system.ts (uses named imports) — replaced all occurrences with bare `homedir()`.

All type-checked clean (`npx tsc --noEmit`). Sidebar now has 7 categories (added "Automation"). Component count: 37 views.

### 2026-05-05 — v1.2 Bug fix & hardening audit (Sonnet 4.6)
Full three-agent codebase audit. Fixed all critical bugs, hardened security, improved AI, updated UI:

**Critical fixes**: Guardian auto-pilot fully wired (3 interconnected bugs — corrupt file tail, missing imports in VortexGuardian.ts and main.ts); RAG project isolation (`getProjectRag` `.all()` missing argument); Terminal Ask AI bridge end-to-end (TerminalView never called `setTerminalQuery`, AssistantView only consumed on mount); VRAM spurious purge on launch; missing error sound case; Guardian widget invisible in Dashboard.

**Security**: Shell input sanitisation in 5 handlers; `read_file` tool replaced `cat "${p}"` with `fs.promises.readFile`; path traversal blocked; per-listener IPC cleanup; `os.homedir()` replaces hardcoded username.

**AI**: Line-buffer accumulator in all 4 stream handlers; agentic loop cap notification; greeting stripping removed; RAG background embedding with progress events; RAG model-missing error.

**UI**: Dynamic GPU model, CPU info, Header status; Command Palette expanded 10→25 commands with shortcuts; StatusBar reactive model + live token counter; HomeView misleading label corrected.

**New**: Terminal hung-command detection (30s banner + Ctrl+C button); `system-rebuild-native` fixed (`cachyos-deb-build` → real `paru/yay --rebuild`); `rag-clear-cache` exposed in preload + types.
