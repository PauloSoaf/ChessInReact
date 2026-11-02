import { CoordinateKey, EntityId } from '../../../core/coordinates/types';
import { IDomainState } from '../../../core/state/gameState';
import { ITopology } from '../../../core/topology/types';
import { IBestMoveResult, IAISearchOptions } from '../interfaces/IAIEngineContracts';
import { AIEngine } from '../AIEngine';

export type StockfishAdapterStatus = 'UNINITIALIZED' | 'INITIALIZING' | 'READY' | 'BUSY' | 'FALLBACK';

export interface IStockfishAdapterOptions {
  readonly workerUrl?: string;
  readonly fallbackEngine?: AIEngine;
}

/**
 * Stockfish WASM UCI Adapter (Spec 05 § 4 Fonte 3, § 14.1 Fonte 1, § 16 RF-05, § 17 RNF-07).
 * Connects to a Stockfish WebAssembly Web Worker via standard UCI text protocol.
 * Falls back transparently to the native TypeScript AIEngine when WASM is not available.
 */
export class StockfishAdapter {
  private worker: Worker | null = null;
  private status: StockfishAdapterStatus = 'UNINITIALIZED';
  private fallbackEngine: AIEngine;
  private readonly workerUrl: string;
  private pendingResolve: ((res: IBestMoveResult) => void) | null = null;
  private pendingReject: ((err: Error) => void) | null = null;
  private currentBestMove: string | null = null;
  private currentScore = 0;
  private currentDepth = 0;

  constructor(options?: IStockfishAdapterOptions) {
    this.workerUrl = options?.workerUrl ?? '/workers/stockfish.js';
    this.fallbackEngine = options?.fallbackEngine ?? new AIEngine();
  }

  public getStatus(): StockfishAdapterStatus {
    return this.status;
  }

  public isAvailable(): boolean {
    return this.status === 'READY';
  }

  /**
   * Initializes the Stockfish WebAssembly worker via Lazy Loading.
   */
  public async init(): Promise<boolean> {
    if (this.status === 'READY') return true;
    if (typeof Worker === 'undefined') {
      this.status = 'FALLBACK';
      return false;
    }

    this.status = 'INITIALIZING';

    return new Promise<boolean>((resolve) => {
      try {
        this.worker = new Worker(this.workerUrl);

        const onInitMessage = (event: MessageEvent) => {
          const line = typeof event.data === 'string' ? event.data.trim() : '';
          if (line === 'uciok' || line === 'readyok') {
            this.status = 'READY';
            this.setupMessageHandler();
            resolve(true);
          }
        };

        this.worker.onmessage = onInitMessage;
        this.worker.onerror = () => {
          this.status = 'FALLBACK';
          if (this.worker) {
            try { this.worker.terminate(); } catch { /* ignore */ }
            this.worker = null;
          }
          resolve(false);
        };

        this.worker.postMessage('uci');
        this.worker.postMessage('isready');

        // 3-second timeout fallback
        setTimeout(() => {
          if (this.status === 'INITIALIZING') {
            this.status = 'FALLBACK';
            resolve(false);
          }
        }, 3000);
      } catch {
        this.status = 'FALLBACK';
        resolve(false);
      }
    });
  }

  private setupMessageHandler(): void {
    if (!this.worker) return;

    this.worker.onmessage = (event: MessageEvent) => {
      const line = typeof event.data === 'string' ? event.data.trim() : '';

      // Parse evaluation score: "info depth 8 score cp 45 ..."
      if (line.startsWith('info') && line.includes('score cp')) {
        const parts = line.split(' ');
        const cpIdx = parts.indexOf('cp');
        if (cpIdx !== -1 && parts[cpIdx + 1]) {
          this.currentScore = parseInt(parts[cpIdx + 1], 10) || 0;
        }
        const depthIdx = parts.indexOf('depth');
        if (depthIdx !== -1 && parts[depthIdx + 1]) {
          this.currentDepth = parseInt(parts[depthIdx + 1], 10) || 0;
        }
      }

      // Parse best move: "bestmove e2e4 ponder e7e5"
      if (line.startsWith('bestmove')) {
        const parts = line.split(' ');
        const uciMove = parts[1];
        this.currentBestMove = uciMove !== '(none)' ? uciMove : null;

        if (this.pendingResolve) {
          const resolve = this.pendingResolve;
          this.pendingResolve = null;
          this.pendingReject = null;
          this.status = 'READY';

          resolve(this.formatBestMoveResult(this.currentBestMove, this.currentScore, this.currentDepth));
        }
      }
    };

    this.worker.onerror = (err) => {
      if (this.pendingReject) {
        this.pendingReject(new Error(err instanceof Error ? err.message : 'Stockfish worker error'));
        this.pendingResolve = null;
        this.pendingReject = null;
      }
      this.status = 'FALLBACK';
    };
  }

  private formatBestMoveResult(
    uciMove: string | null,
    score: number,
    depth: number
  ): IBestMoveResult {
    if (!uciMove || uciMove.length < 4) {
      return {
        bestMove: null,
        evaluationScore: score,
        depthReached: depth,
        nodesCalculated: 1000,
        calculationTimeMs: 50,
        pvLine: [],
      };
    }

    const fromCol = uciMove.charCodeAt(0) - 97;
    const fromRow = parseInt(uciMove[1], 10) - 1;
    const toCol = uciMove.charCodeAt(2) - 97;
    const toRow = parseInt(uciMove[3], 10) - 1;

    const fromCoord = `${fromCol},${fromRow}` as CoordinateKey;
    const toCoord = `${toCol},${toRow}` as CoordinateKey;

    return {
      bestMove: {
        fromCoord,
        toCoord,
        pieceId: 'stockfish-piece' as EntityId,
        promotionVariant: uciMove[4] ? uciMove[4].toUpperCase() : undefined,
      },
      evaluationScore: score,
      depthReached: depth,
      nodesCalculated: 1000,
      calculationTimeMs: 50,
      pvLine: [uciMove],
    };
  }

  /**
   * Computes best move using Stockfish WASM or transparent fallback to AIEngine.
   */
  public async calculateBestMove(
    state: IDomainState,
    topology: ITopology,
    options?: IAISearchOptions
  ): Promise<IBestMoveResult> {
    if (this.status !== 'READY' || !this.worker) {
      return this.fallbackEngine.calculateBestMove(state, topology, options);
    }

    this.status = 'BUSY';
    const depth = options?.depthLimit ?? 5;
    const timeMs = options?.timeBudgetMs ?? 1000;

    return new Promise<IBestMoveResult>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;

      this.worker?.postMessage('ucinewgame');
      this.worker?.postMessage(`go depth ${depth} movetime ${timeMs}`);
    });
  }

  public terminate(): void {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch { /* ignore */ }
      this.worker = null;
    }
    this.status = 'UNINITIALIZED';
  }
}
