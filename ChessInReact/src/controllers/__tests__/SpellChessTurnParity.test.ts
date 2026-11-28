import { describe, expect, it } from 'vitest';
import { UniversalMatchController } from '../UniversalMatchController';
import { MatchConfigurationManager } from '../../matchmaking/config/MatchConfigurationManager';
import { gameStore } from '../../core/state/gameStore';
import { MovePieceCommand } from '../../core/commands/MovePieceCommand';
import { asCoordinateKey, asEntityId } from '../../core/coordinates';
import { OfficialSpellRules } from '../../engine/variants/spells/OfficialSpellRules';
import { PGNParser } from '../../core/persistence/pgn/PGNParser';
import { ReplayEngine } from '../../core/persistence/pgn/ReplayEngine';
import { queenTrap, addPiece } from '../../workers/ai/strategies/spell/testing/KingSafetyFixtures';
import { SquareTopology } from '../../core/topology/SquareTopology';

describe('PATCH-12: live controller, simulator, spells and faithful replay', () => {
  it('replays the reported moves with an explicitly synthetic spell timeline and compares every turn', () => {
    const initial = MatchConfigurationManager.createDefaultMatch('SPELL_CHESS_KING_CAPTURE_ONLY', 2);
    const config = { ...initial, slots: initial.slots.map((s) => ({ ...s, role: 'HUMAN_LOCAL' as const })) };
    const controller = new UniversalMatchController(config);
    try {
      controller.startMatch();
      const sequence = [ ['4,1', '4,2'], ['1,7', '2,5'], ['5,0', '1,4'], ['6,6', '6,5'],
        ['3,0', '5,2'], ['4,6', '4,5'], ['5,2', '5,6'], ['0,6', '0,4'],
        ['1,4', '2,3'], ['4,7', '5,6'], ['2,3', '5,6'] ];
      for (let i = 0; i < sequence.length; i++) {
        const [from, to] = sequence[i];
        // This is a chosen legal timeline for regression, not the missing original event log.
        const spell = i === 7 ? { type: 'FREEZE' as const, targetSquare: '5,6' } :
          i === 10 ? { type: 'JUMP' as const, targetSquare: '4,5' } : { type: 'NONE' as const };
        const before = gameStore.getState().domain;
        const pieceId = before.occupancy[asCoordinateKey(from)];
        const expected = OfficialSpellRules.simulate(before, { spell, move: { pieceId, from, to } }, controller.getTopology());
        if (spell.type !== 'NONE') expect(controller.castOfficialSpell(spell.type, spell.targetSquare)).toBe(true);
        gameStore.getState().executeCommand(new MovePieceCommand(pieceId, asCoordinateKey(from), asCoordinateKey(to),
          before.activePlayer, undefined, true, true, undefined, controller.getTopology()));
        controller.onHumanPieceMoved(from, to, pieceId);
        const live = gameStore.getState().domain;
        expect(live.boardEntities).toEqual(expected.boardEntities);
        expect(live.occupancy).toEqual(expected.occupancy);
        expect(live.metadata?.officialSpellState).toEqual(expected.metadata?.officialSpellState);
        expect({ ...live.turnState, lastActionTimestamp: 0 }).toEqual({ ...expected.turnState, lastActionTimestamp: 0 });
        expect(live.isGameOver).toBe(expected.isGameOver);
        expect(live.winnerId).toBe(expected.winnerId);
        if (i === 8) {
          // Qf7 thaws when White finishes Bc4, opening its real check on e8.
          expect(controller.getMoveHistory()[8].san).toBe('Bc4+');
        }
      }
      expect(gameStore.getState().domain.winnerId).toBe('P1');
      const audit = controller.getSpellAudit();
      expect(audit.events.length).toBe(2);
      expect(audit.events[0].movePly).toBe(8);
      expect(audit.events[1].movePly).toBe(11);
      expect(controller.getFormattedMoveItems().some((m) => m.white?.includes('Jump(e6) + Bxf7'))).toBe(true);
      const pgn = controller.exportSpellPGN();
      expect(pgn).toContain('{[%spell FREEZE f7]}');
      expect(pgn).toContain('{[%spell JUMP e6]}');
      const replay = new ReplayEngine(PGNParser.parse(pgn), audit.initialState);
      const final = replay.getStateAtTurn(11);
      expect(final.boardEntities).toEqual(audit.finalState.boardEntities);
      expect(final.metadata?.officialSpellState).toEqual(audit.finalState.metadata?.officialSpellState);
      expect(final.winnerId).toBe('P1');
      // PATCH-16A: a concluded match stays concluded. Earlier positions come from the replay.
      expect(controller.undo()).toBe(false);
      expect(controller.redo()).toBe(false);
      expect(gameStore.getState().domain.winnerId).toBe('P1');
      expect(controller.getMoveHistory().length).toBe(11);
      const timeline = controller.journal.current;
      expect(timeline.livePly).toBe(11);
      expect(timeline.stateAtPly(10).domain.isGameOver).toBe(false);
      expect(timeline.stateAtPly(11).domain.boardEntities).toEqual(gameStore.getState().domain.boardEntities);
      expect(timeline.entry(11)?.spells.map((s) => s.payload.spell.type)).toEqual(['JUMP']);
      expect(timeline.findCorruption()).toBeNull();
      expect(gameStore.getState().domain.winnerId).toBe('P1');
    } finally { controller.dispose(); }
  });

  it('rejects invalid Jump and a second spell without spending charges or changing state', () => {
    const config = MatchConfigurationManager.createDefaultMatch('SPELL_CHESS_KING_CAPTURE_ONLY', 2);
    const controller = new UniversalMatchController(config);
    try {
      controller.startMatch();
      const before = JSON.stringify(gameStore.getState().domain);
      expect(controller.castOfficialSpell('JUMP', 'missing-piece')).toBe(false);
      expect(JSON.stringify(gameStore.getState().domain)).toBe(before);
      expect(controller.castOfficialSpell('JUMP', 'e2')).toBe(true);
      const once = JSON.stringify(gameStore.getState().domain);
      expect(controller.castOfficialSpell('FREEZE', 'e7')).toBe(false);
      expect(JSON.stringify(gameStore.getState().domain)).toBe(once);
    } finally { controller.dispose(); }
  });

  it('freezes occupants at cast time, allowing a later arrival into the visual zone', () => {
    const domain = queenTrap({ beforeCapture: true, blackFreeze: 1 });
    addPiece(domain, 'br', 'P2', 'ROOK', '0,2');
    const withFreeze = OfficialSpellRules.cast(domain, { type: 'FREEZE', targetSquare: '2,3' }, 'P2');
    expect(withFreeze.boardEntities[asEntityId('wb')]?.metadata?.isFrozen).toBe(true);
    const next = OfficialSpellRules.simulate(withFreeze, { spell: { type: 'NONE' }, move: {
      pieceId: 'br', from: '0,2', to: '1,2',
    } }, new SquareTopology({ width: 8, height: 8 }));
    expect(next.boardEntities[asEntityId('br')].metadata?.isFrozen).toBe(false);
    expect(next.metadata?.hasCastSpellThisTurn).toBe(false);
  });
});
