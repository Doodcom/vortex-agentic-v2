# Vortex Agentic V2 — User Manual

**Version:** 2.0  
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
9. [AI Models (Ollama)](#9-ai-models-ollama)
10. [System Updates](#10-system-updates)
11. [System Cleaner](#11-system-cleaner)
12. [System Optimiser](#12-system-optimiser)
13. [Package Manager](#13-package-manager)
14. [Processes](#14-processes)
15. [Services](#15-services)
16. [Network Monitor](#16-network-monitor)
17. [Docker](#17-docker)
18. [Terminal](#18-terminal)
19. [Boot Analyser](#19-boot-analyser)
20. [Disk Monitor](#20-disk-monitor)
21. [Logs](#21-logs)
22. [Startup Manager](#22-startup-manager)
23. [Scheduler](#23-scheduler)
24. [AI Memory](#24-ai-memory)
25. [Audit Log](#25-audit-log)
26. [System History](#26-system-history)
27. [Restore Points](#27-restore-points)
28. [Automation Workflows](#28-automation-workflows)
29. [App Launcher](#29-app-launcher)
30. [Cron Job Manager](#30-cron-job-manager)
31. [SSH Key Manager](#31-ssh-key-manager)
32. [UFW Firewall](#32-ufw-firewall)
33. [Dotfile Vault](#33-dotfile-vault)
34. [Benchmark](#34-benchmark)
35. [Environment Variables](#35-environment-variables)
36. [Health Report](#36-health-report)
37. [Settings](#37-settings)
38. [Keyboard Shortcuts](#38-keyboard-shortcuts)
39. [Command Palette](#39-command-palette)
40. [Troubleshooting](#40-troubleshooting)

---

## 1. Overview

Vortex Agentic V2 is a unified Linux system management and AI creation suite. It combines:

- **System management** — package updates, process control, service management, disk health, network monitoring, system cleanup, and automation all in one place
- **AI conversation** — a local Ollama-powered assistant (Quantum) with agentic tool use: it can run shell commands, read files, search the web, and manage your system on your behalf
- **AI image generation** — full ComfyUI integration with text-to-image, image-to-image, ControlNet pose/depth guidance, LoRA style adapters, Face Detailer, 4K upscaling, and saved workflow presets
- **AI video generation** — AnimateDiff text-to-video and image-to-video with RIFE frame interpolation for smooth output
- **A media gallery** — browse and manage all AI-generated images and videos
- **Automation** — custom named workflows that chain system commands and run them sequentially with live per-step status
- **Resource history** — 24-hour trending graphs for CPU, RAM, GPU, Disk, and Network
- **Restore points** — snapper/btrfs snapshot management with one-click rollback

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
| snapper | Optional — required for the Restore Points view |

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

The left sidebar contains all sections, grouped into categories:

| Category | Sections |
|---|---|
| Overview | Dashboard, Home Assistant |
| AI Suite | Quantum AI, Image Gen, Video Gen, AI Gallery, AI Memory, AI Models |
| Performance | Optimizer, Scheduler, Updates, Cleaner, Restore Points, Sandbox |
| System | Terminal, Processes, Services, Packages, Dep Graph, Docker |
| Diagnostics | Network, Disk Monitor, Boot Analyser, Sys History, Audit Log, Log Viewer, Startup Apps |
| Automation | Workflows |
| Config | Settings |

### Sidebar Controls

- **Collapse** — click the `« Collapse` button at the bottom to hide labels (icon-only mode)
- **Resize** — drag the thin handle on the right edge of the sidebar left or right (range: 180px–380px). Width is saved in localStorage and restored on next launch
- **Theme Swatches** — four colour dots in the expanded footer switch the app accent colour between Vortex Red, Cyber Blue, Neon Gold, and Matrix Green

### Active Indicator

The currently active section has a thin red bar on the left edge of its nav button (animated with layoutId, so it smoothly slides between items).

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

### Widget Visibility

Click the **Customise** button (top-right of the Dashboard) to open the customisation panel. Each widget can be toggled on or off using the pill buttons. Hidden widgets are removed from the view; visible widgets remain. Your visibility choices are saved in localStorage (`vortex-widget-visibility`) and persist across restarts.

### Section Reordering

The Customise panel has a second sub-section: **Section Order**. Each of the 5 dashboard sections (Metrics, Control, Creative, Silicon, Activity) appears as a drag handle row. Click and drag the `⠿` grip to rearrange sections in any order. The new order is saved in localStorage (`vortex-section-order`) immediately on drop and persists across restarts.

Click **Reset Defaults** in the Customise panel to restore all widgets to visible and sections to the default order without a page reload.

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

Use the model dropdown at the top of the chat area to switch between any model you have pulled via Ollama. The model is automatically switched with VRAM management — the previous model is unloaded before the new one loads. To manage, pull, or delete models, use the **AI Models** view (see section 9).

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

**Keyboard shortcut:** `Ctrl+Shift+N` creates a new session from anywhere in the app.

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

### Workflow Presets

Below the Style Presets row, the **Saved Presets** panel lets you save and recall your entire generation configuration — prompt, negative prompt, model, resolution, steps, CFG, sampler, seed, and all active LoRAs.

#### Saving a Preset

1. Configure your generation settings as desired
2. Open the Presets panel by clicking the **Presets** header button
3. Type a name in the preset name field
4. Click **Save** (or press Enter)

The preset is saved immediately to localStorage (`vortex-comfy-presets`) and appears in the list below.

#### Loading a Preset

Click **Load** on any saved preset. All fields — positive prompt, negative prompt, model, resolution, steps, CFG, sampler, seed, and LoRA assignments — are filled simultaneously. A green toast confirms what was loaded.

#### Deleting a Preset

Click the **×** button on any preset row to remove it permanently.

#### Preset Storage

Presets are stored in the browser's localStorage under the key `vortex-comfy-presets`. They persist across app restarts and are not tied to any session.

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

## 9. AI Models (Ollama)

The AI Models view is a full management interface for your locally installed Ollama models. Access it via the sidebar under **AI Suite → AI Models** or press `Ctrl+P` and search "AI Models".

### Stats Bar

At the top of the view, three summary cards show at a glance:
- **Installed** — total number of models currently on disk
- **Total Size** — combined disk usage of all models (in GB)
- **Families** — number of distinct model families (llama, mistral, qwen, phi, etc.)

### Pulling New Models

In the **Pull Model** panel on the right side:

1. Type the full model tag in the input field (e.g. `llama3.2:latest`, `qwen2.5-coder:7b`, `phi4:latest`)
2. Click **Pull** or press Enter
3. A progress bar appears showing the download percentage and current layer being fetched. This updates in real time from Ollama's pull stream
4. When the pull completes, the model appears in the table automatically

**Popular model quick-fill:** A row of preset model buttons at the bottom of the pull panel lets you fill common model names with one click: Llama 3.2, Qwen2.5 Coder, Gemma2, Phi-4, Mistral, and DeepSeek R1. Clicking a preset populates the input field without starting the pull, so you can review the tag before committing.

### Model Table

Each installed model is shown in a table with:

| Column | Description |
|---|---|
| Name | Full model tag (e.g. `llama3.2:3b`) |
| Family | Model family with a colour-coded badge (llama=blue, mistral=purple, qwen=cyan, phi=amber, gemma=green, deepseek=red, others=grey) |
| Params | Parameter count (e.g. `3B`, `70B`) |
| Quant | Quantisation level (e.g. `Q4_K_M`, `Q8_0`, `F16`) |
| Size | Disk size |
| Actions | Delete button |

### Deleting a Model

Click the **trash icon** on a model row. A two-step confirmation appears:
- The row highlights in red and a **Confirm Delete** button replaces the trash icon
- Click **Confirm Delete** to permanently remove the model from disk via `DELETE /api/delete`
- Click the **×** button to cancel and restore the row to normal

Deletion is permanent — the model must be re-pulled if needed.

---

## 10. System Updates

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

### Arch Linux News Feed

A collapsible **Arch News** panel at the bottom of the Updates view fetches the official Arch Linux RSS feed and displays recent announcements. This is the same feed that the Arch Wiki uses for breaking-change notices — it alerts you to manual interventions required before upgrades.

**Features:**
- Unread badge on the panel header (count of unread items)
- Items marked in red when the title contains keywords like `breaking`, `manual intervention`, `important`, or `warning`
- Click any item to expand its full summary
- Items are marked as read in localStorage (`vortex-arch-news-read`) when expanded
- The panel is collapsible — click the header to toggle

**When to check:** Before any large system upgrade, verify there are no breaking-change announcements that require manual steps.

---

## 11. System Cleaner

The Cleaner removes unnecessary files to free disk space. Each operation requires polkit elevation.

| Action | What it does |
|---|---|
| **Pacman Cache** | Removes old cached package files, keeping the last 1 version (`paccache -r -k 1`) |
| **Orphaned Packages** | Finds and removes packages no longer needed as dependencies (`pacman -Rns $(pacman -Qtdq)`) |
| **Journal Logs** | Truncates systemd journal logs older than 3 days (`journalctl --vacuum-time=3d`) |
| **Clean All** | Runs Pacman Cache + Journal Logs in one step |

Results and freed space are shown after each operation.

---

## 12. System Optimiser

The Optimiser runs system tuning operations.

| Action | What it does |
|---|---|
| **SSD TRIM** | Runs `fstrim -av` to discard unused blocks on SSDs (improves longevity and performance) |
| **Reset Failed Units** | Runs `systemctl reset-failed` to clear stuck failed service states |
| **Performance Mode** | Sets the CPU governor to `performance` via `cpupower frequency-set -g performance` |

---

## 13. Package Manager

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

## 14. Processes

A live process list, refreshed every 2 seconds.

- Shows PID, process name, user, CPU%, and memory usage
- Sorted by CPU usage by default
- Click **Kill** on any process to terminate it (sends SIGTERM; holds SIGKILL option)
- Filter by process name using the search box

---

## 15. Services

Manages systemd units.

- Lists all active, inactive, and failed units
- Filter by unit name
- **Start / Stop / Restart** any unit
- **Enable / Disable** a unit (persists across reboots)
- Click a unit name to see its recent journal logs

Failed units are highlighted in red.

---

## 16. Network Monitor

Shows live network activity.

- **Interfaces** — all detected network interfaces with IP addresses, link state, and TX/RX counters
- **Live Traffic** — per-interface bytes received and sent per second
- **Active Connections** — list of all current TCP/UDP connections with remote address, port, and state (ESTABLISHED, LISTEN, etc.)

---

## 17. Docker

Manage Docker containers and images.

- **Containers** — lists all containers (running and stopped) with status, image, ports, and uptime
- **Start / Stop / Restart** any container
- **Remove** stopped containers
- **Images** — lists all local Docker images with size and tag
- **Pull Image** — enter an image name to pull from Docker Hub

Requires Docker to be running (`systemctl start docker`).

---

## 18. Terminal

A full multi-tab terminal emulator built into Vortex, powered by node-pty and xterm.js.

### Tabs

- Click **+** to open a new terminal tab
- Click a tab label to switch to it
- Click **×** on a tab to close it
- Each tab runs a fully independent shell session

### Session Persistence

Terminal state is automatically saved and restored across navigation and app restarts:

- **Tab list** — all open tabs (IDs and custom names) are saved to localStorage (`vortex-term-sessions`)
- **Command history** — the up-arrow history for each tab is preserved
- **Scrollback buffer** — the last output of each tab is fetched from the main process on restore, so you can see what was running when you navigated away

When you re-open the terminal after navigating elsewhere, all your tabs are restored in the same order with their names intact. Tabs whose underlying shell process has died (e.g. the tab was closed externally) are pruned automatically.

### Renaming Tabs

Double-click any tab label to rename it. Press Enter or click elsewhere to confirm. The name is saved and persists across navigation.

### Ask AI

When you encounter an error in the terminal, click **Ask AI** (wand icon) — the terminal's current output is forwarded to the AI Assistant as context, and you are switched to the Assistant view with the error pre-populated.

### Keyboard Shortcuts

- `Ctrl+`` ` — focus terminal from anywhere in the app
- Standard terminal shortcuts work inside the terminal (Ctrl+C, Ctrl+D, etc.)

---

## 19. Boot Analyser

Analyses systemd boot performance using `systemd-analyze`.

- **Total boot time** — firmware, loader, kernel, and userspace breakdown
- **Critical chain** — the slowest path through the boot process
- **Service blame list** — every service sorted by the time it added to boot, with a visual bar chart
- Click any service name to jump to it in the Services view

Use this to identify which services are slowing down your boot.

---

## 20. Disk Monitor

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

## 21. Logs

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

## 22. Startup Manager

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

## 23. Scheduler

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

## 24. AI Memory  

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

## 25. Audit Log

A tamper-evident log of every command executed through the app — both AI-executed commands and manual terminal commands.

- Shows timestamp, command string, exit code, source (`agent` / `terminal`), and session ID
- **AI commands from the agentic loop are automatically logged** with `source=agent` — no manual action required
- Colour-coded: green (exit 0), red (non-zero exit)
- Click **Clear Log** to wipe the audit history
- Useful for reviewing what the AI did during an agentic or Orchestra session

### Date Range Filtering

The Audit Log toolbar includes two date pickers for filtering by time range:

- **From** — show only entries on or after this date
- **To** — show only entries on or before this date (includes the entire end day)

Both fields accept a standard date input (`YYYY-MM-DD`). When a filter is active, a **clear** button (×) appears next to the picker to remove that constraint. Both filters can be active simultaneously to show only entries within a specific window (e.g. "show only what the AI did on Tuesday afternoon").

The active filter indicator in the toolbar shows whether date filtering is currently applied.

---

## 26. System History

The System History view shows rolling 24-hour resource trend graphs for your machine's key metrics. Access it via **Diagnostics → Sys History**.

### Data Collection

Vortex samples resource usage every **30 seconds** in the background via a resource poller running in the main process. Samples are written to a SQLite `resource_history` table. Data older than 25 hours is automatically pruned to keep the database lightweight.

### Time Range Tabs

Select the window to display using the tabs at the top: **1h**, **6h**, **12h**, or **24h**.

### Summary Row

A row of metric cards below the tabs shows three values for each metric across the selected window:

| Label | Meaning |
|---|---|
| Current | The most recent recorded sample |
| Avg | Mean value across the selected window |
| Peak | Maximum value recorded in the window |

### Charts

Six SVG line charts are displayed in a 2×3 grid:

| Chart | What it shows |
|---|---|
| CPU | CPU load % over time |
| RAM | RAM usage % over time |
| GPU | GPU utilisation % over time |
| Disk | Root filesystem usage % |
| Net RX | Network receive speed (KB/s) |

Each chart includes:
- **Polyline** with a filled gradient area beneath
- **Grid lines** at 25%, 50%, and 75% of the chart height
- **Time axis labels** at the left and right edges (oldest → newest)
- **Live dot** — a pulsing red dot on the rightmost (most recent) data point

When the selected window contains more than 300 data points, the data is downsampled to a maximum of 300 evenly spaced points for smooth rendering.

### Use Cases

- **Identify CPU/RAM spikes** that occurred while you were away
- **Confirm VRAM usage patterns** during AI generation sessions
- **Verify disk usage is stable** before and after cleaning operations
- **Detect unexpected network activity** at a given time

---

## 27. Restore Points

The Restore Points view manages btrfs snapshots via `snapper`. Access it via **Performance → Restore Points**.

> **Prerequisite:** `snapper` must be installed and a `root` configuration must exist. Install with:
> ```bash
> sudo pacman -S snapper
> sudo snapper -c root create-config /
> ```

### Stats Bar

Three summary cards at the top show:
- **Total Snapshots** — all snapshots in the `root` configuration
- **Manual** — snapshots you created with type `single`
- **Auto** — snapshots created automatically by snapper (type `pre` or `post`, e.g. by pacman hooks)

### Creating a Snapshot

1. Type a description in the **Description** input (e.g. "before kernel update")
2. Click **Create Snapshot**
3. The new snapshot appears in the table with a generated ID and the current timestamp

Snapshots are created as type `single` with `pkexec snapper -c root create -t single -d <description>`.

### Snapshot Table

Each snapshot row shows:

| Column | Description |
|---|---|
| ID | Numeric snapshot identifier |
| Type | `single` (indigo), `pre` (amber), `post` (green), `timeline` (blue) — colour-coded badges |
| Date | Creation timestamp |
| Description | Label from when the snapshot was created |
| Used Space | Disk space uniquely used by this snapshot (btrfs deduplication means most snapshots use very little) |
| Actions | Rollback and Delete buttons |

### Rolling Back

Click **Rollback** on a snapshot row. A confirmation modal appears asking you to confirm:
- The modal shows the snapshot ID and description
- Click **Confirm Rollback** to proceed
- Vortex runs `pkexec snapper -c root rollback <id>`
- A reboot is required for the rollback to fully take effect — Vortex will prompt you

> **Warning:** Rollback replaces your root filesystem with the snapshotted state. Files created after the snapshot was taken will not be present after rebooting. Back up important data before rolling back.

### Deleting a Snapshot

Click **Delete** on a snapshot row. A confirmation modal appears:
- Click **Confirm Delete** to permanently remove the snapshot
- Vortex runs `pkexec snapper -c root delete <id>`
- Freed space is reclaimed by btrfs

### Not Available State

If snapper is not installed or no root configuration exists, the view shows a "Not Available" banner with installation instructions instead of the snapshot table.

---

## 28. Automation Workflows

The Automation Workflows view lets you build named sequences of system operations and run them with one click. Each workflow chains steps sequentially — if a step fails, the run stops. Access it via **Automation → Workflows**.

### Use Cases

- **Pre-update routine:** Create Snapshot → Full System Upgrade → Rate Mirrors
- **AI reset:** Vacuum Journal → Restart Ollama
- **Maintenance sweep:** Repo Upgrade → Clean Package Cache → Rebuild Native Packages
- **Custom scripts:** Chain any shell commands in a defined order

### Creating a Workflow

1. Click **New** in the top-right of the left panel
2. A new workflow called "New Automation" is created and selected automatically
3. Rename it by clicking the **pencil icon** next to the name, typing a new name, and pressing Enter or clicking the checkmark

### The Editor

The editor is split into two panels:

**Left: Step Sequence** — your current workflow's ordered list of steps. Steps run top-to-bottom when executed.

**Right: Step Palette** — a catalogue of available action types to add. Click any item in the palette to append it as the next step in the sequence.

### Available Step Types

| Step | Command |
|---|---|
| Repo Upgrade | `sudo pacman -Syu --noconfirm` |
| AUR Upgrade | `paru -Sua --noconfirm` |
| Full System Upgrade | `paru -Syu --noconfirm` |
| Clean Package Cache | `paru -Sc --noconfirm` |
| Vacuum Journal | `sudo journalctl --vacuum-time=7d` |
| Rebuild Native Pkgs | Rebuilds all AUR/foreign packages natively |
| Restart Ollama | `sudo systemctl restart ollama` |
| Rate CachyOS Mirrors | `sudo cachyos-rate-mirrors` |
| Create Snapshot | `sudo snapper -c root create -t single -d "auto"` |
| Custom Shell Command | Any shell command you type |

### Reordering Steps

Drag any step by its `⠿` grip handle to reorder it within the sequence. The new order takes effect immediately and is saved automatically.

### Removing Steps

Click the **×** button on any step row to remove it from the workflow.

### Custom Shell Commands

When you add a **Custom Shell Command** step, an input field appears below the step label. Type any shell command to execute. The command is stored with the step and runs exactly as typed via `execCommand`.

> **Security note:** Custom shell commands run with the permissions of the Vortex process. Use `sudo` explicitly for operations that require elevation.

### Running a Workflow

Click the **Run** button (top-right of the editor, next to the workflow name). Steps execute sequentially:

- **Running** — the current step shows a spinning blue loader icon
- **Done** — completed steps show a green check icon
- **Error** — if a step exits with a non-zero code, it shows a red × icon and execution stops

**Step Output:** When a step finishes (success or failure), its combined stdout and stderr output is shown in a collapsible code block below the step label. Scroll within it to read lengthy output.

**Stop:** Click the **Stop** button while a workflow is running to interrupt execution after the current step completes.

**Run Result Banner:** After execution finishes, a banner appears below the workflow name summarising the result:
- Green: "All steps completed successfully"
- Red: "Automation stopped — a step failed"

### Managing Workflows

**Left panel** lists all saved workflows:
- Each row shows the workflow name, step count (`Xs`), and a trash button
- Click a row to select and edit it
- Click the trash icon to permanently delete the workflow (no confirmation)

Workflows are persisted in localStorage (`vortex-automations`) and survive app restarts.

---

## 29. App Launcher

**Sidebar:** Overview → App Launcher

A searchable grid of every installed GUI application parsed from `.desktop` files on your system.

### How It Works

On load, the App Launcher scans three directories for `.desktop` files:
- `/usr/share/applications/`
- `/usr/local/share/applications/`
- `~/.local/share/applications/`

Entries with `NoDisplay=true` or a missing `Exec` field are filtered out. Duplicate names are deduplicated.

### Searching and Filtering

- **Search bar** — type any part of an app name, comment, or category to instantly filter the grid
- **Category chips** — filter by category (Audio, Video, Development, Game, Graphics, Network, Office, System, Utility, etc.)
- **Rescan** button — re-reads `.desktop` files (useful after installing new applications)

### Launching Apps

Click any app card to launch it. The card briefly highlights with a play icon during launch. Desktop file field codes (`%u`, `%f`, `%F`, etc.) are stripped before passing the command to the shell.

A notification confirms success or reports an error.

---

## 30. Cron Job Manager

**Sidebar:** Automation → Cron Jobs

A visual editor for the current user's crontab. Read and write scheduled tasks without memorising cron syntax.

### Reading the Crontab

On load, the view reads `crontab -l` for the current user and parses all valid schedule entries. Inline comments above each entry are captured as labels.

### Adding and Editing Jobs

Click **+ Add Job** to create a new entry. Each job has five schedule fields:

| Field | Description | Examples |
|---|---|---|
| min | Minute (0–59) | `0`, `*/15`, `30` |
| hour | Hour (0–23) | `*/6`, `9`, `0` |
| dom | Day of month (1–31) | `*`, `1`, `15` |
| month | Month (1–12) | `*`, `6` |
| dow | Day of week (0–7, 0=Sun) | `*`, `1-5`, `0` |

Click any field and type to edit it directly. The **command** field holds the shell command to execute.

### Preset Chips

Common schedule patterns are available as one-click presets:
- **Every minute** — `* * * * *`
- **Every hour** — `0 * * * *`
- **Daily midnight** — `0 0 * * *`
- **Weekly (Mon)** — `0 0 * * 1`
- **Monthly** — `0 0 1 * *`

### Saving

Changes are not applied until you click **Save Crontab**. The button activates only when there are unsaved edits. Saving writes the entire crontab via `echo "…" | crontab -`.

### Deleting Jobs

Click the trash icon on any row to remove it from the list. The deletion is staged — click **Save Crontab** to commit.

---

## 31. SSH Key Manager

**Sidebar:** Automation → SSH Keys

Manage SSH key pairs in `~/.ssh/`. View fingerprints, copy public keys, generate new keys, and safely delete pairs.

### Key List

Each key card shows:
- **Filename** (the base name, e.g. `id_ed25519`)
- **Key type** badge — `ED25519` (green), `RSA` (blue), `ECDSA` (amber) — colour-coded
- **Fingerprint** — SHA256 hash from `ssh-keygen -lf`
- **Comment** — from the public key header (usually `user@hostname`)

### Copying the Public Key

Click **Copy Pub Key** to copy the full public key string to the clipboard. This is the key you paste into remote `~/.ssh/authorized_keys` files or service dashboards (GitHub, GitLab, servers).

### Viewing the Raw Key

Click **▶ Show Key** to expand the full raw public key text inline.

### Generating a New Key

Click **+ Generate Key** to open the generation form:

| Field | Options |
|---|---|
| Key Type | ED25519 (default, recommended) · RSA · ECDSA |
| RSA Bits | 2048 · 3072 · 4096 (only for RSA) |
| Comment | Optional label (e.g. `work@laptop`) |
| Filename | Key filename (saved in `~/.ssh/`) |

Click **Generate** to run `ssh-keygen`. The new key pair appears in the list immediately.

### Deleting a Key

Click **Delete** on a key card, then confirm the second confirmation prompt. Both the private key and its `.pub` file are removed from `~/.ssh/`.

---

## 32. UFW Firewall

**Sidebar:** Automation → Firewall (UFW)

A graphical interface for the Uncomplicated Firewall. View and manage rules without memorising `ufw` commands.

### Status Panel

The header shows whether UFW is **enabled** or **disabled**. Toggle the **Enable** / **Disable** button to activate or deactivate the firewall. A confirmation prompt appears before disabling.

> UFW operations require `sudo` — a polkit password prompt may appear.

### Rules Table

All active rules are listed in a table with columns:
- **To** — destination port / address
- **Action** — `ALLOW` (green), `DENY` (red), `LIMIT` (amber)
- **From** — source address (`Anywhere` for any)
- **Comment** — optional label

Click the trash icon next to a rule to delete it (by rule number).

### Adding a Rule

Click **+ Add Rule** to open the rule form:

| Field | Description |
|---|---|
| Port | Port number (e.g. `22`, `8080`) or service name (e.g. `ssh`) |
| Protocol | `tcp`, `udp`, or `any` |
| Action | `allow` or `deny` |
| From | Source IP/CIDR (leave blank for `Anywhere`) |
| Comment | Optional label for the rule |

Click **Add** to apply. Input is validated — only numeric ports (1–65535) and valid IP/CIDR patterns are accepted.

### Raw Output

Click **Show Raw Output** at the bottom to see the raw `ufw status numbered` output.

---

## 33. Dotfile Vault

**Sidebar:** Automation → Dotfile Vault

Create and restore compressed backups of your configuration files. Protect your dotfiles before upgrades or experiments.

### How It Works

Backups are stored as `.tar.gz` archives in `~/Vortex-Backups/`. Each archive contains a snapshot of the files and directories you specified at the time of creation.

### Creating a Backup

The **New Backup** panel on the left shows a list of paths to include. Default paths (pre-populated):
- `~/.bashrc`
- `~/.zshrc`
- `~/.config/`
- `~/.local/share/`
- `~/.ssh/`

**Editing the path list:**
- Click any path to edit it inline
- Click **+ Add Path** to add a new entry
- Click the `×` button next to a path to remove it

Click **Create Backup** to tar.gz the selected paths. A timestamped archive (e.g. `vortex-vault-2026-05-05T14:30:00.tar.gz`) is created in `~/Vortex-Backups/`. A success notification appears with the filename.

### Restoring a Backup

The **Existing Backups** panel on the right lists all archives sorted by date (newest first). Each card shows:
- Archive filename
- Date and time created
- File size

Click **Restore** to extract the archive over your home directory. A confirmation prompt appears first — this will overwrite any files that exist at the same paths.

### Deleting a Backup

Click **Delete** on any backup card to remove it. A confirmation prompt appears.

---

## 34. Benchmark

**Sidebar:** Performance → Benchmark

Run sequential performance tests and compare results across sessions.

### Available Tests

Select which tests to run using the chip selector at the top:

| Test | What it measures |
|---|---|
| **CPU** | Multi-threaded `sha256sum` throughput in MB/s |
| **Memory** | RAM bandwidth via `/dev/urandom` read speed in MB/s |
| **Disk Read** | Sequential NVMe read speed from `/tmp` via `dd` |
| **Disk Write** | Sequential NVMe write speed to `/tmp` via `dd` |
| **I/O Throughput** | Combined block I/O score (higher is better) |

Toggle any test on or off. Click **Run Selected Tests** to start.

### Running a Benchmark

Tests run sequentially (one at a time). As each completes, a score bar fills in. The bars are colour-coded:
- **Green** — excellent (near or above reference maximum)
- **Amber** — moderate
- **Red** — poor

Each bar shows the raw score alongside the visual indicator. Partial results display as tests complete — you can see CPU results before Disk finishes.

### Benchmark History

The last 10 benchmark sessions are stored in localStorage. Click **History** (if available) to compare previous runs. Results persist across app restarts.

---

## 35. Environment Variables

**Sidebar:** Diagnostics → Env Variables

Browse all environment variables from the current process environment. Useful for debugging path issues, missing variables, and confirming what's visible to apps launched by Vortex.

### Tabs

| Tab | What it shows |
|---|---|
| **All** | Every environment variable |
| **PATH** | PATH entries split to one per line |
| **Highlighted** | Variables commonly relevant to system tools (`DISPLAY`, `WAYLAND_DISPLAY`, `XDG_*`, `HOME`, `SHELL`, `LANG`, `EDITOR`, etc.) |

### Searching

Type in the search bar to filter variables by name or value in real time.

### PATH Entries

In the **PATH** tab, the PATH value is expanded into individual directory entries. Each entry is shown on its own line — much easier to read than the full colon-separated string. Click any entry to copy it to the clipboard.

### Copying Variables

Click the copy icon next to any variable to copy `KEY=VALUE` to the clipboard. A brief confirmation flash appears on the copied row.

---

## 36. Health Report

**Sidebar:** Diagnostics → Health Report

An AI-powered system health analysis that gathers live data from multiple sources and produces a scored health report with recommendations.

### Generating a Report

Click **Generate Health Report**. The view runs through several stages:

1. **Gathering system stats** — CPU load, RAM usage
2. **Checking disk** — root filesystem usage percentage
3. **Reading journal errors** — counts recent error-priority systemd journal entries
4. **Checking services** — counts and names failed systemd units
5. **Checking updates** — counts pending repo and AUR package updates
6. **Asking AI** — sends all collected data to the local Ollama model for analysis

The button label updates to show the current stage while running.

### Health Score

A circular score ring (0–100) shows the overall health score returned by the AI:
- **85–100** — green (healthy)
- **65–84** — amber (needs attention)
- **0–64** — red (issues detected)

The score is generated by the AI based on the data — it is an approximation, not a precise metric.

### Metric Grid

Six status tiles show the key data points collected before asking the AI:

| Tile | Status logic |
|---|---|
| CPU | warn if load > 85% |
| RAM | warn > 75%, error > 90% |
| Disk | warn > 80%, error > 90% |
| Journal Errors | warn > 5, error > 20 |
| Failed Services | error if any |
| Pending Updates | warn if > 30 packages |

Each tile is colour-coded green / amber / red accordingly.

### Recommendations

The AI generates up to 5 specific, actionable recommendations based on the data. Each recommendation is numbered and displayed as a card.

### Refreshing

Click **Refresh** (appears after a report is generated) to re-run the full analysis with fresh data.

> **Requirement:** The Health Report requires Ollama to be running and a model to be selected in Settings → AI Model. If Ollama is not available the report shows "Could not generate report — is Ollama running?"

---

## 37. Settings

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

Choose the application accent colour: Vortex Red (default), Cyber Blue, Neon Gold, or Matrix Green. The theme swatches are also accessible from the sidebar footer. Theme is persisted across restarts.

### Animations

Toggle smooth page transition animations on or off. Disable on lower-end hardware.

### Resource Alert Thresholds

Set the CPU, RAM, and GPU VRAM usage percentages at which Vortex fires an alert notification.

| Metric | Default threshold |
|---|---|
| CPU | 90% |
| RAM | 90% |
| GPU VRAM | 95% |

Use the sliders or type directly into the number fields. Changes save immediately to localStorage (`vortex-alert-thresholds`).

Alerts appear as system notifications (Wayland/X11 `Notification` API) with a **Vortex:** prefix. Each metric has an independent 5-minute cooldown — you won't be spammed if load stays elevated.

> **GPU alerts** require `nvidia-smi` to be available on the system. If `nvidia-smi` is not found, GPU alerts are skipped silently.

---

## 38. Keyboard Shortcuts

### Global Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+1` – `Ctrl+9` | Jump to sidebar item 1–9 (in order of appearance) |
| `Ctrl+K` | Focus AI Assistant input |
| `Ctrl+`` ` | Focus Terminal |
| `Ctrl+P` | Open Command Palette |
| `Ctrl+Shift+N` | New AI chat session |
| `?` | Open keyboard shortcuts overlay (when not in a text field) |

### Keyboard Shortcuts Overlay

Press **`?`** anywhere in the app (when you are not typing in an input or textarea) to open a floating overlay showing all available keyboard shortcuts, organised into three sections:

- **Navigation** — section-switching shortcuts
- **AI / Chat** — assistant and session shortcuts
- **Global** — app-level shortcuts

Press `Escape` or click the backdrop to close the overlay.

---

## 39. Command Palette

Press **`Ctrl+P`** to open the command palette — a searchable list of every section and action in Vortex.

### Using the Palette

- Start typing to filter the list instantly (fuzzy match by label)
- Use **↑ / ↓** arrow keys to move between results
- Press **Enter** to navigate to the highlighted item
- Press **Escape** to close without navigating

### Available Commands

The palette includes navigation entries for every view: Dashboard, AI Assistant, Image Generation, Video Generation, AI Memory, AI Models, Home Assistant, System Updates, Package Manager, CPU Scheduler, Process Manager, Systemd Services, Docker, Network Monitor, Disk & SMART, Boot Analyzer, Log Viewer, Startup Apps, System Cleaner, Restore Points (Snapper), Optimizer, WinBoat Sandbox, Asset Gallery, Terminal, Audit Log, Dependency Graph, Automation Workflows, and Settings.

Shortcut hints appear next to items that have a keyboard shortcut assigned.

---

## 40. Troubleshooting

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
The Scheduler view will then show all available schedulers and allow switching.

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

### Restore Points view shows "Not Available"

**Cause:** `snapper` is not installed or no `root` configuration has been created.

**Fix:**
```bash
sudo pacman -S snapper
sudo snapper -c root create-config /
```
After creating the config, refresh the Restore Points view.

### System History graphs are empty

**Cause:** The resource history poller has not yet collected enough samples (it starts on app launch and samples every 30 seconds).

**Fix:** Leave the app open for at least 30 seconds and then refresh the History view. Graphs populate as samples accumulate.

### Automation step shows "No command specified"

**Cause:** A Custom Shell Command step was added but the command field was left empty.

**Fix:** Click on the step in the automation editor and type the command in the input field that appears below the step label.

### Ollama model delete fails silently

**Cause:** The model may be currently loaded in VRAM (Ollama holds a lock on loaded models).

**Fix:** Navigate away from the AI Assistant view — doing so triggers an automatic VRAM purge via `ollama-purge`. Wait a few seconds and retry the delete.

---

*Vortex Agentic V2 — Built for Linux power users who demand more from their machines.*
