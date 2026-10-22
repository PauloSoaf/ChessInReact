# Architectural Governance & Agent Directives — ChessInReact

> [!IMPORTANT]
> **Mandatory Architectural Directives for All Agents (including Gemini Flash and Subagents)**
> These rules are permanently active and bind all engineering, remediation, and auditing tasks across the `ChessInReact` repository.

---

## 1. Mandatory Consultation of Specifications (Pre-Implementation Gate)

1. **Mandatory Spec Reading:**
   - Before designing, implementing, or modifying any code, the agent MUST read in full the relevant formal specifications located in `specs/`.
   - The foundation specification `Spec_01_Core_State_Architecture_ECS.md` MUST always be consulted for any changes impacting Core State, entities, coordinates, commands, serialization, or events.
   - For geometry, topologies, chunks, terrain, or procedural generation, `Spec_02_Procedural_Boards_Geometry_Topology.md` MUST be read in full.
   - For all other domains, consult the respective specification (`Spec_03` to `Spec_12`).

2. **Mandatory ADR & Decision Review:**
   - Always inspect Architecture Decision Records in `reports/decisions/` (e.g. `ADR-001`, `ADR-002`, `ADR-003`, `ADR-004`) and existing active code to preserve architectural invariants.

3. **Domain Separation & Spec Boundaries:**
   - **Spec 01:** Core State Architecture, ECS, Entity Indexing, Commands, History, FlatArray & JSON Serialization.
   - **Spec 02:** Geometry, Topologies (Square, Hex, Triangle, Voronoi), Procedural Noise, Chunks, Streaming, Fog of War, Pathfinding.
   - **Spec 03:** Multiplayer, Networking, Colyseus Authoritative Server, Rollback, Client-Side Prediction, Delta Sync, Tick Rate.
   - **Spec 04:** Rules Engine, Fairy Pieces, Betza Notation Mappers, Legality Validation, Modifiers (Atomic, Antichess), Check/Checkmate Resolution.
   - **Spec 05:** AI Engines, MCTS, Bots.
   - **Spec 06:** UI/UX, HUD, Presentation Layer.
   - **Spec 07:** 3D WebGL Rendering, Three.js, R3F, Shaders, InstancedBufferGeometry.
   - **Spec 08:** Matchmaking, Lobbies, Redis Queue.
   - **Spec 09:** Database, Event Sourcing, PGN Persistence, Supabase.
   - **Spec 10:** Modding API, CI/CD, Free Tier Deployment.
   - **Spec 11:** Bot Ecosystem, Adaptive Learning.
   - **Spec 12:** Game Review, Analysis, Spell Chess Minigames.
   - **Strict Rule:** Respect this domain separation. Never mix multiplayer logic into Spec 04 or rules into Spec 03.

---

## 2. Pre-Modification Architectural Briefing

Before modifying or creating any code files, the agent MUST explicitly present in its response:
1. **List of Consulted Specifications:** File paths, sections, and exact line ranges.
2. **Applicable Architectural Contracts:** Summary of relevant Functional Requirements (RF-xx), Non-Functional Requirements (RNF-xx), and ADR decisions.
3. **Conflict Detection:** Explicit confirmation of whether any conflict exists between specs, ADRs, and active implementation before altering architecture.

---

## 3. Strict Truthfulness, Assumptions, and Evidence

1. **Zero Hallucinated Requirements:**
   - Do NOT invent requirements, add speculative abstractions, or replace spec decisions with assumptions.
   - If a requirement is underspecified, verify against the spec or ask for clarification.

2. **Honest RNF Verification:**
   - Never classify a requirement as `VERIFIED` without verifiable automated tests or direct execution evidence under specified conditions.
   - If an aspect is partially verified, classify strictly as `PARTIAL`.
   - If an aspect depends on a future spec or infrastructure (e.g. GPU rendering in Spec 07, physical ARM64 runner), classify strictly as `DEFERRED` with explicit justification.
   - Never use clamping (`Math.max(0, ...)`) or masks to conceal GC drops or negative deltas.

3. **Sequential Spec Authorization:**
   - NEVER start the implementation of a subsequent Spec (e.g. Spec 03) without explicit, formal authorization from the user.

---

## 4. Quality Gates & Regression Invariants

Every change must pass the full local quality gate suite prior to push:
1. `npx tsc --noEmit` — 0 errors.
2. `npm run lint` — 0 errors, 0 warnings.
3. `npm run build` — Production bundle build succeeds.
4. `npx vitest run --coverage` — Zero failures, zero skipped tests, topology coverage > 95%.
5. `node scripts/runChromiumSmoke.js` — Native Chromium headless smoke test passes (`skipped: false`).
6. `npm run bench:memory` (`node --expose-gc scripts/runMemoryBenchmark.js`) — Unmasked isolated memory benchmarks pass within spec budget.
