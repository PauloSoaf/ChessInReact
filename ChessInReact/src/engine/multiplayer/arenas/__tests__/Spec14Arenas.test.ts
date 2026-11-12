import { describe, it, expect } from 'vitest';
import {
  CompositeArenaLayouts,
  TurnCycleManager,
  FFAScoringEngine,
  EliminationManager,
  SimultaneousResolutionEngine,
  TeamMatchManager,
} from '../index';

describe('Spec 14: Massive Multiplayer Arenas (3 to 12 Players)', () => {
  describe('RF-14-01: Catalog of 18 Massive Arenas', () => {
    it('defines 18 distinct arena layouts covering 3 to 12 participants', () => {
      const layouts = CompositeArenaLayouts.getAllLayouts();
      expect(layouts.length).toBe(18);

      const arena3p = CompositeArenaLayouts.getLayout('THREE_PLAYER_CHESS');
      expect(arena3p).toBeDefined();
      expect(arena3p?.totalParticipants).toBe(3);

      const arena4p = CompositeArenaLayouts.getLayout('FOUR_PLAYER_FFA');
      expect(arena4p).toBeDefined();
      expect(arena4p?.totalParticipants).toBe(4);

      const arena12p = CompositeArenaLayouts.getLayout('MINI_DODECAGON_12P');
      expect(arena12p).toBeDefined();
      expect(arena12p?.totalParticipants).toBe(12);
      expect(arena12p?.factions.length).toBe(12);
    });

    it('guarantees unique non-overlapping coordinates in 12-player dodecagon', () => {
      const arena12p = CompositeArenaLayouts.getLayout('MINI_DODECAGON_12P');
      expect(arena12p).toBeDefined();

      const occupiedCoords = new Set<string>();
      let totalPieces = 0;

      for (const faction of arena12p!.factions) {
        for (const piece of faction.initialCoordinates) {
          expect(occupiedCoords.has(piece.coordKey)).toBe(false);
          occupiedCoords.add(piece.coordKey);
          totalPieces++;
        }
      }

      expect(totalPieces).toBe(48); // 12 factions * 4 pieces each in layout
      expect(occupiedCoords.size).toBe(48);
    });
  });

  describe('RF-14-02: Clockwise Turn Rotation & Skip of Eliminated Factions', () => {
    it('rotates clockwise across 6 players and skips eliminated player', () => {
      const factions = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'];
      let state = TurnCycleManager.createInitialState(factions);

      expect(TurnCycleManager.getActiveFaction(state)).toBe('F1');

      // F1 plays -> F2's turn
      state = TurnCycleManager.advanceTurn(state);
      expect(TurnCycleManager.getActiveFaction(state)).toBe('F2');

      // Eliminate F3
      state = TurnCycleManager.eliminateFaction(state, 'F3');
      expect(TurnCycleManager.getActiveFaction(state)).toBe('F2'); // Still F2's turn

      // F2 plays -> Turn jumps over F3 directly to F4!
      state = TurnCycleManager.advanceTurn(state);
      expect(TurnCycleManager.getActiveFaction(state)).toBe('F4');

      // F4 plays -> F5
      state = TurnCycleManager.advanceTurn(state);
      expect(TurnCycleManager.getActiveFaction(state)).toBe('F5');
    });
  });

  describe('RF-14-03: FFA Scoring Tally', () => {
    it('accurately computes material values, checkmate bonus (+20), and multi-check bonuses', () => {
      let score = FFAScoringEngine.createInitialScore('FACTION_1');
      expect(score.totalScore).toBe(0);

      // Capture Queen (9 pts)
      score = FFAScoringEngine.addCapture(score, 'QUEEN');
      expect(score.materialPoints).toBe(9);
      expect(score.totalScore).toBe(9);

      // Checkmate / Elimination bonus (+20 pts)
      score = FFAScoringEngine.addElimination(score);
      expect(score.eliminationPoints).toBe(20);
      expect(score.totalScore).toBe(29);
      expect(score.eliminationsCount).toBe(1);

      // Check bonus (+1 pt)
      score = FFAScoringEngine.addCheckBonus(score, 1);
      expect(score.bonusPoints).toBe(1);
      expect(score.totalScore).toBe(30);
    });
  });

  describe('RF-14-04: Four Elimination Policies', () => {
    const mockPieces = [
      { id: 'p1', ownerFactionId: 'FACTION_1', coordKey: '1,1' },
      { id: 'p2', ownerFactionId: 'FACTION_2', coordKey: '2,2' },
      { id: 'p3', ownerFactionId: 'FACTION_2', coordKey: '2,3' },
      { id: 'p4', ownerFactionId: 'FACTION_3', coordKey: '3,3' },
    ];

    it('EVAPORATION: removes eliminated pieces completely', () => {
      const res = EliminationManager.processElimination('EVAPORATION', 'FACTION_2', mockPieces);
      expect(res.survivingPieces.length).toBe(2);
      expect(res.survivingPieces.map((p) => p.id)).toEqual(['p1', 'p4']);
    });

    it('GREY_OBSTACLES: turns eliminated pieces into immobile neutral obstacles', () => {
      const res = EliminationManager.processElimination('GREY_OBSTACLES', 'FACTION_2', mockPieces);
      expect(res.survivingPieces.length).toBe(4);
      const greyPieces = res.survivingPieces.filter((p) => p.ownerFactionId === 'NEUTRAL_GREY');
      expect(greyPieces.length).toBe(2);
      expect(greyPieces[0].isImmobileObstacle).toBe(true);
    });

    it('CONQUEST: transfers ownership to conqueror faction', () => {
      const res = EliminationManager.processElimination(
        'CONQUEST',
        'FACTION_2',
        mockPieces,
        'FACTION_1'
      );
      expect(res.survivingPieces.length).toBe(4);
      const f1Pieces = res.survivingPieces.filter((p) => p.ownerFactionId === 'FACTION_1');
      expect(f1Pieces.length).toBe(3); // Original p1 + conquered p2, p3
    });

    it('ZOMBIE_BOT: assigns autonomous bot to takeover slot', () => {
      const res = EliminationManager.processElimination('ZOMBIE_BOT', 'FACTION_2', mockPieces);
      expect(res.zombieBotAssigned).toBe(true);
      expect(res.survivingPieces.length).toBe(4);
    });
  });

  describe('RF-14-05 & RNF-14-02: Simultaneous Turn Resolution (Diplomacy Chess)', () => {
    it('arbitrates head-on collision: both pieces bounce back to origins', () => {
      const initialOccupancy = { '1,1': 'white_pawn', '1,3': 'black_pawn' };
      const orders = [
        { factionId: 'F1', pieceId: 'white_pawn', fromCoord: '1,1', toCoord: '1,2' },
        { factionId: 'F2', pieceId: 'black_pawn', fromCoord: '1,3', toCoord: '1,2' }, // Same destination!
      ];

      const result = SimultaneousResolutionEngine.arbitrateTurn(orders, initialOccupancy);
      expect(result.executedMoves.length).toBe(0);
      expect(result.bouncedMoves.length).toBe(2);
      expect(result.bouncedMoves[0].bounceReason).toBe('HEAD_ON_COLLISION');
      expect(result.resolvedOccupancy).toEqual(initialOccupancy); // No change
    });

    it('arbitrates swap collision: pieces attempting to swap squares bounce back', () => {
      const initialOccupancy = { '2,2': 'rook_a', '2,3': 'rook_b' };
      const orders = [
        { factionId: 'F1', pieceId: 'rook_a', fromCoord: '2,2', toCoord: '2,3' },
        { factionId: 'F2', pieceId: 'rook_b', fromCoord: '2,3', toCoord: '2,2' },
      ];

      const result = SimultaneousResolutionEngine.arbitrateTurn(orders, initialOccupancy);
      expect(result.executedMoves.length).toBe(0);
      expect(result.bouncedMoves.length).toBe(2);
      expect(result.bouncedMoves[0].bounceReason).toBe('SWAP_COLLISION');
      expect(result.resolvedOccupancy).toEqual(initialOccupancy);
    });

    it('RNF-14-02: arbitrates 12 simultaneous orders in under 10ms', () => {
      const initialOccupancy: Record<string, string> = {};
      const orders = [];

      for (let i = 0; i < 12; i++) {
        const from = `${i},0`;
        const to = `${i},1`;
        initialOccupancy[from] = `piece_${i}`;
        orders.push({
          factionId: `FACTION_${i + 1}`,
          pieceId: `piece_${i}`,
          fromCoord: from,
          toCoord: to,
        });
      }

      const t0 = performance.now();
      const result = SimultaneousResolutionEngine.arbitrateTurn(orders, initialOccupancy);
      const elapsed = performance.now() - t0;

      expect(result.executedMoves.length).toBe(12);
      expect(result.bouncedMoves.length).toBe(0);
      expect(elapsed).toBeLessThan(10); // RNF-14-02 < 10ms
    });
  });

  describe('RF-14-06: Team Modes (Cooperative Victory)', () => {
    it('awards collective victory when all opposing teams are eliminated', () => {
      const teams = [
        { teamId: 'ALLIANCE', memberFactions: ['F1', 'F3'] },
        { teamId: 'HORDE', memberFactions: ['F2', 'F4'] },
      ];

      const eliminated = new Set(['F2']);
      const inProgress = TeamMatchManager.evaluateTeamVictory(teams, eliminated);
      expect(inProgress.isGameOver).toBe(false);

      // F4 is also eliminated: HORDE is wiped out
      const allHordeEliminated = new Set(['F2', 'F4']);
      const victory = TeamMatchManager.evaluateTeamVictory(teams, allHordeEliminated);
      expect(victory.isGameOver).toBe(true);
      expect(victory.winningTeamId).toBe('ALLIANCE');
    });
  });
});

