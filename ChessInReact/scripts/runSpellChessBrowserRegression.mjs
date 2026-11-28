import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const browser = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
if (!browser) throw new Error('Chromium required for Spell Chess browser regression.');
const directory = resolve(process.env.SPELL_EVIDENCE_DIR ?? 'docs/autonomous/patches/patch12-evidence');
mkdirSync(directory, { recursive: true });
const port = 5700 + Math.floor(Math.random() * 100), cdpPort = port + 4000;
const server = await createServer({ server: { port, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const processBrowser = spawn(browser, ['--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--enable-webgl', '--ignore-gpu-blocklist', `--remote-debugging-port=${cdpPort}`, `http://127.0.0.1:${port}/#hub`], { stdio: 'ignore' });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
try {
  let url;
  for (let i = 0; i < 80 && !url; i++) {
    await delay(250);
    try { url = (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).find((t) => t.url.includes(`:${port}/`))?.webSocketDebuggerUrl; } catch { /* browser starting */ }
  }
  if (!url) throw new Error('Browser CDP endpoint unavailable.');
  ws = new WebSocket(url);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let sequence = 0;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { ws.removeEventListener('message', listener); reject(new Error(`CDP timeout: ${method}`)); }, 45000);
    const listener = (event) => {
      const reply = JSON.parse(event.data);
      if (reply.id !== id) return;
      clearTimeout(timer); ws.removeEventListener('message', listener);
      if (reply.error) reject(new Error(JSON.stringify(reply.error))); else resolve(reply.result);
    };
    ws.addEventListener('message', listener); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  };
  const assert = (value, message) => { if (!value) throw new Error(message); };
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  for (let i = 0; i < 80; i++) { if (await evaluate('!!window.__CHESS_APP__?.getMatchController')) break; await delay(250); }
  const results = [];
  for (const mode of ['2D', '3D']) {
    await evaluate(`(async () => {
      const {MatchConfigurationManager:M}=await import('/src/matchmaking/config/MatchConfigurationManager.ts');
      let config=M.createDefaultMatch('SPELL_CHESS_KING_CAPTURE_ONLY',2);
      config=M.updateBotDifficulty(config,1,5);
      config={...config,slots:config.slots.map(s=>({...s,role:'HUMAN_LOCAL'}))};
      window.__CHESS_APP__.launchMatch(config);
    })()`);
    await delay(450);
    await evaluate(`document.getElementById('board-view-mode-${mode.toLowerCase()}')?.click()`);
    await delay(mode === '3D' ? 1800 : 300);
    const before = await evaluate(`(async () => {
      const {gameStore}=await import('/src/core/state/gameStore.ts');
      const {queenTrap}=await import('/src/workers/ai/strategies/spell/testing/KingSafetyFixtures.ts');
      const controller=window.__CHESS_APP__.getMatchController();
      if(!controller.isPaused())controller.togglePause();
      const fixture={...queenTrap({beforeCapture:true}),matchId:controller.getConfig().matchId};
      gameStore.getState().resetDomainState(fixture);
      controller.updateSlotRole(1,'AI_BOT');controller.updateBotDifficulty(1,5);
      window.__spellFrames=0;window.__spellTick=setInterval(()=>window.__spellFrames++,16);
      return {king:fixture.boardEntities.bk.position,queen:fixture.boardEntities.wq.position,
        canvas:!!document.querySelector('[data-testid="chess-board-3d-container"] canvas')};
    })()`);
    if (mode === '3D') assert(before.canvas, '3D WebGL board did not mount.');
    const shotBefore = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(resolve(directory, `${mode.toLowerCase()}-before.png`), Buffer.from(shotBefore.data, 'base64'));
    const result = await evaluate(`(async () => {
      const {gameStore}=await import('/src/core/state/gameStore.ts');
      const {SpellChessMoveGenerator:G}=await import('/src/workers/ai/strategies/spell/SpellChessMoveGenerator.ts');
      const c=window.__CHESS_APP__.getMatchController();
      const stepped=await c.stepBotTurn();clearInterval(window.__spellTick);
      const state=gameStore.getState().domain;
      const decision=c.getMoveHistory()[0]?.aiDecision;
      return {stepped,frames:window.__spellFrames,king:state.boardEntities.bk.position,
        immediateReply:G.findKingCapture(state,state.activePlayer,c.getTopology())??null,
        gameOver:state.isGameOver,winner:state.winnerId,decision,audit:c.getSpellAudit()};
    })()`);
    assert(result.stepped && result.decision?.spellTrace?.engine === 'SPELL_COMPOSITE', 'Real N5 route did not use composite search.');
    assert(!result.decision.fallbackUsed, 'N5 browser route used fallback.');
    assert(!result.immediateReply && !result.gameOver, 'N5 allowed an immediate king capture.');
    assert(result.frames > 3, 'Main thread did not remain responsive during Worker search.');
    const shotAfter = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(resolve(directory, `${mode.toLowerCase()}-after.png`), Buffer.from(shotAfter.data, 'base64'));
    const syntheticReplay = await evaluate(`(async () => {
      const {MatchConfigurationManager:M}=await import('/src/matchmaking/config/MatchConfigurationManager.ts');
      const {gameStore}=await import('/src/core/state/gameStore.ts');
      const {MovePieceCommand}=await import('/src/core/commands/MovePieceCommand.ts');
      let config=M.createDefaultMatch('SPELL_CHESS_KING_CAPTURE_ONLY',2);
      config={...config,slots:config.slots.map(s=>({...s,role:'HUMAN_LOCAL'}))};
      window.__CHESS_APP__.launchMatch(config);
      const c=window.__CHESS_APP__.getMatchController();
      const moves=[['4,1','4,2'],['1,7','2,5'],['5,0','1,4'],['6,6','6,5'],['3,0','5,2'],['4,6','4,5'],
        ['5,2','5,6'],['0,6','0,4'],['1,4','2,3'],['4,7','5,6'],['2,3','5,6']];
      for(let i=0;i<moves.length;i++){
        if(i===7&&!c.castOfficialSpell('FREEZE','5,6'))throw Error('Synthetic Freeze failed');
        if(i===10&&!c.castOfficialSpell('JUMP','4,5'))throw Error('Synthetic Jump failed');
        const [from,to]=moves[i],state=gameStore.getState().domain,pieceId=state.occupancy[from];
        gameStore.getState().executeCommand(new MovePieceCommand(pieceId,from,to,state.activePlayer,undefined,true,true,undefined,c.getTopology()));
        c.onHumanPieceMoved(from,to,pieceId);
        if(i<10&&gameStore.getState().domain.isGameOver)throw Error('Premature victory');
      }
      return {winner:gameStore.getState().domain.winnerId,audit:c.getSpellAudit(),pgn:c.exportSpellPGN()};
    })()`);
    assert(syntheticReplay.winner === 'P1', 'Executed Bxf7 did not capture the king.');
    await delay(350);
    const finalShot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(resolve(directory, `${mode.toLowerCase()}-executed-capture.png`), Buffer.from(finalShot.data, 'base64'));
    const materialScenarios = [];
    if (process.env.SPELL_MATERIAL_SCENARIOS === '1') for (const scenario of ['opening-d3', 'opening-e3', 'forced-jump', 'forced-freeze']) {
      const check = await evaluate(`(async () => {
        const {MatchConfigurationManager:M}=await import('/src/matchmaking/config/MatchConfigurationManager.ts');
        const {gameStore}=await import('/src/core/state/gameStore.ts');
        const {openingTrap}=await import('/src/workers/ai/strategies/spell/testing/MaterialSafetyFixtures.ts');
        const {queenTrap}=await import('/src/workers/ai/strategies/spell/testing/KingSafetyFixtures.ts');
        const {OfficialSpellRules:R}=await import('/src/engine/variants/spells/OfficialSpellRules.ts');
        const {SpellChessMaterialSafety:S}=await import('/src/workers/ai/strategies/spell/SpellChessMaterialSafety.ts');
        let config=M.createDefaultMatch('SPELL_CHESS_KING_CAPTURE_ONLY',2);
        config=M.updateBotDifficulty(M.updateBotDifficulty(config,0,5),1,5);
        config={...config,slots:config.slots.map(s=>({...s,role:'HUMAN_LOCAL'}))};window.__CHESS_APP__.launchMatch(config);
        const c=window.__CHESS_APP__.getMatchController();if(!c.isPaused())c.togglePause();
        let fixture=${JSON.stringify(scenario)}==='opening-d3'?openingTrap('d3'):${JSON.stringify(scenario)}==='opening-e3'?openingTrap('e3'):queenTrap();
        if(${JSON.stringify(scenario)}==='forced-freeze'){
          fixture={...queenTrap({blackFreeze:1}),activePlayer:'P2'};
          fixture=R.sync(fixture,{...R.getState(fixture),activeFrozenPieceIds:{bk:2,blocker:2}});
        }
        fixture={...fixture,matchId:c.getConfig().matchId};gameStore.getState().resetDomainState(fixture);
        c.updateSlotRole(fixture.activePlayer==='P1'?0:1,'AI_BOT');
        gameStore.getState().resetDomainState(fixture);
        let frames=0;const tick=setInterval(()=>frames++,16);
        const stepped=await c.stepBotTurn();clearInterval(tick);
        const actual=gameStore.getState().domain,d=c.getMoveHistory()[0]?.aiDecision;
        if(!d)throw Error('No browser decision');
        const action={move:d.move,spell:d.secondaryAction?{type:d.secondaryAction.payload.spellType,targetSquare:String(d.secondaryAction.payload.targetCoord)}:{type:'NONE'}};
        const expected=R.simulate(fixture,action,c.getTopology());
        const proof=S.inspect(actual,fixture.activePlayer,c.getTopology());
        const canonical=value=>JSON.stringify(value,(key,v)=>{if(key==='metadata')v={isShielded:false,isInvisible:false,...v};return v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v;});
        return {stepped,frames,action,decision:d,materialDeltaCp:proof.score-S.balance(fixture,fixture.activePlayer),
          executedMatchesCalculated:canonical(actual.boardEntities)===canonical(expected.boardEntities)&&
            canonical(actual.occupancy)===canonical(expected.occupancy)&&canonical(R.getState(actual))===canonical(R.getState(expected)),
          differences:Object.keys(expected.boardEntities).filter(id=>canonical(actual.boardEntities[id])!==canonical(expected.boardEntities[id]))
            .map(id=>({id,actual:actual.boardEntities[id],expected:expected.boardEntities[id]})),
          actualSpells:R.getState(actual),expectedSpells:R.getState(expected),
          winner:actual.winnerId,audit:c.getSpellAudit()};
      })()`);
      assert(check.stepped && check.decision.spellTrace?.engine === 'SPELL_COMPOSITE', 'Material scenario did not use N5 Worker');
      if(!check.executedMatchesCalculated) writeFileSync(resolve(directory,'mismatch.json'),JSON.stringify(check,null,2));
      assert(!check.decision.fallbackUsed && check.executedMatchesCalculated, 'Calculated turn differs from actual board');
      assert(check.decision.spellTrace.materialInspectionCompleted, 'Missing material inspection');
      assert(check.frames > 3, 'Material search blocked UI');
      if (scenario.startsWith('opening')) assert(check.materialDeltaCp >= -200, 'N5 still loses major material in opening');
      if (scenario==='forced-jump') assert(check.action.spell.type==='JUMP' && check.winner==='P1', 'Bot Jump was not executed');
      if (scenario==='forced-freeze') assert(check.action.spell.type==='FREEZE', 'Bot Freeze was not executed');
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(resolve(directory, `${mode.toLowerCase()}-${scenario}.png`), Buffer.from(shot.data, 'base64'));
      materialScenarios.push({scenario,...check});
      console.log(`${mode}/${scenario}: depth=${check.decision.depthReached}; material=${check.materialDeltaCp}; frames=${check.frames}`);
    }
    results.push({ mode, ...result, syntheticReplay, materialScenarios });
    console.log(`${mode}: safe king on ${result.king}; depth=${result.decision.depthReached}; frames=${result.frames}`);
  }
  writeFileSync(resolve(directory, 'browser.json'), JSON.stringify({ scenarios: 'Controlled partial queen trap, not original spell timeline', results }, null, 2));
  console.log('Spell Chess real-browser regression passed in 2D and 3D.');
} finally { ws?.close(); processBrowser.kill(); await server.close(); }
