const workflow = {
  '3': { inputs: { seed: 12345, steps: 25, cfg: 7, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] }, class_type: 'KSampler' },
  '4': { inputs: { ckpt_name: 'v1-5-pruned-emaonly.safetensors' }, class_type: 'CheckpointLoaderSimple' },
  '5': { inputs: { width: 512, height: 512, batch_size: 1 }, class_type: 'EmptyLatentImage' },
  '6': { inputs: { text: 'test prompt', clip: ['4', 1] }, class_type: 'CLIPTextEncode' },
  '7': { inputs: { text: 'negative', clip: ['4', 1] }, class_type: 'CLIPTextEncode' },
  '8': { inputs: { samples: ['3', 0], vae: ['4', 2] }, class_type: 'VAEDecode' },
  '9': { inputs: { filename_prefix: 'VortexImage', images: ['8', 0] }, class_type: 'SaveImage' },
}

async function test() {
  const resp = await fetch('http://localhost:8188/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: 'test' }),
  })
  const text = await resp.text();
  console.log(resp.status, text);
}
test();