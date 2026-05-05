# Vortex Agentic V2 — Recovery Guide

How to restore the full environment on a fresh CachyOS install or after data loss.

**Last updated**: 2026-05-05

---

## Prerequisites

| Component | Version | Notes |
|---|---|---|
| OS | CachyOS (pacman-based) | Arch Linux also works |
| Node.js | 24.x | Install via `nvm` or `pacman -S nodejs` |
| npm | bundled with Node | |
| Electron | 41.x | Installed via `npm install` |
| Ollama | latest | `curl -fsSL https://ollama.com/install.sh \| sh` |
| ComfyUI | headless | See Step 3 |
| AUR helper | paru or yay | Optional — needed for AUR packages |
| NVIDIA driver | 560+ | `nvidia-open-dkms` recommended on CachyOS |

---

## Step 1 — Clone and Install Dependencies

```bash
cd ~/Documents/Vortex\ Agentic\ V2
npm install --legacy-peer-deps
```

`--legacy-peer-deps` is required due to React 19 peer conflicts. It is set in `.npmrc` so `npm install` alone should also work.

---

## Step 2 — Rebuild Native Module

`better-sqlite3` must be compiled against the Electron 41 ABI. The precompiled binaries from npm are built for Node.js, not Electron.

```bash
npm run rebuild:native
```

This runs `scripts/rebuild-native.sh`, which:
- Uses Electron headers cached at `~/.cache/node-gyp/41.3.0/` (downloaded automatically if missing)
- Compiles with `-march=znver4 -O3` flags via `~/.gyp/include.gypi`
- Produces a native binary with ~6000 AVX-512/YMM SIMD instructions

If `~/.cache/node-gyp/41.3.0/` is missing (fresh machine), the script downloads the headers automatically via `node-gyp install --target=41.3.0 --dist-url=https://electronjs.org/headers`.

**Do not use `npx electron-rebuild`** — it downloads a precompiled Debian GCC-12 binary from GitHub, ignoring your native flags.

---

## Step 3 — ComfyUI Headless

The app expects ComfyUI at `~/.comfyui-headless` with a `start-engine.sh` entry point.

```bash
# Clone ComfyUI
git clone https://github.com/comfyanonymous/ComfyUI ~/.comfyui-headless
cd ~/.comfyui-headless

# Create Python venv and install dependencies
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Create the start script the app calls
cat > start-engine.sh << 'EOF'
#!/usr/bin/env bash
cd "$(dirname "$0")"
source .venv/bin/activate
python main.py --listen 127.0.0.1 --port 8188 --disable-auto-launch
EOF
chmod +x start-engine.sh
```

### Required ComfyUI Custom Nodes

```bash
cd ~/.comfyui-headless/custom_nodes

git clone https://github.com/ltdrdata/ComfyUI-Impact-Pack        # Face Detailer
git clone https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved  # Video
git clone https://github.com/Fannovel16/comfyui_controlnet_aux  # ControlNet
git clone https://github.com/kijai/ComfyUI-RIFE-VFI              # RIFE interpolation
git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite # V2V input/output
```

Install each node's Python deps:
```bash
for d in ~/.comfyui-headless/custom_nodes/*/; do
  [ -f "$d/requirements.txt" ] && pip install -r "$d/requirements.txt"
done
```

### Required Model Files

Place in `~/.comfyui-headless/models/checkpoints/`:
- SDXL base checkpoint (e.g. `juggernautXL_v9.safetensors`)
- FLUX.1 Schnell: `flux1-schnell.safetensors`

Place in `~/.comfyui-headless/custom_nodes/ComfyUI-AnimateDiff-Evolved/models/`:
- AnimateDiff motion module (e.g. `mm_sdxl_v10_beta.ckpt`)

Place in `~/.comfyui-headless/models/upscale_models/`:
- `4x-UltraSharp.pth`

---

## Step 4 — Ollama Setup

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh
systemctl enable --now ollama

# Pull models
ollama pull llama3.1:8b          # default fast model
ollama pull deepseek-r1:14b      # reasoning model
ollama pull nomic-embed-text     # required for RAG
```

The RAG system requires `nomic-embed-text`. Without it, RAG indexing will fail silently.

---

## Step 5 — Optional CachyOS Services

```bash
# SCX scheduler loader (for Scheduler view)
systemctl enable --now scx_loader.service

# fprintd (for fingerprint auth — only if you have a fingerprint reader)
sudo pacman -S fprintd
systemctl enable --now fprintd
fprintd-enroll
```

---

## Step 6 — Launch

```bash
cd ~/Documents/Vortex\ Agentic\ V2
npm run dev
```

The app starts ComfyUI automatically in the background. Wait ~30–60 seconds on first run for ComfyUI to load models.

---

## Troubleshooting

### "invalid ELF header" / "NODE_MODULE_VERSION mismatch" on startup
`better-sqlite3` needs to be rebuilt. Run:
```bash
npm run rebuild:native
```

Also run this after `npm run build:electron` — electron-builder's internal `@electron/rebuild` step always downloads and installs the precompiled Debian GCC-12 binary from GitHub, overwriting the native build.

### ComfyUI shows "disconnected"
```bash
# Kill any hung ComfyUI process
fuser -k 8188/tcp

# Check logs
tail -f ~/.config/Vortex\ Agentic/comfyui.log
```

The WebSocket reconnects every 3 seconds automatically once ComfyUI is ready.

### Ollama not responding
```bash
systemctl start ollama
# or run manually:
ollama serve
```

### Updates tab — authentication fails
Requires polkit:
```bash
sudo pacman -S polkit
systemctl start polkit
```

### Scheduler view — no schedulers listed
```bash
systemctl enable --now scx_loader.service
```

### BORE tuner shows "not available"
BORE sysctls (`kernel.sched_burst_*`) are only compiled into the `-bore` and `-eevdf-bore` CachyOS kernel variants. Switch kernel:
```bash
sudo pacman -S linux-cachyos-bore
```
Then reboot and `npm run dev`.

### GPU not detected for image/video generation
```bash
# Verify NVIDIA driver
nvidia-smi

# If missing:
sudo pacman -S nvidia-open-dkms cuda
# Or use chwd:
sudo chwd --install nvidia-open-dkms
```

---

## Environment Reference

| Path | Purpose |
|---|---|
| `~/.comfyui-headless/` | ComfyUI installation |
| `~/.config/Vortex Agentic/` | App data (SQLite DB, logs) |
| `~/.cache/node-gyp/41.3.0/` | Electron 41 headers (used by rebuild script) |
| `~/.gyp/include.gypi` | node-gyp global build flags (`-march=znver4`) |
| `/etc/systemd/system/ollama.service.d/override.conf` | Ollama VRAM/parallel config |
| `/sys/kernel/sched_ext/` | SCX scheduler state files |
| `/sys/block/nvme*/queue/iosched/` | Kyber I/O tuning files |
