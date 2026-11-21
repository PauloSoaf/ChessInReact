/**
 * ChessInReact - Spec 18 Test Suite: Swiss System & Arena Berserk Engine
 * Spec 18: RF-18-01, RF-18-02, RF-18-03, RF-18-04, RF-18-05
 */

import { describe, it, expect } from 'vitest';
import { SwissTournamentEngine } from '../SwissTournamentEngine';
import { ArenaTournamentEngine } from '../ArenaTournamentEngine';
import { FIDETiebreakCalculator } from '../FIDETiebreakCalculator';
import { ITournamentPlayer } from '../types';

describe('Spec 18: SwissTournamentEngine & FIDETiebreakCalculator', () => {
  const initialPlayers = [
    { id: 'p1', name: 'Player 1', rating: 2800 },
    { id: 'p2', name: 'Player 2', rating: 2750 },
    { id: 'p3', name: 'Player 3', rating: 2700 },
    { id: 'p4', name: 'Player 4', rating: 2650 },
    { id: 'p5', name: 'Player 5', rating: 2600 },
    { id: 'p6', name: 'Player 6', rating: 2550 },
    { id: 'p7', name: 'Player 7', rating: 2500 },
    { id: 'p8', name: 'Player 8', rating: 2450 }
  ];

  it('creates Swiss tournament with calculated total rounds', () => {
    const tournament = SwissTournamentEngine.createTournament(
      'swiss_test_01',
      'Torneio Teste',
      initialPlayers
    );

    expect(tournament.format).toBe('SWISS');
    expect(tournament.totalRounds).toBe(3);
    expect(tournament.currentRound).toBe(0);
    expect(tournament.players.length).toBe(8);
  });

  it('generates Round 1 pairings and prevents rematches across rounds', () => {
    let tournament = SwissTournamentEngine.createTournament(
      'swiss_test_02',
      'Torneio Teste',
      initialPlayers
    );

    // Round 1
    const r1 = SwissTournamentEngine.generateNextRoundPairings(tournament);
    tournament = r1.nextState;
    expect(r1.newMatches.length).toBe(4);
    expect(tournament.currentRound).toBe(1);

    // Complete Round 1 matches
    for (const match of r1.newMatches) {
      tournament = SwissTournamentEngine.recordMatchOutcome(tournament, match.matchId, 'WHITE_WIN');
    }

    // Check winners have 1 point
    const winners = tournament.players.filter(p => p.points === 1);
    expect(winners.length).toBe(4);

    // Round 2
    const r2 = SwissTournamentEngine.generateNextRoundPairings(tournament);
    tournament = r2.nextState;
    expect(r2.newMatches.length).toBe(4);
    expect(tournament.currentRound).toBe(2);

    // Ensure no rematches occurred in Round 2
    for (const match of r2.newMatches) {
      const white = tournament.players.find(p => p.id === match.whitePlayerId);
      expect(white?.opponentIds.includes(match.blackPlayerId)).toBe(false);
    }
  });

  it('assigns automatic Bye and +1 point when player count is odd', () => {
    const oddPlayers = initialPlayers.slice(0, 5); // 5 players
    let tournament = SwissTournamentEngine.createTournament(
      'swiss_odd_01',
      'Odd Tournament',
      oddPlayers
    );

    const r1 = SwissTournamentEngine.generateNextRoundPairings(tournament);
    tournament = r1.nextState;

    const byeMatch = r1.newMatches.find(m => m.blackPlayerId === 'BYE');
    expect(byeMatch).toBeDefined();

    tournament = SwissTournamentEngine.recordMatchOutcome(tournament, byeMatch!.matchId, 'BYE');
    const byePlayer = tournament.players.find(p => p.id === byeMatch!.whitePlayerId);
    expect(byePlayer?.points).toBe(1);
    expect(byePlayer?.opponentIds).toContain('BYE');
  });

  it('calculates FIDE Buchholz Cut 1 accurately', () => {
    const dummyPlayers: ITournamentPlayer[] = [
      {
        id: 'pA',
        name: 'Player A',
        rating: 2000,
        points: 3,
        tiebreakBuchholzCut1: 0,
        tiebreakSonnebornBerger: 0,
        winsCount: 3,
        gamesPlayed: 3,
        colorHistory: ['WHITE', 'BLACK', 'WHITE'],
        opponentIds: ['opp1', 'opp2', 'opp3'],
        currentStreak: 3
      }
    ];

    const allMap = new Map<string, ITournamentPlayer>();
    allMap.set('opp1', { ...dummyPlayers[0], id: 'opp1', points: 1 });
    allMap.set('opp2', { ...dummyPlayers[0], id: 'opp2', points: 2 });
    allMap.set('opp3', { ...dummyPlayers[0], id: 'opp3', points: 3 });

    // Scores are 1, 2, 3. Cut 1 drops 1 -> sum is 2 + 3 = 5.
    const buchholz = FIDETiebreakCalculator.calculateBuchholzCut1(dummyPlayers[0], allMap);
    expect(buchholz).toBe(5);
  });
});

describe('Spec 18: ArenaTournamentEngine (Win Streaks & Berserk)', () => {
  const initialPlayers = [
    { id: 'a1', name: 'Arena 1', rating: 2200 },
    { id: 'a2', name: 'Arena 2', rating: 2150 },
    { id: 'a3', name: 'Arena 3', rating: 2100 },
    { id: 'a4', name: 'Arena 4', rating: 2050 }
  ];

  it('creates Arena tournament with initial duration', () => {
    const arena = ArenaTournamentEngine.createTournament('arena_01', 'Arena Blitz', initialPlayers, 30);
    expect(arena.format).toBe('ARENA');
    expect(arena.durationMinutes).toBe(30);
    expect(arena.timeRemainingSeconds).toBe(1800);
    expect(arena.players.length).toBe(4);
  });

  it('generates fast pairings for idle players', () => {
    const arena = ArenaTournamentEngine.createTournament('arena_02', 'Arena Blitz', initialPlayers, 30);
    const result = ArenaTournamentEngine.generateFastPairings(arena);

    expect(result.newMatches.length).toBe(2);
    expect(result.nextState.matches.length).toBe(2);
  });

  it('calculates standard win (2 pts), win streak (4 pts) and Berserk bonus (+1 pt)', () => {
    let arena = ArenaTournamentEngine.createTournament('arena_03', 'Arena Streak', initialPlayers);

    // Round 1 pairings: a1 vs a2, a3 vs a4
    const p1 = ArenaTournamentEngine.generateFastPairings(arena);
    arena = p1.nextState;

    // Complete all round 1 matches (a1 wins match 0)
    for (const m of p1.newMatches) {
      arena = ArenaTournamentEngine.recordMatchOutcome(arena, m.matchId, 'WHITE_WIN');
    }
    let a1 = arena.players.find(p => p.id === 'a1');
    expect(a1?.points).toBe(2);
    expect(a1?.currentStreak).toBe(1);

    // Round 2 pairings
    const p2 = ArenaTournamentEngine.generateFastPairings(arena);
    arena = p2.nextState;

    // a1 wins match in round 2 -> streak becomes 2, points 2 + 2 = 4
    const match2 = p2.newMatches.find(m => m.whitePlayerId === 'a1' || m.blackPlayerId === 'a1')!;
    const a1WinRound2 = match2.whitePlayerId === 'a1' ? 'WHITE_WIN' : 'BLACK_WIN';
    arena = ArenaTournamentEngine.recordMatchOutcome(arena, match2.matchId, a1WinRound2);

    a1 = arena.players.find(p => p.id === 'a1');
    expect(a1?.points).toBe(4);
    expect(a1?.currentStreak).toBe(2);

    // a1 activates Berserk before Round 3!
    arena = ArenaTournamentEngine.setPlayerBerserk(arena, 'a1', true);

    // Round 3 pairings
    const p3 = ArenaTournamentEngine.generateFastPairings(arena);
    arena = p3.nextState;
    const match3 = p3.newMatches.find(m => m.whitePlayerId === 'a1' || m.blackPlayerId === 'a1')!;

    const isA1Berserk = match3.whitePlayerId === 'a1' ? match3.isWhiteBerserk : match3.isBlackBerserk;
    expect(isA1Berserk).toBe(true);

    // a1 wins Game 3 on streak + Berserk -> 4 pts (streak) + 1 pt (berserk) = 5 pts! Total = 4 + 5 = 9 pts
    const a1WinRound3 = match3.whitePlayerId === 'a1' ? 'WHITE_WIN' : 'BLACK_WIN';
    arena = ArenaTournamentEngine.recordMatchOutcome(arena, match3.matchId, a1WinRound3);

    a1 = arena.players.find(p => p.id === 'a1');
    expect(a1?.points).toBe(9);
    expect(a1?.currentStreak).toBe(3);
  });
});
