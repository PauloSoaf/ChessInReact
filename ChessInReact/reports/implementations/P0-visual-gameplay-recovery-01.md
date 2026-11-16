# P0 Visual Gameplay Recovery — Patch 01

## Status

**Implemented and validated locally; commit/push pending.**

This patch addresses the first critical integration block identified in the
audit: selected bot difficulty was lost during match launch, and the legacy
and universal bot controllers could both act on the same turn.

## Architectural context

Consulted before modification:

- `specs/Spec_01_Core_State_Architecture_ECS.md`
- `specs/Spec_04_Rules_Engine_Fairy_Chess_Variants.md`
- `specs/Spec_05_AI_Engines_MCTS_Multiplayer_Bots.md`
- `specs/Spec_06_UI_UX_HUD_NutriOpus_Integration.md`
- `specs/Spec_12_Game_Review_Analysis_Minigames_Spell_Chess.md`
- `specs/Spec_15_Universal_Bot_Intelligence_Pluggable_Engines.md`
- `reports/decisions/ADR-001-entity-mutation-and-index-invariants.md`
- `reports/decisions/ADR-002-worker-serialization-identity-mapping.md`
- `reports/decisions/ADR-003-core-ui-integration-architecture.md`
- `reports/decisions/ADR-004-handling-unadapted-nutriopus-assets.md`
- `reports/decisions/ADR-005-authoritative-multiplayer-colyseus.md`

Relevant contracts:

- Match configuration is the authoritative source for participant role and
  bot difficulty.
- Core state remains the single source of truth for revisions, turns, and
  commands.
- Asynchronous AI responses must be discarded if their captured match context
  is no longer current.
- The legacy bot controller must not dispatch alongside the universal
  controller for the same launched match.

No specification/ADR conflict was found. The existing implementation violated
the contracts at the integration boundary rather than in the rule engine.

## Changes

### Difficulty propagation

`MatchConfigurationManager.updateBotDifficulty()` now updates one bot slot
without rebuilding the match configuration. `App.tsx` uses it when starting a
bot match, so N1, N2, N3, N4, and N5 survive from the Hub into
`UniversalMatchController` and the AI request.

### Controller authority

Hub-launched matches disable the legacy `BotMatchController`. The universal
controller remains responsible for bot turns according to each participant
slot, including participants beyond P2.

### Stale decision protection

`UniversalMatchController.stepBotTurn()` captures:

- match ID;
- revision;
- active player;
- turn number;
- match generation;
- request ID;
- pause/disposal state.

After `AIWorkerPool.dispatchDecision()` resolves, all values are revalidated
before applying spells, moves, Duck Chess phases, or multiplayer turn changes.

## Tests added

- Slot difficulty preservation for N1–N5.
- Universal AI request receives the configured slot difficulty.
- Universal AI decision is rejected after a revision change during calculation.

## Remaining work

This patch does not claim completion of the full visual recovery mission.
P0.2–P0.10 remain, including real Bughouse rendering, Puzzle Rush board
interaction, Spell Chess target selection, Duck Chess acceptance, topology
correction, historical variant status, and visual browser acceptance.

## Validation evidence

Passed:

- `npx tsc --noEmit`
- `npm run lint -- --quiet`
- `npm run build`
- focused configuration/controller suite: **18/18**
- legacy bot regression suite: **12/12**
- `npm run bench:memory`
- Chromium acceptance flows through N4 selection, match start, human move,
  autonomous bot response, undo, redo, reset, and 3D interactions.

Known unrelated failures:

- Full Vitest run: **877 passed, 4 failed**. The failures are the existing heap
  threshold case and three duplicate `square-4,1` selectors in
  `ChessBoardMounted.test.tsx`; they are not caused by this patch.
- Full acceptance continues past the N4 assertion but later fails at the
  existing 3D-to-2D state preservation assertion for the black pawn on d5.
- The standalone Chromium smoke runner timed out in this environment; the
  acceptance runner did execute the real browser flows and WebGL checks.

No claim of full visual homologation is made from this patch.
