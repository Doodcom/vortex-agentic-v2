#!/bin/bash

# Vortex Agentic V2 - Master Setup & Recovery Script
# Target: Arch Linux / Generic Linux
# Purpose: Reinstall the entire AI stack, front-to-back.

set -e

echo "🌪️  Vortex V2: Initializing Deep Recovery..."

# 1. System Dependencies
echo "📦 Step 1: Validating System Core..."
if command -v pacman &> /dev/null; then
    sudo pacman -S --needed --noconfirm base-devel git nodejs npm python python-pip curl ffmpeg
else
    echo "⚠️  Non-Arch system detected. Please ensure Node.js 20+, Python 3.10+, and FFmpeg are installed."
fi

# 2. Ollama Setup
echo "🧠 Step 2: Preparing Quantum AI (Ollama)..."
if ! command -v ollama &> /dev/null; then
    curl -fsSL https://ollama.com/install.sh | sh
fi

echo "📥 Pulling Essential LLMs..."
ollama pull deepseek-r1:14b
ollama pull llama3:8b

# 3. ComfyUI Setup
echo "🎨 Step 3: Preparing Motion Engine (ComfyUI)..."
COMFY_DIR="$HOME/.comfyui-headless"

if [ ! -d "$COMFY_DIR" ]; then
    git clone https://github.com/comfyanonymous/ComfyUI "$COMFY_DIR"
    cd "$COMFY_DIR"
    python -m venv .venv
    source .venv/bin/activate
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
    pip install -r requirements.txt
else
    echo "✅ ComfyUI directory already exists."
fi

# 4. Motion Engine Models
echo "🎞️  Step 4: Validating Motion Engine Models..."
CHECKPOINT_DIR="$COMFY_DIR/models/checkpoints"
ANIMATE_DIR="$COMFY_DIR/custom_nodes/ComfyUI-AnimateDiff-Evolved/models"
mkdir -p "$CHECKPOINT_DIR"
mkdir -p "$ANIMATE_DIR"

MISSING_MODELS=0

# Check for SDXL Base (or preferred model)
if [ ! -f "$CHECKPOINT_DIR/sd_xl_base_1.0.safetensors" ]; then
    echo "❌ MISSING: SDXL Base Checkpoint"
    echo "   👉 Download from: https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors"
    echo "   👉 Place in: $CHECKPOINT_DIR"
    MISSING_MODELS=1
fi

# Check for AnimateDiff Motion Module
if [ ! -f "$ANIMATE_DIR/v3_sd15_mm.ckpt" ]; then
    echo "❌ MISSING: AnimateDiff Motion Module"
    echo "   👉 Download from: https://huggingface.co/guoyww/AnimateDiff/resolve/main/v3_sd15_mm.ckpt"
    echo "   👉 Place in: $ANIMATE_DIR"
    MISSING_MODELS=1
fi

if [ $MISSING_MODELS -eq 1 ]; then
    echo ""
    echo "⚠️  INSTALLATION PAUSED: Please download the models listed above."
    echo "   Once you have placed the files in their respective folders, run this script again."
    exit 1
else
    echo "✅ All required motion models detected."
fi

# 5. App Packaging
echo "⚙️  Step 5: Finalizing Application Linkage..."
cd "$(dirname "$0")"
npm install --legacy-peer-deps
npm run build

echo "------------------------------------------------"
echo "✅ DEEP RECOVERY COMPLETE"
echo "------------------------------------------------"
echo "To launch the engine:"
echo "1. Start Ollama (systemctl start ollama)"
echo "2. Start ComfyUI (~/.comfyui-headless/.venv/bin/python main.py)"
echo "3. Run 'npm run dev' or launch the packaged .AppImage"
echo "------------------------------------------------"
