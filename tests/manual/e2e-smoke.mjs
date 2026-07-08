// E2E smoke test: drives the built app with Playwright and verifies the
// core surfaces render and the security/storage plumbing works.
//
// Prereqs: `npm run build` first; Home Assistant on :8123 (optional — its
// checks report status either way). The app spawns ComfyUI itself.
//
// Run headless:  xvfb-run -a node tests/manual/e2e-smoke.mjs
// Run on display: node tests/manual/e2e-smoke.mjs
//
// Screenshots land in $SCREENSHOT_DIR (default /tmp/vortex-shots).
import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_DIR = path.resolve(import.meta.dirname, '../..');
const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/vortex-shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const app = await electron.launch({
  executablePath: path.join(APP_DIR, 'node_modules/electron/dist/electron'),
  args: ['--no-sandbox', APP_DIR],
  cwd: APP_DIR,
  timeout: 45_000,
});

let page = null;
for (let i = 0; i < 60 && !page; i++) {
  page = app.windows().find(w => !w.url().startsWith('devtools://')) ?? null;
  if (!page) await new Promise(r => setTimeout(r, 1000));
}
if (!page) { console.log('FAIL  no window appeared'); process.exit(1); }
await page.waitForSelector('.v-sidebar', { timeout: 30_000 }).catch(() => {});
await new Promise(r => setTimeout(r, 3000));

// Sidebar-button navigation. Buttons only — category wrapper divs share the
// same textContent and swallow the click without navigating.
const navTo = async (label) => {
  await page.evaluate(l => {
    const els = [...document.querySelectorAll('.v-sidebar button')];
    (els.find(e => e.textContent?.trim() === l) ?? els.find(e => e.textContent?.includes(l)))?.click();
  }, label);
  await new Promise(r => setTimeout(r, 1500));
};

// NB: innerText reflects CSS text-transform: uppercase — every text
// assertion below must be case-insensitive.

// ── 1. Boot + sidebar contents ─────────────────────────────────────────────
const sidebarText = await page.evaluate(() => document.querySelector('.v-sidebar')?.innerText ?? '');
check('app boots to dashboard', sidebarText.length > 0, `${sidebarText.split('\n').filter(Boolean).length} sidebar entries`);
const removed = ['App Launcher', 'Benchmark', 'Sandbox', 'Compose Builder', 'Env Variables', 'AI Log Advisor'];
const leftovers = removed.filter(l => new RegExp(l, 'i').test(sidebarText));
check('removed views absent from sidebar', leftovers.length === 0, leftovers.join(', ') || 'all gone');
const kept = ['Dashboard', 'Quantum AI', 'Image Gen', 'Log Viewer', 'Home Assistant', 'Dotfile Vault'];
const missing = kept.filter(l => !new RegExp(l, 'i').test(sidebarText));
check('kept views present', missing.length === 0, missing.join(', ') || 'all present');
await page.screenshot({ path: `${SHOT_DIR}/01-dashboard.png` });

// ── 2. ComfyUI reachable from renderer (CORS via --enable-cors-header) ─────
// The app spawns ComfyUI itself; poll up to 90s while it boots.
let comfy = 'never-tried';
for (let i = 0; i < 30; i++) {
  comfy = await page.evaluate(async () => {
    try { const r = await fetch('http://127.0.0.1:8188/system_stats'); return r.status; }
    catch (e) { return 'fetch-failed: ' + e.message; }
  });
  if (comfy === 200) break;
  await new Promise(r => setTimeout(r, 3000));
}
check('renderer fetch to ComfyUI succeeds', comfy === 200, String(comfy));

// ── 3. net-fetch IPC → Home Assistant ──────────────────────────────────────
const ha = await page.evaluate(() => window.electron.netFetch({ url: 'http://localhost:8123/api/', timeoutMs: 4000 }));
check('netFetch reaches HA', ha.status === 200 || ha.status === 401, `status ${ha.status}${ha.error ? ' err=' + ha.error : ''}`);
const proxyBlock = await page.evaluate(() => window.electron.netFetch({ url: 'https://example.com/', timeoutMs: 4000 }));
check('netFetch refuses non-LAN hosts', proxyBlock.ok === false && /restricted/.test(proxyBlock.error ?? ''), proxyBlock.error ?? `status ${proxyBlock.status}`);

// ── 4. kv store roundtrip ──────────────────────────────────────────────────
const kv = await page.evaluate(async () => {
  await window.electron.kvSet('vortex-smoke-test', 'hello');
  const v = await window.electron.kvGet('vortex-smoke-test');
  await window.electron.kvDelete('vortex-smoke-test');
  return v;
});
check('kv store roundtrip', kv === 'hello', JSON.stringify(kv));

// ── 5. Log Viewer merge: Browse / AI Diagnose tabs ─────────────────────────
await navTo('Log Viewer');
const logButtons = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => b.textContent?.trim()).filter(Boolean));
check('LogView has Browse + AI Diagnose tabs', logButtons.includes('Browse') && logButtons.includes('AI Diagnose'));
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'AI Diagnose')?.click());
await new Promise(r => setTimeout(r, 1500));
const aiPanel = await page.evaluate(() => /ai crash diagnostics/i.test(document.body.innerText));
check('AI Diagnose panel renders inside LogView', aiPanel);
await page.screenshot({ path: `${SHOT_DIR}/02-logview-ai.png` });

// ── 6. Home Assistant view via net-fetch ───────────────────────────────────
await navTo('Home Assistant');
await new Promise(r => setTimeout(r, 3500));
const haView = await page.evaluate(() => document.body.innerText);
check('Home Assistant view shows connected state', /connected|online/i.test(haView),
  (haView.match(/connect\w*|online|offline/gi) ?? []).slice(0, 4).join(', '));
await page.screenshot({ path: `${SHOT_DIR}/03-home-assistant.png` });

// Close any live-camera overlay left open before navigating on
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /close/i.test(b.textContent ?? ''));
  btn?.click();
});
await new Promise(r => setTimeout(r, 1000));

// ── 7. Settings: ComfyUI quit toggle ───────────────────────────────────────
await navTo('Settings');
await new Promise(r => setTimeout(r, 1500));
const settingsText = await page.evaluate(() => document.body.innerText);
check('Stop ComfyUI on Quit toggle present', /stop comfyui on quit/i.test(settingsText));
await page.screenshot({ path: `${SHOT_DIR}/04-settings.png` });

// ── 8. Memory view renders as list (no 3D graph) ───────────────────────────
await navTo('AI Memory');
const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas'));
check('MemoryView renders without 3D canvas', !hasCanvas, hasCanvas ? 'canvas found' : 'list mode');
await page.screenshot({ path: `${SHOT_DIR}/05-memory.png` });

const fails = results.filter(r => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} checks passed — screenshots in ${SHOT_DIR}`);
// app.quit() severs the CDP connection before evaluate resolves and hangs
// Playwright — kill the process directly instead. ComfyUI stays up (detached).
app.process().kill('SIGTERM');
await new Promise(r => setTimeout(r, 2000));
process.exit(fails ? 1 : 0);
