import { spawn } from 'node:child_process';
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

const port = 5510 + Math.floor(Math.random() * 40);
const cdpPort = 9510 + Math.floor(Math.random() * 40);

const viteServer = await createServer({
  root: projectRoot,
  server: { port, host: '127.0.0.1' },
  logLevel: 'error',
});
await viteServer.listen();
console.log(`Vite server listening on port ${port}`);

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

  if (!wsUrl) throw new Error('Could not connect to Chromium CDP');

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

  await sleep(2000);

  // -------------------------------------------------------------
  // 1. Homologation Capture 1: The six pieces side by side
  // -------------------------------------------------------------
  console.log('Capturing: 1. piece_showcase_all_six.png');
  await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('showcase-select-view-mode');
      if (sel) {
        sel.value = 'all';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`,
  });
  await sleep(1500);
  const ss1 = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${artifactDir}\\piece_showcase_all_six.png`, Buffer.from(ss1.data, 'base64'));

  // -------------------------------------------------------------
  // 2. Homologation Capture 2: Close-up of White and Black knights
  // -------------------------------------------------------------
  console.log('Capturing: 2. piece_knight_closeup.png');
  await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('showcase-select-view-mode');
      if (sel) {
        sel.value = 'duel';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`,
  });
  await sleep(1500);
  const ss2 = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${artifactDir}\\piece_knight_closeup.png`, Buffer.from(ss2.data, 'base64'));

  // -------------------------------------------------------------
  // 3. Homologation Capture 3: Full 3D board with all 32 pieces
  // -------------------------------------------------------------
  console.log('Transitioning to 3D Match Arena...');
  await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('hub-hero-btn-play-bot')?.click();
    })()`,
  });
  await sleep(1200);

  // Switch to 3D board view
  await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('button[title*="Modo 3D WebGL"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === '3D WebGL');
      btn?.click();
    })()`,
  });
  await sleep(2500);

  console.log('Capturing: 3. match_arena_3d_32_pieces.png');
  const ss3 = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${artifactDir}\\match_arena_3d_32_pieces.png`, Buffer.from(ss3.data, 'base64'));

  // -------------------------------------------------------------
  // 4. Homologation Capture 4: In-progress game with movement
  // -------------------------------------------------------------
  console.log('Executing move 1. Nf3 and selecting Pawn e2...');
  // Select Knight at 6,0 (g1)
  await sendCdp('Runtime.evaluate', {
    expression: `window.__CHESS_3D__?.simulateSquareClick('6,0')`,
  });
  await sleep(1000);

  // Move Knight to 5,2 (f3)
  await sendCdp('Runtime.evaluate', {
    expression: `window.__CHESS_3D__?.simulateSquareClick('5,2')`,
  });
  await sleep(2000);

  // Select Pawn at 4,1 (e2) to show legal moves and amber selection halo
  await sendCdp('Runtime.evaluate', {
    expression: `window.__CHESS_3D__?.simulateSquareClick('4,1')`,
  });
  await sleep(1500);

  console.log('Capturing: 4. match_arena_3d_move_in_progress.png');
  const ss4 = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${artifactDir}\\match_arena_3d_move_in_progress.png`, Buffer.from(ss4.data, 'base64'));

  // -------------------------------------------------------------
  // 5. Homologation Capture 5: Procedural Fallback vs PBR Premium
  // -------------------------------------------------------------
  console.log('Navigating back to Hub for comparison inspection...');
  await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      window.location.hash = '#hub';
    })()`,
  });
  await sleep(1500);
  await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('showcase-select-view-mode');
      if (sel) {
        sel.value = 'comparison';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      document.getElementById('showcase-btn-finish-brass')?.click();
    })()`,
  });
  await sleep(2000);

  console.log('Capturing: 5. piece_comparison_procedural_vs_pbr.png');
  const ss5 = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${artifactDir}\\piece_comparison_procedural_vs_pbr.png`, Buffer.from(ss5.data, 'base64'));

  // -------------------------------------------------------------
  // 6. Homologation Capture 6: Mobile (390px) Viewport
  // -------------------------------------------------------------
  console.log('Testing Mobile 390px Viewport in Match Arena...');
  await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('hub-hero-btn-play-bot')?.click();
    })()`,
  });
  await sleep(1200);

  await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('button[title*="Modo 3D WebGL"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === '3D WebGL');
      btn?.click();
    })()`,
  });
  await sleep(1500);

  await sendCdp('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await sleep(2000);

  console.log('Capturing: 6. mobile_and_desktop_3d_viewports.png');
  const ss6 = await sendCdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${artifactDir}\\mobile_and_desktop_3d_viewports.png`, Buffer.from(ss6.data, 'base64'));

  ws.close();
  console.log('All 6 homologation captures successfully saved.');
} finally {
  chromeProc.kill('SIGTERM');
  await viteServer.close();
}
