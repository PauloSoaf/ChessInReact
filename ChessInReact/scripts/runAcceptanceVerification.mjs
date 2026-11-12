import { execFileSync, spawn } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
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
  if (process.env.CI) {
    console.error('[ACCEPTANCE CRITICAL] No Chromium executable found in CI environment!');
    throw new Error('Chromium Acceptance Verification failed: No browser installed in CI environment! (Silent skip prohibited in CI)');
  }
  console.warn('[ACCEPTANCE] SKIPPED: No Chromium browser executable found on local dev system.');
  process.exit(0);
}

let browserVersion = 'unknown';
try {
  browserVersion = execFileSync(browserPath, ['--version'], { encoding: 'utf8', timeout: 3000 }).trim();
} catch {
  browserVersion = 'headless-chromium';
}
console.log(`[ACCEPTANCE RUNNER] Detected browser: "${browserPath}" (${browserVersion})`);

const port = 5430 + Math.floor(Math.random() * 200);
const cdpPort = 9430 + Math.floor(Math.random() * 200);

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

function assert(condition, message) {
  if (!condition) {
    console.error(`[ACCEPTANCE ASSERTION FAILED] ${message}`);
    throw new Error(`[ACCEPTANCE ASSERTION FAILED] ${message}`);
  }
}

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

  assert(wsUrl, `Could not connect to CDP target on port ${cdpPort}`);

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

  ws.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args?.map((a) => a.value ?? a.description ?? '').join(' ');
        // Filter known upstream Three.js deprecation notices to maintain clean CI logs
        if (text.includes('THREE.Clock') || text.includes('PCFSoftShadowMap')) {
          return;
        }
        if (text.includes('THREE.WebGLRenderer: Context Lost.')) {
          // Normal WebGL context disposal on React component unmount / viewport remount
          console.log('[BROWSER LOG] (Lifecycle unmount) WebGLRenderer Context Disposed.');
          return;
        }
        if (msg.params.type === 'error' || msg.params.type === 'warning' || text.includes('3D') || text.includes('WebGL')) {
          console.log(`[BROWSER ${msg.params.type.toUpperCase()}] ${text}`);
        }
      } else if (msg.method === 'Runtime.exceptionThrown') {
        console.error('[BROWSER UNCAUGHT EXCEPTION]', msg.params.exceptionDetails?.text, msg.params.exceptionDetails?.exception?.description);
      }
    } catch {
      // ignore
    }
  });

  const setViewport = async (width, height, mobile = false) => {
    await sendCdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile,
      fitWindow: false,
    });
  };

  const evaluate = async (expr) => {
    const res = await sendCdp('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || JSON.stringify(res.exceptionDetails);
      throw new Error(`Runtime.evaluate failed: ${desc}`);
    }
    return res.result?.value;
  };

  // Wait up to 15s for initial app mount (accommodates Vite first-load dependency pre-bundling)
  let initialMount = false;
  for (let i = 0; i < 30; i++) {
    const ready = await evaluate(`!!(document.getElementById('game-hub') || document.getElementById('match-arena-shell'))`);
    if (ready) {
      initialMount = true;
      break;
    }
    await sleep(500);
  }
  assert(initialMount, 'Application failed to mount initial UI within 15 seconds');
  await sleep(500);

  // =========================================================================
  // 1. Viewport & Responsiveness Verification (360px, 390px, 768px, 1024px, 1440px)
  // =========================================================================
  console.log('--- 1. VIEWPORT & OVERFLOW BOUNDARY VERIFICATION ---');
  const viewports = [
    { w: 360, h: 800, mobile: true },
    { w: 390, h: 844, mobile: true },
    { w: 768, h: 1024, mobile: false },
    { w: 1024, h: 768, mobile: false },
    { w: 1440, h: 900, mobile: false },
  ];

  for (const vp of viewports) {
    await setViewport(vp.w, vp.h, vp.mobile);
    await evaluate(`window.location.hash = '#hub'; document.getElementById('nav-btn-hub')?.click();`);
    await sleep(350);

    // Measure Hub
    const hubMetrics = await evaluate(`(() => {
      const scrollW = document.documentElement.scrollWidth;
      const innerW = window.innerWidth;
      const hubEl = document.getElementById('game-hub');
      if (!hubEl) return { error: 'Element #game-hub not found in DOM' };
      const elements = Array.from(document.querySelectorAll('button, h1, h2, h3, .hub-hero-card, .hub-mode-card, .top-nav-bar'));
      let clippedCount = 0;
      const clippedDetails = [];
      for (const el of elements) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > innerW + 1.5) {
          clippedCount++;
          clippedDetails.push(el.tagName + (el.id ? '#' + el.id : '') + ' right=' + r.right + ' > innerW=' + innerW);
        }
      }
      return { scrollW, innerW, clippedCount, clippedDetails, overflow: scrollW > innerW };
    })()`);

    assert(!hubMetrics.error, hubMetrics.error);
    assert(!hubMetrics.overflow, `Horizontal overflow in Hub at ${vp.w}px: scrollWidth=${hubMetrics.scrollW} > innerWidth=${hubMetrics.innerW}`);
    assert(hubMetrics.clippedCount === 0, `Clipped elements in Hub at ${vp.w}px: ${hubMetrics.clippedDetails.join(', ')}`);

    // Measure Game Arena
    await evaluate(`window.location.hash = '#game'; document.getElementById('nav-btn-game')?.click();`);
    await sleep(350);
    const gameMetrics = await evaluate(`(() => {
      const scrollW = document.documentElement.scrollWidth;
      const innerW = window.innerWidth;
      const arenaEl = document.getElementById('match-arena-shell') || document.querySelector('.match-arena-shell');
      if (!arenaEl) return { error: 'Element .match-arena-shell not found in DOM' };
      const elements = Array.from(document.querySelectorAll('button, .board-square, .player-card, #bot-controls, .top-nav-bar'));
      let clippedCount = 0;
      const clippedDetails = [];
      for (const el of elements) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > innerW + 1.5) {
          clippedCount++;
          clippedDetails.push(el.tagName + (el.id ? '#' + el.id : '') + ' right=' + r.right + ' > innerW=' + innerW);
        }
      }
      const wideElements = [];
      for (const el of Array.from(document.querySelectorAll('*'))) {
        const r = el.getBoundingClientRect();
        if (r.right > innerW + 1.5 && r.width > 0) {
          wideElements.push(el.tagName + (el.id ? '#' + el.id : (el.className ? '.' + String(el.className).slice(0, 30) : '')) + ' right=' + Math.round(r.right) + ' w=' + Math.round(r.width));
        }
      }
      return { scrollW, innerW, clippedCount, clippedDetails, wideElements: wideElements.slice(0, 5), overflow: scrollW > innerW };
    })()`);

    assert(!gameMetrics.error, gameMetrics.error);
    assert(!gameMetrics.overflow, `Horizontal overflow in Game Arena at ${vp.w}px: scrollWidth=${gameMetrics.scrollW} > innerWidth=${gameMetrics.innerW}. Wide elements: ${gameMetrics.wideElements?.join(', ')}`);
    assert(gameMetrics.clippedCount === 0, `Clipped elements in Game Arena at ${vp.w}px: ${gameMetrics.clippedDetails.join(', ')}`);

    console.log(
      `✓ [VIEWPORT ${vp.w}x${vp.h}] Hub: ${hubMetrics.scrollW}/${hubMetrics.innerW}px (clipped=0) | Game: ${gameMetrics.scrollW}/${gameMetrics.innerW}px (clipped=0)`
    );
  }

  // =========================================================================
  // 2. Behavioral & Interactive Gameplay Acceptance Verification
  // =========================================================================
  console.log('--- 2. BEHAVIORAL & INTERACTIVE GAMEPLAY ACCEPTANCE VERIFICATION ---');
  await setViewport(1440, 900, false);

  // Return to Hub
  await evaluate(`document.getElementById('nav-btn-hub')?.click();`);
  await sleep(350);
  assert(await evaluate(`!!document.getElementById('game-hub')`), 'Game Hub view was not mounted');

  // Flow 1: Difficulty Selection (SegmentedControl role="radio" and aria-checked)
  await evaluate(`document.getElementById('hub-difficulty-btn-4')?.click();`);
  await sleep(300);

  const diffCheck = await evaluate(`(() => {
    const btn4 = document.getElementById('hub-difficulty-btn-4');
    if (!btn4) return { error: 'Difficulty button #hub-difficulty-btn-4 not found' };
    const role = btn4.getAttribute('role');
    const isChecked4 = btn4.getAttribute('aria-checked') === 'true';
    const isChecked3 = document.getElementById('hub-difficulty-btn-3')?.getAttribute('aria-checked') === 'true';
    const hubText = document.getElementById('game-hub')?.textContent || '';
    const hasForteDesc = hubText.includes('Forte') && hubText.includes('Cálculo Profundo');
    return { role, isChecked4, isChecked3, hasForteDesc };
  })()`);

  assert(!diffCheck.error, diffCheck.error);
  assert(diffCheck.role === 'radio', `SegmentedControl must use role="radio", found role="${diffCheck.role}"`);
  assert(diffCheck.isChecked4 === true, 'Difficulty N4 was not checked (aria-checked != true)');
  assert(diffCheck.isChecked3 === false, 'Difficulty N3 was not un-checked');
  assert(diffCheck.hasForteDesc === true, 'Bot card description did not update to N4 Forte/Cálculo Profundo');
  console.log('✓ [FLOW 1: DIFFICULTY SELECTION] Verified role="radio", aria-checked="true", and card meta update');

  // Flow 2: Start Match against Bot
  const startMatchCheck = await evaluate(`(() => {
    const playBtn = document.getElementById('hub-hero-btn-play-bot');
    if (!playBtn) return { error: 'Hero start button #hub-hero-btn-play-bot not found' };
    playBtn.click();
    return { ok: true };
  })()`);
  assert(startMatchCheck.ok, startMatchCheck.error);
  await sleep(500);

  const matchMountedCheck = await evaluate(`(() => {
    const arena = document.getElementById('match-arena-shell') || document.querySelector('.match-arena-shell');
    const controls = document.getElementById('bot-controls');
    const statusText = document.querySelector('.nav-status-pill')?.textContent?.trim() || '';
    const sqE2 = document.querySelector('[data-testid="square-4,1"]');
    const sqE4 = document.querySelector('[data-testid="square-4,3"]');
    const sqE2HasPiece = !!sqE2?.querySelector('[data-testid$="-piece"], .piece-symbol');
    const sqE4HasPiece = !!sqE4?.querySelector('[data-testid$="-piece"], .piece-symbol');
    const oppCard = document.querySelector('.match-stage-player-wrap')?.textContent || '';
    const hasN4Label = oppCard.includes('N4') || oppCard.includes('Forte');
    return {
      arenaMounted: !!arena,
      controlsMounted: !!controls,
      statusText,
      hasTurn1: statusText.includes('Turno #1') && statusText.includes('Brancas'),
      sqE2HasPiece,
      sqE4HasPiece,
      hasN4Label,
    };
  })()`);

  assert(matchMountedCheck.arenaMounted, 'Match arena (.match-arena-shell) failed to mount');
  assert(matchMountedCheck.controlsMounted, 'Bot controls (#bot-controls) failed to mount');
  assert(matchMountedCheck.hasTurn1, `Status indicator did not show Turno #1 and Brancas (received: "${matchMountedCheck.statusText}")`);
  assert(matchMountedCheck.sqE2HasPiece, 'Square e2 (4,1) does not contain initial White pawn');
  assert(!matchMountedCheck.sqE4HasPiece, 'Square e4 (4,3) must be empty at match start');
  assert(matchMountedCheck.hasN4Label, 'Opponent player card does not display N4 Forte level');
  console.log('✓ [FLOW 2: MATCH START] Verified arena mount, initial board state, Turno #1, and N4 AI opponent card');

  // Flow 3: Human Player Moves e2 -> e4 (Square 4,1 -> 4,3)
  await evaluate(`document.querySelector('[data-testid="square-4,1"]')?.click();`);
  await sleep(200);
  await evaluate(`document.querySelector('[data-testid="square-4,3"]')?.click();`);
  await sleep(500);

  const humanMoveCheck = await evaluate(`(() => {
    const sqE2 = document.querySelector('[data-testid="square-4,1"]');
    const sqE4 = document.querySelector('[data-testid="square-4,3"]');
    const sqE2HasPiece = !!sqE2?.querySelector('[data-testid$="-piece"], .piece-symbol');
    const sqE4HasPiece = !!sqE4?.querySelector('[data-testid$="-piece"], .piece-symbol');
    return { sqE2Empty: !sqE2HasPiece, sqE4HasPiece };
  })()`);

  assert(humanMoveCheck.sqE2Empty, 'Square e2 was not vacated after e2->e4 move');
  assert(humanMoveCheck.sqE4HasPiece, 'Square e4 does not contain White pawn after e2->e4 move');
  console.log('✓ [FLOW 3: HUMAN MOVE EXECUTION] Verified e2 vacated and e4 occupied by White pawn');

  // Flow 4: Bot Deliberation and Autonomous Response (Turn advances to Turn #3)
  console.log('... Awaiting AI opponent deliberation and response move ...');
  let botMoveCompleted = false;
  for (let i = 0; i < 25; i++) {
    await sleep(300);
    const pollState = await evaluate(`(() => {
      const statusText = document.querySelector('.nav-status-pill')?.textContent?.trim() || '';
      const isTurn3 = statusText.includes('Turno #3') && statusText.includes('Brancas');
      return { isTurn3 };
    })()`);
    if (pollState.isTurn3) {
      botMoveCompleted = true;
      break;
    }
  }

  assert(botMoveCompleted, 'Bot failed to deliberate and respond within timeout (Turno #3 not reached)');
  console.log('✓ [FLOW 4: BOT AUTONOMOUS RESPONSE] Bot executed valid reply move and advanced match to Turno #3');

  // Flow 5: Undo (Desfazer) Rolls Back Full Round
  const undoResult = await evaluate(`(() => {
    const undoBtn = document.getElementById('bot-undo-button');
    if (!undoBtn) return { error: 'Undo button #bot-undo-button not found' };
    undoBtn.click();
    return { ok: true };
  })()`);
  assert(undoResult.ok, undoResult.error);
  await sleep(400);

  const undoState = await evaluate(`(() => {
    const statusText = document.querySelector('.nav-status-pill')?.textContent?.trim() || '';
    const hasTurn1 = statusText.includes('Turno #1') && statusText.includes('Brancas');
    const sqE2 = document.querySelector('[data-testid="square-4,1"]');
    const sqE4 = document.querySelector('[data-testid="square-4,3"]');
    const sqE2HasPiece = !!sqE2?.querySelector('[data-testid$="-piece"], .piece-symbol');
    const sqE4HasPiece = !!sqE4?.querySelector('[data-testid$="-piece"], .piece-symbol');
    return { hasTurn1, sqE2Restored: sqE2HasPiece, sqE4Vacated: !sqE4HasPiece, statusText };
  })()`);

  assert(undoState.hasTurn1, `Undo did not restore Turno #1 (status: "${undoState.statusText}")`);
  assert(undoState.sqE2Restored, 'Square e2 did not restore White pawn after Undo');
  assert(undoState.sqE4Vacated, 'Square e4 was not vacated after Undo');
  console.log('✓ [FLOW 5: UNDO RESTORATION] Undo restored match state to Turno #1 and original board positions');

  // Flow 6: Redo (Refazer) Reapplies the Round
  const redoResult = await evaluate(`(() => {
    const redoBtn = document.getElementById('bot-redo-button');
    if (!redoBtn) return { error: 'Redo button #bot-redo-button not found' };
    redoBtn.click();
    return { ok: true };
  })()`);
  assert(redoResult.ok, redoResult.error);
  await sleep(400);

  const redoState = await evaluate(`(() => {
    const statusText = document.querySelector('.nav-status-pill')?.textContent?.trim() || '';
    const hasTurn3 = statusText.includes('Turno #3') && statusText.includes('Brancas');
    const sqE4 = document.querySelector('[data-testid="square-4,3"]');
    const sqE4HasPiece = !!sqE4?.querySelector('[data-testid$="-piece"], .piece-symbol');
    return { hasTurn3, sqE4Restored: sqE4HasPiece, statusText };
  })()`);

  assert(redoState.hasTurn3, `Redo did not advance to Turno #3 (status: "${redoState.statusText}")`);
  assert(redoState.sqE4Restored, 'Square e4 does not contain White pawn after Redo');
  console.log('✓ [FLOW 6: REDO RESTORATION] Redo restored match state to Turno #3 and reapplied move history');

  // Flow 7: Board Flip (Inverter Tabuleiro)
  const initialFlipState = await evaluate(`document.querySelector('[data-testid="square-4,1"]')?.getAttribute('data-square-col')`);
  assert(initialFlipState === '4', `Initial visual column for e2 should be 4, found: ${initialFlipState}`);

  await evaluate(`document.getElementById('bot-flip-board-button')?.click();`);
  await sleep(300);
  const flippedState = await evaluate(`document.querySelector('[data-testid="square-4,1"]')?.getAttribute('data-square-col')`);
  assert(flippedState === '3', `Flipped visual column for e2 should be 3, found: ${flippedState}`);

  // Flip back
  await evaluate(`document.getElementById('bot-flip-board-button')?.click();`);
  await sleep(300);
  const unFlippedState = await evaluate(`document.querySelector('[data-testid="square-4,1"]')?.getAttribute('data-square-col')`);
  assert(unFlippedState === '4', 'Board failed to restore original column orientation after second flip');
  console.log('✓ [FLOW 7: BOARD FLIP] Verified visual coordinate rotation without modifying logical coordinates');

  // Flow 8: Theme Switcher Modal and Dynamic CSS Theme Application
  await evaluate(`document.getElementById('nav-open-theme-customizer')?.click();`);
  await sleep(300);

  const modalOpen = await evaluate(`(() => {
    const ivory = document.getElementById('theme-card-ivory');
    const synth = document.getElementById('theme-card-synthwave');
    const midnight = document.getElementById('theme-card-midnight');
    return !!ivory && !!synth && !!midnight;
  })()`);
  assert(modalOpen, 'Theme customizer modal failed to render theme cards');

  await evaluate(`document.getElementById('theme-card-ivory')?.click();`);
  assert(await evaluate(`document.documentElement.classList.contains('theme-ivory')`), 'Class .theme-ivory was not applied');

  await evaluate(`document.getElementById('theme-card-synthwave')?.click();`);
  assert(await evaluate(`document.documentElement.classList.contains('theme-synthwave')`), 'Class .theme-synthwave was not applied');

  await evaluate(`document.getElementById('theme-card-midnight')?.click();`);
  assert(await evaluate(`document.documentElement.classList.contains('theme-midnight')`), 'Class .theme-midnight was not restored');

  await evaluate(`document.getElementById('close-theme-customizer-btn')?.click();`);
  await sleep(250);
  console.log('✓ [FLOW 8: THEME SWITCHER] Verified theme switching across ivory, synthwave, and midnight with zero regressions');

  // Flow 9: Reset Match (Reiniciar Partida)
  await evaluate(`document.getElementById('bot-reset-button')?.click();`);
  await sleep(400);

  const resetState = await evaluate(`(() => {
    const statusText = document.querySelector('.nav-status-pill')?.textContent?.trim() || '';
    const hasTurn1 = statusText.includes('Turno #1') && statusText.includes('Brancas');
    const sqE2 = document.querySelector('[data-testid="square-4,1"]');
    const sqE4 = document.querySelector('[data-testid="square-4,3"]');
    const sqE2HasPiece = !!sqE2?.querySelector('[data-testid$="-piece"], .piece-symbol');
    const sqE4HasPiece = !!sqE4?.querySelector('[data-testid$="-piece"], .piece-symbol');
    return { hasTurn1, sqE2HasPiece, sqE4Empty: !sqE4HasPiece };
  })()`);

  assert(resetState.hasTurn1, 'Reset button did not reset turn to Turno #1');
  assert(resetState.sqE2HasPiece, 'Reset did not restore initial White pawn on e2');
  assert(resetState.sqE4Empty, 'Reset did not vacate square e4');
  console.log('✓ [FLOW 9: RESET MATCH] Verified initial state clean restoration');

  // Flow 10: Fallback SVG Unique ID or 3D Showcase Canvas Mount
  await evaluate(`document.getElementById('nav-btn-hub')?.click();`);
  await sleep(350);
  const showcaseCheck = await evaluate(`(() => {
    const svg = document.querySelector('[data-testid="chess-piece-fallback-svg"]');
    if (svg) {
      const svgId = svg.getAttribute('id') || '';
      const hasUniqueSvgId = svgId.startsWith('chess-piece-fallback-svg-') && svgId.length > 26;
      const grad = svg.querySelector('linearGradient');
      const gradId = grad?.getAttribute('id') || '';
      const hasUniqueGradId = gradId.startsWith('knight-grad-') && gradId.length > 15;
      const rectFill = svg.querySelector('rect')?.getAttribute('fill') || '';
      const referencesGrad = rectFill === 'url(#' + gradId + ')';
      return { mode: '2D_FALLBACK', hasUniqueSvgId, hasUniqueGradId, referencesGrad };
    }

    const showcase3D = document.getElementById('chess-piece-showcase');
    if (showcase3D) {
      const canvas = showcase3D.querySelector('canvas');
      const status = showcase3D.getAttribute('data-webgl-status');
      return {
        mode: '3D_SHOWCASE',
        isMounted: true,
        hasCanvas: !!canvas,
        status: status || 'available',
      };
    }

    return { error: 'Neither 2D fallback SVG nor 3D showcase canvas found in Hub' };
  })()`);

  assert(!showcaseCheck.error, showcaseCheck.error);
  if (showcaseCheck.mode === '2D_FALLBACK') {
    assert(showcaseCheck.hasUniqueSvgId, 'Fallback SVG root does not use an instance-unique ID');
    assert(showcaseCheck.hasUniqueGradId, 'Fallback SVG linearGradient does not use an instance-unique ID');
    assert(showcaseCheck.referencesGrad, 'Fallback SVG elements do not reference the unique local gradient');
    console.log('✓ [FLOW 10: 2D FALLBACK SVG] Verified collision-free root SVG id and linearGradient references');
  } else {
    assert(showcaseCheck.isMounted, '3D showcase is not mounted');
    assert(showcaseCheck.hasCanvas, '3D showcase canvas is not mounted');
    console.log(`✓ [FLOW 10: 3D SHOWCASE] Verified active 3D Three.js canvas mount (status=${showcaseCheck.status})`);
  }

  // =========================================================================
  // Flow 11: Real In-Browser Check Constraint & 3D Interactive Validation
  // =========================================================================
  console.log('--- 3. CHECK CONSTRAINT & 3D HARDENING IN-BROWSER ACCEPTANCE ---');

  // 1. Navigate to game arena
  await evaluate(`document.getElementById('nav-btn-game')?.click();`);
  await sleep(400);

  // 2. Disable bot so we can execute two-player moves deterministically in browser
  await evaluate(`(() => {
    const toggle = document.getElementById('bot-toggle-checkbox');
    if (toggle && toggle.checked) toggle.click();
  })()`);
  await sleep(300);

  // 3. Reset match to initial turn 1
  await evaluate(`document.getElementById('bot-reset-button')?.click();`);
  await sleep(400);

  // 4. Execute moves 1. e4 e6 2. f4 Qh4+
  // Move 1: White e2 (4,1) -> e4 (4,3)
  await evaluate(`document.querySelector('[data-testid="square-4,1"]')?.click();`);
  await sleep(200);
  await evaluate(`document.querySelector('[data-testid="square-4,3"]')?.click();`);
  await sleep(300);

  // Move 2: Black e7 (4,6) -> e6 (4,5)
  await evaluate(`document.querySelector('[data-testid="square-4,6"]')?.click();`);
  await sleep(200);
  await evaluate(`document.querySelector('[data-testid="square-4,5"]')?.click();`);
  await sleep(300);

  // Move 3: White f2 (5,1) -> f4 (5,3)
  await evaluate(`document.querySelector('[data-testid="square-5,1"]')?.click();`);
  await sleep(200);
  await evaluate(`document.querySelector('[data-testid="square-5,3"]')?.click();`);
  await sleep(300);

  // Move 4: Black d8 (3,7) -> h4 (7,3) [Check to White King at e1!]
  await evaluate(`document.querySelector('[data-testid="square-3,7"]')?.click();`);
  await sleep(200);
  await evaluate(`document.querySelector('[data-testid="square-7,3"]')?.click();`);
  await sleep(400);

  // 5. Verify Check state in 2D mode (PlayerCard displays "EM XEQUE" status badge):
  const checkState2D = await evaluate(`(() => {
    const playerCardCheck = document.querySelector('[data-testid="player-in-check-P1"]');
    const hasCheckBadge = playerCardCheck?.textContent?.includes('EM XEQUE');
    const statusText = document.querySelector('.nav-status-pill')?.textContent?.trim() || '';
    const isWhiteTurn = statusText.includes('Brancas');
    return { hasCheckBadge, isWhiteTurn };
  })()`);
  assert(checkState2D.hasCheckBadge, 'White PlayerCard missing "⚠️ EM XEQUE" status pill');
  assert(checkState2D.isWhiteTurn, 'Active turn must be White (P1) under check');
  console.log('✓ [FLOW 11: 2D CHECK VISUALS] Verified PlayerCard "EM XEQUE" status pill during active check');

  // 6. Attempt illegal move with helpless pawn a2 (0,1):
  await evaluate(`document.querySelector('[data-testid="square-0,1"]')?.click();`);
  await sleep(250);

  const bannerCheck = await evaluate(`(() => {
    const banner = document.querySelector('[data-testid="check-constraint-banner"]');
    const role = banner?.getAttribute('role');
    const ariaLive = banner?.getAttribute('aria-live');
    const text = banner?.textContent || '';
    const pawnSquare = document.querySelector('[data-testid="square-0,1"]');
    const isPawnRed = pawnSquare?.classList.contains('board-square--check-source-error');
    const kingSquare = document.querySelector('[data-testid="square-4,0"]');
    const isKingRed = kingSquare?.classList.contains('board-square--check-king-error');
    return {
      hasBanner: !!banner,
      role,
      ariaLive,
      hasCheckText: text.includes('seu rei está em xeque') && text.includes('REI EM XEQUE'),
      isPawnRed,
      isKingRed,
    };
  })()`);
  assert(bannerCheck.hasBanner, 'Check constraint banner failed to appear when clicking helpless piece');
  assert(bannerCheck.role === 'status', `Check constraint banner must have role="status", found: ${bannerCheck.role}`);
  assert(bannerCheck.ariaLive === 'polite', `Check constraint banner must have aria-live="polite", found: ${bannerCheck.ariaLive}`);
  assert(bannerCheck.hasCheckText, 'Check constraint banner missing explanatory message');
  assert(bannerCheck.isPawnRed, 'Helpless pawn square a2 (0,1) missing red highlight class board-square--check-source-error');
  assert(bannerCheck.isKingRed, 'White King square e1 (4,0) missing red highlight class board-square--check-king-error');
  console.log('✓ [FLOW 11: 2D CHECK FEEDBACK BANNER] Verified role="status", aria-live="polite", King red error, and source piece error highlight');

  // 7. Switch to 3D WebGL mode in real Chromium WHILE IN ACTIVE CHECK
  const clickResult = await evaluate(`(() => {
    const btn = document.getElementById('board-view-mode-3d');
    if (!btn) return { error: 'Button #board-view-mode-3d not found in DOM' };
    btn.click();
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return { success: true };
  })()`);
  assert(!clickResult?.error, clickResult?.error);

  let webglMetrics = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(200);
    webglMetrics = await evaluate(`(() => {
      const metrics = window.__CHESS_3D__?.getRenderMetrics();
      const container3D = document.querySelector('[data-testid="chess-board-3d-container"]');
      const canvas = container3D?.querySelector('canvas');
      if (!canvas || !metrics) {
        return { retry: true, hasContainer: !!container3D, hasCanvas: !!canvas };
      }
      return {
        hasCanvas: true,
        width: metrics.width,
        height: metrics.height,
        clientWidth: metrics.clientWidth,
        clientHeight: metrics.clientHeight,
        cameraFov: metrics.cameraFov,
        isContextLost: metrics.isContextLost,
      };
    })()`);
    if (webglMetrics?.hasCanvas && webglMetrics.width > 300 && webglMetrics.height > 150) break;
  }

  assert(webglMetrics?.hasCanvas, `3D WebGL <canvas> not mounted in arena (state: ${JSON.stringify(webglMetrics)})`);
  assert(!webglMetrics.isContextLost, 'Real WebGL context in Chromium is invalid or lost');
  assert(webglMetrics.clientWidth >= 280, `Canvas clientWidth too small (${webglMetrics.clientWidth}px)`);
  assert(webglMetrics.clientHeight >= 280, `Canvas clientHeight too small (${webglMetrics.clientHeight}px)`);
  assert(webglMetrics.width > 300 && webglMetrics.height > 150, `WebGL backing buffer running at uninitialized 300x150 default (${webglMetrics.width}x${webglMetrics.height})`);
  assert(webglMetrics.cameraFov === 45, `Unexpected camera FOV: ${webglMetrics.cameraFov}`);
  console.log(`✓ [FLOW 11: REAL WEBGL 3D CANVAS & SIZING] Backing buffer scaled (${webglMetrics.width}x${webglMetrics.height}), client: ${webglMetrics.clientWidth}x${webglMetrics.clientHeight}px, context=active`);

  // 8. Capture Visual Screenshots of 3D Scene under Check across 3 resolutions (1440, 768, 390 px)
  const evidenceDir = resolve('reports/design/evidence');
  const artifactDir = resolve('C:/Users/Paulo/.gemini/antigravity/brain/3da1db70-7e29-416a-80f9-9127ca84088c');

  const capture3DScreen = async (filename) => {
    const res = await sendCdp('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(join(evidenceDir, filename), buffer);
    if (existsSync(artifactDir)) {
      writeFileSync(join(artifactDir, filename), buffer);
    }
  };

  // 1440px Desktop Capture
  await capture3DScreen('polish_11_spec07_arena_3d_1440.png');

  // 768px Tablet Capture
  await setViewport(768, 1024);
  await sleep(350);
  await capture3DScreen('polish_12_spec07_arena_3d_768.png');

  // 390px Mobile Capture
  await setViewport(390, 844, true);
  await sleep(350);
  await capture3DScreen('polish_13_spec07_arena_3d_390.png');

  // Restore 1440px Viewport
  await setViewport(1440, 900);
  await sleep(350);
  console.log('✓ [FLOW 11: 3D SCREENSHOT EVIDENCE] Captured arena in check across 1440, 768, and 390 px');

  // 9. Real 3D Raycasting Interaction: Resolve check in 3D WebGL (g2 -> g3)
  const raycastClick = async (coord) => {
    const res = await evaluate(`(() => {
      const canvas = document.querySelector('[data-testid="chess-board-3d-container"] canvas');
      const pt = window.__CHESS_3D__?.projectCoordToScreen('${coord}');
      if (!canvas || !pt) return { error: 'Failed to project 3D coordinate ${coord}' };

      // Prevent unhandled synthetic pointer capture error in Drei OrbitControls
      if (!canvas.__pointer_capture_guarded__) {
        canvas.__pointer_capture_guarded__ = true;
        const origRelease = canvas.releasePointerCapture?.bind(canvas);
        canvas.releasePointerCapture = function(id) {
          try {
            if (this.hasPointerCapture && this.hasPointerCapture(id)) {
              origRelease?.(id);
            }
          } catch {
            // ignore
          }
        };
      }

      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: pt.clientX,
        clientY: pt.clientY,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerType: 'mouse',
      }));
      canvas.dispatchEvent(new PointerEvent('pointerup', {
        clientX: pt.clientX,
        clientY: pt.clientY,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerType: 'mouse',
      }));
      return { success: true, pt };
    })()`);
    assert(!res?.error, res?.error);
  };

  // Select White pawn at g2 (6,1) via 3D raycast
  await raycastClick('6,1');
  await sleep(250);

  // Click target square g3 (6,2) via 3D raycast to resolve check
  await raycastClick('6,2');
  await sleep(400);

  const checkResolvedIn3D = await evaluate(`(() => {
    const banner = document.querySelector('[data-testid="check-constraint-banner"]');
    const statusText = document.querySelector('.nav-status-pill')?.textContent?.trim() || '';
    const isBlackTurn = statusText.includes('Pretas');
    return { bannerDismissed: !banner, isBlackTurn };
  })()`);
  assert(checkResolvedIn3D.bannerDismissed, 'Check constraint banner not dismissed after 3D raycast resolution move');
  assert(checkResolvedIn3D.isBlackTurn, 'Turn failed to advance to Black after 3D move');
  console.log('✓ [FLOW 11: 3D RAYCASTING CHECK RESOLUTION] Real raycast pointer interaction resolved check and advanced turn in 3D');

  // 10. Execute second 3D raycasting move: Black pawn d7 (3,6) -> d5 (3,4)
  await raycastClick('3,6');
  await sleep(250);
  await raycastClick('3,4');
  await sleep(400);

  const blackMoveIn3D = await evaluate(`(() => {
    const statusText = document.querySelector('.nav-status-pill')?.textContent?.trim() || '';
    const isWhiteTurn = statusText.includes('Brancas');
    return { isWhiteTurn };
  })()`);
  assert(blackMoveIn3D.isWhiteTurn, 'Turn failed to advance to White after Black 3D raycast move');
  console.log('✓ [FLOW 11: 3D RAYCASTING MULTI-MOVE] Real raycast interaction executed second move (d7->d5) in 3D WebGL');

  // 11. Switch back to 2D: verify lossless state preservation
  await evaluate(`document.getElementById('board-view-mode-2d')?.click();`);
  await sleep(350);

  const statePreserved = await evaluate(`(() => {
    const board2D = document.querySelector('[data-testid="chess-board"]');
    const sqG3 = document.querySelector('[data-testid="square-6,2"]');
    const sqD5 = document.querySelector('[data-testid="square-3,4"]');
    const hasPawnOnG3 = !!sqG3?.querySelector('[data-testid$="-piece"], .piece-symbol');
    const hasPawnOnD5 = !!sqD5?.querySelector('[data-testid$="-piece"], .piece-symbol');
    return { hasBoard2D: !!board2D, hasPawnOnG3, hasPawnOnD5 };
  })()`);
  assert(statePreserved.hasBoard2D, 'Failed to revert to 2D board');
  assert(statePreserved.hasPawnOnG3, 'State lost during 3D -> 2D transition: White pawn not on g3');
  assert(statePreserved.hasPawnOnD5, 'State lost during 3D -> 2D transition: Black pawn not on d5');
  console.log('✓ [FLOW 11: 3D <-> 2D STATE PRESERVATION] Verified lossless state retention of 3D moves upon switching back to 2D');

  console.log('\n=============================================================================');
  console.log('✓ [ACCEPTANCE VERIFICATION] ALL 11 MANDATORY BEHAVIORAL & RESPONSIVE SUITES PASSED STRICTLY');
  console.log('=============================================================================\n');

  ws.close();
} finally {
  chromeProc.kill();
  await viteServer.close();
}
