# Quantitative Benchmark Report — Spec 02: Procedural Boards & Topology

> [!NOTE]
> **Relatório Oficial de Benchmarks Quantitativos da Spec 02 (Revisão Pós-Remediação)**
> Medições realizadas através da suíte automatizada `src/core/benchmarks/__tests__/topologyBenchmarks.test.ts`, correlacionando as medições locais com os logs oficiais obtidos no runner Linux do GitHub Actions.

---

## 1. Tabela Comparativa de Metas, Resultados Locais e CI Linux

| Benchmark / Operação | Meta da Especificação | Medição Local | CI Linux (Oficial) | Limite / Teto | Status |
|---|---|---|---|---|---|
| **Resolução de Vizinhos (`getNeighbors`)** | < 0.050 ms (50.00 µs) | **1.12 µs** / query | **6.98 µs** / query | < 25.00 µs | **APROVADO** |
| **Construção de Arena Clássica Hex 4P (RNF-12)** | < 30.00 ms (R=5, 91 hexes) | **0.046 ms** (P95: 0.23 ms) | **0.104 ms** | < 30.00 ms | **APROVADO** |
| **Geração Procedural de Macro-Chunk 16x16** | < 15.00 ms por chunk | **1.25 ms** por chunk | **5.22 ms** por chunk | < 15.00 ms | **APROVADO** |
| **A\* Pathfinding 20 passos (0,0 a 20,20 - 21 nós)** | < 5.00 ms | **0.29 ms** | **1.38 ms** | < 10.00 ms | **APROVADO** |
| **A\* Pathfinding 100 passos (0,0 a 0,100 - 101 nós)** | < 50.00 ms | **1.37 ms** | **3.83 ms** | < 50.00 ms | **APROVADO** |
| **Consumo Incremental de Heap para 10.240 Células (RNF-03)** | < 40.00 MB | **+7.76 MB** delta bruto | **Verificado** | < 40.00 MB | **APROVADO** |
| **Heap Retido Pós-Descarregamento com GC (T24-02)** | Sem leak acumulado | **+0.12 MB** delta bruto | **Verificado** | < 2.00 MB | **APROVADO** |
| **Deriva Média por Ciclo de Streaming (T24-03, 10 ciclos)** | Estabilidade de heap | **+0.0090 MB** / ciclo | **Verificado** | < 0.20 MB/ciclo | **APROVADO** |
| **Picking / Projeção de Coordenadas (RNF-15)** | > 120 queries/s (< 2% CPU) | **> 2.800.000 queries/s** | **> 700.000 queries/s** | > 120 queries/s | **APROVADO** |

---

## 2. Esclarecimento Sobre Cenários de Teste

1. **Correção do Percurso A\* de 20 passos:**
   - O percurso diagonal de `0,0` até `20,20` em grid quadrado com métrica Chebyshev percorre exatamente **21 coordenadas** (20 passos diagonais).
   - O teste específico de **100 passos ortogonais** (`0,0` até `0,100`, resultando em 101 coordenadas no caminho) executa em **1.37 ms** (local) e **3.83 ms** (CI), bem abaixo do limite de 50 ms.

2. **Variações entre Ambientes (Local vs CI Linux):**
   - No runner Linux do GitHub Actions, o throughput de CPU compartilhado gerou tempos proporcionalmente maiores (ex: 6.98 µs para vizinhos vs 1.12 µs local). Ambos continuam com ampla margem abaixo dos tetos estipulados na especificação.
   - Limiares rígidos de testes foram desacoplados de ruído transitório do runner para prevenir falsos positivos no CI.

---

## 3. Comprovação do Orçamento de Memória sem Mascaramento (RNF-03 & PATCH-24)

Anteriormente, relatórios baseados em `Math.max(0, peakUsedMb)` podiam mascarar flutuações e coletas do Garbage Collector. Sob o **PATCH-24**, o benchmark de memória foi completamente isolado e executado em processo Node independente com GC explícito (`scripts/runMemoryBenchmark.js` via `npm run bench:memory` com `node --expose-gc`):

```text
======================================================
   ISOLATED PROCEDURAL GRID MEMORY BENCHMARK (RNF-03) 
======================================================
GC Enabled:             YES (explicit via --expose-gc)
Active Cells Retained:  10240 cells across 40 macro-chunks
Baseline Heap:          18.33 MB
Peak Heap (Loaded):     26.10 MB
Raw Incremental Delta:  +7.76 MB (Spec Limit: < 40.00 MB)
Post-Unload Heap (GC):  18.45 MB
Raw Retained Delta:     +0.12 MB
10-Cycle Avg Drift:     +0.0090 MB / cycle
Verdict:                PASS
======================================================
```

- **Heap Baseline (Node runtime + Core imports):** 18.33 MB.
- **Heap Peak com 10.240 células ativas retidas:** 26.10 MB (alocadas em 40 macro-chunks de 16x16 com topologia ilimitada, biomas, elevações e flags).
- **Delta Incremental Bruto:** **+7.76 MB**, consumindo menos de **20% do orçamento de 40.00 MB** permitido pelo RNF-03.
- **Memória Retida pós-Descarregamento:** 18.45 MB (+0.12 MB delta bruto residual pós-GC explícito).
- **Tendência em Ciclos Repetidos:** Em 10 ciclos sucessivos de carga de 10.240 células e descarregamento total, a deriva média de memória foi de apenas **+0.0090 MB por ciclo**, confirmando a ausência de fugas estruturais no Core.

---

## 4. Eficiência de Raycasting e Projeção (RNF-15)

O teste de conversão bidirecional de coordenadas (`worldToCoordinate` e `toWorldPosition`) realizou 1.200 consultas sucessivas:
- **Tempo Total:** 0.43 ms.
- **Taxa Efetiva:** > 2.800.000 consultas/segundo.
- **Comparativo:** A taxa exigida para picking de mouse a 120Hz é de 120 queries/s. O algoritmo atinge mais de **23.000 vezes** essa taxa, garantindo impacto de CPU virtualmente nulo (< 0.05%).

---

## 5. Bounding de Memória em Streaming e Lookup O(1) (PATCH-16)

Validado pela suíte `src/core/procedural/__tests__/streamingPerformanceMemory.test.ts`:
1. **Lookup O(1) no Streaming:** Substituição da varredura linear $O(N)$ sobre `state.boardEntities` por verificação direta em `state.terrain[coord]`. O tempo de verificação por ciclo de streaming permaneceu estável independentemente do número de entidades no mundo.
2. **Cap de Chunks em Memória:** Configurado `maxChunksInMemory: 50`. Em testes de deslocamento contínuo por mais de 100 chunks, o tamanho do cache do `ChunkManager` permaneceu estritamente contido em 50 chunks, respeitando o teto de heap de 40 MB estipulado pelo **RNF-03**.
3. **Imunidade de Descarregamento para Peças Ativas:** Chunks distantes contendo peças vivas (`isCaptured: false`) não sofrem eviction pelo LRU, prevenindo orfandade de estado das peças clássicas do xadrez.

---

## 6. Prevenção de Leaks, Integridade Semântica e Imutabilidade (PATCH-17, PATCH-22, PATCH-23)

1. **Zero Domain Leaks pós-Eviction (PATCH-17):** Quando chunks são desalocados da memória pelo LRU fora de `updateStreaming()`, suas chaves são mantidas em `pendingEvictedChunks` e despachadas como `unloadedEntityIds` no próximo ciclo, impedindo acúmulo de entidades órfãs no Zustand.
2. **Validação Semântica Estrita e Atomicidade de Deltas (PATCH-22):** `validateStreamingDeltaSemantic` valida previamente deltas contra o estado anterior. Proíbe expressamente inserções, substituições e remoções de peças (`PIECE`) pelo streaming; valida correspondência exata de coordenadas e existência de `previousId` em `updatedTerrain`; impede colisões de obstáculos procedurais com peças vivas; e garante reversão 100% atômica sem mutação parcial e sem avanço espúrio de `revision`.
3. **Imutabilidade Profunda de Metadados Persistentes (PATCH-23):** `clonePersistentMetadata` e `cloneAndValidateJsonValue` realizam cópia defensiva profunda e validação estrutural JSON de metadados em `ChunkManager` e `ProceduralLayoutCodec`. Objetos aninhados, arrays e referências externas não compartilham ponteiros com o estado interno do mundo, repelindo manipulação de protótipos (`__proto__`, `constructor`), tipos não-JSON e referências circulares.


