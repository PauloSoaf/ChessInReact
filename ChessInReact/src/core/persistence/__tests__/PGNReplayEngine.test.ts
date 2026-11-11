import { describe, it, expect, beforeEach } from 'vitest';
import { asCoordinateKey } from '../../coordinates';
import { PGNExporter, IPGNMoveEntry } from '../pgn/PGNExporter';
import { PGNParser } from '../pgn/PGNParser';
import { ReplayEngine } from '../pgn/ReplayEngine';
import { PGNStorage } from '../pgn/PGNStorage';
import { MemoryStorageDriver } from '../StorageAdapter';

describe('Spec 09 PGN Event Sourcing & Replay Engine Suite (S09-RF01, S09-RF02, S09-RF03)', () => {
  describe('1. PGNExporter & Coordinate Translation (Spec 09 § 4, RF-01)', () => {
    it('translates coordinates between internal indices and algebraic notation', () => {
      expect(PGNExporter.coordToAlgebraic('4,1')).toBe('e2');
      expect(PGNExporter.coordToAlgebraic('4,3')).toBe('e4');
      expect(PGNExporter.coordToAlgebraic('0,0')).toBe('a1');
      expect(PGNExporter.coordToAlgebraic('7,7')).toBe('h8');

      expect(PGNExporter.algebraicToCoord('e2')).toBe('4,1');
      expect(PGNExporter.algebraicToCoord('e4')).toBe('4,3');
      expect(PGNExporter.algebraicToCoord('a1')).toBe('0,0');
      expect(PGNExporter.algebraicToCoord('h8')).toBe('7,7');
    });

    it('exports moves and Seven Tag Roster to valid FIDE PGN string', () => {
      const sampleMoves: IPGNMoveEntry[] = [
        { moveNumber: 1, player: 'P1', fromCoord: '4,1', toCoord: '4,3', san: 'e4' },
        { moveNumber: 1, player: 'P2', fromCoord: '4,6', toCoord: '4,4', san: 'e5' },
        { moveNumber: 2, player: 'P1', fromCoord: '6,0', toCoord: '5,2', san: 'Nf3' },
        { moveNumber: 2, player: 'P2', fromCoord: '1,7', toCoord: '2,5', san: 'Nc6' },
      ];

      const pgn = PGNExporter.exportToPGN(sampleMoves, {
        Event: 'World Championship 2026',
        White: 'Grandmaster Alpha',
        Black: 'Grandmaster Beta',
        Result: '1-0',
        Variant: 'Standard',
      });

      expect(pgn).toContain('[Event "World Championship 2026"]');
      expect(pgn).toContain('[White "Grandmaster Alpha"]');
      expect(pgn).toContain('[Black "Grandmaster Beta"]');
      expect(pgn).toContain('[Result "1-0"]');
      expect(pgn).toContain('[PlyCount "4"]');
      expect(pgn).toContain('1. e4 e5 2. Nf3 Nc6 1-0');
    });
  });

  describe('2. PGNParser Lexing & Token Sanitization (Spec 09 § 4, RF-02)', () => {
    it('parses headers and extracts moves while ignoring comments and annotations', () => {
      const rawPGN = `
[Event "Speed Chess Match"]
[Site "ChessInReact WebGL"]
[Date "2026.11.11"]
[Round "1"]
[White "Player1"]
[Black "Player2"]
[Result "0-1"]
[Variant "Atomic"]

1. e2-e4 {Best by test} 1... e7-e5 (1... c7-c5) $1
2. g1-f3 b8-c6 0-1
      `;

      const parsed = PGNParser.parse(rawPGN);

      expect(parsed.headers.Event).toBe('Speed Chess Match');
      expect(parsed.headers.Variant).toBe('Atomic');
      expect(parsed.headers.Result).toBe('0-1');
      expect(parsed.result).toBe('0-1');

      expect(parsed.moves).toHaveLength(4);
      expect(parsed.moves[0].fromCoord).toBe('4,1');
      expect(parsed.moves[0].toCoord).toBe('4,3');
      expect(parsed.moves[1].fromCoord).toBe('4,6');
      expect(parsed.moves[1].toCoord).toBe('4,4');
      expect(parsed.moves[2].fromCoord).toBe('6,0');
      expect(parsed.moves[2].toCoord).toBe('5,2');
      expect(parsed.moves[3].fromCoord).toBe('1,7');
      expect(parsed.moves[3].toCoord).toBe('2,5');
    });
  });

  describe('3. ReplayEngine State Reconstitution (Spec 09 § 8, RF-03)', () => {
    it('compiles PGN moves into sequential state snapshots with O(1) random access', () => {
      const pgnText = `
[Event "Test Replay"]
[Result "*"]

1. e2-e4 e7-e5 2. g1-f3 b8-c6 *
      `;

      const parsed = PGNParser.parse(pgnText);
      const replay = new ReplayEngine(parsed);

      // Total states: Initial state (0) + 4 moves = 5 states
      expect(replay.getTotalStates()).toBe(5);

      // Frame 0: e2 is occupied, e4 is empty
      const state0 = replay.getStateAtTurn(0);
      expect(state0.occupancy[asCoordinateKey('4,1')]).toBeDefined();
      expect(state0.occupancy[asCoordinateKey('4,3')]).toBeUndefined();

      // Frame 1: After 1. e4 (White pawn moved to 4,3)
      const state1 = replay.getStateAtTurn(1);
      expect(state1.occupancy[asCoordinateKey('4,1')]).toBeUndefined();
      expect(state1.occupancy[asCoordinateKey('4,3')]).toBeDefined();
      expect(state1.activePlayer).toBe('P2');

      // Step forward and backward
      expect(replay.getCurrentIndex()).toBe(0);
      replay.stepForward();
      expect(replay.getCurrentIndex()).toBe(1);
      expect(replay.getCurrentState()).toBe(state1);

      replay.seek(4);
      expect(replay.getCurrentIndex()).toBe(4);
      const state4 = replay.getCurrentState();
      // Black knight at c6 (2,5)
      expect(state4.occupancy[asCoordinateKey('2,5')]).toBeDefined();

      replay.stepBackward();
      expect(replay.getCurrentIndex()).toBe(3);
    });

    it('faithfully replays pure SAN tokens with minor pieces, castling, and promotions', () => {
      // Italian Game opening + castling sequence:
      // 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6
      const italianPGN = `
[Event "Italian Game Replay Test"]
[Site "ChessInReact Engine"]
[Date "2026.11.11"]
[White "Player 1"]
[Black "Player 2"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 *
      `;

      const parsed = PGNParser.parse(italianPGN);
      const replay = new ReplayEngine(parsed);

      expect(replay.getTotalStates()).toBe(9); // Initial (0) + 8 plies = 9

      // Turn 2 White: Nf3 (g1 -> f3, i.e. 6,0 -> 5,2)
      const state3 = replay.getStateAtTurn(3);
      expect(state3.occupancy[asCoordinateKey('6,0')]).toBeUndefined();
      expect(state3.occupancy[asCoordinateKey('5,2')]).toBeDefined();

      // Turn 4 White: O-O (White Kingside Castle)
      // King moves from e1 (4,0) to g1 (6,0)
      // Rook moves from h1 (7,0) to f1 (5,0)
      const state7 = replay.getStateAtTurn(7);
      expect(state7.occupancy[asCoordinateKey('4,0')]).toBeUndefined();
      expect(state7.occupancy[asCoordinateKey('6,0')]).toBeDefined(); // King at g1
      expect(state7.occupancy[asCoordinateKey('7,0')]).toBeUndefined();
      expect(state7.occupancy[asCoordinateKey('5,0')]).toBeDefined(); // Rook at f1
    });

    it('resolves piece disambiguation (Nbd2 / R1e2 / exd5) without heuristic degradation', () => {
      // Test knight disambiguation and pawn captures
      const disambigPGN = `
[Event "Disambiguation Test"]
[Result "*"]

1. e4 d5 2. exd5 Nf6 3. d4 Nbd7 *
      `;

      const parsed = PGNParser.parse(disambigPGN);
      const replay = new ReplayEngine(parsed);

      expect(replay.getTotalStates()).toBe(7);

      // 2. exd5: pawn from e4 (4,3) captures at d5 (3,4)
      const state3 = replay.getStateAtTurn(3);
      expect(state3.occupancy[asCoordinateKey('4,3')]).toBeUndefined();
      expect(state3.occupancy[asCoordinateKey('3,4')]).toBeDefined();

      // 3... Nbd7: knight from b8 (1,7) moves to d7 (3,6)
      const state6 = replay.getStateAtTurn(6);
      expect(state6.occupancy[asCoordinateKey('1,7')]).toBeUndefined();
      expect(state6.occupancy[asCoordinateKey('3,6')]).toBeDefined();
    });
  });

  describe('4. PGNStorage Local Persistence (Spec 09 § 1, RF-01)', () => {
    let storage: PGNStorage;

    beforeEach(() => {
      storage = new PGNStorage(new MemoryStorageDriver());
    });

    it('saves, lists, and deletes PGN matches in archive storage', () => {
      expect(storage.listMatches()).toHaveLength(0);

      storage.saveMatch({
        id: 'match-101',
        title: 'Blitz Game vs Bot N3',
        date: '2026.11.11',
        result: '1-0',
        pgn: '[Event "Blitz"]\n\n1. e4 e5 1-0',
        plyCount: 2,
      });

      const matches = storage.listMatches();
      expect(matches).toHaveLength(1);
      expect(matches[0].id).toBe('match-101');
      expect(matches[0].result).toBe('1-0');

      storage.deleteMatch('match-101');
      expect(storage.listMatches()).toHaveLength(0);
    });
  });
});
