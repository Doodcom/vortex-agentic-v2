# Vortex Agentic V2 — User Manual

**Version:** 1.1  
**Platform:** CachyOS / Arch Linux  
**Built with:** Electron 41 · React 19 · Ollama · ComfyUI · sched-ext

---

## Table of Contents

1. [Overview](#1-overview)
2. [Getting Started](#2-getting-started)
3. [Navigation](#3-navigation)
4. [Dashboard](#4-dashboard)
5. [AI Assistant — Quantum](#5-ai-assistant--quantum)
6. [Image Generation](#6-image-generation)
7. [Video Generation](#7-video-generation)
8. [Media Gallery](#8-media-gallery)
9. [System Updates](#9-system-updates)
10. [System Cleaner](#10-system-cleaner)
11. [System Optimiser](#11-system-optimiser)
12. [Package Manager](#12-package-manager)
13. [Processes](#13-processes)
14. [Services](#14-services)
15. [Network Monitor](#15-network-monitor)
16. [Docker](#16-docker)
17. [Terminal](#17-terminal)
18. [Boot Analyser](#18-boot-analyser)
19. [Disk Monitor](#19-disk-monitor)
20. [Logs](#20-logs)
21. [Startup Manager](#21-startup-manager)
22. [Scheduler](#22-scheduler)
23. [AI Memory](#23-ai-memory)
24. [Audit Log](#24-audit-log)
25. [Settings](#25-settings)
26. [Keyboard Shortcuts](#26-keyboard-shortcuts)
27. [Troubleshooting](#27-troubleshooting)

---

## 1. Overview

Vortex Agentic V2 is a unified Linux system management and AI creation suite. It combines:

- **System management** — package updates, process control, service management, disk health, network monitoring, and system cleanup all in one place
- **AI conversation** — a local Ollama-powered assistant (Quantum) with agentic tool use: it can run shell commands, read files, search the web, and manage your system on your behalf
- **AI image generation** — full ComfyUI integration with text-to-image, image-to-image, ControlNet pose/depth guidance, LoRA style adapters, Face Detailer, and 4K upscaling
- **AI video generation** — AnimateDiff text-to-video and image-to-video with RIFE frame interpolation for smooth output
- **A media gallery** — browse and manage all AI-generated images and videos

All AI models run **locally** — no cloud, no subscription, no data leaving your machine.

---

## 2. Getting Started

### Requirements

| Component | Requirement |
|---|---|
| OS | Arch Linux, CachyOS, or any pacman-based distro |
| GPU | NVIDIA GPU with 8 GB+ VRAM (16 GB+ recommended for FLUX) |
| RAM | 32 GB+ system RAM recommended |
| Ollama | Installed and running at `localhost:11434` |
| ComfyUI | Headless install at `~/.comfyui-headless` with `start-engine.sh` |
| AUR Helper | `paru` or `yay` (optional, for AUR package support) |

### Launching

```bash
cd ~/Documents/Vortex\ Agentic\ V2
npm run dev
```

Vortex starts ComfyUI automatically in the background when the app opens. ComfyUI logs are written to `~/.config/Vortex Agentic/comfyui.log`.

### Closing / Tray

Clicking the window close button **hides** the app to the system tray — it does not quit. To fully quit, right-click the tray icon and select **Quit**. This keeps ComfyUI running in the background.

---

## 3. Navigation

The left sidebar contains all sections. Click any item to navigate. The sidebar can be:

- **Collapsed** — click the arrow icon at the bottom to hide labels
- **Resized** — drag the thin handle on the right edge of the sidebar

The header displays the active section name and a live system-online indicator.

---

## 4. Dashboard

The Dashboard gives you an at-a-glance view of your system health, updated every 2 seconds.

### Metrics Displayed

- **CPU** — model name, core count, clock speed, and current load percentage
- **RAM** — total, used, and free memory with a usage bar
- **Storage** — root filesystem used / total with percentage
- **Network** — active interface, download speed (rx/s), upload speed (tx/s)
- **GPU** — model, VRAM used/total, GPU utilisation %, temperature, power draw, fan speed, core clock

### Quick-Access Cards

The dashboard includes shortcut cards to the most-used sections. Click any card to jump directly to that section.

---

## 5. AI Assistant — Quantum

Quantum is your local AI assistant powered by Ollama. It has two modes:

### Standard Mode

A direct conversational AI. Quantum answers questions, explains code, writes scripts, and provides technical guidance. All responses are streamed token-by-token.

### Agentic Mode

Enable the **Agent** toggle in the toolbar. In this mode, Quantum has access to 10 built-in tools and can autonomously take actions on your system across up to 6 reasoning iterations per message.

All commands executed by the AI in this mode are automatically logged to the **Audit Log** with `source=agent`.

| Tool | What it does |
|---|---|
| `exec_command` | Runs any shell command and returns the output |
| `read_file` | Reads any file from disk |
| `write_file` | Creates or overwrites a file |
| `create_directory` | Creates a directory |
| `list_directory` | Lists files in a directory |
| `get_system_stats` | Gets live CPU, RAM, and top process data |
| `search_packages` | Searches pacman for packages |
| `remember_fact` | Saves a fact to long-term AI Memory |
| `web_search` | Searches the web via SearXNG or DuckDuckGo |
| `web_fetch` | Fetches and reads a webpage |

Each tool call is shown as a collapsible step card in the conversation, showing what was called and what it returned.

### Model Selection

Use the model dropdown at the top of the chat area to switch between any model you have pulled via Ollama. The model is automatically switched with VRAM management — the previous model is unloaded before the new one loads.

### Orchestra Mode

Enable the **Orchestra** toggle (orange, Network icon) to run multi-agent orchestration. Instead of a single AI answering your message, a 3-stage pipeline runs:

1. **Planner** — decomposes your request into parallel sub-tasks (JSON decomposition)
2. **Workers** — each sub-task runs in its own focused agentic mini-loop (up to 4 iterations, full tool access)
3. **Synthesizer** — merges all worker outputs into a single streamed answer

During orchestration, each worker is shown as a collapsible **Agent Card** in the conversation. Use Orchestra mode for complex multi-step tasks like "audit my system, check for updates, summarise disk health, and suggest optimisations" in one message.

> Orchestra mode is slower than single-agent mode but produces far more thorough results for broad tasks.

### Smart Route

**Smart Route** automatically selects the best available model for your prompt. Enable it to let Vortex choose between a powerful reasoning model and a fast model depending on task complexity.

### Sessions

Conversations are saved as **Sessions**. Use the sessions panel (clock icon) to:
- Create a new session with **+ New Session**
- Switch between past conversations
- Rename a session by clicking the edit icon
- Delete a session permanently

Sessions persist across app restarts using SQLite.

### Attaching Files

Click the **paperclip icon** to attach a file to your message. Vortex reads the first 20,000 characters of text files and includes the content as context. For image files, the image is sent directly (vision-capable models will see it).

### Context Flags

Three toggles control what background context is included with every message:

- **RAG** — semantic search results from your loaded project codebase
- **Terminal** — the contents of the last terminal output (forwarded via terminal bridge)
- **Memory** — all stored AI Memory facts

### RAG (Retrieval-Augmented Generation)

Click **Load Project** to select a project folder. Vortex indexes all text and code files, splitting them into chunks and generating embeddings. When you ask a question, relevant chunks are automatically retrieved and injected into the AI's context.

### Diagnostics

The **Diagnose** button in agentic mode runs a system health check: it reads the last 50 journal error logs, checks running services, and asks Quantum to analyse what might be wrong.

### Pulling New Models

Type a model name in the pull input at the bottom (e.g. `llama3.2:latest`) and click **Pull**. A progress bar shows download status.

---

## 6. Image Generation

The Image Generation view connects directly to ComfyUI running at `http://127.0.0.1:8188`. The sidebar controls feed into ComfyUI workflow JSON that is queued and executed.

### Mode Toggle

At the top of the sidebar (non-FLUX models only):

- **Text → Image** — generate from a prompt, optionally with ControlNet
- **Image → Image** — use an existing image as the starting point and vary it

### Neural Model

Select your checkpoint model from the dropdown. Detected models are fetched live from ComfyUI. A description card appears below the dropdown indicating the model's strengths. When you change the model, ComfyUI VRAM is automatically purged to prevent stale residue.

### Sampler Controls

**Seed** — Enter any integer to lock a specific result. Click the shuffle icon (↺) to reset to `-1` (random). A fixed seed with identical settings will reproduce the same image exactly.

**Steps** (non-FLUX) — Number of diffusion steps, 4–50. Higher = more detail, slower generation. Default 25.

**CFG Scale** (non-FLUX) — Classifier-free guidance scale, 1–15. Higher = stronger prompt adherence. Default 7. Values above 12 can cause oversaturation.

**Sampler** (non-FLUX) — The noise schedule algorithm:
- `DPM++ 2M` — best quality/speed balance (default)
- `Euler` — fast, good for lower step counts
- `DPM++ 3M SDE` — high quality stochastic
- `DPM++ 2S Ancestral` — creative, slight variation each run
- `LCM` — ultra-fast (use with LCM LoRA)
- `DDIM` — deterministic, good for inpainting

FLUX models always use Euler with 4 steps and CFG=1 regardless of these settings.

### Reference Image (ControlNet / Img2Img)

**Text → Image mode:**
- Upload a **Pose, Depth, or Canny map** for ControlNet guidance
- Enable the ControlNet checkbox to activate it
- Choose the ControlNet model: Depth (SDXL), Canny (SDXL), or OpenPose (SDXL)

**Image → Image mode:**
- Upload or drop a reference image
- Click **Use Last Result** to immediately use the most recently generated image
- Set the **Creativity** slider (0.1–1.0):
  - `0.1–0.3` — very subtle variation, preserves the original closely
  - `0.5–0.7` — balanced variation (default 0.75)
  - `0.9–1.0` — full regeneration from the reference

### Face Detailer

When enabled, a second pass runs after the initial generation. A YOLO face detector finds any faces in the image and re-renders them at higher detail with a targeted inpaint step. This fixes common face quality issues (blurriness, distortion) without affecting the rest of the image.

Not available for FLUX.

### LoRA Adapters

LoRAs (Low-Rank Adaptation) are fine-tuning layers you can apply on top of a base model. Up to **2 LoRAs** can be active simultaneously.

Click **+ Add** to add a LoRA slot. For each slot:
- **Dropdown** — select the LoRA file from your ComfyUI LoRAs folder
- **Model slider** (0–2) — how strongly the LoRA affects the base model weights. 1.0 = full strength
- **CLIP slider** (0–2) — how strongly the LoRA affects the text encoder. Usually match the Model slider
- **× button** — remove this LoRA slot

Click the placeholder area to add your first LoRA if no slots are active. LoRAs are hidden when FLUX is selected (FLUX uses a separate LoRA loader not currently supported).

### Resolution

Select from 5 presets. Resolutions above 1024×1024 carry a **subject duplication risk** warning — at high resolutions, SDXL models trained at 1024px may generate mirrored or doubled subjects. Use 1024×1024 + Upscale for best results.

### Style Presets

Eight one-click style chips sit above the prompt. Clicking a chip **appends** its trigger words to both the positive and negative prompts without replacing what you've already typed. Chips: Cinematic, Anime, Oil Paint, Watercolour, Neon Noir, Studio Photo, Fantasy Art, Macro Photo.

### Prompts

**Positive Prompt** — describe what you want in the image. Use commas to separate descriptors. FLUX models are particularly good with natural language and can render text in quotes accurately.

**Negative Prompt** — describe what to avoid. Greyed out for FLUX (FLUX does not use negative conditioning).

Click `[ CLEAR ]` next to either label to wipe that field.

### Generate Button

Click **Synthesize** (or **Flux Synthesize** / **Img2Img Synthesize** depending on mode) to queue the workflow. The button shows "Synthesizing..." and spins the wand icon while the job runs.

Progress is shown as a percentage below the generating animation and as a thin bar at the bottom of the canvas.

### Canvas Actions

Once an image is generated, three buttons appear in the top-right corner:

- **Download** (blue) — saves the image to your Downloads folder
- **Upscale** (cyan, sparkle) — runs a 4K neural upscale using the 4x-UltraSharp model. The upscaled image replaces the current view and is auto-saved
- **Animate** (purple, film) — sends the current image to the Video Generation view as an Img2Video source

Images are automatically saved to `~/Pictures/AI Images/` on generation.

### Error Recovery

If generation fails, an error panel appears in the canvas with a human-readable description of what went wrong. A **Purge VRAM & Dismiss** button clears ComfyUI's GPU memory and resets the error state so you can retry.

---

## 7. Video Generation

The Video Generation view uses AnimateDiff to animate from text, an image, or an existing video.

### Mode Toggle

- **T2V (Text-to-Video)** — generate a video from a text prompt alone
- **I2V (Image-to-Video)** — animate an existing image. You can upload one or use the last image from Image Generation (the animate button forwards it automatically)
- **V2V (Video-to-Video)** — apply AI FX to an existing video while preserving its motion and structure

### Model

Select the AnimateDiff-compatible checkpoint. The same models used for image generation work here.

### Parameters

- **Frames** — total frames in the output (8–64). More frames = longer video but uses more VRAM
- **FPS** — playback frame rate (8–24). Does not affect generation speed
- **Width / Height** — output resolution
- **Prompt / Negative Prompt** — same as image generation

### Video-to-Video (V2V)

Switch to the **V2V** tab to apply style and FX to an existing video.

1. **Drag and drop** a video file onto the V2V zone, or click to browse
2. Set the **FX Intensity** slider (10–90%):
   - `10–30%` — subtle style shift, preserves original motion closely
   - `40–60%` — noticeable restyle (default: 50%)
   - `70–90%` — aggressive transformation, significant deviation from source
3. Write a positive prompt describing the target style
4. Click **Generate Motion**

The pipeline is: `VHS_LoadVideo → VAEEncode → AnimateDiff KSampler (denoise = intensity) → VAEDecode → VHS_VideoCombine`. The FX Intensity maps directly to AnimateDiff's denoise parameter — higher values let the model deviate more from the original frames.

### RIFE Frame Interpolation

Enable **RIFE** to multiply the frame count after generation using the RIFE optical-flow model. Three multiplier options:
- **2×** — doubles the frames (e.g. 16 → 32 frames)
- **3×** — triples the frames
- **5×** — quintuples the frames (default)

RIFE significantly smooths motion and increases video length without additional generation time.

### Tiled VAE

Enable for high-resolution video generation. The VAE decode step is split into tiles to reduce peak VRAM usage, at a small quality cost.

### Live VRAM Display

The bottom of the sidebar shows a live VRAM readout (`VRAM used/total MB · GPU util%`), polled every 5 seconds via `nvidia-smi`. The label turns red when VRAM usage exceeds 85% — a cue to purge before generating at high resolution.

### Output

Generated videos are saved to `~/Pictures/AI Video/` automatically and previewed directly in the canvas. The save uses `ionice -c 3` (idle I/O class) so file writes don't spike the I/O queue during generation. Download button saves a copy to your chosen location.

---

## 8. Media Gallery

The Gallery view shows all images and videos saved to `~/Pictures/AI Images/` and `~/Pictures/AI Video/`.

- Click any thumbnail to view it full-size
- Use the **Delete** button to permanently remove a file
- Images have a **Send to Animator** button to forward them to Video Generation

---

## 9. System Updates

The Updates view checks your system for available package updates.

### How It Works

- **Official Repositories** — uses `checkupdates` (pacman-contrib) to find pending pacman updates without touching the system
- **User Repositories (AUR)** — uses `paru -Qua` or `yay -Qua` to find outdated AUR packages

Both checks run in parallel. Click **Rescan System** to refresh.

### Applying Updates

When updates are available, an **Apply Full System Upgrade** panel appears. Click **Upgrade All** to run a full system upgrade:
- Uses `pkexec` for privilege escalation (a polkit password prompt appears)
- Uses `paru` or `yay` with `--noconfirm` if an AUR helper is installed
- Falls back to `pacman -Syu` via `pkexec` for repo-only upgrades

Live upgrade output streams into a scrollable log terminal below the button.

### AI Component Sync

The **AI Neural Engines** card at the bottom lets you update ComfyUI and Ollama separately from your system packages. Click **Sync AI**:

1. Updates ComfyUI core via `git pull` in `~/.comfyui-headless`
2. Updates all custom nodes in `~/.comfyui-headless/custom_nodes/` (in parallel)
3. Checks if Ollama is running and `ollama pull`s each installed model to refresh weights

---

## 10. System Cleaner

The Cleaner removes unnecessary files to free disk space. Each operation requires polkit elevation.

| Action | What it does |
|---|---|
| **Pacman Cache** | Removes old cached package files, keeping the last 1 version (`paccache -r -k 1`) |
| **Orphaned Packages** | Finds and removes packages no longer needed as dependencies (`pacman -Rns $(pacman -Qtdq)`) |
| **Journal Logs** | Truncates systemd journal logs older than 3 days (`journalctl --vacuum-time=3d`) |
| **Clean All** | Runs Pacman Cache + Journal Logs in one step |

Results and freed space are shown after each operation.

---

## 11. System Optimiser

The Optimiser runs system tuning operations.

| Action | What it does |
|---|---|
| **SSD TRIM** | Runs `fstrim -av` to discard unused blocks on SSDs (improves longevity and performance) |
| **Reset Failed Units** | Runs `systemctl reset-failed` to clear stuck failed service states |
| **Performance Mode** | Sets the CPU governor to `performance` via `cpupower frequency-set -g performance` |

---

## 12. Package Manager

A GUI front-end for pacman and your AUR helper.

### Search

Type a package name in the search box. Results show the package name, version, and repository (core, extra, community, AUR). Click a result to see full package info (description, dependencies, install size, homepage).

### Installing

Click **Install** on a package info card. Uses `pkexec pacman -S` for official packages and your AUR helper for AUR packages.

### Removing

Click **Remove** to uninstall a package. Uses `pkexec pacman -Rns` (removes with dependencies).

### AUR Packages

The **AUR** tab shows all currently installed AUR packages with their installed versions.

### Dependency Tree

Click **Explore Dependencies** on any package to open the Dependency Graph view — a visual tree of all package dependencies and what depends on the package.

---

## 13. Processes

A live process list, refreshed every 2 seconds.

- Shows PID, process name, user, CPU%, and memory usage
- Sorted by CPU usage by default
- Click **Kill** on any process to terminate it (sends SIGTERM; holds SIGKILL option)
- Filter by process name using the search box

---

## 14. Services

Manages systemd units.

- Lists all active, inactive, and failed units
- Filter by unit name
- **Start / Stop / Restart** any unit
- **Enable / Disable** a unit (persists across reboots)
- Click a unit name to see its recent journal logs

Failed units are highlighted in red.

---

## 15. Network Monitor

Shows live network activity.

- **Interfaces** — all detected network interfaces with IP addresses, link state, and TX/RX counters
- **Live Traffic** — per-interface bytes received and sent per second
- **Active Connections** — list of all current TCP/UDP connections with remote address, port, and state (ESTABLISHED, LISTEN, etc.)

---

## 16. Docker

Manage Docker containers and images.

- **Containers** — lists all containers (running and stopped) with status, image, ports, and uptime
- **Start / Stop / Restart** any container
- **Remove** stopped containers
- **Images** — lists all local Docker images with size and tag
- **Pull Image** — enter an image name to pull from Docker Hub

Requires Docker to be running (`systemctl start docker`).

---

## 17. Terminal

A full multi-tab terminal emulator built into Vortex, powered by node-pty and xterm.js.

### Tabs

- Click **+** to open a new terminal tab
- Click a tab label to switch to it
- Click **×** on a tab to close it
- Each tab runs a fully independent shell session

### Ask AI

When you encounter an error in the terminal, click **Ask AI** (wand icon) — the terminal's current output is forwarded to the AI Assistant as context, and you are switched to the Assistant view with the error pre-populated.

### Keyboard Shortcuts

- `Ctrl+`` ` — focus terminal from anywhere in the app
- Standard terminal shortcuts work inside the terminal (Ctrl+C, Ctrl+D, etc.)

---

## 18. Boot Analyser

Analyses systemd boot performance using `systemd-analyze`.

- **Total boot time** — firmware, loader, kernel, and userspace breakdown
- **Critical chain** — the slowest path through the boot process
- **Service blame list** — every service sorted by the time it added to boot, with a visual bar chart
- Click any service name to jump to it in the Services view

Use this to identify which services are slowing down your boot.

---

## 19. Disk Monitor

Shows health and usage information for all storage devices.

- **Filesystem usage** — each mounted filesystem with used/total/available and percentage bar
- **Device health** — S.M.A.R.T. data for each physical drive:
  - Overall health status (PASSED / FAILED)
  - Temperature
  - Power-on hours
  - Reallocated sectors, pending sectors, uncorrectable errors (red if non-zero)
  - Read error rate

A warning badge appears on any disk with non-zero error sectors.

---

## 20. Logs

A live system log viewer backed by `journalctl`.

### Filtering Options

- **Unit filter** — show logs only from a specific systemd unit (e.g. `nginx`, `sshd`)
- **Priority filter** — filter by severity: Emergency, Alert, Critical, Error, Warning, Notice, Info, Debug
- **Keyword search** — filter lines containing a specific string
- **Time range** — show logs since a specific date/time
- **Line count** — number of recent lines to load (default 200)

### Output

Logs are colour-coded by priority. Click **Refresh** to reload with current filters. Click **Copy All** to copy the full log output to clipboard.

---

## 21. Startup Manager

Controls which applications launch at login.

### Desktop Autostart

Lists `.desktop` files in `~/.config/autostart/` and `/etc/xdg/autostart/`. 

- Toggle the switch to **enable or disable** an entry (disabling adds `Hidden=true` to the file)
- Click **Delete** to permanently remove a user autostart entry

### Systemd User Services

Lists enabled systemd user units (`systemctl --user list-unit-files --state=enabled`).

- Toggle to **enable or disable** a user service at login
- Systemd system services (requiring root) are shown but cannot be toggled from here

---

## 22. Scheduler

The Scheduler view gives you live control over the Linux sched-ext BPF scheduler framework and BORE burst-penalty tuning.

### SCX Scheduler Panel

The top of the view shows the current active scheduler and sched-ext kernel state (`/sys/kernel/sched_ext/state`). Metrics show:

- **enable_seq** — how many times a sched-ext scheduler has been loaded since boot
- **rejected** — tasks rejected by the scheduler (non-zero indicates instability)

#### Scheduler Mode

Before switching, choose a mode:

| Mode | Description |
|---|---|
| **Auto** | Scheduler picks its own strategy (default) |
| **Power Save** | Favour energy efficiency |
| **Performance** | Favour throughput |
| **Gaming** | Favour latency and responsiveness |

#### Available Schedulers

| Scheduler | Best for |
|---|---|
| `scx_lavd` | Desktop + gaming — latency-aware vruntime |
| `scx_bpfland` | Mixed workloads — interactive-first BPF |
| `scx_rusty` | Multi-domain / NUMA topology-aware |
| `scx_cake` | Fair queuing with network-aware weighting |
| `scx_p2dq` | Low overhead, consistent latency |
| `scx_flash` | Ultra-low latency, aggressive preemption |
| `scx_cosmos` | Global vruntime scheduler |

Click **Switch** next to any scheduler to activate it via `scx_loader` DBus. The currently active scheduler is highlighted.

Click **Stop Scheduler** (shown when a sched-ext scheduler is active) to revert to the kernel default (EEVDF).

> Changes take effect immediately. No reboot required.

### BORE Burst Tuner

The bottom panel applies BORE burst-penalty sysctl presets via `kernel.sched_burst_*` parameters.

| Profile | Description |
|---|---|
| **Desktop** | Balanced burst penalty — responsive UI, good for daily use |
| **AI Heavy** | Low penalty for long-running compute tasks (Ollama inference) |
| **Balanced** | Good default for mixed workloads |
| **Gaming** | Reduced burst penalty, tighter latency budget |

> **Note:** BORE sysctl tunables (`kernel.sched_burst_*`) are only present in CachyOS kernels compiled with BORE, specifically the `-bore` or `-eevdf-bore` variants. The `-lts` kernel does not include them. If you are on the standard or LTS kernel, the tuner will show which parameters are unavailable without crashing.

---

## 23. AI Memory  

The Memory view manages the long-term memory bank that the AI assistant uses across all sessions.

### How It Works

The AI can call `remember_fact` during a conversation to save an important discovery. You can also add facts manually. Every fact is stored in SQLite and injected into every AI conversation (when the Memory context flag is enabled).

### Managing Memories

- **Add** — type a fact and click Add to save it immediately
- **Delete** — click the × button to remove a specific fact permanently
- **Clear All** — removes every memory entry (confirmation required)

### Examples of useful memories

- "User prefers concise answers without code explanations"
- "Project uses Rust 1.75, not stable default"
- "ComfyUI custom nodes are in ~/.comfyui-headless/custom_nodes"

---

## 24. Audit Log

A tamper-evident log of every command executed through the app — both AI-executed commands and manual terminal commands.

- Shows timestamp, command string, exit code, source (`agent` / `terminal`), and session ID
- **AI commands from the agentic loop are now automatically logged** with `source=agent` — no manual action required
- Colour-coded: green (exit 0), red (non-zero exit)
- Click **Clear Log** to wipe the audit history
- Useful for reviewing what the AI did during an agentic or Orchestra session

---

## 25. Settings

### AI Model

Select the default Ollama model used for new conversations. Also set a custom model name if yours doesn't appear in the list.

### System Prompt

Override the AI's built-in system prompt. Leave blank to use the default Quantum personality and system context. Useful for giving the AI specific role instructions (e.g. "You are a security auditor. Be extra cautious about destructive operations").

### SearXNG URL

Set the URL of your local SearXNG instance (default: `http://localhost:8080`). SearXNG is used by the AI's `web_search` tool. If SearXNG is unreachable, the AI falls back to DuckDuckGo instant answers.

To install SearXNG locally:
```bash
docker run -d -p 8080:8080 searxng/searxng
```

### Ollama Performance

Control how Ollama uses hardware resources. These buttons are in the **AI Node Configuration** section.

**VRAM Modes** — writes `/etc/systemd/system/ollama.service.d/override.conf` and restarts the Ollama service (requires polkit elevation):

| Mode | VRAM Overhead | Loaded Models | Parallel | Use when |
|---|---|---|---|---|
| **Max** | 0 GB reserved | 2 | 2 | Dedicated AI machine, maximum context |
| **Budget** | 2 GB reserved | 1 | 1 | Running games or other GPU workloads alongside AI |

**Pin V-Cache** — pins the running Ollama process to CPU cores 0–7 (the 3D-VCache CCD on the 7800X3D) and applies `renice -5`. This ensures Ollama gets the full L3 cache advantage. Ollama must be running for this to have effect.

### CachyOS Hardware

Controls for CachyOS-specific system tools.

**Hardware Detection (chwd)** — runs `chwd --list` to scan PCI devices and show available driver profiles (e.g. `nvidia-open-dkms`, `amd`). Click **Detect** to run the scan. Output shows each device with available profiles and priority scores.

**Mirror Ranking** — runs `cachyos-rate-mirrors` (requires polkit elevation) to test your pacman mirror speeds and rewrite `/etc/pacman.d/mirrorlist` with the fastest servers ordered by latency.

**Fingerprint (fprintd)** — shows whether `fprintd.service` is active and whether the package is installed. fprintd enables fingerprint reader authentication for polkit and PAM. Install with:
```bash
sudo pacman -S fprintd
systemctl enable --now fprintd
fprintd-enroll
```

### Theme

Choose the application theme: Dark (default), Crimson, or Light. Theme is persisted across restarts.

### Animations

Toggle smooth page transition animations on or off. Disable on lower-end hardware.

---

## 26. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+1` – `Ctrl+9` | Jump to sidebar item 1–9 |
| `Ctrl+K` | Focus AI Assistant input |
| `Ctrl+`` ` | Focus Terminal |
| `Ctrl+P` | Open Command Palette |
| `Ctrl+Shift+N` | New AI chat session |

### Command Palette

Press `Ctrl+P` to open a searchable command palette. Type any section name to navigate there instantly.

---

## 27. Troubleshooting

### App crashes on startup with "invalid ELF header" or "NODE_MODULE_VERSION mismatch"

**Cause:** `better-sqlite3` was compiled for a different Electron version. This happens after `npm install` or an Electron version update.

**Fix:** Rebuild the native module against the current Electron headers:
```bash
cd ~/Documents/Vortex\ Agentic\ V2
npm run rebuild:native
```

This runs `scripts/rebuild-native.sh`, which compiles `better-sqlite3` natively with `-march=znver4` optimisations, bypassing the precompiled GitHub release binaries.

### Scheduler view shows "scx_loader not running"

**Cause:** `scx_loader.service` is disabled (the default on CachyOS — it only activates on demand).

**Fix:** Enable and start scx_loader:
```bash
systemctl enable --now scx_loader.service
```
The Scheduler view will then show all 11 available schedulers and allow switching.

### "Generation Failed — Broken Pipe"

**Cause:** ComfyUI ran out of VRAM mid-generation, or a subprocess inside ComfyUI was interrupted.

**Fix:**
1. Click **Purge VRAM & Dismiss** in the canvas error panel
2. Try a lower resolution (e.g. 896×896 instead of 1440×1440)
3. Disable Face Detailer and LoRAs if active (they increase VRAM usage)
4. Switch to a model with fewer parameters

### "No models detected" in Image Generation

**Cause:** ComfyUI is not running or hasn't finished starting.

**Fix:**
1. Wait 30–60 seconds after opening the app for ComfyUI to initialise
2. Check `~/.config/Vortex Agentic/comfyui.log` for startup errors
3. Verify `~/.comfyui-headless/start-engine.sh` is executable: `chmod +x ~/.comfyui-headless/start-engine.sh`

### AI Assistant "Connection refused"

**Cause:** Ollama is not running.

**Fix:**
```bash
systemctl start ollama
# or
ollama serve
```

### Updates tab shows black window / crash

**Cause:** `checkupdates` or paru returned an unexpected format.

**Fix:** Click **Rescan System** to retry. If it persists, install `pacman-contrib`:
```bash
sudo pacman -S pacman-contrib
```

### Upgrade asks for password but fails

**Cause:** polkit (`pkexec`) is not installed or the polkit agent is not running.

**Fix:**
```bash
sudo pacman -S polkit
systemctl start polkit
```

### "Missing ComfyUI custom node dependency"

**Cause:** A ComfyUI node requires a Python package that isn't installed.

**Fix:** Go to **Updates → AI Neural Engines → Sync AI**. This runs `git pull` in all custom node directories, which typically also runs their install scripts.

### ComfyUI WebSocket shows "disconnected"

**Cause:** ComfyUI hasn't started yet, or crashed.

**Fix:** 
1. Wait for ComfyUI to initialise (can take 60 seconds on first run as models load)
2. Check the log: `tail -f ~/.config/Vortex\ Agentic/comfyui.log`
3. The socket auto-reconnects every 3 seconds — it will recover when ComfyUI is ready

### LoRA list shows "No LoRAs detected"

**Cause:** No LoRA files are installed in ComfyUI's LoRA directory.

**Fix:** Place `.safetensors` LoRA files in `~/.comfyui-headless/models/loras/` and restart ComfyUI (or click Rescan/Purge VRAM).

---

*Vortex Agentic V2 — Built for Linux power users who demand more from their machines.*
