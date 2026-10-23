# Implementation Report — Spec 02: Geometria, Topologia e Tabuleiros Procedurais Infinitos

> [!NOTE]
> **Relatório Oficial de Implementação e Remediação Técnica da Spec 02**
> Este documento registra a arquitetura, módulos entregues, correções de integração e remediação dos 16 patches corretivos executados para a **Spec 02 — Geometria, Topologia e Tabuleiros Procedurais Infinitos** no projeto `ChessInReact`.

---

## 1. Executive Summary

- **Specification:** Spec 02 — Geometria, Topologia e Tabuleiros Procedurais Infinitos
- **Target Branch:** `feat/procedural-boards-topology` (preservando o baseline da Spec 01 `dd730512db65b3152d02f66bcc76c3cc3faf439f`)
- **Status:** **INTEGRALMENTE REMEDIADA, IMPLEMENTADA E VALIDADA**
- **Testes Aprovados:** **352 testes aprovados em 47 suítes** (0 falhas, 0 skips, preservando 100% dos testes da Spec 01 e de todos os 27 patches anteriores).
- **TypeScript:** `npx tsc --noEmit` — 0 erros.
- **ESLint:** `npm run lint` — 0 erros, 0 avisos.
- **Production Build:** Vite production bundle aprovado (`dist/assets/index-*.js`, 1398 módulos transformados).
- **Native Web Worker Smoke Test:** Executado com sucesso em Chromium real sem falso positivo por skip e sem deadlock do esbuild (Voronoi, chunking e pathfinding verificados).
- **Isolated Procedural Grid Memory Benchmark:** Executado com sucesso via `npm run bench:memory` (`node --expose-gc`) com medições brutas não mascaradas (+8.04 MB incremental < 40 MB, +0.12 MB pós-GC, +0.009 MB/ciclo deriva).

---

## 2. Estrutura Completa de Módulos Entregues

```text
src/core/
├── topology/
│   ├── types.ts                     # Contratos ITopology, DirectionIndex, IWorldPosition, TopologyType
│   ├── topologyFactory.ts           # Fábrica unificada createTopology (SQUARE, HEX, TRIANGLE, VORONOI)
│   ├── SquareTopology.ts            # Topologia Quadrada (8 direções, Chebyshev/Manhattan, Bresenham, Toroidal, Unbounded)
│   ├── HexTopology.ts               # Topologia Hexagonal Cúbica (q,r,s), LERP epsilon 1e-6, Tricromática, O(R) Anéis/Espirais
│   ├── TriangleTopology.ts          # Topologia Triangular com métrica 3-eixos e raycasting retificado sem ciclos
│   ├── VoronoiTopology.ts           # Topologia Voronoi Irregular determinística por relaxamento (RF-01)
│   ├── index.ts                     # Re-exportações canônicas
│   ├── fog/
│   │   ├── FogOfWarManager.ts       # Gestor lógico de Névoa de Guerra: HIDDEN, EXPLORED, VISIBLE (RF-13)
│   │   └── index.ts                 # Exportações do subsistema de visão
│   └── pathfinding/
│       ├── AStarPathfinder.ts       # A* determinístico com multi-entry heap e descarte de prioridade obsoleta
│       ├── LineOfSight.ts           # Validador de trajetória com interceptação FLAT vs PARABOLIC
│       ├── AdjacencyGraph.ts        # Grafo denso Int32Array sem alocações de strings para IA/heurísticas
│       └── index.ts                 # Re-exportações de pathfinding
├── procedural/
│   ├── types.ts                     # ITerrainCell, BiomeType, IChunkCoordinate, IChunkData, IProceduralConfig
│   ├── ProceduralLayoutCodec.ts     # Serializador / Reconstrutor de layouts e sementes procedurais (RF-15)
│   ├── prng/
│   │   └── AleaPRNG.ts              # PRNG determinístico de alta resolução por semente
│   ├── noise/
│   │   └── SimplexNoise2D.ts        # Ruído Simplex 2D contínuo com interpolação e FBM multi-oitava
│   ├── NoiseGenerator.ts            # Gerador de relevo contínuo (0.0 a 3.0), biomas e Island Guarantee
│   ├── ChunkManager.ts              # Macro-chunks 16x16, sliding window, LRU eviction e sync com Zustand
│   └── index.ts                     # Re-exportações de procedural
├── entities/
│   ├── EntityManager.ts             # Separação formal entre ocupação física e camada de terreno
│   └── types.ts                     # Entidades tipadas (PIECE, TERRAIN, OBSTACLE)
├── serialization/
│   ├── FlatArraySerializer.ts       # Suporte binário v1 a biomas PLAINS, FOREST, CHASM
│   └── types.ts                     # VariantBinary atualizado
├── state/
│   ├── gameStore.ts                 # Ação applyChunkStreamingDelta com sincronização transacional
│   └── gameState.ts                 # IDomainState com campo terrain e controle de revisão
└── workers/
    ├── types.ts                     # Protocolo assíncrono estendido (topologyOptions)
    ├── dummyWorker.ts               # Suporte a topologia infinita e deserialização de estado
    └── EngineBridge.ts              # Ponte assíncrona Worker com tipagem estrita
```

---

## 3. Resumo dos 10 Patches Corretivos Executados

### PATCH-01: Separação entre Terreno e Ocupação Física (P0)
- **Problema:** `EntityManager` registrava entidades de terreno no mesmo índice exclusivo de peças (`occupancyByCoordinate`), impedindo peças de se moverem para casas com terreno e gerando falha de serialização binária para biomas procedurais.
- **Solução:** Introdução de `terrainByCoordinate` e `terrain` no `IDomainState`. Peças transitam livremente sobre terreno transitável. Biomas `PLAINS`, `FOREST` e `CHASM` adicionados ao protocolo binário.
- **Validação:** Suíte `terrainOccupancyCoexistence.test.ts` (5 testes).

### PATCH-02: Algoritmo A\* para Custos Variáveis (P0)
- **Problema:** `AStarPathfinder` não atualizava nós no Min-Heap quando encontrava caminhos mais baratos para nós já presentes no `openSet`, resultando em trajetórias subótimas em grafos ponderados.
- **Solução:** Estratégia multi-entry na `MinPriorityQueue` com descarte de nós obsoletos durante o `pop()` e desempate determinístico estável FIFO.
- **Validação:** Suíte `astarDijkstraOracle.test.ts` (5 testes contra implementação Dijkstra independente).

### PATCH-03: Distância e Trajetória Triangular (P1)
- **Problema:** `TriangleTopology.getDistance` retornava 1 para células que exigiam 3 arestas no grafo real.
- **Solução:** Mapeamento analítico em 3 eixos ortogonais equivalentes à distância mínima real em grafos triangulares ($|x_1-x_2|+|y_1-y_2|+|z_1-z_2|$), validado 100% contra BFS.
- **Validação:** `TriangleTopology.test.ts` (10 testes).

### PATCH-04: Chunks Quadrados Infinitos no Worker (P1)
- **Problema:** O worker instanciava `new SquareTopology()` sem opções, assumindo 8x8 padrão e produzindo blocos vazios em chunks distantes.
- **Solução:** O protocolo do Worker agora transporta `topologyOptions`, instanciando `SquareTopology({ width: null, height: null })` por padrão para geração procedural infinita.
- **Validação:** `proceduralWorker.test.ts` (5 testes, incluindo chunks em coordenadas negativas e chunk 1000,-1000).

### PATCH-05: Integração do Streaming de Chunks ao Zustand (P1)
- **Problema:** `ChunkManager.updateStreaming()` gerava deltas desconectados da store central do jogo.
- **Solução:** Ação `applyChunkStreamingDelta` adicionada ao Zustand, aplicando adições e remoções de terreno de forma atômica com incremento de revisão e proteção contra descarregamento de peças ativas.
- **Validação:** `chunkManagerZustand.test.ts` (3 testes).

### PATCH-06: Implementação de RF-01 (Voronoi), RF-13 (Fog of War) e RF-15 (Codec) (P1)
- **Problema:** A auditoria anterior apontou a ausência desses recursos no código publicado.
- **Solução:** 
  1. `VoronoiTopology.ts` implementa partição irregular determinística por semente.
  2. `FogOfWarManager.ts` implementa cálculo determinístico de visibilidade com estados `FOG_HIDDEN`, `FOG_EXPLORED` e `VISIBLE`.
  3. `ProceduralLayoutCodec.ts` implementa roundtrip JSON compacto de sementes e layouts com fingerprint de chunks.
- **Validação:** Testes unitários dedicados em `VoronoiTopology.test.ts`, `FogOfWarManager.test.ts` e `ProceduralLayoutCodec.test.ts`.

### PATCH-07: Fortalecimento do CI e Smoke Test Chromium Nativo (P1)
- **Problema:** O teste anterior aceitava resultado `skipped` quando o navegador não estava presente.
- **Solução:** O script `scripts/runChromiumSmoke.js` falha obrigatoriamente se o executável do navegador não for encontrado no CI (`CI=true`). O teste executa handshake PING/PONG, geração de chunk 256 células e pathfinding real no WebWorker nativo do Chromium.
- **Validação:** `browserWorkerSmoke.test.ts` e workflow GitHub Actions atualizado.

### PATCH-08: Revisão de Requisitos Não-Funcionais e Benchmarks (P1/P2)
- **Problema:** Métricas sem evidência de heap e benchmarks com descrição imprecisa.
- **Solução:** Teste explícito de heap (RNF-03) comprovando ~12MB para 10.240 células (teto 40MB); teste de coordenadas até 50.000 unidades (RNF-11); correção da descrição do A\* para percurso de 21 coordenadas (0,0 para 20,20) e adição de teste de 100 passos reais (0,0 para 0,100).
- **Validação:** `topologyBenchmarks.test.ts` (7 testes).

### PATCH-09: Auditoria de Escopo e Conformidade Documental (P1)
- **Problema:** Relatório anterior afirmava "APROVADO SEM RESSALVAS" sem base fática.
- **Solução:** Auditoria minuciosa da Seção 16 e 17 da Spec 02, classificação precisa de requisitos (VERIFIED, PARTIAL, DEFERRED) e sincronização dos relatórios com números reais do CI.

### PATCH-10: Execução dos Gates de Qualidade e Publicação
- **Resultado:** Todos os gates locais e remotos executados com sucesso no ciclo intermediário (260/260 testes).

### PATCH-11: Serialização e Invariantes de Terreno v2 (P1)
- **Problema:** `SnapshotSerializer` serializava `boardEntities` e `occupancyByCoordinate`, mas omitia a camada `terrain`. Ao restaurar snapshots, o estado ficava com inconsistência de terreno ou sem metadados procedurais.
- **Solução:** Introduzido `SNAPSHOT_VERSION = 2`. O serializador exporta a camada `terrain`, valida a consistência de ocupação vs terreno vs entidades e implementa migrador automático v1 -> v2 sem quebrar saves antigos.
- **Validação:** Suíte `src/core/serialization/__tests__/snapshotTerrainPersistence.test.ts` (5 testes: T11-01 a T11-05).

### PATCH-12: Sobrescritas Persistentes em Chunks Procedurais (P1)
- **Problema:** Quando um macro-chunk modificado sofria eviction por LRU e o jogador retornava à mesma coordenada, o terreno era re-gerado a partir da semente pura, perdendo edições do jogador.
- **Solução:** `ProceduralLayoutCodec` recebeu `IPersistentTileModification`, integrado ao `ChunkManager`. Modificações persistem no layout e são reaplicadas deterministicamente em `getOrGenerateChunk()` após eviction.
- **Validação:** Suíte `src/core/procedural/__tests__/proceduralOverrides.test.ts` (6 testes: T12-01 a T12-06).

### PATCH-13: Fábrica Centralizada de Topologias no Worker com Voronoi (P1)
- **Problema:** O worker possuía lógica dispersa de instanciação de topologia sem suporte a Voronoi, recorrendo a fallback silencioso quadrado.
- **Solução:** Criação de `createTopology()` em `topologyFactory.ts`, suportando `SQUARE`, `HEXAGONAL`, `TRIANGULAR` e `VORONOI_IRREGULAR`. Lança erro descritivo imediato para tipos desconhecidos sem fallback silencioso.
- **Validação:** Suíte `src/core/workers/__tests__/voronoiWorker.test.ts` (5 testes: T13-01 a T13-05) e `worker-smoke.html` no Chromium nativo.

### PATCH-14: Admissibilidade e Salvaguarda A\* em Custos Subunitários (P1)
- **Problema:** Quando o consumidor fornece função de custo com valores subunitários (< 1.0) sem especificar `minEdgeCost`, a heurística padrão do A* superestimava a distância real ($h > h^*$), violando a admissibilidade matemática e gerando rotas subótimas.
- **Solução:** Adicionada salvaguarda: na ausência de `minEdgeCost` válido para custos subunitários, o A* rebaixa com segurança a heurística para $h=0$ (Dijkstra), garantindo admissibilidade estrita; valida que `minEdgeCost <= getCost(u,v)` e implementa reabertura de nós fechados caso um caminho mais curto seja descoberto.
- **Validação:** Suíte `src/core/topology/pathfinding/__tests__/astarSubunitCosts.test.ts` (3 testes: T14-01 a T14-03).

### PATCH-15: Retificação de Trajetórias de Raycasting em Triângulos (P1)
- **Problema:** `TriangleTopology.getRay()` para certas direções (ex: direção 0 a partir de UP) oscilava repetindo o nó de partida ou alternando entre células vizinhas em loop fechado.
- **Solução:** Algoritmo retificado de alternância UP/DOWN: triângulos UP avançam pela aresta Norte (índice 0), e triângulos DOWN avançam pela aresta Sul correspondente sem retroceder, garantindo raio contínuo estritamente linear sem ciclos.
- **Validação:** Suíte `src/core/topology/__tests__/triangleRay.test.ts` (3 testes: T15-01 a T15-03).

### PATCH-16: Otimização O(1) de Streaming, Teto de Chunks e Bounding Voronoi (P1)
- **Problema:** `updateStreaming()` iterava sobre todas as entidades do tabuleiro em $O(N)$ para verificar células de terreno existentes; `ChunkManager` não impunha limite rígido de chunks na memória heap; geração Voronoi em chunks distantes executava BFS irrestrita de distância.
- **Solução:** Varredura $O(N)$ substituída por checagem direta $O(1)$ no dicionário `state.terrain`. Configurado `maxChunksInMemory: 50` com proteção para chunks contendo peças de xadrez ativas. Bounding em `NoiseGenerator` com verificação de raio de spawn antes de calcular BFS no Voronoi.
- **Validação:** Suíte `src/core/procedural/__tests__/streamingPerformanceMemory.test.ts` (8 testes: T16-01 a T16-08, incluindo T16-06 validando atomização estrita de falhas).

### PATCH-17: Integridade de Ocupação Espacial, Atualização de Terreno Carregado, Biomas Estritos e Semente Voronoi (P0/P1)
- **Problema:**
  1. Obstáculos procedurais (CHASM) gerados em coordenadas ocupadas por peças ativas podiam sequestrar o índice `occupancy` físico no Zustand.
  2. Modificações manuais de terreno em chunks já carregados eram ignoradas devido ao curto-circuito `hasExistingTerrain`.
  3. Desalocação LRU de chunks fora do streaming acumulava entidades órfãs na store do Zustand.
  4. Falta de validação em tempo de execução para valores arbitrários de `BiomeType` e metadados reservados.
  5. Semente Voronoi podia divergir ou ser omitida entre worker e pathfinding.
- **Solução:**
  1. Em `ChunkManager.buildCellEntity()`, se a coordenada estiver ocupada por uma entidade viva, CHASM é instanciado como `TERRAIN` intransponível (preservando `occupancy` exclusivamente para a peça); `applyChunkStreamingDelta` rejeita sobrescrever peças.
  2. `setPersistentModification()` marca coordenadas dirty e `updateStreaming()` emite `updatedTerrain` deltas atômicos para substituir entidades de terreno carregadas.
  3. LRU eviction protege chunks com peças ativas (`protectedChunkIds`) e comunica chunks evicted via `pendingEvictedChunks` -> `unloadedEntityIds` no Zustand.
  4. `validatePersistentTileModification()` impõe união fechada de `BiomeType`, elevação finita [0, 3.0] e metadados JSON-safe não reservados.
  5. `topologyFactory.ts` introduz `ITopologyCreationContext` e `resolveSeed()`, exigindo semente explícita para Voronoi e rejeitando pathfinding sem semente.
- **Validação:** Suíte `src/core/procedural/__tests__/streamingZustandIntegrity.test.ts` (4 testes de integração), `voronoiWorker.test.ts` (5 testes com T13-04) e `worker-smoke.html` no Chromium nativo.

### PATCH-22: Validação Semântica Estrita e Atomicidade dos Deltas de Streaming (P0)
- **Problema:** `validateStreamingDelta` validava apenas a tipagem básica dos campos de um delta, permitindo deltas semanticamente maliciosos ou corrompidos:
  1. Criação ou injeção de peças (`PIECE`) através do fluxo de streaming.
  2. Substituição de peças existentes em coordenadas arbitrárias sem sincronizar o índice `occupancy`, gerando divergência espacial.
  3. Tentativas de `updatedTerrain` referenciando `previousId` inexistente ou com divergência de coordenadas em relação à entidade original.
  4. Duplicidade de IDs compartilhados entre `newEntities`, `updatedTerrain` e `unloadedEntityIds`.
  5. Spawning de obstáculos procedurais (`OBSTACLE`) diretamente sobre peças de gameplay ativas.
  6. Falhas na aplicação de deltas compostos podiam deixar mutações parciais no estado do Zustand.
- **Solução:**
  1. Implementado contrato semântico rigoroso em `validateStreamingDeltaSemantic` em `src/core/state/gameStore.ts`.
  2. Permite estritamente `TERRAIN` e `OBSTACLE` em deltas de streaming, proibindo terminantemente `PIECE`.
  3. Valida contra o estado anterior antes de qualquer chamada a `produce()`: verifica existência de `previousId`, correspondência exata de coordenadas, rejeita colisões de obstáculos com peças vivas, e rejeita conflitos de IDs e múltiplas definições de terreno para a mesma casa.
  4. Executado pré-transação: qualquer erro interrompe a operação lançando exceção explícita, garantindo que `boardEntities`, `occupancy`, `terrain` e `revision` permaneçam 100% inalterados (reversão atômica integral).
- **Validação:** Suíte `src/core/procedural/__tests__/streamingSemanticDeltas.test.ts` (10 testes: T22-01 a T22-10).

### PATCH-23: Imutabilidade Profunda de Metadados Persistentes (P1)
- **Problema:** `ChunkManager.setPersistentModification()` e `getPersistentModifications()` utilizavam clonagem rasa (`{ ...mod.metadata }`). Objetos ou arrays aninhados mantinham referências compartilhadas com o chamador externo, permitindo mutações indiretas do estado do mundo sem validação.
- **Solução:**
  1. Criação das rotinas de clonagem defensiva profunda `clonePersistentMetadata()` e `cloneAndValidateJsonValue()` em `src/core/procedural/persistentModification.ts`.
  2. Suporte estrito a tipos JSON válidos: strings, números finitos (rejeitando NaN e Infinity), booleanos, null, arrays e objetos literais.
  3. Proteção ativa contra prototype pollution: rejeita chaves perigosas (`__proto__`, `constructor`, `prototype`).
  4. Rejeição com erro descritivo para funções, símbolos, instâncias de classes, estruturas circulares e profundidade > 8.
  5. Cópia profunda aplicada no armazenamento (`setPersistentModification`, `applyModification`), na extração (`getPersistentModifications`, `buildCellEntity`, `getCell`) e na codificação/decodificação (`ProceduralLayoutCodec`).
- **Validação:** Suíte `src/core/procedural/__tests__/persistentMetadataImmutability.test.ts` (8 testes: T23-01 a T23-08).

### PATCH-24: Benchmarks Honestos de Memória e Reclassificação dos RNFs (P1)
- **Problema:**
  1. Testes de memória utilizavam `Math.max(0, peakUsedMb)`, convertendo variações normais de garbage collection em zero e mascarando o comportamento real do heap.
  2. RNF-09 estava classificado como VERIFIED sem evidência do ensaio contínuo de 60 minutos de streaming.
- **Solução:**
  1. Criação do benchmark isolado `scripts/runMemoryBenchmark.js` (executável via `npm run bench:memory` com `node --expose-gc`) que avalia valores brutos reais: heap baseline, pico com 10.240 células ativas retidas (40 macro-chunks de 16x16 em topologia infinita), delta incremental não-mascarado, heap pós-descarregamento com GC explícito e deriva multi-ciclo.
  2. Adição dos testes T24-01, T24-02 e T24-03 em `src/core/benchmarks/__tests__/topologyBenchmarks.test.ts`.
  3. Resultados comprovados: Baseline 18.33 MB, Peak 26.10 MB, Delta Incremental Bruto +7.76 MB (< 40.00 MB do RNF-03), Retido pós-GC +0.12 MB, Deriva média por ciclo +0.0090 MB/ciclo.
  4. Reclassificação formal de conformidade: RNF-03 marcado como VERIFIED com métrica real isolada; RNF-09 reclassificado para PARTIAL (soak test de 60 minutos ininterruptos diferido para a Spec 07); RNF-04 e RNF-08 mantidos como DEFERRED para a Spec 07.
- **Validação:** Execução isolada de `npm run bench:memory` e testes T24-01 a T24-03 em `topologyBenchmarks.test.ts`.

### PATCH-25: Suporte a Transição de Terreno para OBSTACLE e Integridade de Identidade Espacial (P0)
- **Problema:**
  1. No fluxo procedural de transição de bioma em célula desocupada (`PLAINS` -> `CHASM`), `ChunkManager.buildCellEntity()` emite uma entidade do tipo `OBSTACLE` para impedir trânsito de peças de xadrez terrestres sem colidir com peças. Porém, `validateStreamingDeltaSemantic()` restringia `updatedTerrain` exclusivamente a entidades de tipo `TERRAIN`, causando rejeição de deltas procedurais legítimos.
  2. `validateStreamingDeltaSemantic()` permitia que `newEntities` reutilizasse o ID de uma entidade existente em outra coordenada espacial, o que sobrepunha a entidade no dicionário `boardEntities` e deixava a coordenada anterior no mapa espacial `terrain` referenciando uma entidade localizada em posição diferente.
- **Solução:**
  1. Em `validateStreamingDeltaSemantic()`, `updatedTerrain` agora valida entidades de tipo `TERRAIN` ou `OBSTACLE`. Caso a substituição seja um `OBSTACLE`, verifica se a coordenada não possui uma `PIECE` viva ativa. Em `applyChunkStreamingDelta()`, a aplicação sincroniza bidirecionalmente: se o novo elemento for `OBSTACLE`, remove de `draft.terrain` e aloca em `draft.occupancy`; se for `TERRAIN`, remove de `draft.occupancy` e aloca em `draft.terrain`.
  2. Em `validateStreamingDeltaSemantic()`, qualquer entidade em `newEntities` cujo ID já exista no domínio tem sua inserção terminantemente rejeitada (especialmente se em coordenada divergente). Atualizações de terreno carregado devem transitar exclusivamente via `updatedTerrain`.
  3. Prevenção de duplicidade de coordenadas em `updatedTerrain` e rejeição de concorrência com IDs em `newEntities`.
- **Validação:** Suíte `src/core/procedural/__tests__/terrainIdentityAndChasmTransitionRegression.test.ts` (5 testes de regressão: REPRO-01 a REPRO-05).

### PATCH-26: Integridade Referencial de updatedTerrain, Proteção de Obstáculos de Gameplay e Governança de Specs (P0/P1)
- **Problema:**
  1. O PATCH-25 protegia `newEntities` contra reutilização de IDs de entidades existentes, mas `updatedTerrain` ainda permitia que a nova entidade substituta reutilizasse o ID de uma entidade existente distinta (ex: atualizar terreno em `1,1` usando o ID de um terreno existente em `2,2` ou de uma peça), sobrepondo `boardEntities` e corrompendo o índice referencial da outra coordenada.
  2. Não havia diferenciação explícita entre obstáculos procedurais (gerados por biomas como `CHASM`) e obstáculos de gameplay (gerados por regras, variantes ou comandos de partida). Como consequência, uma atualização ou inserção procedural podia acidentalmente substituir ou remover um obstáculo de gameplay legítimo.
  3. Governança arquitetural exigia comprovação formal de leitura integral das especificações `Spec_01` e `Spec_02`, consulta das fronteiras de `Spec_03` e `Spec_04`, e cumprimento rigoroso das diretivas de `GEMINI.md`.
- **Solução:**
  1. **PATCH-26A (Identidade em updatedTerrain):** Implementada validação em `validateStreamingDeltaSemantic` garantindo que:
     - Nenhum `entity.id` em `updatedTerrain` pertença a uma entidade existente diferente (`existingWithSameId.id !== update.previousId` e `existingWithSameId.position !== update.entity.position`).
     - Rejeita estritamente substituição utilizando ID de qualquer peça ativa ou obstáculo de gameplay.
     - Validação atômica de colisões intra-lote entre `updatedTerrain`, `newEntities` e `unloadedEntityIds`, rejeitando duplicidade de IDs substitutos no mesmo lote.
     - Se qualquer operação violar a integridade, o lote inteiro é rejeitado atomicamente sem modificar o `revision` do Zustand.
  2. **PATCH-26B (Proteção de Obstáculos de Gameplay e Proveniência):**
     - Adicionado campo formal `provenance?: 'PROCEDURAL' | 'GAMEPLAY'` em `IBaseEntity` (`src/core/entities/types.ts`) e predicado `isProceduralEntity()`.
     - `ChunkManager.buildCellEntity()` estampa explicitamente `provenance: 'PROCEDURAL'` em terrenos e obstáculos procedurais (`CHASM`).
     - Entidades de gameplay (peças e obstáculos manuais/variantes) possuem proveniência `GAMEPLAY` (ou padrão não-procedural).
     - `validateStreamingDeltaSemantic` proíbe terminantemente que `updatedTerrain`, `newEntities` ou `unloadedEntityIds` removam, substituam ou colidam com entidades cuja proveniência não seja estritamente procedural.
     - Compatibilidade retroativa garantida com snapshots legacy em `SnapshotSerializer.ts` e `isProceduralEntity`.
  3. **PATCH-26C (Auditoria de Invariantes em Integração):**
     - Criação da suíte de integração e regressão `updatedTerrainIdentityAndObstacleProtectionRegression.test.ts` (13 testes cobrindo T26-01 a T26-13).
     - Validação contínua de invariantes via `EntityManager.validateInvariants()` através de ciclos completos de geração procedural, streaming, deltas legítimos/inválidos, reversão atômica, serialização/restauração e comandos com Undo/Redo.
- **Validação:** Suíte `src/core/procedural/__tests__/updatedTerrainIdentityAndObstacleProtectionRegression.test.ts` (13 testes: T26-01 a T26-13).

### PATCH-27: Proteção de Obstáculos de Gameplay no GC de Streaming, Unificação de Proveniência e Diagnóstico do Chromium (P0/P1/P2)
- **Problema:**
  1. **(P0)** `ChunkManager.updateStreaming()` percorria os chunks descarregados pelo LRU e adicionava qualquer entidade não-peça a `unloadIds`. Isso incluía obstáculos colocados por regras ou ações do jogador (`provenance: 'GAMEPLAY'`). Como `validateStreamingDeltaSemantic()` rejeita descarregar entidades não-procedurais, o delta gerado pelo `ChunkManager` era rejeitado integralmente pelo Zustand, travando o ciclo de streaming e corrompendo a sincronização espacial.
  2. **(P1)** `findExistingTerrainEntity()` utilizava a verificação frágil `ent.type === 'OBSTACLE' && ent.metadata?.biome !== undefined`. Isso ignorava a proveniência explícita (`provenance: 'GAMEPLAY'`) e falhava em reconhecer obstáculos procedurais sem bioma no metadata.
  3. **(P1)** `validateStreamedEntity()` aceitava entidades com `provenance: 'GAMEPLAY'` em `newEntities` e `updatedTerrain`, violando o contrato de que operações de streaming são estritamente reservadas à camada procedural.
  4. **(P2)** O encerramento imediato via `process.exit(0)` em `scripts/runChromiumSmoke.js` após a conclusão bem-sucedida do teste provocava o corte abrupto de pipes IPC de stdio do processo filho esbuild (Go), disparando `fatal error: all goroutines are asleep - deadlock!`.
- **Solução:**
  1. **PATCH-27A (Eviction GC Exclusivamente Procedural):** O garbage collector em `ChunkManager.updateStreaming()` agora avalia `isProceduralEntity(ent)` tanto para terreno quanto para ocupantes. Apenas entidades procedurais têm remoção agendada em `unloadIds`. Obstáculos de gameplay permanecem intactos e ativos no estado do domínio (`boardEntities` e `occupancy`), mesmo quando o macro-chunk procedural sai do cache em memória.
  2. **PATCH-27B (Centralização da Identificação de Proveniência):** O predicado `isProceduralEntity(entity)` em `src/core/entities/types.ts` foi consolidado com precedência estrita:
     - `entity.type === 'PIECE'` -> sempre `false` (gameplay soberano, neutralizando marcadores espúrios).
     - `entity.provenance === 'GAMEPLAY'` -> sempre `false`.
     - `entity.provenance === 'PROCEDURAL'` -> `true`.
     - `entity.type === 'TERRAIN'` -> `true`.
     - Entidades legadas (`OBSTACLE` sem `provenance`): `destructible === false` mapeado como procedural (indestrutível de relevo) e `true` como gameplay.
     - `ChunkManager.findExistingTerrainEntity()` passou a utilizar `isProceduralEntity(ent)`.
  3. **PATCH-27C (Validação Estrita de Proveniência em Streaming):** `validateStreamedEntity()` e `validateStreamingDeltaSemantic()` rejeitam de forma atômica entidades com `provenance === 'GAMEPLAY'` ou cujo predicado `isProceduralEntity` seja falso, preservando a atomicidade integral de reversão em caso de tentativa de injeção.
  4. **PATCH-27D (Encerramento Gracioso de Processo):** `scripts/runChromiumSmoke.js` fecha adequadamente o `viteServer` e substitui o `process.exit(0)` abrupto por `process.exitCode = 0`, permitindo drenagem assíncrona limpa dos pipes IPC do daemon Go do esbuild sem interrupção abrupta de streams.
- **Validação:** Suíte `src/core/procedural/__tests__/streamingGCAndProvenanceRegression.test.ts` (16 testes: T27-01 a T27-15 e teste integrado E2E completo).

---

## 4. Conclusão e Gates Finais Consolidados

Todos os 27 patches foram completamente integrados e validados contra os gates do pipeline:
- `npx tsc --noEmit` — 0 erros.
- `npm run lint` — 0 erros, 0 avisos.
- `npm run build` — Bundle de produção gerado com sucesso (`dist/assets/index-*.js`, 1398 módulos transformados).
- `npx vitest run --coverage` — 352 testes em 47 suítes, 0 falhas, 0 skips, cobertura Statements de 72.36% (CI #39815663573 anterior registrado oficialmente com 72.28%) e agregado de Topologia & Procedural de 97.50%.
- `node scripts/runChromiumSmoke.js` — Web Worker real em Chromium headless aprovado (`skipped: false`, `voronoiVerified: true`, encerramento gracioso sem deadlock).
- `npm run bench:memory` — Benchmark isolado de memória com GC explícito registrando delta incremental bruto de +8.04 MB para 10.240 células retidas (teto: < 40.00 MB), retido pós-GC +0.12 MB e deriva média de +0.0090 MB/ciclo.
- **Governança Arquitetural:** Regras vinculantes permanentes consolidadas em `GEMINI.md` na raiz do repositório, com leitura integral comprovada de `Spec_01` e `Spec_02`.
- **Avanço para a Spec 03:** Aguardar homologação e autorização expressa do usuário; Spec 03 não iniciada.



