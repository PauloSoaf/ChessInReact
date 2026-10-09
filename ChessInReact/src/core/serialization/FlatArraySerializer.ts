import { PlayerId } from '../coordinates/types';
import { IDomainState } from '../state/gameState';
import {
  BINARY_SCHEMA_VERSION,
  DeserializedWorkerState,
  ENTITY_STRIDE_INTS,
  EntityFieldOffset,
  EntityFlagsBinary,
  EntityTypeBinary,
  HEADER_SIZE_INTS,
  HeaderOffset,
  PlayerBinary,
  VariantBinary,
  WorkerSnapshot,
} from './types';

function playerToBinary(player: PlayerId): PlayerBinary {
  switch (player) {
    case 'P1': return PlayerBinary.P1;
    case 'P2': return PlayerBinary.P2;
    case 'P3': return PlayerBinary.P3;
    case 'P4': return PlayerBinary.P4;
    case 'P5': return PlayerBinary.P5;
    case 'P6': return PlayerBinary.P6;
    case 'P7': return PlayerBinary.P7;
    case 'P8': return PlayerBinary.P8;
    default: return PlayerBinary.NONE;
  }
}

function binaryToPlayer(val: number): PlayerId {
  switch (val) {
    case PlayerBinary.P1: return 'P1';
    case PlayerBinary.P2: return 'P2';
    case PlayerBinary.P3: return 'P3';
    case PlayerBinary.P4: return 'P4';
    case PlayerBinary.P5: return 'P5';
    case PlayerBinary.P6: return 'P6';
    case PlayerBinary.P7: return 'P7';
    case PlayerBinary.P8: return 'P8';
    default: return 'NONE';
  }
}

function variantToBinary(variantId?: string): VariantBinary {
  if (!variantId) return VariantBinary.UNKNOWN;
  switch (variantId.toUpperCase()) {
    case 'PAWN': return VariantBinary.PAWN;
    case 'KNIGHT': return VariantBinary.KNIGHT;
    case 'BISHOP': return VariantBinary.BISHOP;
    case 'ROOK': return VariantBinary.ROOK;
    case 'QUEEN': return VariantBinary.QUEEN;
    case 'KING': return VariantBinary.KING;
    case 'MOUNTAIN': return VariantBinary.MOUNTAIN;
    case 'WATER': return VariantBinary.WATER;
    default: return VariantBinary.UNKNOWN;
  }
}

function binaryToVariant(val: number): string {
  switch (val) {
    case VariantBinary.PAWN: return 'PAWN';
    case VariantBinary.KNIGHT: return 'KNIGHT';
    case VariantBinary.BISHOP: return 'BISHOP';
    case VariantBinary.ROOK: return 'ROOK';
    case VariantBinary.QUEEN: return 'QUEEN';
    case VariantBinary.KING: return 'KING';
    case VariantBinary.MOUNTAIN: return 'MOUNTAIN';
    case VariantBinary.WATER: return 'WATER';
    default: return 'UNKNOWN';
  }
}

/**
 * Serializes domain state into a contiguous Int32Array buffer with an accompanying
 * stringTable dictionary sidecar. This avoids 32-bit hash truncation and guarantees
 * 100% collision-free entity identity round-trip (AUDIT-03 & ADR-002).
 */
export function serializeStateForWorker(domain: IDomainState): WorkerSnapshot {
  const entities = Object.values(domain.boardEntities);
  const totalLength = HEADER_SIZE_INTS + entities.length * ENTITY_STRIDE_INTS;
  const buffer = new Int32Array(totalLength);
  const stringTable: string[] = [];

  // Write header
  buffer[HeaderOffset.SCHEMA_VERSION] = BINARY_SCHEMA_VERSION;
  buffer[HeaderOffset.ENTITY_COUNT] = entities.length;
  buffer[HeaderOffset.ACTIVE_PLAYER] = playerToBinary(domain.activePlayer);
  buffer[HeaderOffset.TURN_NUMBER] = domain.turnNumber;

  let offset = HEADER_SIZE_INTS;

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    stringTable.push(entity.id);

    let typeCode = EntityTypeBinary.UNKNOWN;
    let ownerCode = PlayerBinary.NONE;
    let flags = EntityFlagsBinary.NONE;
    let variantCode = VariantBinary.UNKNOWN;

    if (entity.type === 'PIECE') {
      typeCode = EntityTypeBinary.PIECE;
      ownerCode = playerToBinary(entity.ownerId);
      variantCode = variantToBinary(entity.variantId);
      if (entity.hasMoved) flags |= EntityFlagsBinary.HAS_MOVED;
      if (entity.isCaptured) flags |= EntityFlagsBinary.IS_CAPTURED;
    } else if (entity.type === 'TERRAIN') {
      typeCode = EntityTypeBinary.TERRAIN;
      variantCode = variantToBinary(entity.variantId);
    } else if (entity.type === 'OBSTACLE') {
      typeCode = EntityTypeBinary.OBSTACLE;
    }

    // Bit packing:
    // [Type: bits 28..31] | [Owner: bits 24..27] | [Flags: bits 16..23] | [Variant: bits 0..15]
    const packedWord =
      ((typeCode & 0x0f) << 28) |
      ((ownerCode & 0x0f) << 24) |
      ((flags & 0xff) << 16) |
      (variantCode & 0xffff);

    buffer[offset + EntityFieldOffset.TYPE_OWNER_FLAGS_VARIANT] = packedWord;

    // Parse coordinates (e.g. "x,y" or "q,r,s")
    const coordParts = entity.position.split(',').map((val) => parseInt(val, 10));
    buffer[offset + EntityFieldOffset.X_OR_Q] = coordParts[0] ?? 0;
    buffer[offset + EntityFieldOffset.Y_OR_R] = coordParts[1] ?? 0;
    buffer[offset + EntityFieldOffset.Z_OR_S] = coordParts[2] ?? 0;

    // Index into stringTable sidecar (zero-collision identity)
    buffer[offset + EntityFieldOffset.ID_STRING_INDEX] = i;

    offset += ENTITY_STRIDE_INTS;
  }

  return { buffer, stringTable };
}

/**
 * Deserializes an Int32Array and optional stringTable sidecar into typed structure
 * for worker consumption.
 */
export function deserializeWorkerState(
  buffer: Int32Array,
  stringTable?: readonly string[]
): DeserializedWorkerState {
  if (buffer.length < HEADER_SIZE_INTS) {
    throw new Error(
      `Malformed buffer: length ${buffer.length} is less than header size ${HEADER_SIZE_INTS}`
    );
  }

  const schemaVersion = buffer[HeaderOffset.SCHEMA_VERSION];
  if (schemaVersion !== BINARY_SCHEMA_VERSION) {
    throw new Error(
      `Schema version mismatch: buffer has version ${schemaVersion}, expected ${BINARY_SCHEMA_VERSION}`
    );
  }

  const entityCount = buffer[HeaderOffset.ENTITY_COUNT];
  const expectedLength = HEADER_SIZE_INTS + entityCount * ENTITY_STRIDE_INTS;
  if (buffer.length !== expectedLength) {
    throw new Error(
      `Buffer corruption: length is ${buffer.length}, expected ${expectedLength} for ${entityCount} entities`
    );
  }

  const activePlayer = binaryToPlayer(buffer[HeaderOffset.ACTIVE_PLAYER]);
  const turnNumber = buffer[HeaderOffset.TURN_NUMBER];

  const entities: DeserializedWorkerState['entities'][number][] = [];
  let offset = HEADER_SIZE_INTS;

  for (let i = 0; i < entityCount; i++) {
    const packed = buffer[offset + EntityFieldOffset.TYPE_OWNER_FLAGS_VARIANT];
    const typeCode = (packed >>> 28) & 0x0f;
    const ownerCode = (packed >>> 24) & 0x0f;
    const flags = (packed >>> 16) & 0xff;
    const variantCode = packed & 0xffff;

    let typeStr: 'PIECE' | 'TERRAIN' | 'OBSTACLE' = 'PIECE';
    if (typeCode === EntityTypeBinary.TERRAIN) typeStr = 'TERRAIN';
    else if (typeCode === EntityTypeBinary.OBSTACLE) typeStr = 'OBSTACLE';

    const ownerId = binaryToPlayer(ownerCode);
    const variantId = binaryToVariant(variantCode);
    const hasMoved = (flags & EntityFlagsBinary.HAS_MOVED) !== 0;
    const isCaptured = (flags & EntityFlagsBinary.IS_CAPTURED) !== 0;

    const x = buffer[offset + EntityFieldOffset.X_OR_Q];
    const y = buffer[offset + EntityFieldOffset.Y_OR_R];
    const z = buffer[offset + EntityFieldOffset.Z_OR_S];
    const idIndex = buffer[offset + EntityFieldOffset.ID_STRING_INDEX];

    const entityId =
      stringTable && stringTable[idIndex] !== undefined
        ? stringTable[idIndex]
        : `entity_${idIndex}`;

    entities.push({
      id: entityId,
      type: typeStr,
      ownerId,
      variantId,
      x,
      y,
      z,
      hasMoved,
      isCaptured,
    });

    offset += ENTITY_STRIDE_INTS;
  }

  return {
    schemaVersion,
    entityCount,
    activePlayer,
    turnNumber,
    entities,
  };
}

