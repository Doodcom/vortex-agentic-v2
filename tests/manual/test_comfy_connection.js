async function test() {
  try {
    const resp = await fetch('http://127.0.0.1:8188/object_info');
    if (resp.ok) {
      console.log('ComfyUI API is reachable!');
      const data = await resp.json();
      console.log('Available checkpoints:', data.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0]?.length ?? 0);
    } else {
      console.log('ComfyUI API returned status:', resp.status);
    }
  } catch (e) {
    console.log('Failed to connect to ComfyUI:', e.message);
  }
}

test();
