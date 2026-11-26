import { describe, expect, it } from 'vitest';
import { UniversalMatchController } from '../UniversalMatchController';
import { MatchConfigurationManager } from '../../matchmaking/config/MatchConfigurationManager';
import { gameStore } from '../../core/state/gameStore';
import { asCoordinateKey } from '../../core/coordinates';
import { MovePieceCommand } from '../../core/commands/MovePieceCommand';
import { SquareTopology } from '../../core/topology/SquareTopology';
import { RulesEngine } from '../../engine/rules/RulesEngine';
import { CheckValidator } from '../../engine/rules/CheckValidator';

describe('PATCH-10: reported game through controller and store', () => {
  it.each([false, true])('keeps playing after Bxc6, Freeze=%s', (freeze) => {
    const base = MatchConfigurationManager.createDefaultMatch('SPELL_CHESS_KING_CAPTURE_ONLY', 2);
    const config = { ...base, slots: base.slots.map((s) => ({ ...s, role: 'HUMAN_LOCAL' as const })) };
    const controller = new UniversalMatchController(config);
    const topology = new SquareTopology({ width: 8, height: 8 });
    try {
      controller.startMatch(config);
      expect(controller.getSnapshot().officialSpellState?.whiteCharges.jumpCharges).toBe(2);
      const sequence = [
        ['4,1', '4,2'], ['1,7', '2,5'], ['5,0', '1,4'], ['6,6', '6,5'],
        ['3,0', '5,2'], ['4,6', '4,5'], ['5,2', '4,3'], ['3,7', '4,6'], ['1,4', '2,5'],
      ];
      sequence.forEach(([from, to], i) => {
        if (freeze && i === 8) {
          expect(controller.castOfficialSpell('FREEZE', { file: 3, rank: 6 })).toBe(true);
        }
        const state = gameStore.getState().domain;
        const pieceId = state.occupancy[asCoordinateKey(from)]!;
        gameStore.getState().executeCommand(new MovePieceCommand(pieceId, asCoordinateKey(from),
          asCoordinateKey(to), state.activePlayer, undefined, true, true, undefined, topology));
        controller.onHumanPieceMoved(from, to, pieceId);
      });
      const state = gameStore.getState().domain;
      expect(state.variantId).toBe('SPELL_CHESS_KING_CAPTURE_ONLY');
      expect(state.activePlayer).toBe('P2');
      expect(state.isGameOver).toBe(false);
      expect(state.winnerId).toBeNull();
      expect(CheckValidator.findRoyalPiece('P1', state)?.position).toBe('4,0');
      expect(CheckValidator.findRoyalPiece('P2', state)?.position).toBe('4,7');
      expect(CheckValidator.isRoyalInCheck('P2', state, topology)).toBe(false);
      const history = controller.getMoveHistory();
      expect(history[history.length - 1]?.san).toBe('Bxc6');
      expect(RulesEngine.getGameResult(state, topology).isGameOver).toBe(false);
      // b7 is outside Freeze centered on d7; bxc6 is a concrete available defense.
      expect(RulesEngine.getLegalMoves(state, topology).some((m) => m.from === '1,6' && m.to === '2,5')).toBe(true);
    } finally {
      controller.dispose();
    }
  });
});
