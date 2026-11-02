import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BotMatchController } from '../BotMatchController';
import { gameStore } from '../../core/state/gameStore';
import { bootstrapGame } from '../../core/bootstrap/GameInitializer';
import { EngineBridge } from '../../core/workers/EngineBridge';
import { MockWorkerPort } from '../../core/workers/dummyWorker';
import { asCoordinateKey, asEntityId } from '../../core/coordinates';
import { IPieceEntity } from '../../core/entities/types';
import { MovePieceCommand } from '../../core/commands/MovePieceCommand';
import { IBestMoveResult } from '../../workers/ai/interfaces/IAIEngineContracts';

describe('BotMatchController (P0 Functional Bot Integration)', () => {
  beforeEach(() => {
    bootstrapGame({ targetStore: gameStore });
  });

  it('initializes in disabled state with default difficulty', () => {
    const controller = new BotMatchController({ enabled: false, difficulty: 2 });
    expect(controller.isBotEnabled()).toBe(false);
    expect(controller.getDifficulty()).toBe(2);
    expect(controller.getBotPlayer()).toBe('P2');
    expect(controller.getHumanPlayer()).toBe('P1');
    expect(controller.getIsThinking()).toBe(false);
  });

  it('triggers bot deliberation and dispatches validated move when it is bot turn', async () => {
    const botPieceId = gameStore.getState().domain.occupancy[asCoordinateKey('4,6')];
    const mockBridge = new EngineBridge({ workerPort: new MockWorkerPort(5) });
    // Spy on calculateBestMove
    vi.spyOn(mockBridge, 'calculateBestMove').mockImplementation(async () => {
      return {
        bestMove: {
          fromCoord: asCoordinateKey('4,6'),
          toCoord: asCoordinateKey('4,4'),
          pieceId: botPieceId,
        },
        evaluationScore: -15,
        depthReached: 2,
        nodesCalculated: 40,
        calculationTimeMs: 12,
        pvLine: ['4,6->4,4'],
      };
    });

    const controller = new BotMatchController({
      enabled: true,
      botPlayer: 'P2',
      humanPlayer: 'P1',
      bridge: mockBridge,
    });

    // Currently P1 is active (White)
    expect(gameStore.getState().domain.activePlayer).toBe('P1');
    const noopResult = await controller.checkAndTriggerBotTurn();
    expect(noopResult).toBeNull(); // Should not move on P1 turn

    // Execute human move: e2 (4,1) to e4 (4,3)
    const humanPieceId = gameStore.getState().domain.occupancy[asCoordinateKey('4,1')];
    const humanPiece = gameStore.getState().domain.boardEntities[humanPieceId] as IPieceEntity;
    const humanCmd = new MovePieceCommand(
      humanPiece.id,
      asCoordinateKey('4,1'),
      asCoordinateKey('4,3'),
      'P1'
    );
    gameStore.getState().executeCommand(humanCmd);

    // Now active player is P2 (Black)
    expect(gameStore.getState().domain.activePlayer).toBe('P2');

    // Bot triggers
    const botResult = await controller.checkAndTriggerBotTurn();
    expect(botResult).not.toBeNull();
    expect(botResult?.bestMove?.toCoord).toBe('4,4');

    // The move should have been executed on gameStore!
    const updatedDomain = gameStore.getState().domain;
    expect(updatedDomain.activePlayer).toBe('P1'); // Passed back to P1!
    expect(updatedDomain.occupancy[asCoordinateKey('4,4')]).toBe(botPieceId);
    expect(controller.getLastEvaluationScore()).toBe(-15);
    expect(controller.getLastCalculationTimeMs()).toBe(12);
  });

  it('rejects stale responses if match was reset or turn changed during calculation', async () => {
    let resolveSearch!: (val: IBestMoveResult) => void;
    const searchPromise = new Promise<IBestMoveResult>((resolve) => {
      resolveSearch = resolve;
    });

    const mockBridge = new EngineBridge({ workerPort: new MockWorkerPort(5) });
    vi.spyOn(mockBridge, 'calculateBestMove').mockImplementation(async () => {
      return searchPromise;
    });

    const controller = new BotMatchController({
      enabled: true,
      botPlayer: 'P2',
      bridge: mockBridge,
    });

    // Advance to P2
    const humanPieceId = gameStore.getState().domain.occupancy[asCoordinateKey('4,1')];
    const humanPiece = gameStore.getState().domain.boardEntities[humanPieceId] as IPieceEntity;
    gameStore.getState().executeCommand(
      new MovePieceCommand(
        humanPiece.id,
        asCoordinateKey('4,1'),
        asCoordinateKey('4,3'),
        'P1'
      )
    );

    // Bot starts thinking
    const botPromise = controller.checkAndTriggerBotTurn();
    expect(controller.getIsThinking()).toBe(true);

    // Match is reset or user clicks Undo while bot is thinking!
    controller.cancel();
    expect(controller.getIsThinking()).toBe(false);

    // Resolve delayed response
    resolveSearch({
      bestMove: {
        fromCoord: asCoordinateKey('4,6'),
        toCoord: asCoordinateKey('4,4'),
        pieceId: asEntityId('b-pawn-4'),
      },
      evaluationScore: 0,
      depthReached: 1,
      nodesCalculated: 10,
      calculationTimeMs: 5,
      pvLine: [],
    });

    const result = await botPromise;
    // Must be rejected as null because token was invalidated
    expect(result).toBeNull();
  });

  it('notifies subscribers when thinking state transitions', () => {
    const controller = new BotMatchController({ enabled: true });
    const listener = vi.fn();
    const unsub = controller.subscribe(listener);

    controller.cancel();
    expect(listener).toHaveBeenCalledWith(false);

    unsub();
  });
});
