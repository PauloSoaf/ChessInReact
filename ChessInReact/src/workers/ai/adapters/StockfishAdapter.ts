import { CoordinateKey, EntityId } from '../../../core/coordinates/types';
import { IPieceEntity } from '../../../core/entities/types';
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

  private currentNodes = 0;
  private searchStartTime = 0;
  private activeState: IDomainState | null = null;

  public static domainStateToFEN(state: IDomainState): string {
    const pieceCharMap: Record<string, string> = {
      PAWN: 'P',
      KNIGHT: 'N',
      BISHOP: 'B',
      ROOK: 'R',
      QUEEN: 'Q',
      KING: 'K',
    };

    const rows: string[] = [];
    for (let r = 7; r >= 0; r--) {
      let emptyCount = 0;
      let rowStr = '';
      for (let c = 0; c < 8; c++) {
        const coord = `${c},${r}` as CoordinateKey;
        const entityId = state.occupancy[coord];
        const piece = entityId ? state.boardEntities[entityId] : undefined;
        if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
          if (emptyCount > 0) {
            rowStr += emptyCount;
            emptyCount = 0;
          }
          const char = pieceCharMap[piece.variantId.toUpperCase()] ?? 'P';
          rowStr += piece.ownerId === 'P1' ? char.toUpperCase() : char.toLowerCase();
        } else {
          emptyCount++;
        }
      }
      if (emptyCount > 0) {
        rowStr += emptyCount;
      }
      rows.push(rowStr);
    }

    const boardPart = rows.join('/');
    const activeColor = state.activePlayer === 'P1' ? 'w' : 'b';

    // Castling rights (FIDE standard)
    let castling = '';
    const wKingId = state.occupancy['4,0' as CoordinateKey];
    const wKing = wKingId ? (state.boardEntities[wKingId] as IPieceEntity | undefined) : undefined;
    if (wKing && wKing.ownerId === 'P1' && wKing.variantId.toUpperCase() === 'KING' && !wKing.hasMoved) {
      const wKRookId = state.occupancy['7,0' as CoordinateKey];
      const wKRook = wKRookId ? (state.boardEntities[wKRookId] as IPieceEntity | undefined) : undefined;
      if (wKRook && wKRook.ownerId === 'P1' && wKRook.variantId.toUpperCase() === 'ROOK' && !wKRook.hasMoved) {
        castling += 'K';
      }
      const wQRookId = state.occupancy['0,0' as CoordinateKey];
      const wQRook = wQRookId ? (state.boardEntities[wQRookId] as IPieceEntity | undefined) : undefined;
      if (wQRook && wQRook.ownerId === 'P1' && wQRook.variantId.toUpperCase() === 'ROOK' && !wQRook.hasMoved) {
        castling += 'Q';
      }
    }

    const bKingId = state.occupancy['4,7' as CoordinateKey];
    const bKing = bKingId ? (state.boardEntities[bKingId] as IPieceEntity | undefined) : undefined;
    if (bKing && bKing.ownerId === 'P2' && bKing.variantId.toUpperCase() === 'KING' && !bKing.hasMoved) {
      const bKRookId = state.occupancy['7,7' as CoordinateKey];
      const bKRook = bKRookId ? (state.boardEntities[bKRookId] as IPieceEntity | undefined) : undefined;
      if (bKRook && bKRook.ownerId === 'P2' && bKRook.variantId.toUpperCase() === 'ROOK' && !bKRook.hasMoved) {
        castling += 'k';
      }
      const bQRookId = state.occupancy['0,7' as CoordinateKey];
      const bQRook = bQRookId ? (state.boardEntities[bQRookId] as IPieceEntity | undefined) : undefined;
      if (bQRook && bQRook.ownerId === 'P2' && bQRook.variantId.toUpperCase() === 'ROOK' && !bQRook.hasMoved) {
        castling += 'q';
      }
    }

    if (castling === '') {
      castling = '-';
    }

    // Algebraic En Passant
    let enPassant = '-';
    if (state.turnState?.enPassantTarget) {
      const ep = state.turnState.enPassantTarget;
      const commaIdx = ep.indexOf(',');
      if (commaIdx !== -1) {
        const col = Number(ep.substring(0, commaIdx));
        const row = Number(ep.substring(commaIdx + 1));
        if (Number.isInteger(col) && Number.isInteger(row) && col >= 0 && col < 8 && row >= 0 && row < 8) {
          enPassant = `${String.fromCharCode(97 + col)}${row + 1}`;
        }
      }
    }

    const halfmove = state.turnState?.fiftyMoveCounter ?? 0;
    const fullmove = Math.max(1, Math.floor((state.turnNumber + 1) / 2));

    return `${boardPart} ${activeColor} ${castling} ${enPassant} ${halfmove} ${fullmove}`;
  }

  private setupMessageHandler(): void {
    if (!this.worker) return;

    this.worker.onmessage = (event: MessageEvent) => {
      const line = typeof event.data === 'string' ? event.data.trim() : '';

      // Parse evaluation score and search stats: "info depth 8 score cp 45 nodes 12345 ..."
      if (line.startsWith('info')) {
        const parts = line.split(' ');
        const cpIdx = parts.indexOf('cp');
        if (cpIdx !== -1 && parts[cpIdx + 1]) {
          this.currentScore = parseInt(parts[cpIdx + 1], 10) || 0;
        }
        const depthIdx = parts.indexOf('depth');
        if (depthIdx !== -1 && parts[depthIdx + 1]) {
          this.currentDepth = parseInt(parts[depthIdx + 1], 10) || 0;
        }
        const nodesIdx = parts.indexOf('nodes');
        if (nodesIdx !== -1 && parts[nodesIdx + 1]) {
          this.currentNodes = parseInt(parts[nodesIdx + 1], 10) || 0;
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

          const elapsedMs = Math.round(performance.now() - this.searchStartTime);
          resolve(
            this.formatBestMoveResult(
              this.activeState,
              this.currentBestMove,
              this.currentScore,
              this.currentDepth,
              this.currentNodes,
              elapsedMs
            )
          );
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
    state: IDomainState | null,
    uciMove: string | null,
    score: number,
    depth: number,
    nodes: number,
    calculationTimeMs: number
  ): IBestMoveResult {
    if (!uciMove || uciMove.length < 4) {
      return {
        bestMove: null,
        evaluationScore: score,
        depthReached: depth,
        nodesCalculated: nodes,
        calculationTimeMs,
        pvLine: [],
      };
    }

    const fromCol = uciMove.charCodeAt(0) - 97;
    const fromRow = parseInt(uciMove[1], 10) - 1;
    const toCol = uciMove.charCodeAt(2) - 97;
    const toRow = parseInt(uciMove[3], 10) - 1;

    const fromCoord = `${fromCol},${fromRow}` as CoordinateKey;
    const toCoord = `${toCol},${toRow}` as CoordinateKey;
    const pieceId = state?.occupancy[fromCoord] ?? ('' as EntityId);

    return {
      bestMove: {
        fromCoord,
        toCoord,
        pieceId,
        promotionVariant: uciMove[4] ? uciMove[4].toUpperCase() : undefined,
      },
      evaluationScore: score,
      depthReached: depth,
      nodesCalculated: nodes,
      calculationTimeMs,
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
    this.activeState = state;
    this.searchStartTime = performance.now();
    const depth = options?.depthLimit ?? 5;
    const timeMs = options?.timeBudgetMs ?? 1000;
    const fen = StockfishAdapter.domainStateToFEN(state);

    return new Promise<IBestMoveResult>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;

      this.worker?.postMessage('ucinewgame');
      this.worker?.postMessage(`position fen ${fen}`);
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

  public dispose(): void {
    this.terminate();
  }
}
