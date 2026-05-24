export const VORTEX_MODELS = [
  { name: 'qwen3:8b',          size: 5.2  * 1024 * 1024 * 1024, label: '8B Fast'      },
  { name: 'qwen3:14b',         size: 9.3  * 1024 * 1024 * 1024, label: '14B Thinker'  },
  { name: 'qwen3-coder:30b',   size: 18.6 * 1024 * 1024 * 1024, label: '30B Coder'    },
  { name: 'deepseek-r1:14b',   size: 9.0  * 1024 * 1024 * 1024, label: '14B Reasoner' },
  { name: 'gemma3:12b',        size: 8.1  * 1024 * 1024 * 1024, label: '12B Vision'   },
]

// Models that can ingest images via the Ollama `images` parameter.
export const VISION_MODELS = new Set<string>(['gemma3:12b', 'llava:13b', 'llava:7b', 'minicpm-v', 'qwen2.5vl:7b'])

export const DEFAULT_MODEL = 'qwen3:8b'
