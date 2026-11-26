# Architectural Governance & Agent Directives — ChessInReact

> [!IMPORTANT]
> **Mandatory Architectural Directives for All Agents (including Gemini Flash and Subagents)**
> These rules are permanently active and bind all engineering, remediation, and auditing tasks across the `ChessInReact` repository.

---

## 1. Mandatory Consultation of Specifications (Pre-Implementation Gate)

1. **Mandatory Spec Reading:**
   - Before designing, implementing, or modifying any code, the agent MUST read in full the relevant formal specifications located in `ChessInReact/specs/`.
   - The foundation specification `Spec_01_Core_State_Architecture_ECS.md` MUST always be consulted for any changes impacting Core State, entities, coordinates, commands, serialization, or events.
   - For geometry, topologies, chunks, terrain, or procedural generation, `Spec_02_Procedural_Boards_Geometry_Topology.md` MUST be read in full.
   - For all other domains, consult the respective specification (`Spec_03` to `Spec_18`).

2. **Mandatory ADR & Decision Review:**
   - Always inspect Architecture Decision Records in `ChessInReact/reports/decisions/` (e.g. `ADR-001`, `ADR-002`, `ADR-003`, `ADR-004`, `ADR-005`) and existing active code to preserve architectural invariants.

3. **Domain Separation & Spec Boundaries (Specs 01 to 18):**
   - **Spec 01:** Core State Architecture, ECS, Entity Indexing, Commands, History, FlatArray & JSON Serialization.
   - **Spec 02:** Geometry, Topologies (Square, Hex, Triangle, Voronoi, Toroidal, Cubic), Procedural Noise, Chunks, Streaming, Fog of War, Pathfinding.
   - **Spec 03:** Multiplayer, Networking, Colyseus Authoritative Server, Rollback, Client-Side Prediction, Delta Sync, Tick Rate.
   - **Spec 04:** Rules Engine, Fairy Pieces, Betza Notation Mappers, Legality Validation, Modifiers (Atomic, Antichess), Check/Checkmate Resolution.
   - **Spec 05:** AI Engines, MCTS, Bots, Alpha-Beta, Move Ordering.
   - **Spec 06:** UI/UX, HUD, Presentation Layer, Viewport Responsiveness, Theme Management.
   - **Spec 07:** 3D WebGL Rendering, Three.js, R3F, Shaders, InstancedBufferGeometry, Poly Haven PBR Staunton Models.
   - **Spec 08:** Matchmaking, Lobbies, Redis Queue, Rating Brackets.
   - **Spec 09:** Database, Event Sourcing, PGN Persistence, Supabase.
   - **Spec 10:** Modding API, CI/CD, Free Tier Deployment.
   - **Spec 11:** Bot Ecosystem, Adaptive Learning, Personalities, Ratings.
   - **Spec 12:** Game Review, Analysis, Spell Chess Minigames (Official vs Expanded, Duck Chess, Bughouse, Puzzle Rush).
   - **Spec 13:** Expanded Variant Universe, Historical & Regional Engines (Shogi, Makruk, Xiangqi), 70+ Variants, 4 Families.
   - **Spec 14:** Massive Multiplayer Arenas (3 to 12 Players), Turn Cycle Manager, FFA Scoring, Simultaneous Orders.
   - **Spec 15:** Universal Bot Intelligence, Pluggable Engines (9 search families: MaxN, ISMCTS, JointMoveDuckPlanner, etc.).
   - **Spec 16:** Universal Lobby & Match Configurator (Dynamic Slots: Human/Bot/Remote/Standin), Expanded Hub, JSON Setup Import/Export.
   - **Spec 17:** Interactive Opening Explorer, ECO Classification Engine (A00-E99), Spaced-Repetition (Leitner/SM-2) Repertoire Trainer.
   - **Spec 18:** Competitive Tournaments, FIDE Swiss Pairing (Dutch Algorithm), Tie-breaks (Buchholz/Sonneborn-Berger), Arena & Berserk.
   - **Strict Rule:** Respect this domain separation. Never mix multiplayer logic into Spec 04, rendering into Spec 01, or rules into Spec 03.

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

3. **Sequential Spec Authorization & Remediation Scope:**
   - The user has formally authorized the autonomous audit, remediation, and sequential advancement across SPECs 01 to 18 according to the Continuous Remediation Protocol.
   - Advancing to the subsequent SPEC is only permitted after all known defects of the active SPEC are remediated, passing both primary compliance and adversarial audits with zero blocking regressions.
   - No `git push`, no merge to `main`, and no external infrastructure deployment without explicit user authorization.

---

## 4. Quality Gates & Regression Invariants

Every change must pass the full local quality gate suite:
1. `npx tsc --noEmit` — 0 errors.
2. `npm run lint` — 0 errors, 0 warnings.
3. `npm run build` — Production bundle build succeeds.
4. `npx vitest run --coverage` — Zero failures, zero skipped tests, topology coverage > 95%.
5. `node scripts/runChromiumSmoke.js` — Native Chromium headless smoke test passes (`skipped: false`).
6. `npm run bench:memory` (`node --expose-gc scripts/runMemoryBenchmark.js`) — Unmasked isolated memory benchmarks pass within spec budget.

---

## 5. Continuous Audit & Remediation Protocol

Each SPEC must undergo the following strict quality loop:
```
IDENTIFICAR SPEC -> LER INTEGRALMENTE -> LER REFERÊNCIAS & ADRS -> MAPEAR IMPLEMENTAÇÃO REAL
  -> AUDITORIA ESTÁTICA -> AUDITORIA FUNCIONAL -> AUDITORIA VISUAL/INTEGRAÇÃO -> COMPARAR REQUISITOS
  -> EXISTEM DEFEITOS?
       SIM -> DOCUMENTAR CAUSA -> CORRIGIR -> CRIAR REGRESSÃO -> REEXECUTAR GATES -> REAUDITAR
       NÃO -> AUDITORIA A (CONFORMIDADE) -> AUDITORIA B (ADVERSARIAL) -> HOMOLOGAÇÃO -> PRÓXIMA SPEC
```
- A status of `VERIFIED` requires current, reproducible execution evidence on the active branch and HEAD.
- Track every requirement in `reports/continuous-audit/REQUIREMENTS-TRACEABILITY.md` and log checkpoints in `reports/continuous-audit/NEXT-CHECKPOINT.md`.
