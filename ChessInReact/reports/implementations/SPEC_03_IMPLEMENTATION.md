# Spec 03 Implementation Report: Multiplayer, N-Players e Sincronização de Estado

- **Status:** Functional End-to-End Vertical Slice Implemented & Hardened (SPEC03-PATCH-01)
- **Branch:** `feat/spec03-authoritative-multiplayer`
- **Date:** 2026-10-28
- **Quality Gates:** 431 / 431 Tests Passed (59 Suites), TypeScript 0 Errors, ESLint 0 Warnings, Build Succeeded, Coverage 71.22%

---

## 1. Architecture and Module Structure

The authoritative multiplayer netcode is cleanly segregated across backend server rooms and client-side synchronization bridges:

```
ChessInReact/
├── src-backend/
│   └── game-server/
│       ├── auth/
│       │   └── jwtAuth.ts               # Cryptographic JWT token signing, verification & claims validation
│       ├── rooms/
│       │   ├── ChessRoom.ts             # Authoritative Colyseus Room with 20-tick simulation, JWT auth & command buffering
│       │   ├── StandardMoveValidator.ts # Pure geometric move validation (anti-teleport, path obstruction, bounds, directions)
│       │   ├── TurnResolver.ts          # Turn progression, anti-cheat validation, and simultaneous collision resolution
│       │   └── RateLimiter.ts           # Sliding-window token bucket (max 10 msgs/s) for anti-DoS
│       ├── schemas/
│       │   └── RoomStateSchema.ts       # Colyseus binary schemas: NetworkEntitySchema, PlayerSchema, ChessRoomStateSchema
│       ├── server.ts                    # Colyseus Server bootstrap with /health warm-up and graceful shutdown
│       └── __tests__/
│           ├── jwtAuth.test.ts
│           ├── RateLimiter.test.ts
│           ├── TurnResolver.test.ts
│           ├── multiplayerBenchmark.test.ts
│           └── multiplayerIntegration.test.ts
└── src/
    └── multiplayer/
        ├── types.ts                     # Network packet payloads and connection status contracts
        ├── ColyseusClient.ts            # Client WebSocket lifecycle, Cristian clock sync, reconnection
        ├── StateSyncBridge.ts           # Gabriel Gambetta optimistic prediction, reconciliation & rollback bridge
        └── __tests__/
            ├── ColyseusClient.test.ts
            └── StateSyncBridge.test.ts
```

---

## 2. Implemented Subsystems & Mechanics

### 2.1 Cryptographic JWT Handshake Authentication (`jwtAuth.ts`)
- Implements `signAuthToken(user, config)` and `verifyAuthToken(token, config)`.
- Fails fast at startup (`validateJwtBootstrap`) if `JWT_SECRET` is missing in production or shorter than 32 characters.
- Eliminates hardcoded default secret fallback in production environments (S03-02).
- Validates token signature (HS256), audience (`chessinreact-game-server`), issuer (`chessinreact-auth`), and expiration.
- Distinguishes player and spectator roles (`PLAYER` vs `SPECTATOR`).

### 2.2 Authoritative Move Validation (`StandardMoveValidator.ts`)
- Pure geometric validator enforcing:
  - Board boundaries (x, y between 0 and 7).
  - Trajectory legality for pawn (1-step forward, 2-step from initial rank, diagonal-only capture, path blocked check).
  - Raycast path unblocked check for Rook (orthogonal), Bishop (diagonal), and Queen (both).
  - Knight $L$-shaped jump offsets.
  - King 1-step radius.
  - Friendly piece collision prevention.
- Decodes both algebraic (`e2`) and Cartesian coordinate keys symmetrically (S03-01).

### 2.3 Binary State Schemas (`RoomStateSchema.ts`)
- Utilizes `@colyseus/schema` decorators (`@type`) to compile state structures to compact binary deltas.
- `NetworkEntitySchema`: Tracks `id`, `entityType`, `position`, `ownerId`, `variantId`, `hasMoved`, and `isCaptured`.
- `PlayerSchema`: Tracks `sessionId`, `playerId`, `username`, `role` (`WHITE` | `BLACK` | `SPECTATOR`), `connected`, and `ping`.
- `playerSequenceAcks: MapSchema<number>`: Dedicated per-player sequence ACK map ensuring ACKs never cross-prune predictions across opponents (S03-04).
- `ChessRoomStateSchema`: Dual map schemas (`boardEntities` and `players`), `matchId`, `phase`, `activePlayerId`, `turnNumber`, and `lastProcessedSequenceId`.

### 2.4 Authoritative Simulation & Lifecycle (`ChessRoom.ts`)
- Runs fixed simulation loop at 20 ticks per second (50ms interval) via `setSimulationInterval` (RNF-15).
- Enqueues moves into `moveCommandBuffer` and processes them deterministically on the next simulation tick (S03-05).
- Rejects replayed sequence IDs both at buffer insertion time and tick execution time.
- Enforces player identity isolation: same authenticated `playerId` cannot occupy both WHITE and BLACK sides (S03-03).
- Enforces 60-second reconnection lease via `allowReconnection(client, 60)` upon unconsented disconnection (RF-08).
- Decrements turn timer and handles forfeit / timeout automatically if disconnected client fails to return within 60 seconds (RF-09).
- Emits ephemeral capture sound events (`PIECE_CAPTURED_EVENT`) and handles clock telemetry (`PING` / `PONG`).

### 2.5 Anti-DoS Rate Limiter (`RateLimiter.ts`)
- Sliding window token bucket enforcing maximum 10 messages per second per client session (RF-11).
- Drops flooding requests and sends descriptive rejection notifications.

### 2.6 Client Prediction & Rollback Bridge (`StateSyncBridge.ts`)
- Implements Gabriel Gambetta client-side prediction model.
- Upon player move, executes `MovePieceCommand` locally on Zustand store immediately (< 2ms, RNF-06), adds command to pending buffer, and transmits `PLAYER_MOVE` with sequence ID.
- Automatically maps player identifier to canonical domain `PlayerId` (`P1` / `P2`).
- Upon receiving authoritative server delta, reconciles authoritative snapshot and replays remaining unconfirmed optimistic commands.
- Prunes pending commands strictly using the calling player's specific ACK, ignoring opponent sequence ACKs (S03-04).
- Upon receiving server `REJECT_MOVE` or `FORCE_ROLLBACK`, discards the rejected command and rolls back local state to the authoritative base.

### 2.7 Cristian's Clock Synchronization (`ColyseusClient.ts`)
- Periodically transmits `PING` with `clientSendTime`.
- Server responds with `PONG` containing `serverReceiveTime`.
- Client computes $RTT = T_{\text{receive}} - T_{\text{send}}$ and clock offset:
  $$\text{ClockOffset} = \left(T_{\text{server}} + \frac{RTT}{2}\right) - T_{\text{receive}}$$
- Calibrates timers to maintain sub-10ms synchronization precision (RNF-05).

