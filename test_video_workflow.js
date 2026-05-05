const workflow = {
  '1': { inputs: { ckpt_name: 'v1-5-pruned-emaonly.safetensors' }, class_type: 'CheckpointLoaderSimple' },
  '2': { inputs: { text: 'test', clip: ['1', 1] }, class_type: 'CLIPTextEncode' },
  '3': { inputs: { text: 'bad', clip: ['1', 1] }, class_type: 'CLIPTextEncode' },
  '5': { 
    inputs: { 
      model: ['1', 0], 
      model_name: 'v3_sd15_mm.ckpt',
      beta_schedule: 'autoselect'
    }, 
    class_type: 'ADE_AnimateDiffLoaderGen1' 
  },
  '6': { inputs: { samples: ['10', 0], vae: ['1', 2] }, class_type: 'VAEDecode' },
  '7': { 
    inputs: { 
      images: ['6', 0],
      filename_prefix: 'VortexMotion',
      frame_rate: 12,
      loop_count: 0,
      format: 'video/h264-mp4',
      pingpong: false,
      save_output: true
    }, 
    class_type: 'VHS_VideoCombine' 
  },
  '8': { inputs: { width: 512, height: 512, batch_size: 16 }, class_type: 'EmptyLatentImage' },
  '10': { 
    inputs: { 
      seed: 12345, 
      steps: 25, 
      cfg: 7.5, 
      sampler_name: 'euler_ancestral', 
      scheduler: 'karras', 
      denoise: 1.0, 
      model: ['5', 0], 
      positive: ['2', 0], 
      negative: ['3', 0], 
      latent_image: ['8', 0] 
    }, 
    class_type: 'KSampler' 
  }
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