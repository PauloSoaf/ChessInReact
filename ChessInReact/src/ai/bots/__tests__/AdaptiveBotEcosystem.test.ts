import { describe, it, expect, beforeEach } from 'vitest';
import { BotLadderCatalog } from '../catalog/BotLadderCatalog';
import { AdaptiveBotLearningEngine } from '../learning/AdaptiveBotLearningEngine';
import { PVEGlickoRatingEngine } from '../rating/PVEGlickoRatingEngine';

describe('Spec 11 - BotLadderCatalog (RF-01, RF-02, § 5, § 7.2)', () => {
  it('contains exactly 19 bots calibrated across ratings 0 to 2200+ (RF-01)', () => {
    const bots = BotLadderCatalog.getAllBots();
    expect(bots).toHaveLength(19);

    expect(bots[0].id).toBe('bot_000');
    expect(bots[0].ratingElo).toBe(0);

    expect(bots[bots.length - 1].id).toBe('bot_2200');
    expect(bots[bots.length - 1].ratingElo).toBe(2200);
  });

  it('partitions bots into 4 distinct progression tiers (US11-P02, § 7.2)', () => {
    const tier1 = BotLadderCatalog.getBotsByTier(1);
    const tier2 = BotLadderCatalog.getBotsByTier(2);
    const tier3 = BotLadderCatalog.getBotsByTier(3);
    const tier4 = BotLadderCatalog.getBotsByTier(4);

    expect(tier1).toHaveLength(6); // 0, 100, 200, 300, 400, 500
    expect(tier2).toHaveLength(6); // 600, 700, 800, 900, 1000, 1100
    expect(tier3).toHaveLength(4); // 1200, 1600, 1700, 1800
    expect(tier4).toHaveLength(3); // 1900, 2000, 2200
  });

  it('differentiates static benchmark bots from adaptive evolutionary bots (RF-02)', () => {
    const adaptiveBots = BotLadderCatalog.getAdaptiveBots();
    expect(adaptiveBots.length).toBeGreaterThan(0);

    // Adaptive bots: Faísca (300), Capivara (600), Cavaleiro (900), Gladiador (1200), Inquisidor (1700), Arquiduque (1900), Nemesis (2200)
    const adaptiveIds = adaptiveBots.map(b => b.id);
    expect(adaptiveIds).toContain('bot_300');
    expect(adaptiveIds).toContain('bot_600');
    expect(adaptiveIds).toContain('bot_900');
    expect(adaptiveIds).toContain('bot_1200');
    expect(adaptiveIds).toContain('bot_1700');
    expect(adaptiveIds).toContain('bot_1900');
    expect(adaptiveIds).toContain('bot_2200');
  });

  it('provides rich personality dialogues and archetypes for all bots (RF-11)', () => {
    for (const bot of BotLadderCatalog.getAllBots()) {
      expect(bot.name).toBeDefined();
      expect(bot.archetype).toBeDefined();
      expect(bot.dialogueLines.gameStart.length).toBeGreaterThan(0);
      expect(bot.dialogueLines.onCapturePlayerQueen.length).toBeGreaterThan(0);
      expect(bot.dialogueLines.onOwnBlunder.length).toBeGreaterThan(0);
      expect(bot.dialogueLines.onCheckmateDelivered.length).toBeGreaterThan(0);
      expect(bot.dialogueLines.onDefeated.length).toBeGreaterThan(0);
    }
  });
});

describe('Spec 11 - AdaptiveBotLearningEngine (RF-03, RF-04, RF-13, RF-14, RNF-05, RNF-09)', () => {
  let engine: AdaptiveBotLearningEngine;

  beforeEach(() => {
    engine = new AdaptiveBotLearningEngine();
  });

  it('records critical blunders and applies -15,000 centipawns penalty (RF-04)', () => {
    const botId = 'bot_600';
    const zobristHash = '0x1a2b3c4d5e6f7a8b';
    const blunderMove = 'c3d5';

    engine.recordBlunder(botId, zobristHash, blunderMove);

    const start = performance.now();
    const penalty = engine.getBlunderPenalty(botId, zobristHash, blunderMove);
    const durationMs = performance.now() - start;

    expect(penalty).toBe(AdaptiveBotLearningEngine.CRITICAL_BLUNDER_PENALTY);
    expect(penalty).toBe(-15000);
    // Latency constraint: < 2.0 ms (RNF-05)
    expect(durationMs).toBeLessThan(2.0);

    // Unrelated move does not receive penalty
    expect(engine.getBlunderPenalty(botId, zobristHash, 'e2e4')).toBe(0);
  });

  it('enforces LRU capacity limit of 500 entries per bot (RNF-09)', () => {
    const botId = 'bot_1900';

    // Insert 550 distinct positions
    for (let i = 1; i <= 550; i++) {
      engine.recordBlunder(botId, `hash_${i}`, `move_${i}`);
    }

    // Capacity must be capped at 500
    expect(engine.getBlunderCount(botId)).toBe(500);

    // Oldest entry (hash_1) was evicted
    expect(engine.getBlunderPenalty(botId, 'hash_1', 'move_1')).toBe(0);

    // Newest entry (hash_550) exists
    expect(engine.getBlunderPenalty(botId, 'hash_550', 'move_550')).toBe(-15000);
  });

  it('mutates opening book by cutting losing move weight by 50% (RF-03, § 6.1)', () => {
    const botId = 'bot_300';
    const fenKey = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR';
    const losingMove = 'e7e5';

    // Initial weight is 1.0
    expect(engine.getBookWeightMultiplier(botId, fenKey, losingMove)).toBe(1.0);

    // 1st loss -> decays to 0.5
    engine.recordOpeningLoss(botId, fenKey, losingMove);
    expect(engine.getBookWeightMultiplier(botId, fenKey, losingMove)).toBe(0.5);

    // 2nd loss -> decays to 0.25
    engine.recordOpeningLoss(botId, fenKey, losingMove);
    expect(engine.getBookWeightMultiplier(botId, fenKey, losingMove)).toBe(0.25);

    // 3rd loss -> decays to 0.125
    engine.recordOpeningLoss(botId, fenKey, losingMove);
    expect(engine.getBookWeightMultiplier(botId, fenKey, losingMove)).toBe(0.125);
  });

  it('clears bot memories on reset (Factory Reset) (RF-13)', () => {
    const botId = 'bot_900';
    engine.recordBlunder(botId, 'hash_abc', 'e2e4');
    engine.recordOpeningLoss(botId, 'fen_123', 'd2d4');

    expect(engine.getBlunderCount(botId)).toBe(1);

    engine.resetBotLearning(botId);
    expect(engine.getBlunderCount(botId)).toBe(0);
    expect(engine.getBookWeightMultiplier(botId, 'fen_123', 'd2d4')).toBe(1.0);
  });

  it('exports and imports learning memories with 100% fidelity (RF-14)', () => {
    const botId = 'bot_2200';
    engine.recordBlunder(botId, 'hash_alpha', 'g1f3');
    engine.recordOpeningLoss(botId, 'fen_root', 'c2c4');

    const exported = engine.exportBotLearning(botId);
    expect(exported.botId).toBe(botId);
    expect(exported.blunders).toHaveLength(1);
    expect(exported.bookMutations).toHaveLength(1);

    const freshEngine = new AdaptiveBotLearningEngine();
    const success = freshEngine.importBotLearning(exported);

    expect(success).toBe(true);
    expect(freshEngine.getBlunderPenalty(botId, 'hash_alpha', 'g1f3')).toBe(-15000);
    expect(freshEngine.getBookWeightMultiplier(botId, 'fen_root', 'c2c4')).toBe(0.5);
  });
});

describe('Spec 11 - PVEGlickoRatingEngine (RF-07, RNF-11)', () => {
  it('calculates expected score: 50% for equal ratings, higher for superior rating', () => {
    expect(PVEGlickoRatingEngine.calculateExpectedScore(1500, 1500)).toBeCloseTo(0.5, 2);
    expect(PVEGlickoRatingEngine.calculateExpectedScore(1900, 1500)).toBeGreaterThan(0.9);
    expect(PVEGlickoRatingEngine.calculateExpectedScore(1100, 1500)).toBeLessThan(0.1);
  });

  it('updates ratings on win, draw, and loss with RD confidence decay (RF-07)', () => {
    const player = { rating: 1200, ratingDeviation: 100 };
    const bot = { rating: 1200, ratingDeviation: 80 };

    // Player wins
    const winResult = PVEGlickoRatingEngine.calculateMatchRating(player, bot, 1.0);
    expect(winResult.player.rating).toBeGreaterThan(1200);
    expect(winResult.opponent.rating).toBeLessThan(1200);
    expect(winResult.player.ratingDeviation).toBeLessThan(100);

    // Player loses
    const lossResult = PVEGlickoRatingEngine.calculateMatchRating(player, bot, 0.0);
    expect(lossResult.player.rating).toBeLessThan(1200);
    expect(lossResult.opponent.rating).toBeGreaterThan(1200);

    // Draw between equals
    const drawResult = PVEGlickoRatingEngine.calculateMatchRating(player, bot, 0.5);
    expect(drawResult.playerRatingDelta).toBe(0);
    expect(drawResult.player.rating).toBe(1200);
  });
});

