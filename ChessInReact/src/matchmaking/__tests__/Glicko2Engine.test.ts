import { describe, it, expect } from 'vitest';
import { Glicko2Engine, IGlicko2Player, IGlicko2MultiplayerEntry } from '../engine/Glicko2Engine';

describe('Spec 08 - Glicko-2 Competitive Rating Engine (RF-13, RNF-11)', () => {
  it('creates standard unrated player profile', () => {
    const player = Glicko2Engine.createDefaultPlayer();
    expect(player.rating).toBe(1500);
    expect(player.ratingDeviation).toBe(350);
    expect(player.volatility).toBe(0.06);
  });

  it('matches Dr. Mark Glickman official example paper test vector', () => {
    const engine = new Glicko2Engine(0.5); // tau = 0.5
    const player: IGlicko2Player = {
      rating: 1500,
      ratingDeviation: 200,
      volatility: 0.06,
    };

    const matches = [
      { opponent: { rating: 1400, ratingDeviation: 30, volatility: 0.06 }, score: 1 },
      { opponent: { rating: 1550, ratingDeviation: 100, volatility: 0.06 }, score: 0 },
      { opponent: { rating: 1700, ratingDeviation: 300, volatility: 0.06 }, score: 0 },
    ];

    const updated = engine.updatePlayer(player, matches);

    // Dr. Glickman's published values: Rating ~ 1464.06, RD ~ 151.52, Volatility ~ 0.05999
    expect(updated.rating).toBeCloseTo(1464.06, 0);
    expect(updated.ratingDeviation).toBeCloseTo(151.52, 0);
    expect(updated.volatility).toBeCloseTo(0.06, 2);
  });

  it('decays rating deviation for an inactive player with 0 matches', () => {
    const engine = new Glicko2Engine();
    const activePlayer: IGlicko2Player = {
      rating: 1600,
      ratingDeviation: 50,
      volatility: 0.06,
    };

    const decayed = engine.updatePlayer(activePlayer, []);
    expect(decayed.rating).toBe(1600);
    // Rating deviation must increase due to inactivity
    expect(decayed.ratingDeviation).toBeGreaterThan(activePlayer.ratingDeviation);
  });

  it('updates 1v1 match symmetrically: winner gains rating, loser drops', () => {
    const engine = new Glicko2Engine();
    const playerA: IGlicko2Player = { rating: 1500, ratingDeviation: 100, volatility: 0.06 };
    const playerB: IGlicko2Player = { rating: 1500, ratingDeviation: 100, volatility: 0.06 };

    // Player A wins
    const result = engine.update1v1Match(playerA, playerB, 1.0);

    expect(result.playerA.rating).toBeGreaterThan(1500);
    expect(result.playerB.rating).toBeLessThan(1500);
    expect(result.playerA.ratingDeviation).toBeLessThan(100);
    expect(result.playerB.ratingDeviation).toBeLessThan(100);
  });

  it('handles 1v1 draw between unequal players properly', () => {
    const engine = new Glicko2Engine();
    const strongPlayer: IGlicko2Player = { rating: 1800, ratingDeviation: 80, volatility: 0.06 };
    const weakPlayer: IGlicko2Player = { rating: 1400, ratingDeviation: 80, volatility: 0.06 };

    // Draw (score = 0.5)
    const result = engine.update1v1Match(strongPlayer, weakPlayer, 0.5);

    // Strong player drops because draw against weaker is underperformance
    expect(result.playerA.rating).toBeLessThan(1800);
    // Weak player rises because draw against stronger is overperformance
    expect(result.playerB.rating).toBeGreaterThan(1400);
  });

  it('processes 4-Player FFA match with hierarchical rating adjustments (RF-04, RF-13)', () => {
    const engine = new Glicko2Engine();

    const entries: IGlicko2MultiplayerEntry[] = [
      { playerId: 'p1', player: { rating: 1500, ratingDeviation: 100, volatility: 0.06 }, rank: 1 },
      { playerId: 'p2', player: { rating: 1500, ratingDeviation: 100, volatility: 0.06 }, rank: 2 },
      { playerId: 'p3', player: { rating: 1500, ratingDeviation: 100, volatility: 0.06 }, rank: 3 },
      { playerId: 'p4', player: { rating: 1500, ratingDeviation: 100, volatility: 0.06 }, rank: 4 },
    ];

    const results = engine.updateMultiplayerMatch(entries);

    const r1 = results.get('p1')!;
    const r2 = results.get('p2')!;
    const r3 = results.get('p3')!;
    const r4 = results.get('p4')!;

    expect(r1.rating).toBeGreaterThan(1500);
    expect(r2.rating).toBeGreaterThan(r3.rating);
    expect(r3.rating).toBeGreaterThan(r4.rating);
    expect(r4.rating).toBeLessThan(1500);
  });

  it('enforces rating deviation bounds (MIN_RD and MAX_RD)', () => {
    const engine = new Glicko2Engine();
    const ultraDecayed: IGlicko2Player = {
      rating: 1500,
      ratingDeviation: 400, // exceeds max
      volatility: 0.06,
    };

    const decayed = engine.decayInactivePlayer(ultraDecayed);
    expect(decayed.ratingDeviation).toBeLessThanOrEqual(Glicko2Engine.MAX_RD);
  });
});
