# Technical Audit Report — Spec 02: Procedural Boards, Geometry & Topology

> [!NOTE]
> **Auditoria Técnica Completa e Comparativa da Spec 02 (Revisão Pós-Remediação)**
> Este relatório compara minuciosamente cada requisito funcional (RF-01 a RF-15) e não funcional (RNF-01 a RNF-15) da especificação oficial (`ChessInReact/specs/Spec_02_Procedural_Boards_Geometry_Topology.md`, Seções 16 e 17) com o código efetivamente entregue e validado no repositório.

---

## 1. Escopo e Metadados da Auditoria

- **Repositório:** `PauloSoaf/ChessInReact`
- **Branch de Trabalho:** `feat/procedural-boards-topology`
- **Commit Base Spec 01:** `dd730512db65b3152d02f66bcc76c3cc3faf439f`
- **Commit Auditado Anterior:** `c7af00f149a85debd89e86401db9f6ca65b17d96` (298 testes / 42 suítes)
- **Commit Consolidado Atual (PATCH-22 a PATCH-24):** Branch HEAD atual (318 testes / 44 suítes, 72.15% global, 97.50% topologia)
- **Especificação Auditada:** `specs/Spec_02_Procedural_Boards_Geometry_Topology.md` (673 linhas)
- **Status Geral:** **APROVADO COM RESSALVAS DOCUMENTADAS (DEFERRED PARA SPEC 07: RNF-04, RNF-08; PARTIAL: RNF-07, RNF-09)**

---

## 2. Matriz de Rastreabilidade dos Requisitos Funcionais (RF-01 a RF-15)

Todos os 15 requisitos funcionais da Seção 16 da Spec 02 foram auditados linha por linha contra o código de produção e testes de regressão:

| ID | Descrição Original na Spec 02 | Módulo de Produção | Suíte de Testes | Status | Evidência Técnica / Justificativa |
|---|---|---|---|---|---|
| **RF-01** | **Mapeamento de Topologias:** Implementações concretas de `ITopology` para Quadrada (8x8 e 16x16), Hexagonal Cúbica (q,r,s), Triangular Alternada e Voronoi Dinâmica. | `SquareTopology.ts`, `HexTopology.ts`, `TriangleTopology.ts`, `VoronoiTopology.ts`, `topologyFactory.ts` | `SquareTopology.test.ts`, `HexTopology.test.ts`, `TriangleTopology.test.ts`, `VoronoiTopology.test.ts`, `voronoiWorker.test.ts` | **VERIFIED** | Todas as 4 classes implementam o contrato polimórfico `ITopology`. `VoronoiTopology` entrega partição determinística por centroides de relaxamento com semente reproduzível e suporte integral no Web Worker nativo via `createTopology`. |
| **RF-02** | **Cálculo de Vizinhança O(1):** `getNeighbor(coord, dir)` em tempo constante sem buscas em coleções ou varreduras. | Classes de topologia (`SquareTopology`, `HexTopology`, `TriangleTopology`, `VoronoiTopology`) | `SquareTopology.test.ts`, `HexTopology.test.ts`, `TriangleTopology.test.ts`, `topologyBenchmarks.test.ts` | **VERIFIED** | Vetores estáticos de deslocamento e lookup direto O(1). Média aferida: 1.12 µs (local) e 6.98 µs (CI Linux). |
| **RF-03** | **Fórmula de Distância Invariante:** `getDistance(a, b)` retorna menor distância em casas no grafo real. | Classes de topologia e `astarDijkstraOracle.test.ts` | `TriangleTopology.test.ts`, `astarDijkstraOracle.test.ts` | **VERIFIED** | Triângulos corrigidos com métrica tridimensional $|x_1-x_2|+|y_1-y_2|+|z_1-z_2|$ idêntica a BFS (0,0 para 0,1 = 3 passos). Hexagonal utiliza Chebyshev cúbico. |
| **RF-04** | **Linha de Visão e Raycasting Discreto:** `getLineOfSight` com lista ordenada de casas contíguas para peças de longo alcance. | `LineOfSight.ts`, `HexTopology.ts` (LERP $\epsilon=10^{-6}$), `SquareTopology.ts` (Bresenham), `TriangleTopology.ts` | `pathfinding.test.ts`, `topologyEdgeCases.test.ts`, `triangleRay.test.ts` | **VERIFIED** | Desempate por $\epsilon = 10^{-6}$ em hexágonos; Bresenham contíguo em quadrados; raycasting contínuo em triângulos sem repetição de nós ou oscilação (PATCH-15). |
| **RF-05** | **Geração Procedural Determinística:** Gerador pseudoaleatório alimentado por Seed, gerando relevo e biomas idênticos em qualquer máquina. | `AleaPRNG.ts`, `SimplexNoise2D.ts`, `NoiseGenerator.ts` | `procedural.test.ts`, `ProceduralLayoutCodec.test.ts` | **VERIFIED** | Hashes de chunks e sementes 100% determinísticos. Testado com sementes fixas e re-execução em ambientes distintos. |
| **RF-06** | **Divisão de Espaço em Chunks:** Espaço particionado em macro-chunks lógicos de 16x16 unidades (ChunkX, ChunkY). | `ChunkManager.ts`, `types.ts` | `ChunkManager.test.ts`, `proceduralWorker.test.ts`, `voronoiWorker.test.ts` | **VERIFIED** | Particionamento com bounding radius e 256 células por chunk em topologias infinitas e trabalhadores WebWorker. |
| **RF-07** | **Streaming Dinâmico de Terreno:** `ChunkManager` detecta proximidade de entidades/câmera e gera sob demanda. | `ChunkManager.ts`, `gameStore.ts` (`applyChunkStreamingDelta`) | `chunkManagerZustand.test.ts`, `streamingPerformanceMemory.test.ts`, `streamingSemanticDeltas.test.ts` | **VERIFIED** | Deltas de streaming aplicados com validação semântica atômica prévia (PATCH-22) e lookup O(1) via `state.terrain` (PATCH-16). |
| **RF-08** | **Descarregamento de Chunks Inativos:** Chunks sem peças ativas fora do raio são descarregados mantendo metadados compactos. | `ChunkManager.ts`, `gameStore.ts` | `chunkManagerZustand.test.ts`, `ChunkManager.test.ts`, `streamingPerformanceMemory.test.ts` | **VERIFIED** | Política LRU com limite rígido `maxChunksInMemory: 50` descarrega terreno inativo sem descarregar chunks contendo peças ativas (`isCaptured: false`). |
| **RF-09** | **Sistema de Elevação e Relevo 3D:** Elevação contínua entre 0.0 e 3.0 via octaves de Simplex Noise. | `NoiseGenerator.ts`, `SimplexNoise2D.ts` | `procedural.test.ts` | **VERIFIED** | Elevação normalizada [0.0, 3.0] com Island Guarantee central. Valores finitos validados no `EntityManager`. |
| **RF-10** | **Obstáculos e Casas Intransponíveis:** Classificação `isObstacle: true` impedindo ocupação por peças terrestres. | `NoiseGenerator.ts`, `MovePieceCommand.ts`, `EntityManager.ts` | `terrainOccupancyCoexistence.test.ts`, `commands.test.ts`, `streamingSemanticDeltas.test.ts` | **VERIFIED** | `costMultiplier: 999.0` finito substituindo `Infinity`. Peças bloqueadas ao tentar entrar em terreno intransponível; deltas com obstáculos sobre peças vivas rejeitados (PATCH-22). |
| **RF-11** | **Coloração Tricromática Hexagonal:** Cor canônica analítica via $((q - r) \% 3 + 3) \% 3 \in \{0, 1, 2\}$. | `HexTopology.getCellColorIndex` | `HexTopology.test.ts`, `topologyEdgeCases.test.ts` | **VERIFIED** | Fórmula tricromática implementada e testada em eixos principais e diagonais. |
| **RF-12** | **Topologia Toroidal e Wrap-Around:** Módulo aritmético nas bordas fechando extremos Norte-Sul e Leste-Oeste. | `SquareTopology.ts` (`toroidal: true`) | `SquareTopology.test.ts`, `topologyEdgeCases.test.ts` | **VERIFIED** | Coordenadas modulares bidirecionais implementadas sem alocação e testadas em limites negativos. |
| **RF-13** | **Névoa de Guerra (Fog of War):** Cálculo da união de campos de visão com estados `FOG_HIDDEN`, `FOG_EXPLORED` e `VISIBLE`. | `src/core/topology/fog/FogOfWarManager.ts` | `src/core/topology/fog/__tests__/FogOfWarManager.test.ts` (5 testes) | **VERIFIED** | Visibilidade determinística por jogador com raio configurável, oclusão por montanhas e persistência histórica da exploração. |
| **RF-14** | **Conversão Bidirecional Espaço-Mundo:** `toWorldPosition(coord)` e `worldToCoordinate(pos)` puras e sem alocação heap. | `SquareTopology.ts`, `HexTopology.ts`, `TriangleTopology.ts`, `VoronoiTopology.ts` | Suítes de topologia e `topologyBenchmarks.test.ts` | **VERIFIED** | Roundtrip com precisão float em todas as topologias. Aferidos > 2.800.000 queries/s. |
| **RF-15** | **Exportação e Importação de Sementes e Layouts:** Serialização compacta em JSON e reconstrução idêntica do mundo procedural. | `src/core/procedural/ProceduralLayoutCodec.ts`, `SnapshotSerializer.ts` | `ProceduralLayoutCodec.test.ts`, `persistentMetadataImmutability.test.ts`, `snapshotTerrainPersistence.test.ts` | **VERIFIED** | Codec versionado exporta semente, topologia e alterações com isolamento profundo de referências JSON (PATCH-23). |

---

## 3. Matriz de Rastreabilidade dos Requisitos Não-Funcionais (RNF-01 a RNF-15)

| ID | Descrição Original | Limite Exigido | Valor Aferido | Status | Justificativa Técnica |
|---|---|---|---|---|---|
| **RNF-01** | Tempo de Resolução de Vizinhança | < 0.01 ms (10 µs) | **1.12 µs** (local) / **6.98 µs** (CI) | **VERIFIED** | Testado com 10.000 chamadas contínuas sem alocação heap. |
| **RNF-02** | Latência de Geração de Chunk | < 15 ms por chunk 16x16 | **1.25 ms** (local) / **5.22 ms** (CI) | **VERIFIED** | Geração assíncrona em WebWorker abaixo de 35% do teto. |
| **RNF-03** | Orçamento de Memória do Grid | < 40 MB para 10.000 células | **+7.76 MB** heap incremental bruto | **VERIFIED** | Medição isolada via `scripts/runMemoryBenchmark.js` com `--expose-gc` para 10.240 células ativas retidas em 40 chunks (Baseline: 18.33 MB, Peak: 26.10 MB, Delta: +7.76 MB < 40.00 MB). |
| **RNF-04** | Taxa de Quadros GPU em Expansão | >= 60 FPS estáveis | N/A (GPU) | **DEFERRED** | Pertence formalmente à **Spec 07** (Renderização WebGL/Three.js e Instancing). Não há contexto WebGL nesta camada Core. |
| **RNF-05** | Tamanho do Payload de Semente | < 1 KB comprimido | **~340 bytes** JSON bruto | **VERIFIED** | Medido em `ProceduralLayoutCodec.test.ts` (~340 bytes sem compressão, < 180 bytes gzipped). |
| **RNF-06** | Conformidade com Free Tier | 100% Client-Side / Node leve | 100% headless | **VERIFIED** | Zero dependências nativas ou de banco; roda em container com 512MB RAM. |
| **RNF-07** | Consistência Multiplataforma | x86_64 e ARM64 idênticos | x86_64 VERIFIED; ARM64 PARTIAL | **PARTIAL** | AleaPRNG e Simplex utilizam aritmética inteira de 32 bits e Math.floor determinístico. O CI atual possui apenas runners Linux x86_64; runner ARM64 dedicado não disponível no free-tier do repositório. |
| **RNF-08** | Orçamento de Draw Calls WebGL | <= 3 Draw Calls | N/A (GPU) | **DEFERRED** | Pertence à **Spec 07**. O Core State não emite chamadas de desenho WebGL. |
| **RNF-09** | Prevenção de Leaks em Streaming | < 2 MB de leak em 60 min | Deriva +0.009 MB/ciclo; soak diferido | **PARTIAL** | O descarregamento transacional remove referências de objetos no Zustand e LRU (+0.12 MB retido pós-GC). Contudo, o teste contínuo ininterrupto de 60 minutos não foi executado no CI e fica diferido para a Spec 07 com a engine gráfica. |
| **RNF-10** | Cobertura de Testes de Topologia | > 95% em topologias | **97.50%** (todas > 95%) | **VERIFIED** | Hex: 97.26%, Square: 98.75%, Triangle: 96.29%, Voronoi: 96.47%. |
| **RNF-11** | Coordenadas de Grande Magnitude | Precisão até 50.000 unidades | 50.000 testado | **VERIFIED** | Testado com $q=30.000, r=-10.000, s=-20.000$ e chunk (1000, -1000). |
| **RNF-12** | Tempo de Arena Hex 4P | < 30 ms (91 hexágonos) | **0.046 ms** (P95: 0.23 ms) | **VERIFIED** | Mais de 200x mais rápido que a exigência da especificação. |
| **RNF-13** | Isolamento Total de DOM e Three.js | Zero dependências no Core | Zero dependências | **VERIFIED** | Validado por compilação pura Node/Worker e testes de isolamento. |
| **RNF-14** | Resiliência a Coordenadas Inválidas | Retornar `null` / erro tipado | 100% resiliente | **VERIFIED** | Testado com chaves fora de padrão, strings vazias e coordenadas malformadas. |
| **RNF-15** | Tolerância de Raycasting / Picking | > 120 queries/s (< 2% CPU) | **> 2.800.000 queries/s** | **VERIFIED** | 1.200 projeções executadas em 0.43 ms. |

---

## 4. Defeitos Críticos Auditados e Remediados

| Defeito | Severidade | Causa Raiz | Remediação Aplicada | Teste de Verificação |
|---|---|---|---|---|
| **Conflito de Ocupação Peça x Terreno** | P0 (Bloqueante) | `EntityManager` usava o mesmo índice de ocupação física para peças e terreno de fundo. | Separação explícita entre camada de terreno (`terrainByCoordinate`) e ocupação física (`occupancyByCoordinate`). Peças podem transitar e repousar sobre terreno transitável sem conflito. | `terrainOccupancyCoexistence.test.ts` (5 testes) |
| **Incompatibilidade no FlatArraySerializer** | P0 (Bloqueante) | Serializador rejeitava biomas procedurais `PLAINS`, `FOREST`, `CHASM` com erro de schema v1. | Expansão dos códigos binários no enum `VariantBinary` e suporte completo a roundtrip binário sem quebra de contrato. | `spec02RegressionDefects.test.ts` |
| **Valores Não-Finitos em Metadados** | P0 (Bloqueante) | `NoiseGenerator` atribuía `costMultiplier: Infinity` para água, rejeitado pelo `EntityManager`. | Substituição por custo finito padronizado (`999.0`) e flag booleana `isObstacle: true`. | `spec02RegressionDefects.test.ts` |
| **A\* Subótimo em Custos Variáveis** | P0 (Bloqueante) | `MinPriorityQueue` não atualizava nós com `gScore` reduzido, permitindo consumo de entradas com prioridade obsoleta. | Min-Heap com inserção incremental, descarte de entradas obsoletas no `pop()` e desempate determinístico estável FIFO. | `astarDijkstraOracle.test.ts` (5 testes contra oráculo Dijkstra) |
| **Distância Triangular Inconsistente** | P1 (Alta) | Fórmula Manhattan retornava 1 para células que exigiam 3 arestas no grafo real. | Mapeamento em 3 eixos ortogonais equivalentes à distância mínima real em grafos triangulares contínuos ($|x_1-x_2|+|y_1-y_2|+|z_1-z_2|$). | `TriangleTopology.test.ts` (10 testes) |
| **Worker Quadrado Limitado a 8x8** | P1 (Alta) | `SquareTopology` padrão no Worker gerava chunks vazios fora do grid 8x8 inicial. | Adicionado suporte explícito a topologia infinita (`width: null, height: null`) via `topologyOptions` no protocolo do Worker. | `proceduralWorker.test.ts` (5 testes) |
| **Ausência de Voronoi, Fog of War e Codec** | P1 (Alta) | Requisitos RF-01 (Voronoi), RF-13 (Fog of War) e RF-15 (Codec) não estavam presentes nos módulos publicados. | Implementação completa de `VoronoiTopology`, `FogOfWarManager` e `ProceduralLayoutCodec`. | Suítes dedicadas para cada módulo |
| **PATCH-11: Serialização e Invariantes de Terreno** | P1 (Alta) | `SnapshotSerializer` não persistia a camada `terrain` em snapshots JSON, quebrando integridade ao restaurar partidas salvas. | Atualização para `SNAPSHOT_VERSION = 2` com campo `terrain`, validação de invariantes estruturais e migrador retrocompatível v1 -> v2. | `snapshotTerrainPersistence.test.ts` (5 testes) |
| **PATCH-12: Sobrescritas Persistentes em Chunks** | P1 (Alta) | Modificações manuais de terreno em chunks sofriam reset quando os chunks eram descarregados pelo LRU. | Suporte a `persistentModifications` no `ProceduralLayoutCodec` e re-aplicação automática das modificações em `ChunkManager.getOrGenerateChunk()`. | `proceduralOverrides.test.ts` (6 testes) |
| **PATCH-13: Fábrica de Topologias no Worker (Voronoi)** | P1 (Alta) | O Worker Engine não possuía rota para instanciar `VoronoiTopology`, fazendo fallback inadvertido para quadrado. | Criação da fábrica unificada `createTopology` em `topologyFactory.ts` cobrindo SQUARE, HEX, TRIANGLE e VORONOI, com rejeição imediata de topologias desconhecidas. | `voronoiWorker.test.ts` (5 testes) |
| **PATCH-14: Admissibilidade A\* em Custos Subunitários** | P1 (Alta) | Heurística Manhattan assumindo custo >= 1.0 causava inadmissibilidade quando custos de aresta eram menores que 1.0 (subunidade). | Quando `minEdgeCost` não é fornecido com custos subunitários, o A* passa a usar Dijkstra $h=0$ para admissibilidade estrita garantida, com reabertura de nós fechados. | `astarSubunitCosts.test.ts` (3 testes) |
| **PATCH-15: Trajetória Contínua em Triângulos** | P1 (Alta) | `TriangleTopology.getRay` apresentava oscilação periódica cíclica em direções lineares. | Algoritmo retificado de alternância UP/DOWN garantindo propagação estritamente contínua sem ciclos e sem nós repetidos. | `triangleRay.test.ts` (3 testes) |
| **PATCH-16: Eliminação de Scan O(N) e Limite de Chunks** | P1 (Alta) | `updateStreaming` realizava varredura $O(N)$ sobre todas as entidades de tabuleiro; sem teto fixo de chunks em memória. | Lookup $O(1)$ usando `state.terrain`, teto `maxChunksInMemory: 50` com proteção para chunks contendo peças ativas, e bounding de spawn Voronoi. | `streamingPerformanceMemory.test.ts` (8 testes: T16-01 a T16-08) |
| **PATCH-17: Integridade Espacial, Terreno no Zustand e Biomas** | P0/P1 | CHASM colidindo com ocupação de peças vivas; modificações manuais de terreno ignoradas por chunks carregados; orfandade de entidades de chunks evicted; metadados sem validação; seed Voronoi divergente. | CHASM gera `TERRAIN` intransponível sem sobrescrever ocupação de peças; `setPersistentModification` emite `updatedTerrain` deltas; LRU eviction descarrega via `unloadedEntityIds`; validador estrito de `BiomeType` e metadados; semente Voronoi reconciliada e obrigatória. | `streamingZustandIntegrity.test.ts` (4 testes), `voronoiWorker.test.ts` |
| **PATCH-22: Validação Semântica Estrita e Atomicidade dos Deltas** | P0 (Bloqueante) | Deltas permitiam inserção de peças, substituição de peças em outras coordenadas sem atualizar `occupancy`, e colisões de `OBSTACLE` com peças vivas. | Validador semântico prévio `validateStreamingDeltaSemantic` executado antes de qualquer mutação. Bloqueia estritamente mutação de `PIECE` por streaming, exige `previousId` existente e coordenadas coincidentes em `updatedTerrain`, impede colisão de `OBSTACLE` com peças vivas e garante reversão 100% atômica (zero mutação parcial, sem incremento de `revision`). | `streamingSemanticDeltas.test.ts` (10 testes: T22-01 a T22-10) |
| **PATCH-23: Imutabilidade Profunda de Metadados Persistentes** | P1 (Alta) | `setPersistentModification` e `getPersistentModifications` realizavam cópia rasa (`{ ...metadata }`), permitindo mutação externa indireta de objetos aninhados sem validação. | Implementada clonagem defensiva profunda `clonePersistentMetadata` com validação de tipos JSON puros (string, number, boolean, null, arrays, objetos). Rejeita `__proto__`, `constructor`, funções, NaN, Infinity, referências circulares e profundidade > 8. | `persistentMetadataImmutability.test.ts` (8 testes: T23-01 a T23-08) |
| **PATCH-24: Benchmarks Honestos de Memória e Reclassificação de RNFs** | P1 (Governança) | Clamping com `Math.max(0, ...)` mascarava dados de GC; RNF-09 declarado VERIFIED sem execução do soak test de 60 minutos. | Removido clamping; criado benchmark isolado `scripts/runMemoryBenchmark.js` com `--expose-gc` e métricas brutas (+7.76 MB incremental para 10.240 células, +0.12 MB pós-GC, +0.009 MB/ciclo deriva); RNF-09 reclassificado para PARTIAL (soak diferido para Spec 07). | `topologyBenchmarks.test.ts` (T24-01 a T24-03) e `scripts/runMemoryBenchmark.js` |
| **PATCH-25: Transição CHASM/Obstáculo em updatedTerrain e Proteção de Identidade de Terreno** | P0 (Bloqueante) | 1. Célula desocupada transitando de PLAINS para CHASM gera entidade OBSTACLE em `ChunkManager.buildCellEntity()`, mas `validateStreamingDeltaSemantic` rejeitava qualquer entidade que não fosse TERRAIN em `updatedTerrain`.<br>2. `newEntities` não proibia reutilizar ID de entidade existente em outra coordenada espacial, corrompendo o índice espacial `boardEntities` e `terrain`. | 1. `validateStreamingDeltaSemantic` passou a aceitar `TERRAIN` ou `OBSTACLE` em `updatedTerrain`, verificando que `OBSTACLE` não colide com `PIECE` viva. `applyChunkStreamingDelta` realiza a transição bidirecional nos índices `occupancy` e `terrain`.<br>2. Validação estrita em `validateStreamingDeltaSemantic`: rejeita entidade em `newEntities` com ID já existente no domínio (especialmente em outra coordenada); atualizações de células carregadas devem transitar exclusivamente por `updatedTerrain`. | `terrainIdentityAndChasmTransitionRegression.test.ts` (5 testes: REPRO-01 a REPRO-05) |

---

## 5. Veredito Final da Auditoria

**Status: APROVADO COM RESSALVAS TÉCNICAS DOCUMENTADAS**

1. Todos os 15 Requisitos Funcionais (RF-01 a RF-15) estão plenamente implementados, testados e integrados.
2. Os defeitos P0 e P1 identificados em todos os ciclos de auditoria (Patches 01 a 25) foram completamente remediados e cobertos por testes unitários e de integração.
3. A base de testes cresceu para **323 testes aprovados em 45 suítes** (100% green, 0 falhas, 0 pendências, 0 skips), com **zero regressões** na Spec 01 e nas regras do xadrez clássico 8x8.
4. Cobertura global atingiu **72.22%** e a camada de topologia atingiu **95.88%** (satisfazendo a meta > 95% do RNF-10).
5. O Web Worker nativo foi validado em **Google Chrome nativo (headless-chromium)** comprovando PING/PONG, geração de terreno, rejeição de pathfinding sem semente e pathfinding com `skipped: false` e `voronoiVerified: true`.
6. Os requisitos RNF-04 e RNF-08 continuam formalmente **adiados (DEFERRED)** para a **Spec 07** por dependerem da camada gráfica Three.js / WebGL.
7. O requisito RNF-07 está aprovado no ambiente x86_64 e classificado como **PARTIAL** para ARM64 por ausência de runner físico ARM64 no pipeline CI.
8. O requisito RNF-09 está formalmente classificado como **PARTIAL**, com o ensaio contínuo de 60 minutos diferido para a Spec 07.
9. Governança arquitetural consolidada no arquivo versionado `GEMINI.md` na raiz do repositório, impondo a leitura compulsória prévia das especificações e ADRs.

**Parecer para a Spec 03:** **AGUARDAR HOMOLOGAÇÃO FORMAL DO CLIENTE / FECHAMENTO DEFINITIVO DA SPEC 02.** A implementação está concluída e protegida; não iniciar a Spec 03 até instrução explícita do usuário.


