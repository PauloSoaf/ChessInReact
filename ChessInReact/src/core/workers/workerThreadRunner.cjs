const { parentPort } = require('node:worker_threads');

if (parentPort) {
  parentPort.on('message', (msg) => {
    try {
      if (msg.type === 'PING') {
        parentPort.postMessage({ id: msg.id, type: 'PONG', result: 'PONG' });
        return;
      }

      if (
        msg.type === 'ECHO_STATE_METADATA' ||
        msg.type === 'VALIDATE_SERIALIZATION' ||
        msg.type === 'ECHO_DESERIALIZED_ENTITIES'
      ) {
        const { buffer, stringTable } = msg.payload || {};
        if (!buffer) {
          parentPort.postMessage({ id: msg.id, type: 'ERROR', error: 'Missing ArrayBuffer payload' });
          return;
        }
        if (!stringTable) {
          parentPort.postMessage({ id: msg.id, type: 'ERROR', error: 'Missing stringTable payload' });
          return;
        }

        const int32 = new Int32Array(buffer);
        const schemaVersion = int32[0];
        const entityCount = int32[1];
        const activePlayerCode = int32[2];
        const turnNumber = int32[3];

        if (schemaVersion !== 1) {
          parentPort.postMessage({ id: msg.id, type: 'ERROR', error: `Unsupported schemaVersion: ${schemaVersion}` });
          return;
        }

        if (msg.type === 'ECHO_STATE_METADATA') {
          parentPort.postMessage({
            id: msg.id,
            type: 'METADATA_RESULT',
            result: {
              schemaVersion,
              entityCount,
              activePlayer: activePlayerCode === 1 ? 'P1' : activePlayerCode === 2 ? 'P2' : 'NONE',
              turnNumber,
            },
          });
          return;
        }

        if (msg.type === 'VALIDATE_SERIALIZATION') {
          parentPort.postMessage({
            id: msg.id,
            type: 'VALIDATION_RESULT',
            result: {
              valid: true,
              entityCount,
            },
          });
          return;
        }

        // ECHO_DESERIALIZED_ENTITIES
        const entities = [];
        let offset = 4;
        for (let i = 0; i < entityCount; i++) {
          const packed = int32[offset];
          const typeCode = (packed >>> 28) & 0x0f;
          const ownerCode = (packed >>> 24) & 0x0f;
          const flags = (packed >>> 16) & 0xff;
          const variantCode = packed & 0xffff;

          const isHex = (flags & (1 << 2)) !== 0;
          const isCaptured = (flags & (1 << 1)) !== 0;
          const hasMoved = (flags & 1) !== 0;

          const x = int32[offset + 1];
          const y = int32[offset + 2];
          const z = int32[offset + 3];
          const idIdx = int32[offset + 4];

          const variantMap = {
            1: 'PAWN', 2: 'KNIGHT', 3: 'BISHOP', 4: 'ROOK', 5: 'QUEEN', 6: 'KING',
            7: 'MOUNTAIN', 8: 'WATER', 9: 'OBSTACLE_WALL'
          };

          entities.push({
            id: stringTable[idIdx],
            type: typeCode === 1 ? 'PIECE' : typeCode === 2 ? 'TERRAIN' : 'OBSTACLE',
            ownerId: ownerCode === 1 ? 'P1' : ownerCode === 2 ? 'P2' : 'NONE',
            kind: isHex ? 'HEX_CUBIC' : 'SQUARE',
            position: isHex ? `${x},${y},${z}` : `${x},${y}`,
            variantId: variantMap[variantCode],
            isCaptured,
            hasMoved,
            x,
            y,
            z,
          });
          offset += 5;
        }

        parentPort.postMessage({
          id: msg.id,
          type: 'DESERIALIZED_ENTITIES_RESULT',
          result: {
            schemaVersion,
            entityCount,
            activePlayer: activePlayerCode === 1 ? 'P1' : activePlayerCode === 2 ? 'P2' : 'NONE',
            turnNumber,
            entities,
          },
        });
        return;
      }

      parentPort.postMessage({ id: msg.id, type: 'ERROR', error: `Unknown request type: ${msg.type}` });
    } catch (err) {
      parentPort.postMessage({
        id: msg.id,
        type: 'ERROR',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
