import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

console.log('Running verification for Milestone 2 fixes...');

const ollamaPath = path.resolve('src/hooks/useOllama.ts');
const comfyPath = path.resolve('src/hooks/useComfySocket.ts');

// 1. Verify useOllama.ts
const ollamaContent = fs.readFileSync(ollamaPath, 'utf8');

assert.ok(ollamaContent.includes('const unsubToken = window.electron.on'), 'useOllama.ts must capture unsubscribe function for ollama-token');
assert.ok(ollamaContent.includes('unsubToken()'), 'useOllama.ts must invoke unsubToken in the cleanup function');
assert.ok(!ollamaContent.includes("window.electron.removeListener('ollama-token'"), 'useOllama.ts must not call removeListener manually');

console.log('✓ useOllama.ts event listener cleanup verified.');

// 2. Verify useComfySocket.ts
const comfyContent = fs.readFileSync(comfyPath, 'utf8');

assert.ok(comfyContent.includes('const raw = String(') && comfyContent.includes('exception_message'), 'useComfySocket.ts must coerce exception_message raw value to string using String()');

console.log('✓ useComfySocket.ts exception_message coercion verified.');

console.log('All verification checks PASSED successfully!');
