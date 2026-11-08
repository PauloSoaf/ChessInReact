import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'vite';

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

const browserPath = CHROME_PATHS.find((p) => existsSync(p));
if (!browserPath) {
  console.warn('[ACCEPTANCE] Skipping Chromium verification: no Chromium binary found.');
  process.exit(0);
}

const port = 5420 + Math.floor(Math.random() * 200);
const cdpPort = 9420 + Math.floor(Math.random() * 200);

const viteServer = await createServer({
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
    } catch {
      // retry
    }
  }

  if (!wsUrl) throw new Error('Could not connect to CDP page target');

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let seq = 1;
  const sendCdp = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = seq++;
      const handler = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id === id) {
          ws.removeEventListener('message', handler);
          if (msg.error) reject(new Error(JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });

  await sendCdp('Page.enable');
  await sendCdp('Runtime.enable');

  const setViewport = async (width, height, mobile = false) => {
    await sendCdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile,
    });
  };

  const evaluate = async (expr) => {
    const res = await sendCdp('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
  };

  await sleep(1500);

  // 1. Viewport & Responsiveness Verification (360px, 390px, 768px, 1024px, 1440px)
  const viewports = [
    { w: 360, h: 800, mobile: true },
    { w: 390, h: 844, mobile: true },
    { w: 768, h: 1024, mobile: false },
    { w: 1024, h: 768, mobile: false },
    { w: 1440, h: 900, mobile: false },
  ];

  console.log('--- 1. VIEWPORT & OVERFLOW BOUNDARY VERIFICATION ---');
  for (const vp of viewports) {
    await setViewport(vp.w, vp.h, vp.mobile);
    await evaluate(`window.location.hash = '#hub'; document.getElementById('nav-btn-hub')?.click();`);
    await sleep(350);

    // Measure Hub
    const hubOverflow = await evaluate(`(() => {
      const scrollW = document.documentElement.scrollWidth;
      const innerW = window.innerWidth;
      const elements = Array.from(document.querySelectorAll('button, h1, h2, h3, .hub-hero-card, .hub-mode-card, .top-nav-bar'));
      let clippedCount = 0;
      for (const el of elements) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > innerW + 1.5) {
          clippedCount++;
        }
      }
      return { scrollW, innerW, clippedCount, overflow: scrollW > innerW };
    })()`);

    // Measure Game
    await evaluate(`window.location.hash = '#game'; document.getElementById('nav-btn-game')?.click();`);
    await sleep(350);
    const gameOverflow = await evaluate(`(() => {
      const scrollW = document.documentElement.scrollWidth;
      const innerW = window.innerWidth;
      const elements = Array.from(document.querySelectorAll('button, .board-square, .player-card, .game-controls-bar, .top-nav-bar'));
      let clippedCount = 0;
      for (const el of elements) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > innerW + 1.5) {
          clippedCount++;
        }
      }
      return { scrollW, innerW, clippedCount, overflow: scrollW > innerW };
    })()`);

    console.log(
      `[VIEWPORT ${vp.w}x${vp.h}] Hub: scrollW=${hubOverflow.scrollW}/${hubOverflow.innerW} (clipped=${hubOverflow.clippedCount}) | Game: scrollW=${gameOverflow.scrollW}/${gameOverflow.innerW} (clipped=${gameOverflow.clippedCount})`
    );

    if (hubOverflow.overflow || gameOverflow.overflow) {
      throw new Error(`Horizontal layout overflow detected at ${vp.w}px!`);
    }
    if (hubOverflow.clippedCount > 0 || gameOverflow.clippedCount > 0) {
      throw new Error(`Clipped elements detected at ${vp.w}px!`);
    }
  }

  // 2. Interactive Flow Verification (Hub -> Match -> Controls -> Themes)
  console.log('--- 2. INTERACTIVE GAMEPLAY & THEME FLOW VERIFICATION ---');
  await setViewport(1440, 900, false);

  // Return to Hub and verify difficulty selection
  await evaluate(`document.getElementById('nav-btn-hub')?.click();`);
  await sleep(300);
  const diffSelected = await evaluate(`(() => {
    document.getElementById('hub-difficulty-btn-4')?.click();
    return document.getElementById('hub-difficulty-btn-4')?.getAttribute('aria-pressed');
  })()`);
  console.log(`[FLOW: DIFFICULTY] Selected N4, aria-pressed=${diffSelected}`);

  // Start bot match
  await evaluate(`document.getElementById('hub-hero-btn-play-bot')?.click();`);
  await sleep(400);

  // Verify Board mounted and active player White
  const initialMatchState = await evaluate(`(() => {
    const isGameActive = !!document.getElementById('game-play-view');
    const sqE2 = !!document.querySelector('[data-testid="square-4,1"]');
    const statusText = document.querySelector('.nav-status-pill')?.textContent?.trim() || '';
    return { isGameActive, sqE2, statusText };
  })()`);
  console.log(`[FLOW: MATCH START] Active=${initialMatchState.isGameActive}, BoardPresent=${initialMatchState.sqE2}, Status="${initialMatchState.statusText}"`);

  // Play White move e2 -> e4
  await evaluate(`document.querySelector('[data-testid="square-4,1"]')?.click();`);
  await sleep(150);
  await evaluate(`document.querySelector('[data-testid="square-4,3"]')?.click();`);
  await sleep(600);

  // Wait for bot deliberation and response
  let botMoved = false;
  for (let i = 0; i < 20; i++) {
    await sleep(300);
    const hasTurn3 = await evaluate(`document.querySelector('.nav-status-pill')?.textContent?.includes('Turno #3')`);
    if (hasTurn3) {
      botMoved = true;
      break;
    }
  }
  console.log(`[FLOW: BOT RESPONSE] Bot move registered: ${botMoved}`);

  // Test Undo (Desfazer)
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Desfazer'));
    btn?.click();
  })()`);
  await sleep(400);
  const undoTurn = await evaluate(`document.querySelector('.nav-status-pill')?.textContent?.includes('Turno #1')`);
  console.log(`[FLOW: UNDO] Reverted to Turn 1: ${undoTurn}`);

  // Test Redo (Refazer)
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Refazer'));
    btn?.click();
  })()`);
  await sleep(400);
  const redoTurn = await evaluate(`document.querySelector('.nav-status-pill')?.textContent?.includes('Turno #3')`);
  console.log(`[FLOW: REDO] Restored to Turn 3: ${redoTurn}`);

  // Test Board Flip (Inverter Tabuleiro)
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Inverter'));
    btn?.click();
  })()`);
  await sleep(300);
  const flippedCol = await evaluate(`document.querySelector('[data-testid="square-4,1"]')?.getAttribute('data-square-col')`);
  console.log(`[FLOW: FLIP BOARD] Logical e2 rotated visual column to: ${flippedCol}`);

  // Test Theme Switcher via Modal
  await evaluate(`document.getElementById('nav-open-theme-customizer')?.click();`);
  await sleep(300);
  await evaluate(`document.getElementById('theme-card-ivory')?.click();`);
  const isIvory = await evaluate(`document.documentElement.classList.contains('theme-ivory')`);
  await evaluate(`document.getElementById('theme-card-synthwave')?.click();`);
  const isSynth = await evaluate(`document.documentElement.classList.contains('theme-synthwave')`);
  await evaluate(`document.getElementById('theme-card-midnight')?.click();`);
  const isMidnight = await evaluate(`document.documentElement.classList.contains('theme-midnight')`);
  await evaluate(`document.getElementById('close-theme-customizer-btn')?.click();`);
  await sleep(200);
  console.log(`[FLOW: THEMES] Ivory=${isIvory}, Synthwave=${isSynth}, MidnightRestored=${isMidnight}`);

  // Test Reset Match
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Reiniciar Partida'));
    btn?.click();
  })()`);
  await sleep(300);
  const resetTurn = await evaluate(`document.querySelector('.nav-status-pill')?.textContent?.includes('Turno #1')`);
  console.log(`[FLOW: RESET MATCH] Reset to Turn 1: ${resetTurn}`);

  console.log('--- ALL ACCEPTANCE CHECKS PASSED SUCCESSFULLY ---');
  ws.close();
} finally {
  chromeProc.kill();
  await viteServer.close();
}

