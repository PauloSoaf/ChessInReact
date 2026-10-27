# ADR-005: Authoritative Multiplayer Architecture with Colyseus, Delta Schemas, and Free-Tier Optimization

- **Status:** Accepted
- **Date:** 2026-10-27
- **Author:** Antigravity Engine Architecture Team
- **Context:** Spec 03 — Multiplayer, N-Players e Sincronização de Estado

---

## 1. Context and Problem Statement

Multiplayer gameplay across topological boards, N-players, and fairy chess variants introduces non-trivial networking constraints:
1. **Cheat Prevention:** Client-authoritative games allow malicious packet injection (e.g. teleports, moving opponent pieces, moving out of turn). The game server must be the ultimate authority over game state mutations.
2. **Perceptual Latency:** Under continental network latencies (100–250ms), waiting for server round-trip confirmation before rendering a move produces severe input delay and sluggish UX.
3. **Bandwidth Optimization:** Transmitting the entire board state on each move across hundreds or thousands of cells overwhelms network links. Binary delta-encoding is strictly required.
4. **Session Recovery:** Mobile connections and browser tab sleeping frequently drop WebSockets. Players require seamless reconnection within a 60-second grace window without forfeit.
5. **Infrastructure Limits:** Hosting on Render.com free tier provides 256 MB RAM (updated pricing policy). The server memory footprint must remain under 250 MB under active matches.

---

## 2. Decision Drivers

- **Zero Perceived Latency:** Move interaction must register in $<2\text{ ms}$ on the client interface (RNF-06).
- **Packet Economy:** Move delta payloads must remain strictly below $150\text{ bytes}$ (RNF-02).
- **Strict Server Authority:** Server validates JWT handshake, turns, piece ownership, destination collisions, and rate limits (RF-01, RF-11, RF-12).
- **Deterministic Simulation:** Fixed simulation interval of 20 ticks per second (50ms) (RNF-15) with tick execution under 5ms (RNF-01).
- **Free-Tier Viability:** Strict memory budgeting keeping server RSS and heap under 250MB (RNF-03) with a warm-up `/health` endpoint to mitigate spin-down delays.

---

## 3. Considered Options

1. **Option A: Plain WebSockets with JSON Payloads (ws / Socket.IO)**
   - *Pros:* Minimal setup, familiar semantics.
   - *Cons:* JSON serialization is verbose (> 500 bytes per move), no automatic schema diffing, manual room state tracking, error-prone delta calculation.
2. **Option B: Colyseus (v0.15.57) with `@colyseus/schema` and `@colyseus/ws-transport`**
   - *Pros:* Native binary schema delta compression, room isolation, built-in reconnection leases, fixed timestep simulation loops, isomorphism with client TS.
   - *Cons:* Requires `useDefineForClassFields: false` in `tsconfig.json` to prevent class field initializers from overriding prototype schema decorators.
3. **Option C: Colyseus v0.18.x**
   - *Pros:* Newest release.
   - *Cons:* Hard peer dependency on `vite@>=6.0.0` which directly breaks workspace compatibility with Vite 5.2.10.

---

## 4. Decision

We adopt **Option B: Colyseus (v0.15.57) + `@colyseus/schema` (v2.0.37) + `@colyseus/ws-transport`**:

1. **Authoritative Room (`ChessRoom`):**
   - Extends Colyseus `Room<ChessRoomStateSchema>`.
   - Runs a fixed 20 ticks/sec simulation loop (50ms interval).
   - Validates JWT tokens on `onAuth` using HS256, audience, and issuer validation.
   - Manages player slots (WHITE, BLACK, SPECTATOR).
   - Emits ephemeral capture sound events (`PIECE_CAPTURED_EVENT`) and clock sync (`PONG`).
   - Implements 60-second reconnection lease via `allowReconnection(client, 60)`.
2. **Binary State Schema (`ChessRoomStateSchema`):**
   - Maps network entities (`NetworkEntitySchema`) and players (`PlayerSchema`) via `@colyseus/schema` binary decorators.
   - Enables delta compression sending only altered coordinate bytes (< 60 bytes per delta).
3. **Command Buffering & Collision Resolution (`TurnResolver`):**
   - Decoupled from transport layer.
   - Resolves sequential 1v1 turns (turn toggling, captures, anti-cheat validation).
   - Provides simultaneous resolution engine interface with piece weight priority and mutual annihilation.
4. **Anti-DoS Sliding Window Rate Limiter (`RateLimiter`):**
   - Enforces max 10 packets per second per client session (RF-11).
5. **Client Prediction & Rollback Bridge (`StateSyncBridge`):**
   - Connects Colyseus Room to Zustand `gameStore`.
   - Employs Gabriel Gambetta prediction model: optimistic local command execution, sequence counter tracking, ACK reconciliation, and rollback on server rejection.
6. **Clock Synchronization (`ColyseusClient`):**
   - Uses Cristian's algorithm with periodic ping telemetry to compute RTT and clock offset for synchronization within $\pm 10\text{ ms}$.
7. **Free-Tier Infrastructure (`server.ts`):**
   - `/health` endpoint for Render.com warm-up and memory telemetry.
   - Graceful shutdown (`gracefullyShutdown(false)`) handling `SIGINT`/`SIGTERM`.

---

## 5. Consequences and Invariants

- **TypeScript Config:** `"useDefineForClassFields": false` is permanently enforced in `tsconfig.json` to guarantee `@colyseus/schema` property getter/setter interception.
- **Server Authority:** The server never trusts client-supplied state or outcomes. Commands are rejected and rolled back if out of turn, invalid coordinate, or unowned piece.
- **Spec Boundary:** Spec 03 covers networking and authoritative room lifecycle. Complex variant fairy chess rule modding belongs strictly to Spec 04, and Redis multi-server matchmaking belongs to Spec 08.
