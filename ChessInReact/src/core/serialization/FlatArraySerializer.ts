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

const MIN_INT32 = -2147483648;
const MAX_INT32 = 2147483647;

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
  if (!variantId) {
    throw new Error('Entity is missing mandatory variantId for binary serialization.');
  }
  switch (variantId.toUpperCase()) {
    case 'PAWN': return VariantBinary.PAWN;
    case 'KNIGHT': return VariantBinary.KNIGHT;
    case 'BISHOP': return VariantBinary.BISHOP;
    case 'ROOK': return VariantBinary.ROOK;
    case 'QUEEN': return VariantBinary.QUEEN;
    case 'KING': return VariantBinary.KING;
    case 'MOUNTAIN': return VariantBinary.MOUNTAIN;
    case 'WATER': return VariantBinary.WATER;
    case 'OBSTACLE_WALL': return VariantBinary.OBSTACLE_WALL;
    default:
      throw new Error(
        `Unsupported piece/terrain variant: "${variantId}". Binary protocol schema v1 only supports standard chess pieces and terrain variants.`
      );
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
    case VariantBinary.OBSTACLE_WALL: return 'OBSTACLE_WALL';
    default:
      throw new Error(`Buffer corruption: unrecognized variant code ${val}.`);
  }
}

interface ParsedCoordinates {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Validates coordinate string format, bounds, and cubic hex constraints.
 */
function parseAndValidateCoordinates(coord: string, entityId: string): ParsedCoordinates {
  if (typeof coord !== 'string' || coord.trim() === '') {
    throw new Error(`Invalid coordinate: entity "${entityId}" has empty or non-string position.`);
  }

  const parts = coord.split(',');
  if (parts.length !== 2 && parts.length !== 3) {
    throw new Error(
      `Invalid coordinate format "${coord}" for entity "${entityId}". Must be 2-part square "x,y" or 3-part hex "q,r,s".`
    );
  }

  const intParts: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i].trim();
    if (!/^-?\d+$/.test(raw)) {
      throw new Error(
        `Invalid coordinate component "${raw}" in "${coord}" for entity "${entityId}". Must be a valid integer.`
      );
    }
    const val = Number(raw);
    if (!Number.isSafeInteger(val) || val < MIN_INT32 || val > MAX_INT32) {
      throw new RangeError(
        `Coordinate value ${val} in "${coord}" for entity "${entityId}" exceeds 32-bit signed integer limits [${MIN_INT32}, ${MAX_INT32}].`
      );
    }
    intParts.push(val);
  }

  if (parts.length === 2) {
    // 2D square grid: (x, y) with z = 0
    return { x: intParts[0], y: intParts[1], z: 0 };
  } else {
    // 3D cubic hex coordinate: (q, r, s) with q + r + s = 0
    const [q, r, s] = intParts;
    if (q + r + s !== 0) {
      throw new Error(
        `Invalid hex cubic coordinate "${coord}" for entity "${entityId}": sum of q+r+s must equal 0, got ${q + r + s}.`
      );
    }
    return { x: q, y: r, z: s };
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

    let typeCode: EntityTypeBinary;
    let ownerCode = PlayerBinary.NONE;
    let flags = EntityFlagsBinary.NONE;
    let variantCode: VariantBinary;

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
      variantCode = VariantBinary.OBSTACLE_WALL;
    } else {
      throw new Error(
        `Unsupported entity type "${(entity as { type: string }).type}". Binary protocol only supports PIECE, TERRAIN, and OBSTACLE.`
      );
    }

    // Bit packing:
    // [Type: bits 28..31] | [Owner: bits 24..27] | [Flags: bits 16..23] | [Variant: bits 0..15]
    const packedWord =
      ((typeCode & 0x0f) << 28) |
      ((ownerCode & 0x0f) << 24) |
      ((flags & 0xff) << 16) |
      (variantCode & 0xffff);

    buffer[offset + EntityFieldOffset.TYPE_OWNER_FLAGS_VARIANT] = packedWord;

    // Parse and strictly validate coordinates
    const coords = parseAndValidateCoordinates(entity.position, entity.id);
    buffer[offset + EntityFieldOffset.X_OR_Q] = coords.x;
    buffer[offset + EntityFieldOffset.Y_OR_R] = coords.y;
    buffer[offset + EntityFieldOffset.Z_OR_S] = coords.z;

    // Index into stringTable sidecar (zero-collision identity)
    buffer[offset + EntityFieldOffset.ID_STRING_INDEX] = i;

    offset += ENTITY_STRIDE_INTS;
  }

  return { buffer, stringTable };
}

/**
 * Deserializes an Int32Array and stringTable sidecar into typed structure
 * for worker consumption.
 * stringTable is mandatory for lossless identity restoration (AUDIT-03).
 */
export function deserializeWorkerState(
  buffer: Int32Array,
  stringTable: readonly string[]
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
  if (entityCount < 0) {
    throw new Error(`Malformed buffer: negative entityCount ${entityCount}`);
  }
  const expectedLength = HEADER_SIZE_INTS + entityCount * ENTITY_STRIDE_INTS;
  if (buffer.length !== expectedLength) {
    throw new Error(
      `Buffer corruption: length is ${buffer.length}, expected ${expectedLength} for ${entityCount} entities`
    );
  }

  // Validate stringTable contract and integrity (AUDIT-03)
  if (!stringTable || !Array.isArray(stringTable)) {
    throw new Error(
      'Worker deserialization error: stringTable is mandatory for lossless worker state reconstruction (AUDIT-03).'
    );
  }

  if (stringTable.length !== entityCount) {
    throw new Error(
      `stringTable integrity failure: stringTable has ${stringTable.length} entries, expected ${entityCount} for entities.`
    );
  }

  const seenIds = new Set<string>();
  for (let idx = 0; idx < stringTable.length; idx++) {
    const id = stringTable[idx];
    if (typeof id !== 'string' || id.trim() === '') {
      throw new Error(`stringTable integrity failure: entry at index ${idx} is empty or not a string.`);
    }
    if (seenIds.has(id)) {
      throw new Error(`stringTable integrity failure: duplicate entity ID "${id}" detected at index ${idx}.`);
    }
    seenIds.add(id);
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

    let typeStr: 'PIECE' | 'TERRAIN' | 'OBSTACLE';
    if (typeCode === EntityTypeBinary.PIECE) {
      typeStr = 'PIECE';
    } else if (typeCode === EntityTypeBinary.TERRAIN) {
      typeStr = 'TERRAIN';
    } else if (typeCode === EntityTypeBinary.OBSTACLE) {
      typeStr = 'OBSTACLE';
    } else {
      throw new Error(`Buffer corruption: unrecognized entity type code ${typeCode}.`);
    }

    const ownerId = binaryToPlayer(ownerCode);
    const variantId = binaryToVariant(variantCode);
    const hasMoved = (flags & EntityFlagsBinary.HAS_MOVED) !== 0;
    const isCaptured = (flags & EntityFlagsBinary.IS_CAPTURED) !== 0;

    const x = buffer[offset + EntityFieldOffset.X_OR_Q];
    const y = buffer[offset + EntityFieldOffset.Y_OR_R];
    const z = buffer[offset + EntityFieldOffset.Z_OR_S];

    if (z !== 0 && x + y + z !== 0) {
      throw new Error(
        `Buffer corruption: hex coordinate at entity index ${i} violates q+r+s=0 constraint (${x},${y},${z}).`
      );
    }

    const idIndex = buffer[offset + EntityFieldOffset.ID_STRING_INDEX];

    if (idIndex < 0 || idIndex >= stringTable.length) {
      throw new Error(
        `Buffer corruption: entity at index ${i} has out-of-bounds stringTable index ${idIndex} (stringTable length is ${stringTable.length}).`
      );
    }
    const entityId = stringTable[idIndex];

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
