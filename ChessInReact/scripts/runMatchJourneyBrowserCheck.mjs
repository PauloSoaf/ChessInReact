// Real-browser journey for PATCH-15/16/16A/17: human Black against the level 5 bot, in 2D and 3D,
// with reload and browser restart, replay of live and finished matches, spells and saved matches.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

const browser = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
if (!browser) throw new Error('Chromium required for the match journey check.');
const directory = resolve(process.env.JOURNEY_EVIDENCE_DIR ?? join(tmpdir(), 'chessinreact-journey'));
mkdirSync(directory, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'chessinreact-profile-'));
const port = 5900 + Math.floor(Math.random() * 90);
const server = await createServer({ server: { port, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const steps = [];
let chrome, ws, sequence = 0;

// Counts engine requests: every level 5 decision goes through a Worker message.
const COUNTER = `(() => { const Real = window.Worker; window.__engineRequests = 0;
  window.Worker = class extends Real { postMessage(message, ...rest) { if (message?.request?.matchId) window.__engineRequests++; return super.postMessage(message, ...rest); } }; })()`;

const send = (method, params = {}) => new Promise((done, fail) => {
  const id = ++sequence;
  const timer = setTimeout(() => fail(new Error(`CDP timeout: ${method}`)), 45000);
  const listener = (event) => {
    const reply = JSON.parse(event.data);
    if (reply.id !== id) return;
    clearTimeout(timer); ws.removeEventListener('message', listener);
    if (reply.error) fail(new Error(JSON.stringify(reply.error))); else done(reply.result);
  };
  ws.addEventListener('message', listener);
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'evaluation failed');
  return result.result?.value;
};
const assert = (value, message) => { if (!value) throw new Error(message); };
const ok = (message) => { steps.push(message); console.log('✓', message); };
const waitFor = async (expression, label, timeout = 20000) => {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await evaluate(expression);
    if (value) return value;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${label}`);
    await sleep(120);
  }
};
const shot = async (name) => {
  const image = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(directory, `${name}.png`), Buffer.from(image.data, 'base64'));
};

async function openBrowser(hash) {
  const cdp = 9400 + Math.floor(Math.random() * 300);
  chrome = spawn(browser, ['--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--enable-webgl',
    '--ignore-gpu-blocklist', `--user-data-dir=${profile}`, `--remote-debugging-port=${cdp}`, 'about:blank'], { stdio: 'ignore' });
  let url;
  for (let i = 0; i < 80 && !url; i++) {
    await sleep(250);
    try { url = (await (await fetch(`http://127.0.0.1:${cdp}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* starting */ }
  }
  if (!url) throw new Error('Browser CDP endpoint unavailable.');
  ws = new WebSocket(url);
  await new Promise((done, fail) => { ws.onopen = done; ws.onerror = fail; });
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push(message.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300));
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(String(message.params.exceptionDetails.exception?.description).slice(0, 300));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: COUNTER });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/${hash}` });
  await ready();
}
const ready = () => waitFor('!!window.__CHESS_APP__?.getMatchController && !document.querySelector(\'[data-testid="boot-screen"]\')', 'application');
const closeBrowser = async () => {
  try { await send('Browser.close'); } catch { /* already closing */ }
  ws?.close();
  await new Promise((done) => { if (chrome.exitCode !== null) done(); else { chrome.once('exit', done); setTimeout(() => { chrome.kill(); done(); }, 5000); } });
};
const reload = async () => { await send('Page.reload'); await sleep(600); await ready(); };

const click = async (selector) => {
  const found = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
  assert(found, `Missing element ${selector}`);
};
const key = (value) => evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(value)}, bubbles: true }))`);

const STATE = `(async () => {
  const { gameStore } = await import('/src/core/state/gameStore.ts');
  const c = window.__CHESS_APP__.getMatchController();
  const d = gameStore.getState().domain;
  const strip = (p) => { const el = document.querySelector('[data-testid="player-strip-' + p + '"]'); return el && el.dataset.playerId + ':' + el.dataset.seat; };
  const top = (id) => document.querySelector('[data-testid="square-' + id + '"]')?.getBoundingClientRect().top;
  return { matchId: d.matchId, player: d.activePlayer, over: d.isGameOver, winner: d.winnerId,
    moves: c.getMoveHistory().map((m) => m.san), occupancy: JSON.stringify(Object.entries(d.occupancy).sort()),
    spells: JSON.stringify(c.getSnapshot().officialSpellState), cast: c.getSnapshot().hasCastSpellThisTurn,
    mode: c.getInteractionMode(), requests: window.__engineRequests, top: strip('top'), bottom: strip('bottom'),
    blackAtBottom: top('4,7') > top('4,0'), save: document.querySelector('[data-testid="save-status"]')?.dataset.status,
    user: localStorage.getItem('chessinreact:guest-identity') && JSON.parse(localStorage.getItem('chessinreact:guest-identity')).userId };
})()`;
const state = () => evaluate(STATE);
// The accessible label of each square names its piece, whatever animation is running.
const BOARD_2D = `JSON.stringify([...document.querySelectorAll('[data-testid^="square-"]')].map((el) => el.dataset.testid + ':' + (el.getAttribute('aria-label') ?? '')).sort())`;

/** A legal move for the side on turn, from the authoritative rules. */
const legalMove = (prefer) => evaluate(`(async () => {
  const { gameStore } = await import('/src/core/state/gameStore.ts');
  const { RulesEngine } = await import('/src/engine/rules/RulesEngine.ts');
  const c = window.__CHESS_APP__.getMatchController();
  const moves = RulesEngine.getLegalMoves(gameStore.getState().domain, c.getTopology()).filter((m) => !m.isPromotion);
  const wanted = ${JSON.stringify(prefer ?? [])};
  const chosen = wanted.map((w) => moves.find((m) => m.from === w[0] && m.to === w[1])).find(Boolean) ?? moves[0];
  return chosen && [chosen.from, chosen.to];
})()`);

const humanCanMove = () => waitFor(`(async () => {
  const c = window.__CHESS_APP__.getMatchController(); const s = c.getSnapshot();
  return !s.isThinking && c.getSlotForPlayer(s.activePlayer).role === 'HUMAN_LOCAL' && !s.isEnded;
})()`, 'human turn', 25000);

async function move2D(prefer) {
  await humanCanMove();
  const [from, to] = await legalMove(prefer);
  const before = (await state()).moves.length;
  await click(`[data-testid="square-${from}"]`);
  await sleep(120);
  await click(`[data-testid="square-${to}"]`);
  await waitFor(`window.__CHESS_APP__.getMatchController().getMoveHistory().length > ${before}`, `human move ${from}>${to}`, 5000);
  return [from, to];
}

const raycast = async (coord) => {
  const result = await evaluate(`(() => {
    const canvas = document.querySelector('[data-testid="chess-board-3d-container"] canvas');
    const point = window.__CHESS_3D__?.projectCoordToScreen('${coord}');
    if (!canvas || !point) return false;
    if (!canvas.__guarded) { canvas.__guarded = true; const release = canvas.releasePointerCapture?.bind(canvas);
      canvas.releasePointerCapture = (id) => { try { if (canvas.hasPointerCapture?.(id)) release?.(id); } catch { /* synthetic pointer */ } }; }
    for (const type of ['pointerdown', 'pointerup']) canvas.dispatchEvent(new PointerEvent(type,
      { clientX: point.clientX, clientY: point.clientY, pointerId: 1, bubbles: true, cancelable: true, button: 0, pointerType: 'mouse' }));
    return true;
  })()`);
  assert(result, `Could not project ${coord} on the 3D board`);
  await sleep(350);
};

try {
  // ---------------------------------------------------------------- black against level 5, 2D
  await openBrowser('#hub');
  const firstUser = await waitFor(`(JSON.parse(localStorage.getItem('chessinreact:guest-identity') ?? 'null'))?.userId`, 'guest identity');
  ok('guest identity created automatically');
  await click('#hub-difficulty-btn-5');
  await click('[data-testid="hub-color-black"]');
  await click('#hub-hero-btn-play-bot');
  await waitFor(`!!document.querySelector('[data-testid="player-strip-bottom"]')`, 'match arena');
  let s = await state();
  assert(s.bottom === 'P2:human' && s.top === 'P1:bot', `Wrong strips: ${s.top} / ${s.bottom}`);
  assert(s.blackAtBottom, 'Black must start at the bottom.');
  assert(await evaluate(`document.body.innerText.includes('Oponente IA (Brancas)') && !document.body.innerText.includes('Oponente IA (Pretas)')`), 'The sidebar must name the colour the bot plays.');
  await waitFor(`window.__CHESS_APP__.getMatchController().getMoveHistory().length === 1`, 'bot opening');
  s = await state();
  assert(s.player === 'P2' && s.requests === 1, `Expected one engine request and Black to move, got ${s.requests}`);
  ok(`bot opened with ${s.moves[0]} without any click; black at the bottom; human strip is Black`);

  await move2D([['4,6', '4,4'], ['3,6', '3,4']]);
  await waitFor(`window.__CHESS_APP__.getMatchController().getMoveHistory().length === 3`, 'bot reply');
  await sleep(1500);
  s = await state();
  assert(s.moves.length === 3 && s.requests === 2, `Duplicated decision: ${s.moves.length} moves, ${s.requests} requests`);
  ok(`black human played ${s.moves[1]}; bot answered ${s.moves[2]}; no duplicate`);

  await key('f');
  await sleep(300);
  s = await state();
  assert(!s.blackAtBottom && s.bottom === 'P1:bot' && s.top === 'P2:human', 'Flip must swap only the view and the panels.');
  await move2D();
  await waitFor(`window.__CHESS_APP__.getMatchController().getMoveHistory().length === 5`, 'bot reply after flip');
  await key('f');
  await sleep(300);
  s = await state();
  assert(s.blackAtBottom && s.bottom === 'P2:human', 'Second flip restores the black view.');
  ok('flip changes only the perspective; black keeps playing from either side');
  await shot('01-black-2d');

  // ---------------------------------------------------------------- undo / redo
  const beforeUndo = await state();
  await key('z');
  await sleep(300);
  s = await state();
  assert(s.player === 'P2' && s.moves.length === beforeUndo.moves.length - 2, `Undo must return to the black turn: ${s.moves.length}`);
  await key('y');
  await sleep(300);
  s = await state();
  assert(s.player === 'P2' && s.occupancy === beforeUndo.occupancy, 'Redo must restore the same position.');
  ok('undo and redo return to the black human turn');

  // ---------------------------------------------------------------- reload and browser restart
  await waitFor(`document.querySelector('[data-testid="save-status"]')?.dataset.status === 'LOCAL_SAVED'`, 'local save');
  const saved = await state();
  await reload();
  await waitFor(`!!document.querySelector('[data-testid="player-strip-bottom"]')`, 'restored arena');
  await sleep(2000);
  s = await state();
  assert(s.matchId === saved.matchId && s.occupancy === saved.occupancy && JSON.stringify(s.moves) === JSON.stringify(saved.moves), 'Reload changed the match.');
  assert(s.bottom === 'P2:human' && s.blackAtBottom && s.player === 'P2' && s.requests === 0, 'Reload must give Black back to the human without running the bot.');
  assert(s.user === firstUser, 'Guest identity changed after reload.');
  ok(`reload restored ${s.moves.length} half-moves, the black seat and the guest identity; no bot move`);
  // ---------------------------------------------------------------- 3D
  await click('#board-view-mode-3d');
  await waitFor(`!!window.__CHESS_3D__?.projectCoordToScreen && !!document.querySelector('[data-testid="chess-board-3d-container"] canvas')`, '3D board', 30000);
  await sleep(2500);
  await humanCanMove();
  const [from3, to3] = await legalMove([['1,7', '2,5'], ['6,7', '5,5'], ['0,6', '0,5'], ['7,6', '7,5']]);
  const before3d = (await state()).moves.length;
  await raycast(from3);
  await raycast(to3);
  await waitFor(`window.__CHESS_APP__.getMatchController().getMoveHistory().length >= ${before3d + 1}`, `3D black move ${from3}>${to3}`, 6000);
  await waitFor(`window.__CHESS_APP__.getMatchController().getMoveHistory().length === ${before3d + 2}`, '3D bot reply');
  s = await state();
  ok(`3D raycast moved a black piece (${s.moves[before3d]}); bot replied ${s.moves[before3d + 1]}`);
  await shot('02-black-3d');
  await click('[data-testid="move-ply-1"]');
  await sleep(900);
  assert((await state()).occupancy === s.occupancy, '3D replay must not touch the live game.');
  await shot('03-replay-3d');
  await click('[data-testid="btn-replay-exit"]');
  await click('#board-view-mode-2d');
  await sleep(500);

  // ---------------------------------------------------------------- live replay, then finished match
  const live = await state();
  const liveBoard = await evaluate(BOARD_2D);
  await click('[data-testid="move-ply-1"]');
  await sleep(500);
  const board1 = await evaluate(BOARD_2D);
  await click('[data-testid="move-ply-2"]');
  await waitFor(`!!document.querySelector('[data-testid="replay-sliding-piece"]')`, 'replay animation', 2000);
  await sleep(500);
  const board2 = await evaluate(BOARD_2D);
  assert(board1 !== board2 && board2 !== liveBoard, 'White and black cells must show different positions.');
  s = await state();
  assert(s.mode === 'REPLAY' && s.occupancy === live.occupancy && s.moves.length === live.moves.length && s.requests === live.requests, 'Live replay modified the match.');
  await key('Home'); await sleep(300); await key('ArrowRight'); await sleep(500);
  assert((await evaluate(BOARD_2D)) === board1, 'Keyboard navigation must reach the same position.');
  await key('End'); await sleep(500);
  await click('[data-testid="btn-replay-exit"]');
  await sleep(400);
  assert((await evaluate(BOARD_2D)) === liveBoard, 'Back to live must show the live position.');
  ok('live replay: separate positions per ply, animation, keyboard; the live game was untouched');

  await humanCanMove();
  await click('#bot-resign-button');
  await sleep(500);
  const ended = await state();
  assert(ended.over && ended.winner === 'P1', `Black resigning must give White the win, got ${ended.winner}`);
  await click('#victory-btn-close').catch(() => key('Escape'));
  await evaluate(`[...document.querySelectorAll('button')].find((b) => /fechar/i.test(b.getAttribute('aria-label') ?? b.textContent))?.click()`);
  await sleep(400);
  for (const ply of [5, ended.moves.length, 1, 3]) { await click(`[data-testid="move-ply-${ply}"]`); await sleep(500); }
  await click('#board-view-mode-3d'); await sleep(1500); await click('#board-view-mode-2d'); await sleep(500);
  await click('[data-testid="btn-controls-game-review"]'); await sleep(700);
  const reviewText = await evaluate(`document.body.innerText.includes('Você (Pretas)') || document.body.innerText.includes('Bot IA (Mestre (N5))')`);
  await key('Escape');
  await evaluate(`[...document.querySelectorAll('button')].find((b) => /fechar/i.test(b.getAttribute('aria-label') ?? b.textContent))?.click()`);
  await sleep(3500);
  s = await state();
  assert(s.requests === ended.requests && s.moves.length === ended.moves.length && s.over && s.winner === 'P1' &&
    s.occupancy === ended.occupancy && s.mode === 'POST_GAME_REVIEW', 'A finished match changed during the review.');
  ok(`finished match stayed finished through replay, 2D/3D and Game Review (${s.requests} engine requests, unchanged)${reviewText ? '; review names the right seats' : ''}`);
  await reload(); await sleep(2500);
  s = await state();
  assert(s.over && s.winner === 'P1' && s.requests === 0 && s.moves.length === ended.moves.length, 'Reloading a finished match woke the bot.');
  ok('reload of a finished match: result kept, no bot request');

  // ---------------------------------------------------------------- Spell Chess as black, reload mid-turn
  await evaluate(`(async () => {
    const { MatchConfigurationManager: M } = await import('/src/matchmaking/config/MatchConfigurationManager.ts');
    const { seatHuman } = await import('/src/matchmaking/config/participants.ts');
    window.__CHESS_APP__.launchMatch(seatHuman(M.createDefaultMatch('SPELL_CHESS_KING_CAPTURE_ONLY', 2), 'P2', 5));
  })()`);
  await waitFor(`window.__CHESS_APP__.getMatchController().getMoveHistory().length === 1`, 'spell bot opening');
  await humanCanMove();
  s = await state();
  assert(s.blackAtBottom && s.bottom === 'P2:human', 'Spell Chess as Black must start flipped.');
  assert(await evaluate(`!!document.querySelector('[data-testid="player-strip-bottom"] [data-testid="official-spell-bar"]')`), 'The interactive deck must be on the black panel.');
  await click('[data-testid="player-strip-bottom"] [data-testid="btn-cast-freeze"]');
  await sleep(200);
  await click('[data-testid="square-3,0"]');
  await waitFor(`window.__CHESS_APP__.getMatchController().getSnapshot().hasCastSpellThisTurn`, 'black Freeze', 4000);
  await waitFor(`document.querySelector('[data-testid="save-status"]')?.dataset.status === 'LOCAL_SAVED'`, 'spell saved');
  const midTurn = await state();
  await reload(); await sleep(2000);
  s = await state();
  assert(s.cast && s.spells === midTurn.spells && s.occupancy === midTurn.occupancy && s.player === 'P2' && s.requests === 0,
    'Reload between the Freeze and the move lost spell state.');
  ok('reload between Freeze and the mandatory move restored charges, cooldown and the pending move');
  await move2D();
  await waitFor(`window.__CHESS_APP__.getMatchController().getMoveHistory().length >= 3`, 'spell bot reply');
  await sleep(600);
  s = await state();
  if (!s.over) {
    await move2D();
    await sleep(500);
  }
  await shot('04-spell-black');
  await click('[data-testid="move-ply-2"]');
  await waitFor(`/Freeze\\(d1\\)/.test(document.querySelector('[data-testid="replay-spell"]')?.textContent ?? '')`, 'spell shown in replay', 3000);
  await sleep(1200);
  await shot('05-spell-replay');
  await click('[data-testid="btn-replay-exit"]');
  ok('the replay shows the Freeze cast before the black move');

  // ---------------------------------------------------------------- bot against bot
  await evaluate(`(async () => {
    const { MatchConfigurationManager: M } = await import('/src/matchmaking/config/MatchConfigurationManager.ts');
    let config = M.createDefaultMatch('standard', 2);
    config = M.updateSlotRole(config, 0, 'AI_BOT');
    config = M.updateBotDifficulty(M.updateBotDifficulty(config, 0, 5), 1, 5);
    window.__CHESS_APP__.launchMatch(config);
  })()`);
  await waitFor(`window.__CHESS_APP__.getMatchController().getMoveHistory().length >= 4`, 'bot duel', 40000);
  await click('[data-testid="square-4,1"]');
  await evaluate(`window.__CHESS_APP__.getMatchController().declareDraw()`);
  await sleep(600);
  const duel = await state();
  await evaluate(`[...document.querySelectorAll('button')].find((b) => /fechar/i.test(b.getAttribute('aria-label') ?? b.textContent))?.click()`);
  for (const ply of [1, 3, 2, 4]) { await click(`[data-testid="move-ply-${ply}"]`); await sleep(500); }
  await key('Home'); await sleep(3500);
  s = await state();
  assert(s.requests === duel.requests && s.moves.length === duel.moves.length && s.over && s.mode === 'POST_GAME_REVIEW', 'The bots moved during the review of a finished duel.');
  ok(`bot against bot: ${s.moves.length} half-moves reviewed, no new engine request`);

  // ---------------------------------------------------------------- saved matches
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/#hub` });
  await sleep(1200); await ready();
  const rows = await waitFor(`document.querySelectorAll('[data-testid="my-match-row"]').length >= 3 && document.querySelectorAll('[data-testid="my-match-row"]').length`, 'saved matches');
  await shot('06-my-matches');
  await evaluate(`(() => { const row = [...document.querySelectorAll('[data-testid="my-match-row"]')].find((r) => r.innerText.includes('você de pretas') && r.innerText.includes('standard'));
    [...row.querySelectorAll('button')].find((b) => b.textContent === 'Ver replay').click(); })()`);
  await waitFor(`!!document.querySelector('[data-testid="replay-status"]')`, 'replay from history', 8000);
  s = await state();
  assert(s.over && s.winner === 'P1' && s.requests === (await state()).requests, 'Saved match opened with a different result.');
  ok(`"Minhas partidas" lists ${rows} matches and reopens one in replay with its result`);

  // ---------------------------------------------------------------- browser restart (2D)
  // 3D stays before this point: relaunched headless Chrome hangs natively on WebGL, even on a new match.
  await evaluate(`window.__CHESS_APP__.selectNavDestination('VARIANTS')`);
  await click('#board-view-mode-2d').catch(() => undefined);
  await evaluate(`(async () => {
    const { MatchConfigurationManager: M } = await import('/src/matchmaking/config/MatchConfigurationManager.ts');
    const { seatHuman } = await import('/src/matchmaking/config/participants.ts');
    window.__CHESS_APP__.launchMatch(seatHuman(M.createDefaultMatch('standard', 2), 'P2', 5));
  })()`);
  await sleep(600);
  await click('#board-view-mode-2d');
  await waitFor(`window.__CHESS_APP__.getMatchController().getMoveHistory().length === 1`, 'opening before restart');
  await move2D();
  await waitFor(`window.__CHESS_APP__.getMatchController().getMoveHistory().length === 3`, 'reply before restart');
  await waitFor(`document.querySelector('[data-testid="save-status"]')?.dataset.status === 'LOCAL_SAVED'`, 'save before restart');
  await sleep(500);
  const beforeRestart = await state();
  await closeBrowser();
  await openBrowser('#game');
  await waitFor(`!!document.querySelector('[data-testid="player-strip-bottom"]')`, 'restored arena after restart');
  await sleep(1500);
  s = await state();
  assert(s.matchId === beforeRestart.matchId && s.occupancy === beforeRestart.occupancy && s.user === firstUser &&
    s.bottom === 'P2:human' && s.player === 'P2' && s.requests === 0, 'Browser restart lost the match or the identity.');
  ok('closing and reopening the browser keeps the match, the black seat and the identity');

  const unexpected = errors.filter((e) => !/WebGL|THREE\.|AudioContext/i.test(e));
  writeFileSync(join(directory, 'journey.json'), JSON.stringify({ steps, errors }, null, 2));
  console.log(`console errors: ${unexpected.length}`, unexpected.slice(0, 6));
  assert(!unexpected.length, 'Unexpected console errors.');
  console.log(`MATCH JOURNEY PASSED (${steps.length} checks). Evidence: ${directory}`);
} catch (error) {
  await shot('failure').catch(() => undefined);
  console.error('JOURNEY FAILED:', error.message);
  console.error('console errors:', errors.slice(0, 8));
  process.exitCode = 1;
} finally {
  await closeBrowser().catch(() => undefined);
  await server.close();
}
