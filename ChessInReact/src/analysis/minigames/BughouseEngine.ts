/**
 * ChessInReact - Bughouse 2v2 Dual-Board Engine (Spec 12 § 5.4, § 8 RF-10)
 *
 * Implements:
 * 1. 2v2 Twin-Board Architecture:
 *    - Board A: Team 1 (White) vs Team 2 (Black)
 *    - Board B: Team 2 (White) vs Team 1 (Black)
 * 2. Cross-Board Captured Piece Transfer:
 *    - Pieces captured on Board A transfer instantly to partner's reserve on Board B.
 *    - Pieces captured on Board B transfer instantly to partner's reserve on Board A.
 * 3. Drop Move Mechanics:
 *    - Players can drop a piece from reserve on any vacant square on their turn.
 *    - Pawns cannot be placed on 1st or 8th ranks.
 * 4. Shared Victory Invariant:
 *    - First checkmate or resignation on either board awards victory to the corresponding team.
 */

import { IDomainState } from '../../core/state/gameState';
import { createDefaultDomainState } from '../../core/state/initialState';
import { createStandardChessPieces } from '../../core/bootstrap/GameInitializer';
import { RulesEngine } from '../../engine/rules/RulesEngine';
import { SquareTopology } from '../../core/topology/SquareTopology';
import { asCoordinateKey, asEntityId, CoordinateKey, EntityId } from '../../core/coordinates';
import { MovePieceCommand } from '../../core/commands/MovePieceCommand';
import { IPieceEntity, IEntity } from '../../core/entities/types';
import { PGNExporter } from '../../core/persistence/pgn/PGNExporter';

export type BughouseBoardId = 'BOARD_A' | 'BOARD_B';
export type BughouseTeam = 'TEAM_1' | 'TEAM_2';
export type BughousePieceType = 'p' | 'n' | 'b' | 'r' | 'q';

export interface IBughousePlayer {
  readonly id: string;
  readonly team: BughouseTeam;
  readonly boardId: BughouseBoardId;
  readonly color: 'WHITE' | 'BLACK';
  readonly reservePieces: readonly BughousePieceType[];
}

export interface IBughouseBoardState {
  readonly boardId: BughouseBoardId;
  readonly activeColor: 'WHITE' | 'BLACK';
  readonly fullmoveNumber: number;
  readonly isCheckmate: boolean;
  readonly isResigned: boolean;
  readonly domainState?: IDomainState;
}

export interface IBughouseMatchState {
  readonly matchId: string;
  readonly boardA: IBughouseBoardState;
  readonly boardB: IBughouseBoardState;
  readonly players: Record<string, IBughousePlayer>;
  readonly isGameOver: boolean;
  readonly winningTeam: BughouseTeam | null;
  readonly winReason?: string;
}

export class BughouseEngine {
  private static readonly topology = new SquareTopology({ width: 8, height: 8 });

  /**
   * Builds an isolated initial domain state populated with standard 32 Staunton pieces.
   */
  public static createInitialBoardDomain(matchId: string): IDomainState {
    const base = createDefaultDomainState(matchId, 'standard_square');
    const domain: IDomainState = {
      ...base,
      turnState: { ...base.turnState, phase: 'COMMIT' },
      boardEntities: {},
      occupancy: {},
    };
    const pieces = createStandardChessPieces();
    pieces.forEach((piece) => {
      domain.boardEntities[piece.id] = piece;
      if (piece.position) {
        domain.occupancy[piece.position] = piece.id;
      }
    });
    return domain;
  }

  /**
   * Initializes a full 4-player 2v2 Bughouse match state with two authoritative boards.
   */
  public static createMatch(
    players: {
      team1WhiteA: string; // Team 1, Board A (White)
      team1BlackB: string; // Team 1, Board B (Black)
      team2BlackA: string; // Team 2, Board A (Black)
      team2WhiteB: string; // Team 2, Board B (White)
    },
    matchId: string = `bug_${Date.now()}`
  ): IBughouseMatchState {
    const playerMap: Record<string, IBughousePlayer> = {
      [players.team1WhiteA]: {
        id: players.team1WhiteA,
        team: 'TEAM_1',
        boardId: 'BOARD_A',
        color: 'WHITE',
        reservePieces: [],
      },
      [players.team2BlackA]: {
        id: players.team2BlackA,
        team: 'TEAM_2',
        boardId: 'BOARD_A',
        color: 'BLACK',
        reservePieces: [],
      },
      [players.team2WhiteB]: {
        id: players.team2WhiteB,
        team: 'TEAM_2',
        boardId: 'BOARD_B',
        color: 'WHITE',
        reservePieces: [],
      },
      [players.team1BlackB]: {
        id: players.team1BlackB,
        team: 'TEAM_1',
        boardId: 'BOARD_B',
        color: 'BLACK',
        reservePieces: [],
      },
    };

    return {
      matchId,
      boardA: {
        boardId: 'BOARD_A',
        activeColor: 'WHITE',
        fullmoveNumber: 1,
        isCheckmate: false,
        isResigned: false,
        domainState: this.createInitialBoardDomain(`${matchId}_A`),
      },
      boardB: {
        boardId: 'BOARD_B',
        activeColor: 'WHITE',
        fullmoveNumber: 1,
        isCheckmate: false,
        isResigned: false,
        domainState: this.createInitialBoardDomain(`${matchId}_B`),
      },
      players: playerMap,
      isGameOver: false,
      winningTeam: null,
    };
  }

  /**
   * Identifies the partner player ID for a given player ID.
   */
  public static getPartnerId(state: IBughouseMatchState, playerId: string): string | null {
    const player = state.players[playerId];
    if (!player) return null;

    for (const [id, candidate] of Object.entries(state.players)) {
      if (id !== playerId && candidate.team === player.team) {
        return id;
      }
    }
    return null;
  }

  /**
   * Helper to normalize coordinate (e.g. 'e4' -> '4,3' or '4,3' -> '4,3').
   */
  public static normalizeCoord(coord: string): string {
    if (coord.includes(',')) return coord;
    try {
      return PGNExporter.algebraicToCoord(coord);
    } catch {
      return coord;
    }
  }

  /**
   * Translates internal piece variant ID into BughousePieceType ('p' | 'n' | 'b' | 'r' | 'q').
   */
  public static variantToBughouseType(variantId?: string): BughousePieceType | undefined {
    if (!variantId) return undefined;
    const v = variantId.toUpperCase();
    if (v.includes('PAWN')) return 'p';
    if (v.includes('KNIGHT')) return 'n';
    if (v.includes('BISHOP')) return 'b';
    if (v.includes('ROOK')) return 'r';
    if (v.includes('QUEEN')) return 'q';
    return undefined;
  }

  /**
   * Executes a move on one of the boards.
   * If a piece is captured, transfers it to the capturing player's partner on the opposite board.
   * Authoritatively evaluates move legality, captures, and checkmate when domainState is present.
   */
  public static executeMove(
    state: IBughouseMatchState,
    boardId: BughouseBoardId,
    playerId: string,
    move: {
      from: string;
      to: string;
      capturedPieceType?: BughousePieceType;
      isCheckmate?: boolean;
    }
  ): IBughouseMatchState {
    if (state.isGameOver) {
      throw new Error('A partida de Bughouse já foi encerrada.');
    }

    const player = state.players[playerId];
    if (!player || player.boardId !== boardId) {
      throw new Error('Jogador não pertence a este tabuleiro.');
    }

    const currentBoard = boardId === 'BOARD_A' ? state.boardA : state.boardB;
    if (currentBoard.activeColor !== player.color) {
      throw new Error('Não é o turno deste jogador.');
    }

    if (!currentBoard.domainState) {
      throw new Error(`Estado autoritativo de domínio ausente para o tabuleiro ${boardId}.`);
    }

    const nextDomain = JSON.parse(JSON.stringify(currentBoard.domainState)) as IDomainState;
    const fromNorm = this.normalizeCoord(move.from);
    const toNorm = this.normalizeCoord(move.to);
    const fromKey = asCoordinateKey(fromNorm);
    const toKey = asCoordinateKey(toNorm);

    const pieceId = nextDomain.occupancy[fromKey];
    if (!pieceId) {
      throw new Error(`Nenhuma peça encontrada na casa de origem ${move.from}.`);
    }

    const piece = nextDomain.boardEntities[pieceId] as IPieceEntity | undefined;
    const actingPlayer = player.color === 'WHITE' ? 'P1' : 'P2';
    if (nextDomain.activePlayer !== actingPlayer) {
      throw new Error(`Turno incorreto para o jogador ${player.color}.`);
    }
    if (!piece || piece.ownerId !== actingPlayer) {
      throw new Error(`A peça em ${move.from} não pertence ao jogador ativo (${player.color}).`);
    }

    // Authoritative Move Validation via RulesEngine
    const legalMoves = RulesEngine.getLegalMoves(nextDomain, this.topology);
    const matchedMove = legalMoves.find(
      (m) => m.from === fromKey && m.to === toKey && m.pieceId === pieceId
    );
    if (!matchedMove) {
      throw new Error(`Movimento ilegal de ${move.from} para ${move.to} rejeitado pelas regras autoritativas.`);
    }

    // Authoritative Capture Detection — NEVER trust caller's move.capturedPieceType
    let detectedCapture: BughousePieceType | undefined = undefined;
    const targetPieceId = nextDomain.occupancy[toKey];
    if (targetPieceId) {
      const targetPiece = nextDomain.boardEntities[targetPieceId] as IPieceEntity | undefined;
      if (targetPiece && targetPiece.ownerId !== actingPlayer) {
        detectedCapture = this.variantToBughouseType(targetPiece.variantId);
      }
    } else if (matchedMove.isEnPassant && matchedMove.capturedPieceId) {
      const epPiece = nextDomain.boardEntities[matchedMove.capturedPieceId] as IPieceEntity | undefined;
      if (epPiece) {
        detectedCapture = this.variantToBughouseType(epPiece.variantId);
      }
    }

    // Execute Move Command
    const cmd = new MovePieceCommand(
      asEntityId(pieceId),
      fromKey,
      toKey,
      actingPlayer,
      `bug_cmd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      true,
      false,
      undefined,
      this.topology
    );
    cmd.execute(nextDomain);

    // Authoritative Checkmate Detection — NEVER trust caller's move.isCheckmate
    let authoritativeCheckmate = false;
    const gameRes = RulesEngine.getGameResult(nextDomain, this.topology);
    if (gameRes.isGameOver && gameRes.status === 'CHECKMATE') {
      authoritativeCheckmate = true;
    }

    // Check checkmate win condition
    if (authoritativeCheckmate) {
      return {
        ...state,
        boardA: boardId === 'BOARD_A' ? { ...state.boardA, isCheckmate: true, domainState: nextDomain } : state.boardA,
        boardB: boardId === 'BOARD_B' ? { ...state.boardB, isCheckmate: true, domainState: nextDomain } : state.boardB,
        isGameOver: true,
        winningTeam: player.team,
        winReason: `Xeque-mate aplicado por ${player.color} na ${boardId}. Vitória da ${player.team}!`,
      };
    }

    // Clone players map to mutate reserves
    const updatedPlayers = { ...state.players };

    // Transfer captured piece to partner's reserve
    if (detectedCapture) {
      const partnerId = this.getPartnerId(state, playerId);
      if (partnerId && updatedPlayers[partnerId]) {
        const partner = updatedPlayers[partnerId];
        updatedPlayers[partnerId] = {
          ...partner,
          reservePieces: [...partner.reservePieces, detectedCapture],
        };
      }
    }

    // Advance turn on this board
    const nextActiveColor: 'WHITE' | 'BLACK' = currentBoard.activeColor === 'WHITE' ? 'BLACK' : 'WHITE';
    const nextFullmove = currentBoard.activeColor === 'BLACK' ? currentBoard.fullmoveNumber + 1 : currentBoard.fullmoveNumber;

    const updatedBoard: IBughouseBoardState = {
      ...currentBoard,
      activeColor: nextActiveColor,
      fullmoveNumber: nextFullmove,
      domainState: nextDomain,
    };

    return {
      ...state,
      boardA: boardId === 'BOARD_A' ? updatedBoard : state.boardA,
      boardB: boardId === 'BOARD_B' ? updatedBoard : state.boardB,
      players: updatedPlayers,
    };
  }

  /**
   * Translates internal BughousePieceType ('p'|'n'|'b'|'r'|'q') to canonical Variant ID.
   */
  public static bughouseTypeToVariant(type: BughousePieceType): string {
    switch (type) {
      case 'p': return 'PAWN';
      case 'n': return 'KNIGHT';
      case 'b': return 'BISHOP';
      case 'r': return 'ROOK';
      case 'q': return 'QUEEN';
      default: return 'PAWN';
    }
  }

  /**
   * Validates if a piece can be dropped from the player's reserve onto a target square.
   */
  public static canDropPiece(
    state: IBughouseMatchState,
    boardId: BughouseBoardId,
    playerId: string,
    pieceType: BughousePieceType,
    targetCoord: string,
    occupiedCoords?: ReadonlySet<string>
  ): { allowed: boolean; reason?: string } {
    if (state.isGameOver) {
      return { allowed: false, reason: 'Partida já finalizada.' };
    }

    const player = state.players[playerId];
    if (!player || player.boardId !== boardId) {
      return { allowed: false, reason: 'Jogador não pertence a este tabuleiro.' };
    }

    const currentBoard = boardId === 'BOARD_A' ? state.boardA : state.boardB;
    if (currentBoard.activeColor !== player.color) {
      return { allowed: false, reason: 'Não é o turno deste jogador.' };
    }

    if (!player.reservePieces.includes(pieceType)) {
      return { allowed: false, reason: 'Peça não disponível na reserva do jogador.' };
    }

    const normTarget = this.normalizeCoord(targetCoord);
    const targetKey = asCoordinateKey(normTarget);

    if (!this.topology.isValidCoordinate(targetKey)) {
      return { allowed: false, reason: 'A casa de destino está fora do tabuleiro.' };
    }

    // Pawn drop restriction: cannot drop on 1st or 8th rank
    if (pieceType === 'p') {
      const isFirstOrLastRank =
        targetCoord.endsWith('1') ||
        targetCoord.endsWith('8') ||
        normTarget.endsWith(',0') ||
        normTarget.endsWith(',7');
      if (isFirstOrLastRank) {
        return { allowed: false, reason: 'Peões não podem ser inseridos na primeira ou oitava fileira.' };
      }
    }

    // Authoritative check against board domainState occupancy (never trust external caller solely)
    if (currentBoard.domainState && currentBoard.domainState.occupancy[targetKey]) {
      return { allowed: false, reason: 'A casa de destino já está ocupada.' };
    }

    if (occupiedCoords && (occupiedCoords.has(targetCoord) || occupiedCoords.has(normTarget))) {
      return { allowed: false, reason: 'A casa de destino já está ocupada.' };
    }

    return { allowed: true };
  }

  /**
   * Executes a piece drop from reserve onto the board.
   */
  public static executeDrop(
    state: IBughouseMatchState,
    boardId: BughouseBoardId,
    playerId: string,
    pieceType: BughousePieceType,
    targetCoord: string,
    occupiedCoords?: ReadonlySet<string>
  ): IBughouseMatchState {
    const check = this.canDropPiece(state, boardId, playerId, pieceType, targetCoord, occupiedCoords);
    if (!check.allowed) {
      throw new Error(check.reason);
    }

    const player = state.players[playerId];
    const reserve = [...player.reservePieces];
    const pieceIndex = reserve.indexOf(pieceType);
    if (pieceIndex >= 0) {
      reserve.splice(pieceIndex, 1);
    }

    const updatedPlayers = {
      ...state.players,
      [playerId]: {
        ...player,
        reservePieces: reserve,
      },
    };

    const currentBoard = boardId === 'BOARD_A' ? state.boardA : state.boardB;
    const nextDomain: IDomainState | undefined = currentBoard.domainState
      ? JSON.parse(JSON.stringify(currentBoard.domainState))
      : undefined;

    if (nextDomain) {
      const normTarget = this.normalizeCoord(targetCoord);
      const targetKey = asCoordinateKey(normTarget);
      const actingPlayer = player.color === 'WHITE' ? 'P1' : 'P2';
      const variantId = this.bughouseTypeToVariant(pieceType);
      const dropId = asEntityId(`drop_${boardId}_${playerId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);

      const droppedPiece: IPieceEntity = {
        id: dropId,
        type: 'PIECE',
        ownerId: actingPlayer,
        variantId,
        position: targetKey,
        hasMoved: true,
        isCaptured: false,
        metadata: { isDropped: true },
      };

      (nextDomain.boardEntities as Record<EntityId, IEntity>)[dropId] = droppedPiece;
      (nextDomain.occupancy as Record<CoordinateKey, EntityId>)[targetKey] = dropId;
      (nextDomain as { activePlayer: 'P1' | 'P2' }).activePlayer =
        player.color === 'WHITE' ? 'P2' : 'P1';
      (nextDomain as { turnNumber: number }).turnNumber += 1;
      (nextDomain.turnState as {
        lastActionTimestamp: number;
        fiftyMoveCounter: number;
        enPassantTarget: CoordinateKey | null;
      }).lastActionTimestamp = Date.now();
      (nextDomain.turnState as {
        lastActionTimestamp: number;
        fiftyMoveCounter: number;
        enPassantTarget: CoordinateKey | null;
      }).fiftyMoveCounter = 0;
      (nextDomain.turnState as {
        lastActionTimestamp: number;
        fiftyMoveCounter: number;
        enPassantTarget: CoordinateKey | null;
      }).enPassantTarget = null;
      (nextDomain as { revision: number }).revision = (nextDomain.revision || 0) + 1;
    }

    const nextActiveColor: 'WHITE' | 'BLACK' = currentBoard.activeColor === 'WHITE' ? 'BLACK' : 'WHITE';
    const nextFullmove = currentBoard.activeColor === 'BLACK' ? currentBoard.fullmoveNumber + 1 : currentBoard.fullmoveNumber;

    const updatedBoard: IBughouseBoardState = {
      ...currentBoard,
      activeColor: nextActiveColor,
      fullmoveNumber: nextFullmove,
      domainState: nextDomain,
    };

    return {
      ...state,
      boardA: boardId === 'BOARD_A' ? updatedBoard : state.boardA,
      boardB: boardId === 'BOARD_B' ? updatedBoard : state.boardB,
      players: updatedPlayers,
    };
  }

  /**
   * Resignation on any board ends the match immediately, granting victory to opponent team.
   */
  public static resign(
    state: IBughouseMatchState,
    resigningPlayerId: string
  ): IBughouseMatchState {
    if (state.isGameOver) {
      return state;
    }

    const player = state.players[resigningPlayerId];
    if (!player) {
      throw new Error('Jogador desconhecido.');
    }

    const winningTeam: BughouseTeam = player.team === 'TEAM_1' ? 'TEAM_2' : 'TEAM_1';

    return {
      ...state,
      boardA: player.boardId === 'BOARD_A' ? { ...state.boardA, isResigned: true } : state.boardA,
      boardB: player.boardId === 'BOARD_B' ? { ...state.boardB, isResigned: true } : state.boardB,
      isGameOver: true,
      winningTeam,
      winReason: `Jogador ${resigningPlayerId} abandonou a partida na ${player.boardId}. Vitória da ${winningTeam}!`,
    };
  }
}
