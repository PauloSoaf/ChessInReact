# P0 Visual Gameplay Recovery — Patch 02

## Status

**Implemented and validated locally; commit/push pending.**

## Scope

This patch narrows bot authority to participant identity. The universal
controller no longer relies on a special P2 path when scheduling or manually
stepping autonomous turns.

## Changes

- Added `UniversalMatchController.isBotPlayer(playerId)`.
- Reused that predicate in autonomous scheduling and `stepBotTurn()`.
- Added coverage for all-bot matches with 2, 4, and 6 participants.
- Kept the legacy controller disabled for Hub-launched matches, as established
  by Patch 01.

## Architectural contract

The participant slot is authoritative for role and difficulty. A player ID
must resolve to its configured slot before a bot command can be requested.
This preserves Spec 15 participant-specific bot behavior and prevents
multi-player matches from treating P2 as the only possible bot.

## Remaining work

This does not yet solve visual 3D-to-2D state preservation, topology
correction, Bughouse rendering, Puzzle Rush board interaction, Spell Chess
target selection, or the remaining full-suite baseline failures.

## Validation evidence

- `npx tsc --noEmit` passed.
- `npm run lint -- --quiet` passed.
- `UniversalMatchController.test.ts`: **15/15 passed**, including 2, 4, and
  6-player all-bot authority cases.
