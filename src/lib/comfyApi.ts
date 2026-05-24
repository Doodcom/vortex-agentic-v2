export const COMFY_URL = "http://127.0.0.1:8188";

export type LoraEntry = { name: string; modelStr: number; clipStr: number }

export async function cancelGeneration(): Promise<void> {
  try {
    await fetch(`${COMFY_URL}/interrupt`, { method: 'POST' })
  } catch { /* ComfyUI may not be running */ }
}

// Models from both the merged-checkpoints list and the standalone UNet (diffusion_models)
// list are returned. UNet-only entries are flagged with a `unet::` prefix so the workflow
// builder knows to route them through the split-file FLUX path (UNETLoader + DualCLIPLoader
// + VAELoader) instead of the regular CheckpointLoaderSimple.
export async function getModels(): Promise<string[]> {
  try {
    const resp = await fetch(`${COMFY_URL}/object_info`);
    const data = await resp.json();
    const checkpoints: string[] = data.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
    const unets: string[] = data.UNETLoader?.input?.required?.unet_name?.[0] ?? [];
    const taggedUnets = unets.map(n => `unet::${n}`);
    return [...checkpoints, ...taggedUnets];
  } catch (e) {
    console.error("Failed to fetch ComfyUI models:", e);
    return [];
  }
}

// True when the model selection is a standalone diffusion model (UNet only).
// The split-file FLUX workflow (Krea-dev, etc.) needs separate CLIP + VAE loaders.
export function isUnetModel(modelName: string): boolean {
  return modelName.startsWith('unet::');
}
export function stripUnetTag(modelName: string): string {
  return modelName.startsWith('unet::') ? modelName.slice('unet::'.length) : modelName;
}

export async function getLoraNames(): Promise<string[]> {
  try {
    const resp = await fetch(`${COMFY_URL}/object_info/LoraLoader`);
    const data = await resp.json();
    return data.LoraLoader.input.required.lora_name[0] ?? [];
  } catch {
    return [];
  }
}

export async function queuePrompt(workflow: any, clientId: string) {
  const resp = await fetch(`${COMFY_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  if (!resp.ok) {
    const errData = await resp.json();
    console.error("ComfyUI Error:", errData);
    throw new Error(errData.error?.message || `Server rejected request (${resp.status})`);
  }
  return await resp.json();
}

export async function uploadVideo(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  const formData = new FormData();
  const mimeToExt: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
  const ext = mimeToExt[blob.type] ?? url.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1] ?? 'mp4';
  formData.append('image', blob, `vortex-v2v-${Date.now()}.${ext}`);
  const uploadResp = await fetch(`${COMFY_URL}/upload/image`, { method: 'POST', body: formData });
  const data = await uploadResp.json();
  return data.name;
}

export async function uploadImage(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  const formData = new FormData();
  formData.append('image', blob, `vortex-input-${Date.now()}.png`);
  const uploadResp = await fetch(`${COMFY_URL}/upload/image`, { method: 'POST', body: formData });
  const data = await uploadResp.json();
  return data.name;
}

export const MODEL_DESCRIPTIONS: Record<string, string> = {
  'flux-schnell': '🦄 FLUX.1-Schnell: State-of-the-art for perfect text, hands, and photorealism. (24GB VRAM/RAM)',
  'juggernautXL': '🏆 Best for Photorealism, Cinematic Lighting, and high detail. Ideal for SDXL.',
  'ponyDiffusionV6XL': '🦄 Best for Anime, Uncensored content, and following complex tags accurately.',
  'Realistic_Vision': '📸 Classic SD1.5 Photorealism. Faster than XL but lower resolution.',
  'v1-5-pruned': '⚡ Standard Base Model. Best for fast architectural or layout testing.',
  'default': '🤖 General purpose neural model for all-round generation.'
};

export function getModelInfo(name: string): string {
  if (name.toLowerCase().includes('flux')) return MODEL_DESCRIPTIONS['flux-schnell'];
  if (name.toLowerCase().includes('juggernaut')) return MODEL_DESCRIPTIONS['juggernautXL'];
  if (name.toLowerCase().includes('pony')) return MODEL_DESCRIPTIONS['ponyDiffusionV6XL'];
  if (name.toLowerCase().includes('realistic')) return MODEL_DESCRIPTIONS['Realistic_Vision'];
  if (name.toLowerCase().includes('v1-5')) return MODEL_DESCRIPTIONS['v1-5-pruned'];
  return MODEL_DESCRIPTIONS['default'];
}

function resolveSeed(seed: number): number {
  return seed === -1 ? Math.floor(Math.random() * 2 ** 32) : seed;
}

function applyLoras(
  workflow: any,
  loras: LoraEntry[],
  modelRef: [string, number],
  clipRef: [string, number],
  startId = 30
): { modelRef: [string, number]; clipRef: [string, number] } {
  loras.forEach((lora, i) => {
    const id = String(startId + i);
    workflow[id] = {
      inputs: {
        lora_name: lora.name,
        strength_model: lora.modelStr,
        strength_clip: lora.clipStr,
        model: modelRef,
        clip: clipRef
      },
      class_type: 'LoraLoader'
    };
    modelRef = [id, 0];
    clipRef = [id, 1];
  });
  return { modelRef, clipRef };
}

export function createWorkflow(
  prompt: string,
  negativePrompt: string,
  modelName: string,
  width = 1024,
  height = 1024,
  seed = -1,
  steps = 25,
  cfg = 7,
  sampler = 'dpmpp_2m',
  scheduler = 'karras',
  loras: LoraEntry[] = [],
  useFaceDetailer = false,
) {
  const workflow: any = {
    "3": {
      "inputs": {
        "seed": resolveSeed(seed), "steps": steps, "cfg": cfg,
        "sampler_name": sampler, "scheduler": scheduler, "denoise": 1,
        "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]
      },
      "class_type": "KSampler"
    },
    "4": { "inputs": { "ckpt_name": modelName }, "class_type": "CheckpointLoaderSimple" },
    "5": { "inputs": { "width": width, "height": height, "batch_size": 1 }, "class_type": "EmptyLatentImage" },
    "6": { "inputs": { "text": prompt, "clip": ["4", 1] }, "class_type": "CLIPTextEncode" },
    "7": { "inputs": { "text": negativePrompt, "clip": ["4", 1] }, "class_type": "CLIPTextEncode" },
    "8": { "inputs": { "samples": ["3", 0], "vae": ["4", 2] }, "class_type": "VAEDecode" },
    "9": { "inputs": { "filename_prefix": "VortexGen", "images": ["8", 0] }, "class_type": "SaveImage" }
  };
  if (loras.length > 0) {
    const { modelRef, clipRef } = applyLoras(workflow, loras, ["4", 0], ["4", 1]);
    workflow["3"].inputs.model = modelRef;
    workflow["6"].inputs.clip = clipRef;
    workflow["7"].inputs.clip = clipRef;
  }
  if (useFaceDetailer) {
    workflow["20"] = { "inputs": { "model_name": "bbox/face_yolov8m.pt" }, "class_type": "UltralyticsDetectorProvider" };
    workflow["21"] = {
      "inputs": {
        "guide_size": 384, "guide_size_for": true, "max_size": 1024,
        "seed": Math.floor(Math.random() * 1_000_000_000), "steps": 20, "cfg": 8,
        "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 0.4,
        "feather": 5, "noise_mask": true, "force_inpaint": true,
        "bbox_threshold": 0.5, "bbox_dilation": 10, "bbox_crop_factor": 3,
        "drop_size": 10, "cycle": 1,
        // SAM fields are required by the Impact Pack FaceDetailer node schema. We're
        // not using a SAM model (only bbox), so these get neutral defaults that disable
        // SAM-based segmentation.
        "sam_detection_hint": "center-1",
        "sam_dilation": 0,
        "sam_threshold": 0.93,
        "sam_bbox_expansion": 0,
        "sam_mask_hint_threshold": 0.7,
        "sam_mask_hint_use_negative": "False",
        "wildcard": "",
        "image": ["8", 0],
        "model": workflow["3"].inputs.model,
        "clip": workflow["6"].inputs.clip,
        "vae": ["4", 2],
        "positive": ["6", 0], "negative": ["7", 0], "bbox_detector": ["20", 0]
      },
      "class_type": "FaceDetailer"
    };
    workflow["9"].inputs.images = ["21", 0];
  }
  return workflow;
}

export function createFluxWorkflow(
  prompt: string,
  modelName: string,
  width = 1024,
  height = 1024,
  seed = -1
) {
  // If the model is a UNet-only file (split FLUX setup like Krea-dev), build a
  // multi-loader workflow with separate T5+CLIP-L and VAE.
  if (isUnetModel(modelName)) {
    return createFluxSplitWorkflow(stripUnetTag(modelName), prompt, width, height, seed)
  }
  return {
    "3": {
      "inputs": {
        "seed": resolveSeed(seed), "steps": 4, "cfg": 1.0,
        "sampler_name": "euler", "scheduler": "simple", "denoise": 1,
        "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]
      },
      "class_type": "KSampler"
    },
    "4": { "inputs": { "ckpt_name": modelName }, "class_type": "CheckpointLoaderSimple" },
    "5": { "inputs": { "width": width, "height": height, "batch_size": 1 }, "class_type": "EmptyLatentImage" },
    "6": { "inputs": { "text": prompt, "clip": ["4", 1] }, "class_type": "CLIPTextEncode" },
    "7": { "inputs": { "text": "", "clip": ["4", 1] }, "class_type": "CLIPTextEncode" },
    "8": { "inputs": { "samples": ["3", 0], "vae": ["4", 2] }, "class_type": "VAEDecode" },
    "9": { "inputs": { "filename_prefix": "VortexFlux", "images": ["8", 0] }, "class_type": "SaveImage" }
  };
}

// FLUX-Krea-dev (and other split-file FLUX variants) — uses three separate loaders.
// Expects t5xxl_fp16.safetensors + clip_l.safetensors in models/text_encoders/ and
// ae.safetensors in models/vae/. Quality on this setup is comparable to the BFL
// fp16 release while staying under 16GB VRAM via ComfyUI's automatic offload.
export function createFluxSplitWorkflow(
  unetName: string,
  prompt: string,
  width = 1024,
  height = 1024,
  seed = -1,
  steps = 25,
  guidance = 3.5,
) {
  return {
    "1": { "inputs": { "unet_name": unetName, "weight_dtype": "default" }, "class_type": "UNETLoader" },
    "2": {
      "inputs": { "clip_name1": "t5xxl_fp16.safetensors", "clip_name2": "clip_l.safetensors", "type": "flux" },
      "class_type": "DualCLIPLoader",
    },
    "3": { "inputs": { "vae_name": "ae.safetensors" }, "class_type": "VAELoader" },
    "4": { "inputs": { "text": prompt, "clip": ["2", 0] }, "class_type": "CLIPTextEncode" },
    "5": { "inputs": { "conditioning": ["4", 0], "guidance": guidance }, "class_type": "FluxGuidance" },
    "6": { "inputs": { "text": "", "clip": ["2", 0] }, "class_type": "CLIPTextEncode" },
    "7": { "inputs": { "width": width, "height": height, "batch_size": 1 }, "class_type": "EmptyLatentImage" },
    "8": {
      "inputs": {
        "seed": resolveSeed(seed), "steps": steps, "cfg": 1.0,
        "sampler_name": "euler", "scheduler": "simple", "denoise": 1,
        "model": ["1", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["7", 0],
      },
      "class_type": "KSampler",
    },
    "9":  { "inputs": { "samples": ["8", 0], "vae": ["3", 0] }, "class_type": "VAEDecode" },
    "10": { "inputs": { "filename_prefix": "VortexFluxKrea", "images": ["9", 0] }, "class_type": "SaveImage" },
  }
}

// FLUX img2img — starts from a real reference image and denoises into your prompt.
// At denoise 0.4-0.6 most of the source image structure + texture is preserved while
// the prompt steers content and lighting. The best path to photoreal output: feed
// it a real photo and let FLUX refine it. Routes to split or merged loader based on
// whether the selected model is UNet-only (tagged `unet::`) or a merged checkpoint.
// Output dimensions match the source image (latent comes from VAEEncode of LoadImage),
// so we intentionally don't accept width/height — the source dictates them.
export function createFluxImg2ImgWorkflow(
  prompt: string,
  modelName: string,
  imageFilename: string,
  denoiseStrength = 0.55,
  seed = -1,
  steps = 25,
  guidance = 3.5,
) {
  if (isUnetModel(modelName)) {
    const unetName = stripUnetTag(modelName)
    return {
      "1": { "inputs": { "unet_name": unetName, "weight_dtype": "default" }, "class_type": "UNETLoader" },
      "2": { "inputs": { "clip_name1": "t5xxl_fp16.safetensors", "clip_name2": "clip_l.safetensors", "type": "flux" }, "class_type": "DualCLIPLoader" },
      "3": { "inputs": { "vae_name": "ae.safetensors" }, "class_type": "VAELoader" },
      "4": { "inputs": { "text": prompt, "clip": ["2", 0] }, "class_type": "CLIPTextEncode" },
      "5": { "inputs": { "conditioning": ["4", 0], "guidance": guidance }, "class_type": "FluxGuidance" },
      "6": { "inputs": { "text": "", "clip": ["2", 0] }, "class_type": "CLIPTextEncode" },
      "7": { "inputs": { "image": imageFilename, "upload": "image" }, "class_type": "LoadImage" },
      "8": { "inputs": { "pixels": ["7", 0], "vae": ["3", 0] }, "class_type": "VAEEncode" },
      "9": {
        "inputs": {
          "seed": resolveSeed(seed), "steps": steps, "cfg": 1.0,
          "sampler_name": "euler", "scheduler": "simple", "denoise": denoiseStrength,
          "model": ["1", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["8", 0],
        },
        "class_type": "KSampler",
      },
      "10": { "inputs": { "samples": ["9", 0], "vae": ["3", 0] }, "class_type": "VAEDecode" },
      "11": { "inputs": { "filename_prefix": "VortexFluxI2I", "images": ["10", 0] }, "class_type": "SaveImage" },
    }
  }
  // Merged-checkpoint FLUX (e.g. flux1-dev-fp8.safetensors)
  return {
    "3": { "inputs": { "ckpt_name": modelName }, "class_type": "CheckpointLoaderSimple" },
    "4": { "inputs": { "text": prompt, "clip": ["3", 1] }, "class_type": "CLIPTextEncode" },
    "5": { "inputs": { "conditioning": ["4", 0], "guidance": guidance }, "class_type": "FluxGuidance" },
    "6": { "inputs": { "text": "", "clip": ["3", 1] }, "class_type": "CLIPTextEncode" },
    "7": { "inputs": { "image": imageFilename, "upload": "image" }, "class_type": "LoadImage" },
    "8": { "inputs": { "pixels": ["7", 0], "vae": ["3", 2] }, "class_type": "VAEEncode" },
    "9": {
      "inputs": {
        "seed": resolveSeed(seed), "steps": steps, "cfg": 1.0,
        "sampler_name": "euler", "scheduler": "simple", "denoise": denoiseStrength,
        "model": ["3", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["8", 0],
      },
      "class_type": "KSampler",
    },
    "10": { "inputs": { "samples": ["9", 0], "vae": ["3", 2] }, "class_type": "VAEDecode" },
    "11": { "inputs": { "filename_prefix": "VortexFluxI2I", "images": ["10", 0] }, "class_type": "SaveImage" },
  }
}

// FLUX ControlNet via Shakker-Labs Union Pro 2.0 — a single ControlNet model that
// supports depth/canny/openpose/etc. via SetUnionControlNetType. Preprocessor is
// chosen by `controlType`; defaults to depth which works best for animal photos.
export function createFluxControlNetWorkflow(
  prompt: string,
  modelName: string,
  imageFilename: string,
  controlType: 'depth' | 'canny' | 'openpose' = 'depth',
  width = 1024,
  height = 1024,
  seed = -1,
  steps = 25,
  guidance = 3.5,
  strength = 0.6,
) {
  const preprocessorClass =
    controlType === 'canny' ? 'CannyEdgePreprocessor' :
    controlType === 'pose'  ? 'OpenposePreprocessor' :
                              'DepthAnythingPreprocessor'

  const baseLoaders: any = isUnetModel(modelName)
    ? {
        "1": { "inputs": { "unet_name": stripUnetTag(modelName), "weight_dtype": "default" }, "class_type": "UNETLoader" },
        "2": { "inputs": { "clip_name1": "t5xxl_fp16.safetensors", "clip_name2": "clip_l.safetensors", "type": "flux" }, "class_type": "DualCLIPLoader" },
        "3": { "inputs": { "vae_name": "ae.safetensors" }, "class_type": "VAELoader" },
      }
    : {
        "1": { "inputs": { "ckpt_name": modelName }, "class_type": "CheckpointLoaderSimple" },
      }

  const modelRef = isUnetModel(modelName) ? ["1", 0] : ["1", 0]
  const clipRef = isUnetModel(modelName) ? ["2", 0] : ["1", 1]
  const vaeRef = isUnetModel(modelName) ? ["3", 0] : ["1", 2]

  return {
    ...baseLoaders,
    "10": { "inputs": { "image": imageFilename, "upload": "image" }, "class_type": "LoadImage" },
    "11": { "inputs": { "image": ["10", 0], "resolution": Math.min(width, 1024) }, "class_type": preprocessorClass },
    "12": { "inputs": { "control_net_name": "FLUX-Union-Pro-2.0.safetensors" }, "class_type": "ControlNetLoader" },
    "13": { "inputs": { "control_net": ["12", 0], "type": controlType }, "class_type": "SetUnionControlNetType" },
    "14": { "inputs": { "text": prompt, "clip": clipRef }, "class_type": "CLIPTextEncode" },
    "15": { "inputs": { "conditioning": ["14", 0], "guidance": guidance }, "class_type": "FluxGuidance" },
    "16": { "inputs": { "text": "", "clip": clipRef }, "class_type": "CLIPTextEncode" },
    "17": {
      "inputs": {
        "positive": ["15", 0], "negative": ["16", 0],
        "control_net": ["13", 0], "image": ["11", 0], "vae": vaeRef,
        "strength": strength, "start_percent": 0, "end_percent": 0.6,
      },
      "class_type": "ControlNetApplyAdvanced",
    },
    "18": { "inputs": { "width": width, "height": height, "batch_size": 1 }, "class_type": "EmptyLatentImage" },
    "19": {
      "inputs": {
        "seed": resolveSeed(seed), "steps": steps, "cfg": 1.0,
        "sampler_name": "euler", "scheduler": "simple", "denoise": 1,
        "model": modelRef, "positive": ["17", 0], "negative": ["17", 1], "latent_image": ["18", 0],
      },
      "class_type": "KSampler",
    },
    "20": { "inputs": { "samples": ["19", 0], "vae": vaeRef }, "class_type": "VAEDecode" },
    "21": { "inputs": { "filename_prefix": "VortexFluxCN", "images": ["20", 0] }, "class_type": "SaveImage" },
  }
}

// FLUX.1-Fill-dev inpainting — official BFL fill model. Source image + binary mask
// (white = inpaint, black = keep) + prompt. Surrounding pixels stay byte-identical;
// only the masked region is regenerated, with FLUX matching the source's lighting and
// integrating the new content seamlessly. The mask file must be uploaded separately.
export function createFluxFillWorkflow(
  prompt: string,
  fillModelName: string,
  imageFilename: string,
  maskFilename: string,
  seed = -1,
  steps = 30,
  guidance = 30,
) {
  return {
    "1": { "inputs": { "unet_name": fillModelName, "weight_dtype": "default" }, "class_type": "UNETLoader" },
    "2": { "inputs": { "clip_name1": "t5xxl_fp16.safetensors", "clip_name2": "clip_l.safetensors", "type": "flux" }, "class_type": "DualCLIPLoader" },
    "3": { "inputs": { "vae_name": "ae.safetensors" }, "class_type": "VAELoader" },
    "4": { "inputs": { "image": imageFilename, "upload": "image" }, "class_type": "LoadImage" },
    "5": { "inputs": { "image": maskFilename, "channel": "red", "upload": "image" }, "class_type": "LoadImageMask" },
    "6": { "inputs": { "text": prompt, "clip": ["2", 0] }, "class_type": "CLIPTextEncode" },
    "7": { "inputs": { "conditioning": ["6", 0], "guidance": guidance }, "class_type": "FluxGuidance" },
    "8": { "inputs": { "text": "", "clip": ["2", 0] }, "class_type": "CLIPTextEncode" },
    "9": {
      "inputs": {
        "positive": ["7", 0], "negative": ["8", 0], "vae": ["3", 0],
        "pixels": ["4", 0], "mask": ["5", 0], "noise_mask": true,
      },
      "class_type": "InpaintModelConditioning",
    },
    "10": {
      "inputs": {
        "seed": resolveSeed(seed), "steps": steps, "cfg": 1.0,
        "sampler_name": "euler", "scheduler": "simple", "denoise": 1,
        "model": ["1", 0], "positive": ["9", 0], "negative": ["9", 1], "latent_image": ["9", 2],
      },
      "class_type": "KSampler",
    },
    "11": { "inputs": { "samples": ["10", 0], "vae": ["3", 0] }, "class_type": "VAEDecode" },
    "12": { "inputs": { "filename_prefix": "VortexFluxFill", "images": ["11", 0] }, "class_type": "SaveImage" },
  }
}

export function createImg2ImgWorkflow(
  prompt: string,
  negativePrompt: string,
  modelName: string,
  imageFilename: string,
  denoiseStrength = 0.75,
  seed = -1,
  steps = 25,
  cfg = 7,
  sampler = 'dpmpp_2m',
  scheduler = 'karras',
  loras: LoraEntry[] = []
) {
  const workflow: any = {
    "3": {
      "inputs": {
        "seed": resolveSeed(seed), "steps": steps, "cfg": cfg,
        "sampler_name": sampler, "scheduler": scheduler, "denoise": denoiseStrength,
        "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["13", 0]
      },
      "class_type": "KSampler"
    },
    "4": { "inputs": { "ckpt_name": modelName }, "class_type": "CheckpointLoaderSimple" },
    "6": { "inputs": { "text": prompt, "clip": ["4", 1] }, "class_type": "CLIPTextEncode" },
    "7": { "inputs": { "text": negativePrompt, "clip": ["4", 1] }, "class_type": "CLIPTextEncode" },
    "8": { "inputs": { "samples": ["3", 0], "vae": ["4", 2] }, "class_type": "VAEDecode" },
    "9": { "inputs": { "filename_prefix": "VortexI2I", "images": ["8", 0] }, "class_type": "SaveImage" },
    "12": { "inputs": { "image": imageFilename, "upload": "image" }, "class_type": "LoadImage" },
    "13": { "inputs": { "pixels": ["12", 0], "vae": ["4", 2] }, "class_type": "VAEEncode" }
  };
  if (loras.length > 0) {
    const { modelRef, clipRef } = applyLoras(workflow, loras, ["4", 0], ["4", 1]);
    workflow["3"].inputs.model = modelRef;
    workflow["6"].inputs.clip = clipRef;
    workflow["7"].inputs.clip = clipRef;
  }
  return workflow;
}

export function createControlNetWorkflow(
  prompt: string,
  negativePrompt: string,
  modelName: string,
  controlImageFilename: string,
  controlNetModel: string,
  width = 1024,
  height = 1024,
  useFaceDetailer = false,
  seed = -1,
  steps = 25,
  cfg = 7,
  sampler = 'dpmpp_2m',
  scheduler = 'karras',
  loras: LoraEntry[] = []
) {
  const workflow: any = {
    "3": {
      "inputs": {
        "seed": resolveSeed(seed), "steps": steps, "cfg": cfg,
        "sampler_name": sampler, "scheduler": scheduler, "denoise": 1,
        "model": ["4", 0], "positive": ["11", 0], "negative": ["7", 0], "latent_image": ["5", 0]
      },
      "class_type": "KSampler"
    },
    "4": { "inputs": { "ckpt_name": modelName }, "class_type": "CheckpointLoaderSimple" },
    "5": { "inputs": { "width": width, "height": height, "batch_size": 1 }, "class_type": "EmptyLatentImage" },
    "6": { "inputs": { "text": prompt, "clip": ["4", 1] }, "class_type": "CLIPTextEncode" },
    "7": { "inputs": { "text": negativePrompt, "clip": ["4", 1] }, "class_type": "CLIPTextEncode" },
    "8": { "inputs": { "samples": ["3", 0], "vae": ["4", 2] }, "class_type": "VAEDecode" },
    "9": { "inputs": { "filename_prefix": "VortexControl", "images": ["8", 0] }, "class_type": "SaveImage" },
    "10": { "inputs": { "control_net_name": controlNetModel }, "class_type": "ControlNetLoader" },
    "11": {
      "inputs": {
        "strength": 1.0, "start_percent": 0.0, "end_percent": 1.0,
        "conditioning": ["6", 0], "control_net": ["10", 0], "image": ["12", 0]
      },
      "class_type": "ControlNetApply"
    },
    "12": { "inputs": { "image": controlImageFilename, "upload": "image" }, "class_type": "LoadImage" }
  };

  if (loras.length > 0) {
    const { modelRef, clipRef } = applyLoras(workflow, loras, ["4", 0], ["4", 1]);
    workflow["3"].inputs.model = modelRef;
    workflow["6"].inputs.clip = clipRef;
    workflow["7"].inputs.clip = clipRef;
  }

  if (useFaceDetailer) {
    workflow["20"] = { "inputs": { "model_name": "bbox/face_yolov8m.pt" }, "class_type": "UltralyticsDetectorProvider" };
    workflow["21"] = {
      "inputs": {
        "guide_size": 384, "guide_size_for": true, "max_size": 1024,
        "seed": Math.floor(Math.random() * 1000000000), "steps": 20, "cfg": 8,
        "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 0.4,
        "feather": 5, "noise_mask": true, "force_inpaint": true,
        "bbox_threshold": 0.5, "bbox_dilation": 10, "bbox_crop_factor": 3,
        "drop_size": 10, "cycle": 1,
        "sam_detection_hint": "center-1", "sam_dilation": 0, "sam_threshold": 0.93,
        "sam_bbox_expansion": 0, "sam_mask_hint_threshold": 0.7,
        "sam_mask_hint_use_negative": "False", "wildcard": "",
        "image": ["8", 0],
        "model": workflow["3"].inputs.model,
        "clip": workflow["6"].inputs.clip,
        "vae": ["4", 2],
        "positive": ["11", 0], "negative": ["7", 0], "bbox_detector": ["20", 0]
      },
      "class_type": "FaceDetailer"
    };
    workflow["9"].inputs.images = ["21", 0];
  }

  return workflow;
}

export function createUpscaleWorkflow(imageFilename: string, upscaleModel = "4x-UltraSharp.pth") {
  return {
    "1": { "inputs": { "image": imageFilename, "upload": "image" }, "class_type": "LoadImage" },
    "2": { "inputs": { "model_name": upscaleModel }, "class_type": "UpscaleModelLoader" },
    "3": { "inputs": { "upscale_model": ["2", 0], "image": ["1", 0] }, "class_type": "ImageUpscaleWithModel" },
    "4": { "inputs": { "filename_prefix": "Vortex4K", "images": ["3", 0] }, "class_type": "SaveImage" },
    "5": { "inputs": { "images": ["3", 0] }, "class_type": "PreviewImage" }
  };
}

export function createVideoWorkflow(
  prompt: string,
  negativePrompt: string,
  modelName: string,
  width = 1024,
  height = 1024,
  frames = 16,
  fps = 12,
  useTiledVae = false,
  useRife = false,
  rifeMultiplier = 5
) {
  const workflow: any = {
    "3": { "inputs": { "ckpt_name": modelName }, "class_type": "CheckpointLoaderSimple" },
    "4": { "inputs": { "text": prompt, "clip": ["3", 1] }, "class_type": "CLIPTextEncode" },
    "5": { "inputs": { "text": negativePrompt, "clip": ["3", 1] }, "class_type": "CLIPTextEncode" },
    "6": { "inputs": { "width": width, "height": height, "batch_size": frames }, "class_type": "EmptyLatentImage" },
    "7": {
      "inputs": {
        "model": ["3", 0], "model_name": "mm_sdxl_v10_beta.safetensors",
        "beta_schedule": "linear (AnimateDiff-SDXL)", "context_options": ["11", 0]
      },
      "class_type": "ADE_AnimateDiffLoaderGen1"
    },
    "8": {
      "inputs": {
        "seed": Math.floor(Math.random() * 1000000000), "steps": 25, "cfg": 7,
        "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1,
        "model": ["7", 0], "positive": ["4", 0], "negative": ["5", 0], "latent_image": ["6", 0]
      },
      "class_type": "KSampler"
    },
    "11": {
      "inputs": {
        "context_length": 16, "context_stride": 1, "context_overlap": 4,
        "context_schedule": "uniform", "closed_loop": false
      },
      "class_type": "ADE_AnimateDiffUniformContextOptions"
    }
  };

  workflow["9"] = useTiledVae
    ? { "inputs": { "samples": ["8", 0], "vae": ["3", 2], "tile_size": 512, "overlap": 64, "temporal_size": 64, "temporal_overlap": 8 }, "class_type": "VAEDecodeTiled" }
    : { "inputs": { "samples": ["8", 0], "vae": ["3", 2] }, "class_type": "VAEDecode" };

  let finalFrames: [string, number] = ["9", 0];
  let finalFps = fps;

  if (useRife) {
    workflow["20"] = {
      "inputs": { "ckpt_name": "rife49.pth", "clear_cache_after_n_frames": 10, "multiplier": rifeMultiplier, "fast_mode": true, "ensemble": true, "scale_factor": 1.0, "dtype": "float32", "torch_compile": false, "batch_size": 1, "frames": ["9", 0] },
      "class_type": "RIFE VFI"
    };
    finalFrames = ["20", 0];
    finalFps = fps * rifeMultiplier;
  }

  workflow["10"] = {
    "inputs": { "images": finalFrames, "filename_prefix": "VortexVid", "frame_rate": finalFps, "loop_count": 0, "format": "video/h264-mp4", "pingpong": false, "save_output": true },
    "class_type": "VHS_VideoCombine"
  };

  return workflow;
}

export function createI2VWorkflow(
  prompt: string,
  negativePrompt: string,
  modelName: string,
  imageFilename: string,
  frames = 16,
  fps = 12,
  useTiledVae = false,
  useRife = false,
  rifeMultiplier = 5,
  width = 768,
  height = 768,
) {
  const workflow: any = {
    "3": { "inputs": { "ckpt_name": modelName }, "class_type": "CheckpointLoaderSimple" },
    "4": { "inputs": { "text": prompt, "clip": ["3", 1] }, "class_type": "CLIPTextEncode" },
    "5": { "inputs": { "text": negativePrompt, "clip": ["3", 1] }, "class_type": "CLIPTextEncode" },
    "6": { "inputs": { "image": imageFilename }, "class_type": "LoadImage" },
    // Resize source image to target resolution before encoding — phone photos at 4K+
    // would otherwise create massive latents (OOM on 48+ frames).
    "14": { "inputs": { "image": ["6", 0], "width": width, "height": height, "upscale_method": "lanczos", "crop": "center" }, "class_type": "ImageScale" },
    "7": { "inputs": { "pixels": ["14", 0], "vae": ["3", 2] }, "class_type": "VAEEncode" },
    "8": { "inputs": { "amount": Math.min(frames, 64), "samples": ["7", 0] }, "class_type": "RepeatLatentBatch" },
    "9": {
      "inputs": {
        "model": ["3", 0], "model_name": "mm_sdxl_v10_beta.safetensors",
        "beta_schedule": "linear (AnimateDiff-SDXL)", "context_options": ["13", 0]
      },
      "class_type": "ADE_AnimateDiffLoaderGen1"
    },
    "10": {
      "inputs": {
        "seed": Math.floor(Math.random() * 1000000000), "steps": 25, "cfg": 8.5,
        "sampler_name": "dpmpp_2m_sde_gpu", "scheduler": "karras", "denoise": 0.75,
        "model": ["9", 0], "positive": ["4", 0], "negative": ["5", 0], "latent_image": ["8", 0]
      },
      "class_type": "KSampler"
    },
    "13": {
      "inputs": { "context_length": 16, "context_stride": 1, "context_overlap": 4, "context_schedule": "uniform", "closed_loop": false },
      "class_type": "ADE_AnimateDiffUniformContextOptions"
    }
  };

  workflow["11"] = useTiledVae
    ? { "inputs": { "samples": ["10", 0], "vae": ["3", 2], "tile_size": 512, "overlap": 64, "temporal_size": 64, "temporal_overlap": 8 }, "class_type": "VAEDecodeTiled" }
    : { "inputs": { "samples": ["10", 0], "vae": ["3", 2] }, "class_type": "VAEDecode" };

  let finalFrames: [string, number] = ["11", 0];
  let finalFps = fps;

  if (useRife) {
    workflow["20"] = {
      "inputs": { "ckpt_name": "rife49.pth", "clear_cache_after_n_frames": 10, "multiplier": rifeMultiplier, "fast_mode": true, "ensemble": true, "scale_factor": 1.0, "dtype": "float32", "torch_compile": false, "batch_size": 1, "frames": ["11", 0] },
      "class_type": "RIFE VFI"
    };
    finalFrames = ["20", 0];
    finalFps = fps * rifeMultiplier;
  }

  workflow["12"] = {
    "inputs": { "images": finalFrames, "filename_prefix": "VortexI2V", "frame_rate": finalFps, "loop_count": 0, "format": "video/h264-mp4", "pingpong": false, "save_output": true },
    "class_type": "VHS_VideoCombine"
  };

  return workflow;
}

export function createV2VWorkflow(
  prompt: string,
  negativePrompt: string,
  modelName: string,
  videoFilename: string,
  denoiseStrength = 0.5,
  fps = 12,
  frameCap = 48,
  useTiledVae = false,
  useRife = false,
  rifeMultiplier = 5
) {
  const workflow: any = {
    "1": {
      "inputs": {
        "video": videoFilename, "force_rate": fps, "force_size": "Disabled",
        "custom_width": 512, "custom_height": 512,
        "frame_load_cap": frameCap, "skip_first_frames": 0, "select_every_nth": 1
      },
      "class_type": "VHS_LoadVideo"
    },
    "2": { "inputs": { "ckpt_name": modelName }, "class_type": "CheckpointLoaderSimple" },
    "3": { "inputs": { "text": prompt, "clip": ["2", 1] }, "class_type": "CLIPTextEncode" },
    "4": { "inputs": { "text": negativePrompt, "clip": ["2", 1] }, "class_type": "CLIPTextEncode" },
    "5": { "inputs": { "pixels": ["1", 0], "vae": ["2", 2] }, "class_type": "VAEEncode" },
    "6": {
      "inputs": { "context_length": 16, "context_stride": 1, "context_overlap": 4, "context_schedule": "uniform", "closed_loop": false },
      "class_type": "ADE_AnimateDiffUniformContextOptions"
    },
    "7": {
      "inputs": { "model": ["2", 0], "model_name": "mm_sdxl_v10_beta.safetensors", "beta_schedule": "linear (AnimateDiff-SDXL)", "context_options": ["6", 0] },
      "class_type": "ADE_AnimateDiffLoaderGen1"
    },
    "8": {
      "inputs": {
        "seed": Math.floor(Math.random() * 1000000000), "steps": 20, "cfg": 7,
        "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": denoiseStrength,
        "model": ["7", 0], "positive": ["3", 0], "negative": ["4", 0], "latent_image": ["5", 0]
      },
      "class_type": "KSampler"
    }
  };

  workflow["9"] = useTiledVae
    ? { "inputs": { "samples": ["8", 0], "vae": ["2", 2], "tile_size": 512, "overlap": 64, "temporal_size": 64, "temporal_overlap": 8 }, "class_type": "VAEDecodeTiled" }
    : { "inputs": { "samples": ["8", 0], "vae": ["2", 2] }, "class_type": "VAEDecode" };

  let finalFrames: [string, number] = ["9", 0];
  let finalFps = fps;

  if (useRife) {
    workflow["20"] = {
      "inputs": { "ckpt_name": "rife49.pth", "clear_cache_after_n_frames": 10, "multiplier": rifeMultiplier, "fast_mode": true, "ensemble": true, "scale_factor": 1.0, "dtype": "float32", "torch_compile": false, "batch_size": 1, "frames": ["9", 0] },
      "class_type": "RIFE VFI"
    };
    finalFrames = ["20", 0];
    finalFps = fps * rifeMultiplier;
  }

  workflow["10"] = {
    "inputs": { "images": finalFrames, "filename_prefix": "VortexV2V", "frame_rate": finalFps, "loop_count": 0, "format": "video/h264-mp4", "pingpong": false, "save_output": true },
    "class_type": "VHS_VideoCombine"
  };

  return workflow;
}

// WAN 2.1 T2V via kijai's ComfyUI-WanVideoWrapper. Node names track the wrapper's API
// (subject to change between releases — verify in the ComfyUI Manage menu if a node fails
// to load). Defaults target the 14B FP8 model with the BF16 T5 encoder + BF16 VAE.
export function createWanWorkflow(
  prompt: string,
  negativePrompt: string,
  width = 832,
  height = 480,
  numFrames = 81,
  fps = 16,
  steps = 30,
  cfg = 6,
  shift = 8,
  diffusionModel = 'wan2.1_t2v_14B_fp8_e4m3fn.safetensors',
  t5Model = 'umt5-xxl-enc-bf16.safetensors',
  vaeModel = 'Wan2_1_VAE_bf16.safetensors',
  useRife = false,
  rifeMultiplier = 2,
) {
  const seed = Math.floor(Math.random() * 1_000_000_000)
  const workflow: any = {
    "BS": {
      // Streams 20 transformer blocks between VRAM and CPU during inference.
      // Required to fit the 14B FP8 model on a 16GB card. Slower but works.
      // vace_blocks_to_swap must be explicit 0 — the wrapper compares it to int before
      // None-checking, so omitting it crashes inside block_swap().
      "inputs": {
        // 30 of 40 blocks swapped to CPU keeps ~10 transformer blocks resident on GPU at any
        // time — about ~3.5GB of model weights. Combined with offloading image/txt embeds,
        // this fits comfortably in 16GB at 832x480.
        "blocks_to_swap": 30, "offload_img_emb": true, "offload_txt_emb": true,
        "vace_blocks_to_swap": 0, "prefetch_blocks": 0, "use_non_blocking": true,
      },
      "class_type": "WanVideoBlockSwap"
    },
    "1": {
      "inputs": {
        "model": diffusionModel, "base_precision": "bf16", "quantization": "fp8_e4m3fn",
        "load_device": "main_device", "attention_mode": "sdpa",
        "block_swap_args": ["BS", 0],
      },
      "class_type": "WanVideoModelLoader"
    },
    "2": {
      "inputs": { "model_name": t5Model, "precision": "bf16", "load_device": "offload_device", "quantization": "disabled" },
      "class_type": "LoadWanVideoT5TextEncoder"
    },
    "3": {
      "inputs": { "model_name": vaeModel, "precision": "bf16" },
      "class_type": "WanVideoVAELoader"
    },
    "4": {
      "inputs": { "positive_prompt": prompt, "negative_prompt": negativePrompt, "t5": ["2", 0], "force_offload": true },
      "class_type": "WanVideoTextEncode"
    },
    "EE": {
      "inputs": { "width": width, "height": height, "num_frames": numFrames },
      "class_type": "WanVideoEmptyEmbeds"
    },
    "5": {
      "inputs": {
        "model": ["1", 0],
        "image_embeds": ["EE", 0],
        "text_embeds": ["4", 0],
        "steps": steps, "cfg": cfg, "shift": shift, "seed": seed,
        "scheduler": "unipc", "riflex_freq_index": 0,
        "force_offload": true, "denoise_strength": 1.0,
      },
      "class_type": "WanVideoSampler"
    },
    "6": {
      "inputs": { "vae": ["3", 0], "samples": ["5", 0], "enable_vae_tiling": true, "tile_x": 272, "tile_y": 272, "tile_stride_x": 144, "tile_stride_y": 128 },
      "class_type": "WanVideoDecode"
    },
  }

  let finalFrames: [string, number] = ["6", 0]
  let finalFps = fps

  if (useRife) {
    workflow["8"] = {
      "inputs": { "ckpt_name": "rife49.pth", "clear_cache_after_n_frames": 10, "multiplier": rifeMultiplier, "fast_mode": true, "ensemble": true, "scale_factor": 1.0, "dtype": "float32", "torch_compile": false, "batch_size": 1, "frames": ["6", 0] },
      "class_type": "RIFE VFI"
    }
    finalFrames = ["8", 0]
    finalFps = fps * rifeMultiplier
  }

  workflow["7"] = {
    "inputs": { "images": finalFrames, "filename_prefix": "VortexWAN", "frame_rate": finalFps, "loop_count": 0, "format": "video/h264-mp4", "pingpong": false, "save_output": true },
    "class_type": "VHS_VideoCombine"
  }

  return workflow
}

// WAN 2.1 I2V via kijai's ComfyUI-WanVideoWrapper.
// Uses the native WAN I2V architecture: CLIP vision encodes the source image,
// WanVideoImageToVideoEncode anchors frame 0, sampler generates the remaining frames.
export function createWanI2VWorkflow(
  prompt: string,
  negativePrompt: string,
  imageFilename: string,
  width = 832,
  height = 480,
  numFrames = 33,
  fps = 16,
  steps = 30,
  cfg = 6,
  shift = 8,
  diffusionModel = 'Wan2_1-I2V-14B-480p_fp8_e4m3fn_scaled_KJ.safetensors',
  t5Model = 'umt5-xxl-enc-fp8_e4m3fn.safetensors',
  vaeModel = 'Wan2_1_VAE_bf16.safetensors',
  clipVisionModel = 'open-clip-xlm-roberta-large-vit-huge-14_visual_fp16.safetensors',
  useRife = false,
  rifeMultiplier = 2,
) {
  const seed = Math.floor(Math.random() * 1_000_000_000)
  const workflow: any = {
    "BS": {
      "inputs": {
        "blocks_to_swap": 38, "offload_img_emb": true, "offload_txt_emb": true,
        "vace_blocks_to_swap": 0, "prefetch_blocks": 0, "use_non_blocking": true,
      },
      "class_type": "WanVideoBlockSwap"
    },
    "1": {
      "inputs": {
        "model": diffusionModel, "base_precision": "bf16", "quantization": "fp8_e4m3fn",
        "load_device": "offload_device", "attention_mode": "sdpa",
        "block_swap_args": ["BS", 0],
      },
      "class_type": "WanVideoModelLoader"
    },
    "2": {
      "inputs": { "model_name": t5Model, "precision": "bf16", "load_device": "offload_device", "quantization": "fp8_e4m3fn" },
      "class_type": "LoadWanVideoT5TextEncoder"
    },
    "3": {
      "inputs": { "model_name": vaeModel, "precision": "bf16" },
      "class_type": "WanVideoVAELoader"
    },
    "CV": {
      "inputs": { "model_name": clipVisionModel, "precision": "fp16", "load_device": "offload_device" },
      "class_type": "LoadWanVideoClipTextEncoder"
    },
    "LI": {
      "inputs": { "image": imageFilename },
      "class_type": "LoadImage"
    },
    "CL": {
      "inputs": {
        "clip_vision": ["CV", 0], "image_1": ["LI", 0],
        "strength_1": 1.0, "strength_2": 1.0, "crop": "center",
        "combine_embeds": "average", "force_offload": true,
      },
      "class_type": "WanVideoClipVisionEncode"
    },
    "4": {
      "inputs": { "positive_prompt": prompt, "negative_prompt": negativePrompt, "t5": ["2", 0], "force_offload": true },
      "class_type": "WanVideoTextEncode"
    },
    "IE": {
      "inputs": {
        "width": width, "height": height, "num_frames": numFrames,
        "noise_aug_strength": 0.0, "start_latent_strength": 1.0, "end_latent_strength": 1.0,
        "force_offload": true, "vae": ["3", 0], "clip_embeds": ["CL", 0], "start_image": ["LI", 0],
      },
      "class_type": "WanVideoImageToVideoEncode"
    },
    "5": {
      "inputs": {
        "model": ["1", 0],
        "image_embeds": ["IE", 0],
        "text_embeds": ["4", 0],
        "steps": steps, "cfg": cfg, "shift": shift, "seed": seed,
        "scheduler": "unipc", "riflex_freq_index": 0,
        "force_offload": true, "denoise_strength": 1.0,
      },
      "class_type": "WanVideoSampler"
    },
    "6": {
      "inputs": { "vae": ["3", 0], "samples": ["5", 0], "enable_vae_tiling": true, "tile_x": 272, "tile_y": 272, "tile_stride_x": 144, "tile_stride_y": 128 },
      "class_type": "WanVideoDecode"
    },
  }

  let finalFrames: [string, number] = ["6", 0]
  let finalFps = fps

  if (useRife) {
    workflow["8"] = {
      "inputs": { "ckpt_name": "rife49.pth", "clear_cache_after_n_frames": 10, "multiplier": rifeMultiplier, "fast_mode": true, "ensemble": true, "scale_factor": 1.0, "dtype": "float32", "torch_compile": false, "batch_size": 1, "frames": ["6", 0] },
      "class_type": "RIFE VFI"
    }
    finalFrames = ["8", 0]
    finalFps = fps * rifeMultiplier
  }

  workflow["7"] = {
    "inputs": { "images": finalFrames, "filename_prefix": "VortexWANI2V", "frame_rate": finalFps, "loop_count": 0, "format": "video/h264-mp4", "pingpong": false, "save_output": true },
    "class_type": "VHS_VideoCombine"
  }

  return workflow
}
