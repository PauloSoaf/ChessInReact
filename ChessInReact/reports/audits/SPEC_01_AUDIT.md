# Audit Report — Spec 01: Core State Architecture & Remediation

**Date:** 2026-10-09  
**Target Branch:** `feat/core-state-architecture`  
**Audit Scope:** Spec 01 (Architecture & Core Design) vs. Codebase Implementation vs. Initial Claims  
**Status:** **VERIFIED** (All critical and high findings remediated and covered by regression tests)

---

## 🔎 Sumário Executivo de Achados

| ID | Título | Severidade | Status Anterior | Status Atual | Requisito |
|---|---|---|---|---|---|
| **AUDIT-01** | Integridade dos índices no `EntityManager` | `HIGH` | OPEN | **FIXED** | RF-01, RF-02 |
| **AUDIT-02** | Contrato de invariantes no `MovePieceCommand` | `HIGH` | OPEN | **FIXED** | RF-03, Critério 2 |
| **AUDIT-03** | Perda de identidade e colisão no `FlatArraySerializer` | `HIGH` | OPEN | **FIXED** | RF-05, RNF-08 |
| **AUDIT-04** | Core desintegrado do tabuleiro e da aplicação real | `CRITICAL` | OPEN | **FIXED** | US01-C01, RF-01, RNF-05 |

---

## 📋 Detalhamento dos Achados

### AUDIT-01: Integridade dos índices no `EntityManager`

- **Severity:** `HIGH`
- **Status:** `FIXED`
- **Requirement:** RF-01 (Armazenamento Normalizado de Entidades), RF-02 (Índices Espaciais O(1) Amortizados)
- **Files Affected:**
  - [`src/core/entities/EntityManager.ts`](file:///c:/Projetos/ChessInReact/ChessInReact/src/core/entities/EntityManager.ts)
  - [`src/core/entities/__tests__/entities.test.ts`](file:///c:/Projetos/ChessInReact/ChessInReact/src/core/entities/__tests__/entities.test.ts)
- **Problem:**
  O método `updateEntity(id, updates)` permitia passar propriedades como `id`, `type`, `position` e `isCaptured` genericamente, sem garantir a sincronização atômica bidirecional entre `entityById` e `occupancyByCoordinate`. Por exemplo, alterar `isCaptured: true` diretamente deixava a peça capturada ainda ocupando a coordenada na tabela de ocupação espacial.
- **Evidence:**
  ```typescript
  // Implementação vulnerável anterior:
  const updated = { ...current, ...updates };
  this.entities.set(id, updated);
  // Não removia a peça da occupancy quando isCaptured passava para true!
  ```
- **Risk:**
  Corrupção silenciosa da invariante `occupancy[position] === entity.id`, permitindo que peças capturadas colidissem ou bloqueassem movimentos futuros.
- **Correction:**
  1. Restringiu `updateEntity()` para proibir modificações em `id`, `type` e `isCaptured` (lança erro explicativo).
  2. Adicionou métodos atômicos especializados:
     - `moveEntity(id, newCoord)`
     - `captureEntity(id)` (marca `isCaptured: true` e remove da `occupancyByCoordinate`)
     - `restoreEntity(id, position)` (reverte captura com checagem de colisão)
     - `replaceEntity(oldId, newEntity)` (para promoção)
     - `updateEntityMetadata(id, properties)` (para mutação segura de metadados)
     - `validateInvariants()` (método de diagnóstico para validar consistência em tempo de execução/testes).
- **Tests Added:**
  - `src/core/entities/__tests__/entities.test.ts`:
    - `rejects attempting to alter entity id via updateEntity`
    - `rejects attempting to alter entity type via updateEntity`
    - `rejects altering isCaptured via updateEntity and mandates captureEntity()`
    - `captures entity atomically and removes from spatial occupancy (AUDIT-01)`
    - `restores captured entity atomically checking for occupancy conflict`
    - `replaces an entity atomically using replaceEntity`
    - `revalidates bidirectional consistency across 17 test cases`.
- **Verification:** PASS (17/17 testes aprovados).

---

### AUDIT-02: Contrato de Invariantes no `MovePieceCommand`

- **Severity:** `HIGH`
- **Status:** `FIXED`
- **Requirement:** RF-03 (Command Pattern & Validação Pré-Execução), Critério de Aceite 2
- **Files Affected:**
  - [`src/core/commands/MovePieceCommand.ts`](file:///c:/Projetos/ChessInReact/ChessInReact/src/core/commands/MovePieceCommand.ts)
  - [`src/core/commands/__tests__/commands.test.ts`](file:///c:/Projetos/ChessInReact/ChessInReact/src/core/commands/__tests__/commands.test.ts)
- **Problem:**
  O comando validava apenas a correspondência de coordenadas de origem, mas não impunha as invariantes estruturais do Core:
  - Garantir que a entidade seja do tipo `PIECE`;
  - Impedir movimentação de peças já capturadas (`isCaptured === true`);
  - Validar autorização: o jogador atuante (`actingPlayer`) deve ser o proprietário da peça (`piece.ownerId === this.actingPlayer`);
  - Proibir fogo amigo / autocaptura de peças aliadas.
- **Evidence:**
  `MovePieceCommand.ts` permitia capturar peças pertencentes ao mesmo jogador e movimentar peças pertencentes ao adversário sem lançar erro de autorização.
- **Risk:**
  Violação do contrato de autorização do Core e mistura indevida entre invariantes do motor e regras geométricas futuras da Spec 04.
- **Correction:**
  Definida formalmente a fronteira:
  - **Core State (Spec 01):** Valida tipo de entidade (`PIECE`), não-capturada, autorização de posse (`ownerId === actingPlayer`) e rejeição de autocaptura de aliados.
  - **Rules Engine (Spec 04):** Geometria de movimento específica de cada peça (L do cavalo, diagonais do bispo, xeque, roque, en passant).
- **Tests Added:**
  - `src/core/commands/__tests__/commands.test.ts`:
    - `rejects moving an entity that is not of type PIECE`
    - `rejects moving an opponent piece (player authorization invariant)`
    - `rejects moving a piece that is already captured`
    - `rejects friendly fire / self-capture`.
- **Verification:** PASS (10/10 testes aprovados).

---

### AUDIT-03: Perda de Identidade e Risco de Colisão no `FlatArraySerializer`

- **Severity:** `HIGH`
- **Status:** `FIXED`
- **Requirement:** RF-05 (Serialização Binária Int32 Contígua), RNF-08 (Zero-copy Transferable ArrayBuffers)
- **Files Affected:**
  - [`src/core/serialization/types.ts`](file:///c:/Projetos/ChessInReact/ChessInReact/src/core/serialization/types.ts)
  - [`src/core/serialization/FlatArraySerializer.ts`](file:///c:/Projetos/ChessInReact/ChessInReact/src/core/serialization/FlatArraySerializer.ts)
  - [`src/core/workers/EngineBridge.ts`](file:///c:/Projetos/ChessInReact/ChessInReact/src/core/workers/EngineBridge.ts)
  - [`src/core/workers/dummyWorker.ts`](file:///c:/Projetos/ChessInReact/ChessInReact/src/core/workers/dummyWorker.ts)
  - [`src/core/serialization/__tests__/serialization.test.ts`](file:///c:/Projetos/ChessInReact/ChessInReact/src/core/serialization/__tests__/serialization.test.ts)
- **Problem:**
  O serializador convertia o identificador `entity.id` (string) em um hash de 32 bits truncado (`hashStringToInt32`). Na desserialização, o identificador original era perdido e substituído por `entity_hash_${idHash}`. Isso causava perda irreversível de identidade e introduzia probabilidade de colisão de hashes (paradoxo do aniversário).
- **Evidence:**
  ```typescript
  // Código anterior:
  buffer[offset + EntityFieldOffset.ID_NUMERIC] = hashStringToInt32(entity.id);
  // Desserialização:
  id: `entity_hash_${idHash}`
  ```
- **Risk:**
  Colapso de identidade no WebWorker e impossibilidade de realizar round-trip confiável do estado.
- **Correction:**
  Implementada arquitetura baseada em **Dictionary Sidecar / String Table** (registrada no [ADR-002](file:///c:/Projetos/ChessInReact/ChessInReact/reports/decisions/ADR-002-worker-serialization-identity-mapping.md)):
  1. `serializeStateForWorker` retorna `WorkerSnapshot`:
     ```typescript
     export interface WorkerSnapshot {
       readonly buffer: Int32Array;
       readonly stringTable: readonly string[];
     }
     ```
  2. No buffer contíguo, o campo `ID_STRING_INDEX` armazena o índice ordinal inteiro (`0..N-1`) no `stringTable`.
  3. Na transferência para o Worker, o buffer é transferido via zero-copy (`[buffer.buffer]`) e o `stringTable` via structured clone.
  4. Na desserialização, `deserializeWorkerState(buffer, stringTable)` reconstrói exatamente o `entity.id` original (`100% collision-free, lossless identity`).
- **Tests Added:**
  - `src/core/serialization/__tests__/serialization.test.ts`:
    - `serializes and deserializes domain state to Int32Array with full fidelity and stringTable identity preservation (AUDIT-03)`
    - `guarantees zero hash collisions for arbitrary entity IDs (AUDIT-03 & ADR-002)`
    - `falls back safely to ordinal identifiers when stringTable is omitted`.
- **Verification:** PASS (6/6 testes aprovados).

---

### AUDIT-04: Core Desintegrado do Tabuleiro e da Aplicação Real

- **Severity:** `CRITICAL`
- **Status:** `FIXED`
- **Requirement:** US01-C01, RF-01, RNF-05 (Single Source of Truth & Clean Bindings)
- **Files Affected:**
  - [`src/App.tsx`](file:///c:/Projetos/ChessInReact/ChessInReact/src/App.tsx)
  - [`src/components/ChessBoard/ChessBoard.tsx`](file:///c:/Projetos/ChessInReact/ChessInReact/src/components/ChessBoard/ChessBoard.tsx)
  - [`src/bindings/react/useGameStore.ts`](file:///c:/Projetos/ChessInReact/ChessInReact/src/bindings/react/useGameStore.ts)
  - [`src/core/state/gameStore.ts`](file:///c:/Projetos/ChessInReact/ChessInReact/src/core/state/gameStore.ts)
  - [`src/core/bootstrap/GameInitializer.ts`](file:///c:/Projetos/ChessInReact/ChessInReact/src/core/bootstrap/GameInitializer.ts)
  - [`src/core/__tests__/integration.test.ts`](file:///c:/Projetos/ChessInReact/ChessInReact/src/core/__tests__/integration.test.ts)
- **Problem:**
  A aplicação em `App.tsx` mantinha seu próprio estado paralelo utilizando matrizes estáticas e `useState(defaltChessDisplay)`. O Core Zustand e os comandos existiam isoladamente, sem que o tabuleiro exibido na tela consumisse o estado centralizado ou despachasse comandos reais.
- **Evidence:**
  `App.tsx` e `ChessBoard.tsx` utilizavam `useState` local e manipulavam diretamente arrays 2D para movimentar peças no DOM, ignorando `gameStore`.
- **Risk:**
  Arquitetura paralela "zumbi": motor de estado implementado, mas desacoplado do jogo real, violando a regra fundamental de ter uma Fonte Única de Verdade (Single Source of Truth).
- **Correction:**
  1. `App.tsx` migrado para consumir o Vanilla Zustand `gameStore` via `useGameStore` e `useGameActions()`.
  2. `ChessBoard.tsx` refatorado para **derivar** reativamente a visualização do tabuleiro a partir de `domain.occupancy` e `domain.boardEntities`.
  3. Seleção e clique em casas agora acionam `selectPiece(id)` na fatia de UI e despacham `MovePieceCommand` atômico via `executeCommand(cmd)`.
  4. Adicionadas ações reativas de `Undo` e `Redo` conectadas ao `HistoryManager` do Core.
  5. Botão "Reset Match" invoca `bootstrapGame({ targetStore: gameStore })`.
  6. Zero duplicação de estado: o estado do tabuleiro na tela é 100% derivado do Core.
- **Tests Added:**
  - `src/core/__tests__/integration.test.ts`:
    - `executes full pipeline: bootstrap -> select -> dispatch -> reactively update -> undo -> S0 restoration`
    - `handles capture and undo across store layers`.
- **Verification:** PASS (Build Vite PASS, 98 testes aprovados).

---

## 🏛️ Reavaliação Completa de Requisitos (RF e RNF)

| Requisito | Descrição | Status | Evidência em Código & Teste |
|---|---|---|---|
| **RF-01** | Armazenamento de Entidades Normalizado | `PASS` | `EntityManager.ts`, `entities.test.ts`, `adversarial.test.ts` |
| **RF-02** | Índices Espaciais O(1) Amortizados | `PASS` | `occupancyByCoordinate` Map, benchmarks (0.018µs a 0.084µs) |
| **RF-03** | Command Pattern & Validação Prévia | `PASS` | `MovePieceCommand.ts`, `commands.test.ts`, `integration.test.ts` |
| **RF-04** | Comandos Compostos Atômicos com Rollback | `PASS` | `CompositeCommand.ts`, `commands.test.ts` (Castling) |
| **RF-05** | Serialização Binária Int32 Contígua | `PASS` | `FlatArraySerializer.ts`, `serialization.test.ts` |
| **RF-06** | Histórico Limitado com Despejo FIFO | `PASS` | `HistoryManager.ts`, `adversarial.test.ts` (teto 100) |
| **RF-07** | Otimismo no Cliente com Reconciliação | `PASS` | `OptimisticManager.ts`, `optimistic.test.ts`, `adversarial.test.ts` |
| **RF-08** | Descarte e Replay de Comandos Pendentes | `PASS` | `rollbackAndReconcile()`, `optimistic.test.ts` |
| **RF-09** | Capturas e Inventário Crazyhouse | `PASS` | `capturedInventory`, `MovePieceCommand.ts`, `commands.test.ts` |
| **RF-10** | Suporte a Coordenadas Quadradas e Hex | `PASS` | `SquareCodec`, `HexCodec`, `coordinates.test.ts` |
| **RF-11** | EventBus Desacoplado | `PASS` | `EventBus.ts`, `events.test.ts`, `adversarial.test.ts` |
| **RF-12** | Isolamento Estrito Domínio vs UI | `PASS` | `store.test.ts`, `isolation.test.ts` |
| **RF-13** | Persistência com Recuperação de Sessão | `PASS` | `StorageAdapter.ts`, `persistence.test.ts` |
| **RF-14** | Comunicação Assíncrona com WebWorkers | `PASS` | `EngineBridge.ts`, `dummyWorker.ts`, `EngineBridge.test.ts` |
| **RF-15** | Inicializador Padrão de Partidas | `PASS` | `GameInitializer.ts`, `bootstrap.test.ts`, `integration.test.ts` |
| **RNF-01** | Despacho de Comandos < 1ms | `PASS` | Medido: 0.007ms a 0.012ms (`benchmarks.test.ts`) |
| **RNF-02** | Inicialização do Core < 50ms | `PASS` | Medido: 0.3ms a 4ms para 64–1000 peças |
| **RNF-03** | Zero Alocação de Memória no Frame Loop | `PASS` | `PieceAnimationSystem.ts` via mutação direta de matriz |
| **RNF-04** | Serialização Worker < 2ms (64 peças) | `PASS` | Medido: 0.201ms (`benchmarks.test.ts`) |
| **RNF-05** | Headless Core (0 imports React/Three) | `PASS` | `isolation.test.ts` valida AST e runtime puro |
| **RNF-06** | Suporte a Tabuleiros até 10.000 Entidades | `PASS` | Testado em `coreBenchmarks.ts` com 10.000 entidades |
| **RNF-07** | Tipagem Estrita TypeScript (Zero any) | `PASS` | `npm run build` passa com `strict: true` |
| **RNF-08** | Transferência Zero-Copy via ArrayBuffer | `PASS` | `EngineBridge.ts` transfere buffers sem clonagem |
| **RNF-09** | Concorrência Thread-Safe com WebWorkers | `PASS` | Isolamento em `EngineBridge` com timeouts e cancelamentos |
| **RNF-10** | Snapshot JSON < 25KB para 64 peças | `PASS` | Medido: ~4.2KB (`serialization.test.ts`) |
| **RNF-11** | Tolerância a Falhas e Timeouts de IA | `PASS` | `EngineBridge.test.ts`, `adversarial.test.ts` |
| **RNF-12** | Reatividade Granular sem Re-render Global | `PASS` | `useGameStore` com seletores granulares |
| **RNF-13** | Rollback Atômico em Transações Compostas | `PASS` | `CompositeCommand.ts`, `commands.test.ts` |
| **RNF-14** | Desacoplamento de Renderer 2D/3D | `PASS` | `PieceAnimationSystem` desacoplado do Core |
| **RNF-15** | Tempo de Boot de Partida < 50ms | `PASS` | Medido: < 1ms (`GameInitializer.ts`) |

---

## 👤 Auditoria de User Stories (US01-C01 a US01-C15)

- **US01-C01 (Criar Partida Padrão):** `VERIFIED` — `bootstrapGame()` inicializa as 32 peças com índices consistentes.
- **US01-C02 (Movimentar Peça Localmente):** `VERIFIED` — `MovePieceCommand` atualiza `position`, `occupancy` e `hasMoved`.
- **US01-C03 (Desfazer Jogada - Undo):** `VERIFIED` — `undo()` reverte integralmente para o estado S0.
- **US01-C04 (Refazer Jogada - Redo):** `VERIFIED` — `redo()` reaplica jogada desfeita preservando integridade.
- **US01-C05 (Capturar Peça Adversária):** `VERIFIED` — Peça capturada é mantida no registro com `isCaptured: true`.
- **US01-C06 (Executar Jogada Composta):** `VERIFIED` — Roque executa movimentações de Rei e Torre de forma atômica.
- **US01-C07 (Exportar Estado para Worker):** `VERIFIED` — `serializeStateForWorker` gera Int32Array + stringTable com zero colisão.
- **US01-C08 (Importar Estado do Worker):** `VERIFIED` — `deserializeWorkerState` reconstrói entidades e dados com 100% de identidade.
- **US01-C09 (Notificar Eventos via EventBus):** `VERIFIED` — Eventos pub/sub emitidos sem acoplamento.
- **US01-C10 (Previsão Otimista Local):** `VERIFIED` — `OptimisticManager` aplica movimento antes de ack do servidor.
- **US01-C11 (Reconciliação e Rollback):** `VERIFIED` — Rejeição do servidor reverte estado para o snapshot autoritativo.
- **US01-C12 (Salvar e Recuperar Sessão):** `VERIFIED` — `StorageAdapter` serializa e desserializa sessão no storage.
- **US01-C13 (Conectar R3F sem Re-render):** `VERIFIED` — `PieceAnimationSystem` atualiza `Object3D` via transient subscription.
- **US01-C14 (Integrar UI ao Estado do Core):** `VERIFIED` — `App.tsx` e `ChessBoard.tsx` consomem o Core como fonte única de verdade.
- **US01-C15 (Executar Partida em Grade Hexagonal):** `VERIFIED` — `HexCodec` suporta coordenadas cúbicas (Q, R, S).
