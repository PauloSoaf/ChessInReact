import { Schema, MapSchema, type } from '@colyseus/schema';

/**
 * Binary-serializable entity schema representing a piece or obstacle on the authoritative board.
 * Conforms to Spec 03 Section 6 and Section 20.
 */
export class NetworkEntitySchema extends Schema {
  @type('string') public id: string = '';
  @type('string') public entityType: string = 'PIECE'; // 'PIECE' | 'TERRAIN' | 'OBSTACLE'
  @type('string') public position: string = ''; // Coordinate key, e.g. "e2" or "0,0,0"
  @type('string') public ownerId: string = ''; // PlayerId or empty for neutral
  @type('string') public variantId: string = ''; // e.g. 'P', 'N', 'B', 'R', 'Q', 'K'
  @type('boolean') public hasMoved: boolean = false;
  @type('boolean') public isCaptured: boolean = false;

  constructor(init?: Partial<NetworkEntitySchema>) {
    super();
    if (init) {
      if (init.id !== undefined) this.id = init.id;
      if (init.entityType !== undefined) this.entityType = init.entityType;
      if (init.position !== undefined) this.position = init.position;
      if (init.ownerId !== undefined) this.ownerId = init.ownerId;
      if (init.variantId !== undefined) this.variantId = init.variantId;
      if (init.hasMoved !== undefined) this.hasMoved = init.hasMoved;
      if (init.isCaptured !== undefined) this.isCaptured = init.isCaptured;
    }
  }
}

/**
 * Connected player or spectator metadata in the authoritative session.
 */
export class PlayerSchema extends Schema {
  @type('string') public sessionId: string = '';
  @type('string') public playerId: string = '';
  @type('string') public username: string = '';
  @type('string') public role: string = 'SPECTATOR'; // 'WHITE' | 'BLACK' | 'SPECTATOR'
  @type('boolean') public connected: boolean = true;
  @type('number') public ping: number = 0;

  constructor(init?: Partial<PlayerSchema>) {
    super();
    if (init) {
      if (init.sessionId !== undefined) this.sessionId = init.sessionId;
      if (init.playerId !== undefined) this.playerId = init.playerId;
      if (init.username !== undefined) this.username = init.username;
      if (init.role !== undefined) this.role = init.role;
      if (init.connected !== undefined) this.connected = init.connected;
      if (init.ping !== undefined) this.ping = init.ping;
    }
  }
}

/**
 * Root authoritative game room state synchronized via delta-compression with clients.
 */
export class ChessRoomStateSchema extends Schema {
  @type('string') public matchId: string = '';
  @type('string') public phase: string = 'WAITING'; // 'WAITING' | 'PLAYING' | 'RESOLVING' | 'GAME_OVER'
  @type('string') public activePlayerId: string = '';
  @type('number') public turnNumber: number = 1;
  @type('number') public turnTimeRemainingMs: number = 30000; // 30s per turn by default
  @type('number') public lastProcessedSequenceId: number = 0;
  @type('string') public winnerId: string = '';

  @type({ map: NetworkEntitySchema })
  public boardEntities = new MapSchema<NetworkEntitySchema>();

  @type({ map: PlayerSchema })
  public players = new MapSchema<PlayerSchema>();

  @type({ map: 'number' })
  public playerSequenceAcks = new MapSchema<number>();

  constructor(init?: Partial<ChessRoomStateSchema>) {
    super();
    if (init) {
      if (init.matchId !== undefined) this.matchId = init.matchId;
      if (init.phase !== undefined) this.phase = init.phase;
      if (init.activePlayerId !== undefined) this.activePlayerId = init.activePlayerId;
      if (init.turnNumber !== undefined) this.turnNumber = init.turnNumber;
      if (init.turnTimeRemainingMs !== undefined) this.turnTimeRemainingMs = init.turnTimeRemainingMs;
      if (init.lastProcessedSequenceId !== undefined) this.lastProcessedSequenceId = init.lastProcessedSequenceId;
      if (init.winnerId !== undefined) this.winnerId = init.winnerId;
    }
  }
}
