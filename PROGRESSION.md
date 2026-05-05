# Vortex Agentic V2 — Progression

**Status**: v1.1 — All features complete  
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
- RAG context — semantic vector search via `nomic-embed-text`, chunks stored in SQLite
- Terminal context bridge
- AI Memory (persistent facts injected into system prompt)
- Web search — SearXNG primary, DuckDuckGo fallback
- Dynamic system prompt (OS, kernel, CPU, RAM, errors injected each message)

### Image Generation
- Text-to-Image (SDXL checkpoints)
- FLUX.1 Schnell mode (4-step, natural language prompts, text rendering)
- Image-to-Image with creativity slider
- ControlNet (Depth / Canny / OpenPose)
- Face Detailer (YOLO + inpaint pass)
- LoRA adapters (up to 2 simultaneous)
- 4K neural upscale (4x-UltraSharp)
- Style presets (8 chips)
- Auto VRAM purge on model change

### Video Generation
- **T2V** — AnimateDiff text-to-video
- **I2V** — Image-to-video, with "Animate" shortcut from Image Gen
- **V2V** — Video-to-video FX; drag-drop source, FX Intensity slider (10–90%)
- RIFE frame interpolation (2×/3×/5×)
- Tiled VAE for high-res generation
- Live VRAM display (nvidia-smi, 5-second poll, red at >85%)
- Asset saves via `ionice -c 3` (idle I/O class)

### System Management
- Dashboard — CPU, RAM, storage, network, GPU live stats
- Processes — live list, kill, filter
- Services — systemd unit control, enable/disable, inline logs
- Updates — `checkupdates` (repo) + paru/yay (AUR), full upgrade with streaming log, separate AI sync
- Cleaner — paccache, orphans, journal vacuum
- Optimiser — fstrim, reset-failed, cpupower governor
- Packages — search repo+AUR, install, remove, dep graph (SVG radial)
- Network — per-interface stats, active connections
- Boot Analyser — `systemd-analyze blame` bar chart
- Disk Monitor — filesystem usage + SMART health per drive
- Log Viewer — `journalctl` with unit/priority/keyword/time filters
- Startup Manager — `~/.config/autostart/` and systemd user units
- Docker — container list, start/stop/restart/remove, image list, pull, logs

### Terminal
- Multi-tab PTY (bash), ANSI passthrough
- Split panes (vertical/horizontal)
- Scrollback, search (Ctrl+F)
- Ask AI button (sends output to Quantum)

### CachyOS-Specific Features
- **Scheduler view** — live SCX scheduler control via scx_loader DBus (11 schedulers), BORE burst-penalty preset profiles (Desktop / AI Heavy / Balanced / Gaming)
- **Ollama VRAM modes** — max/budget toggle writes systemd override.conf and restarts service
- **V-Cache pin** — `taskset 0-7` + `renice -5` on Ollama PID
- **chwd** — hardware detection scan in Settings
- **cachyos-rate-mirrors** — mirror ranking in Settings
- **Kyber I/O tuning** — `io-tune-for-ai` IPC, switches latency targets on all NVMe Kyber queues
- **native build** — `better-sqlite3` compiled with `-march=znver4` (6040 ymm/zmm SIMD instructions, GCC 16.1.1) via `scripts/rebuild-native.sh`

### Security / Audit
- Audit Log — every shell command logged (source: `terminal` or `agent`)
- Runtime allowlist guards on all `system-cleanup` and `system-optimize` IPC handlers
- AI `exec_command` auto-logs to audit DB via `logAuditCommand()`
- Destructive command guard (regex, confirm modal before execution)
- Sudo UI (inline password modal, never stored in history)

### Other
- AI Memory view — manage persistent facts
- Gallery — browse/delete AI images and videos
- Home Assistant view
- Audit Log view
- Settings — theme, sound, animations, default model, custom system prompt, SearXNG URL, Ollama VRAM/CPU, CachyOS Hardware

---

## Known Constraints

- `better-sqlite3` must be rebuilt after any Electron or Node version change: `npm run rebuild:native`
- `npm install` requires `--legacy-peer-deps` (React 19 peer conflicts)
- Shiki v4: use `codeToHtml(code, { lang, theme })` — no `getHighlighter()` factory
- All TypeScript `export interface` / `export type` must be imported with `import type`
- BORE sysctls (`kernel.sched_burst_*`) only present in `-bore` / `-eevdf-bore` kernel variants, not `-lts`
- scx_loader requires `systemctl enable --now scx_loader.service` to activate

---

## Roadmap (Not Yet Started)

- 3D AI Memory graph (Three.js visualisation of SQLite facts)
- Knowledge graph memory explorer
- News stream widget on Dashboard
