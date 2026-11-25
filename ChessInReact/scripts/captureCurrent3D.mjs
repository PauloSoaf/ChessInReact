import { execFileSync, spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const artifactDir = 'C:\\Users\\Paulo\\.gemini\\antigravity\\brain\\3da1db70-7e29-416a-80f9-9127ca84088c';

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const browserPath = CHROME_PATHS.find((p) => existsSync(p));
if (!browserPath) {
  console.error('No Chromium browser found');
  process.exit(1);
}

const port = 5490 + Math.floor(Math.random() * 50);
const cdpPort = 9490 + Math.floor(Math.random() * 50);

const viteServer = await createServer({
  root: projectRoot,
  server: { port, host: '127.0.0.1' },
  logLevel: 'error',
});
await viteServer.listen();

const chromeProc = spawn(
  browserPath,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    `--remote-debugging-port=${cdpPort}`,
    '--no-first-run',
    '--no-default-browser-check',
    `http://127.0.0.1:${port}/#hub`,
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let wsUrl = null;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try {
      const resp = await fetch(`http://127.0.0.1:${cdpPort}/json`);
      if (!resp.ok) continue;
      const targets = await resp.json();
      const page = targets.find((t) => t.type === 'page' && t.url.includes(`${port}`));
      if (page?.webSocketDebuggerUrl) {
        wsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) throw new Error('Could not connect to CDP');

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let seq = 1;
  const sendCdp = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = seq++;
      const handler = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id === id) {
          ws.removeEventListener('message', handler);
          if (msg.error) rej(msg.error);
          else res(msg.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });

  await sendCdp('Page.enable');
  await sendCdp('Runtime.enable');
  await sendCdp('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await sleep(1500);

  // 1. Capture Showcase in Hub
  await sleep(1000);
  const ss1 = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${artifactDir}\\current_hub_showcase_1440.png`, Buffer.from(ss1.data, 'base64'));
  console.log('Saved current_hub_showcase_1440.png');

  // 2. Click Start Match against Bot and switch to 3D
  await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('hub-hero-btn-play-bot')?.click();
    })()`,
  });

  await sleep(1000);

  // Switch to 3D board view
  await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('button[title*="Modo 3D WebGL"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === '3D WebGL');
      btn?.click();
    })()`,
  });

  await sleep(2500);

  // Capture 3D Match Arena
  const ss2 = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${artifactDir}\\current_match_arena_3d_1440.png`, Buffer.from(ss2.data, 'base64'));
  console.log('Saved current_match_arena_3d_1440.png');

  ws.close();
} finally {
  chromeProc.kill('SIGTERM');
  await viteServer.close();
  console.log('Done capturing current 3D state.');
}
