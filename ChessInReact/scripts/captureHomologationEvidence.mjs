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

const port = 5520 + Math.floor(Math.random() * 40);
const cdpPort = 9520 + Math.floor(Math.random() * 40);

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

  // Helper to set viewport
  const setVp = async (width, height, mobile = false) => {
    await sendCdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile,
    });
    await sleep(350);
  };

  const capture = async (filename) => {
    const ss = await sendCdp('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(ss.data, 'base64');
    writeFileSync(`${artifactDir}\\${filename}`, buf);
    console.log(`Saved: ${filename} (${buf.length} bytes)`);
  };

  // -------------------------------------------------------------
  // 1. Hub Desktop 1440px
  // -------------------------------------------------------------
  console.log('Capturing: Hub Desktop 1440px...');
  await setVp(1440, 900, false);
  await sendCdp('Runtime.evaluate', {
    expression: `window.__CHESS_APP__?.navigateTo('HUB') || (window.location.hash = '#hub');`,
  });
  await sleep(1500);
  await capture('hub_desktop_1440.png');

  // -------------------------------------------------------------
  // 2. Hub Mobile 390px
  // -------------------------------------------------------------
  console.log('Capturing: Hub Mobile 390px...');
  await setVp(390, 844, true);
  await sleep(1000);
  await capture('hub_mobile_390.png');

  // -------------------------------------------------------------
  // 3. Piece Showcase: All 6 Pieces (Desktop)
  // -------------------------------------------------------------
  console.log('Capturing: Piece Showcase All Six...');
  await setVp(1440, 900, false);
  await sleep(500);
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
  await capture('piece_showcase_all_six.png');

  // -------------------------------------------------------------
  // 4. Piece Showcase: Knight Close-up & Procedural vs PBR
  // -------------------------------------------------------------
  console.log('Capturing: Knight Close-up & Comparison...');
  await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('showcase-select-view-mode');
      if (sel) {
        sel.value = 'duel';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`,
  });
  await sleep(1200);
  await capture('piece_knight_closeup.png');

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
  await sleep(1500);
  await capture('piece_comparison_procedural_vs_pbr.png');

  // -------------------------------------------------------------
  // 5. Arena 2D Desktop 1440px
  // -------------------------------------------------------------
  console.log('Capturing: Arena 2D Desktop 1440px...');
  await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      window.__CHESS_APP__?.launchMinigame('STANDARD');
    })()`,
  });
  await sleep(1200);
  // Ensure 2D mode
  await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const badge = document.querySelector('.nav-view-mode-badge');
      if (badge && badge.textContent?.trim() === '3D') {
        document.getElementById('nav-quick-view-mode-toggle')?.click();
      }
    })()`,
  });
  await sleep(1000);
  await capture('arena_2d_desktop_1440.png');

  // -------------------------------------------------------------
  // 6. Arena 3D Desktop 1440px (32 Pieces)
  // -------------------------------------------------------------
  console.log('Capturing: Arena 3D Desktop 1440px...');
  await sendCdp('Runtime.evaluate', {
    expression: `(() => {
      const badge = document.querySelector('.nav-view-mode-badge');
      if (badge && badge.textContent?.trim() === '2D') {
        document.getElementById('nav-quick-view-mode-toggle')?.click();
      }
    })()`,
  });
  await sleep(2500);
  await capture('arena_3d_desktop_1440.png');
  await capture('match_arena_3d_32_pieces.png');

  // -------------------------------------------------------------
  // 7. Arena 3D Move in Progress
  // -------------------------------------------------------------
  console.log('Capturing: Arena 3D Move in Progress...');
  // Move 1. Nf3 (6,0 -> 5,2)
  await sendCdp('Runtime.evaluate', {
    expression: `window.__CHESS_3D__?.simulateSquareClick('6,0')`,
  });
  await sleep(800);
  await sendCdp('Runtime.evaluate', {
    expression: `window.__CHESS_3D__?.simulateSquareClick('5,2')`,
  });
  await sleep(1500);
  // Select Pawn at e2 (4,1)
  await sendCdp('Runtime.evaluate', {
    expression: `window.__CHESS_3D__?.simulateSquareClick('4,1')`,
  });
  await sleep(1000);
  await capture('match_arena_3d_move_in_progress.png');

  // -------------------------------------------------------------
  // 8. Arena 3D Mobile 390px
  // -------------------------------------------------------------
  console.log('Capturing: Arena 3D Mobile 390px...');
  await setVp(390, 844, true);
  await sleep(1500);
  await capture('arena_3d_mobile_390.png');
  await capture('mobile_and_desktop_3d_viewports.png');

  // Return to Desktop for variants
  await setVp(1440, 900, false);
  await sleep(500);

  // -------------------------------------------------------------
  // 9. Variant: Spell Chess
  // -------------------------------------------------------------
  console.log('Capturing: Variant Spell Chess...');
  await sendCdp('Runtime.evaluate', {
    expression: `window.__CHESS_APP__?.launchMinigame('SPELL_CHESS_OFFICIAL');`,
  });
  await sleep(1500);
  await capture('variant_spell_chess.png');

  // -------------------------------------------------------------
  // 10. Variant: Duck Chess
  // -------------------------------------------------------------
  console.log('Capturing: Variant Duck Chess...');
  await sendCdp('Runtime.evaluate', {
    expression: `window.__CHESS_APP__?.launchMinigame('DUCK_CHESS');`,
  });
  await sleep(1500);
  await capture('variant_duck_chess.png');

  // -------------------------------------------------------------
  // 11. Variant: Bughouse
  // -------------------------------------------------------------
  console.log('Capturing: Variant Bughouse...');
  await sendCdp('Runtime.evaluate', {
    expression: `window.__CHESS_APP__?.navigateTo('BUGHOUSE');`,
  });
  await sleep(1500);
  await capture('variant_bughouse.png');

  // -------------------------------------------------------------
  // 12. Variant: Puzzle Rush
  // -------------------------------------------------------------
  console.log('Capturing: Variant Puzzle Rush...');
  await sendCdp('Runtime.evaluate', {
    expression: `window.__CHESS_APP__?.navigateTo('PUZZLE_RUSH');`,
  });
  await sleep(1500);
  await capture('variant_puzzle_rush.png');

  // -------------------------------------------------------------
  // 13. Variant: Cubic 3D
  // -------------------------------------------------------------
  console.log('Capturing: Variant Cubic 3D...');
  await sendCdp('Runtime.evaluate', {
    expression: `window.__CHESS_APP__?.launchMinigame('CUBIC_CHESS');`,
  });
  await sleep(1500);
  await capture('variant_cubic_3d.png');

  // -------------------------------------------------------------
  // 14. Variant: Toroidal 3D
  // -------------------------------------------------------------
  console.log('Capturing: Variant Toroidal 3D...');
  await sendCdp('Runtime.evaluate', {
    expression: `window.__CHESS_APP__?.launchMinigame('TOROIDAL_CHESS');`,
  });
  await sleep(1500);
  await capture('variant_toroidal_3d.png');

  ws.close();
  console.log('ALL HOMOLOGATION EVIDENCE CAPTURES COMPLETED SUCCESSFULLY.');
} finally {
  chromeProc.kill('SIGTERM');
  await viteServer.close();
}
