# P0 Visual Gameplay Recovery — Patch 02 & Complete Minigame 2D/3D Bot Homologation

## Status

**Implemented and validated locally across TypeScript, ESLint, Vite Production Build, Memory Benchmark, Chromium Smoke, Chromium 11-Flow Acceptance, and Full Vitest Suite.**

## Scope

1. **Bot Authority & Dynamic Control Synchronization (`App.tsx`, `UniversalMatchController.ts`, `useUniversalMatch.ts`):**
   - Added `UniversalMatchController.isBotPlayer(playerId)` and guarded `scheduleAutonomousTurnIfNeeded()` and `stepBotTurn()` against stale `matchId`s and Duck Chess `PLACE_DUCK` phases.
   - Added `updateSlotRole()`, `updateBotDifficulty()`, and `resetCurrentMatch()` on `UniversalMatchController`, wired directly to `GameControlsBar` (`onToggleBot`, `onSetDifficulty`, `onReset`) in `App.tsx`.
   - Resolved the 3D-to-2D state preservation failure in Flow 11 of `scripts/runAcceptanceVerification.mjs` (all 11 headless Chromium flows now pass strictly).

2. **Bughouse 2v2 Twin-Board 2D/3D & Multi-Level Coordinated Bots (`BughouseArena.tsx`, `BughouseCoordinatedAgent.ts`):**
   - Replaced plain text glyphs with `PieceRenderer` vector/Staunton/pixel-art rendering and legal move dots / capture rings.
   - Added **2D Clássico / 3D Perspectiva** toggle (`bughouse-view-toggle`) and a 4-seat role/difficulty configurator (`Humano Local` vs `Bot IA Coordenado` N1–N5) plus cross-board partner piece request buttons (`KNIGHT`, `QUEEN`, `ROOK`, `PAWN`).
   - Upgraded `BughouseCoordinatedAgent` with N1–N5 calibration, tactical reserve drops (`DROP_PIECE`) near the opponent's King, partner request fulfillment, and `decideWithSearch` alpha-beta integration.

3. **Puzzle Rush / Puzzle Battle Interactive 2D/3D Board & N1–N5 Bot Opponent (`PuzzleRushArena.tsx`):**
   - Added an interactive 8×8 chessboard (`puzzle-rush-board`) parsed live from `currentPuzzle.fen` (and updated across multi-move combinations) with click-to-move UCI submission and **2D / 3D** view toggle (`pr-view-toggle`).
   - Added N1–N5 Bot ELO calibration (`1000` to `2400`) in `BATTLE` mode (`Battle vs Bot`).

4. **Spell Chess & Duck Chess Target Selection & Rules (`App.tsx`, `UniversalMatchController.ts`, `RulesEngine.ts`, `GameOverDetector.ts`):**
   - Added interactive board target selection in `App.tsx` for both Official Spell Chess (`FREEZE`, `JUMP`) and Expanded Spell Chess (`FREEZE`, `JUMP`, `PORTAL`, `INVISIBILITY`, `MIRROR_SHIELD`, `STEALTH_TRAP`) across 2D and 3D boards.
   - Registered `DUCK_CHESS`, `RACING_KINGS`, and `CAPABLANCA_CHESS` in `VariantRegistry`, enforcing Racing Kings' check prohibition and 8th-rank victory, and Duck Chess' king-capture victory.

5. **3-to-12 Player Arenas, Capablanca Fairy Pieces, and Multi-Faction 2D/3D Visuals (`VariantPieceInitializer.ts`, `PieceRenderer.tsx`, `InstancedPieces.tsx`, `MaxNMultiplayerStrategy.ts`):**
   - Normalized all 18 multi-player arena layouts (`3P` to `12P`) into valid board bounds `[0, boardLimit - 1]`.
   - Added vector silhouettes (2D) and 3D procedural geometries (3D) for fairy pieces (`ARCHBISHOP`, `CHANCELLOR`, `AMAZON`, etc.) and distinct faction colors for `P1`..`P12`.
   - Upgraded `MaxNMultiplayerStrategy` with N1–N5 calibration, `+20 pt` King elimination hunt, and paranoid center-crossfire avoidance.
