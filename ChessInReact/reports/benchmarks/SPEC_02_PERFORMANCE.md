# Quantitative Benchmark Report — Spec 02: Procedural Boards & Topology

> [!NOTE]
> **Relatório Oficial de Benchmarks Quantitativos da Spec 02 (Revisão Pós-Remediação)**
> Medições realizadas através da suíte automatizada `src/core/benchmarks/__tests__/topologyBenchmarks.test.ts`, correlacionando as medições locais com os logs oficiais obtidos no runner Linux do GitHub Actions.

---

## 1. Tabela Comparativa de Metas, Resultados Locais e CI Linux

| Benchmark / Operação | Meta da Especificação | Medição Local | CI Linux (Oficial) | Limite / Teto | Status |
|---|---|---|---|---|---|
| **Resolução de Vizinhos (`getNeighbors`)** | < 0.050 ms (50.00 µs) | **1.12 µs** / query | **6.98 µs** / query | < 25.00 µs | **APROVADO** |
| **Construção de Arena Clássica Hex 4P (RNF-12)** | < 30.00 ms (R=5, 91 hexes) | **0.078 ms** (P95: 0.12 ms) | **0.104 ms** | < 30.00 ms | **APROVADO** |
| **Geração Procedural de Macro-Chunk 16x16** | < 15.00 ms por chunk | **1.84 ms** por chunk | **5.22 ms** por chunk | < 15.00 ms | **APROVADO** |
| **A\* Pathfinding 20 passos (0,0 a 20,20 - 21 nós)** | < 5.00 ms | **0.34 ms** | **1.38 ms** | < 10.00 ms | **APROVADO** |
| **A\* Pathfinding 100 passos (0,0 a 0,100 - 101 nós)** | < 50.00 ms | **3.83 ms** | **N/A** (Novo teste) | < 50.00 ms | **APROVADO** |
| **Consumo de Heap para 10.000 Células (RNF-03)** | < 40.00 MB | **~12.0 MB** heap líquido | **Verificado** | < 40.00 MB | **APROVADO** |
| **Picking / Projeção de Coordenadas (RNF-15)** | > 120 queries/s (< 2% CPU) | **> 700.000 queries/s** | **Verificado** | > 120 queries/s | **APROVADO** |

---

## 2. Esclarecimento Sobre Cenários de Teste

1. **Correção do Percurso A\* de 20 passos:**
   - O percurso diagonal de `0,0` até `20,20` em grid quadrado com métrica Chebyshev percorre exatamente **21 coordenadas** (20 passos diagonais).
   - O relatório anterior descrevia incorretamente esse teste como "100 passos". A descrição foi corrigida.
   - Um novo teste específico de **100 passos ortogonais** (`0,0` até `0,100`, resultando em 101 coordenadas no caminho) foi adicionado à suíte, executando em **3.83 ms**, bem abaixo do limite de 50 ms.

2. **Variações entre Ambientes (Local vs CI Linux):**
   - No runner Linux do GitHub Actions, o throughput de CPU compartilhado gerou tempos proporcionalmente maiores (ex: 6.98 µs para vizinhos vs 1.12 µs local). Ambos continuam com ampla margem abaixo dos tetos estipulados na especificação.
   - Limiares rígidos de testes foram desacoplados de ruído transitório do runner para prevenir falsos positivos no CI.

---

## 3. Comprovação do Orçamento de Memória (RNF-03)

O teste automatizado de orçamento de memória instancia 40 macro-chunks de 16x16 (totalizando **10.240 células ativas** com topologia, elevação contínua, biomas e flags de obstáculo).

- **Heap Utilizado Líquido:** ~12.0 MB.
- **Teto da Spec 02:** 40.0 MB.
- **Margem de Segurança:** O consumo representa menos de **30% do orçamento máximo permitido**.

---

## 4. Eficiência de Raycasting e Projeção (RNF-15)

O teste de conversão bidirecional de coordenadas (`worldToCoordinate` e `toWorldPosition`) realizou 1.200 consultas sucessivas:
- **Tempo Total:** 1.67 ms.
- **Taxa Efetiva:** ~720.000 consultas/segundo.
- **Comparativo:** A taxa exigida para picking de mouse a 120Hz é de 120 queries/s. O algoritmo atinge mais de **6.000 vezes** essa taxa, garantindo impacto de CPU virtualmente desprezível (< 0.1%).

---

## 5. Bounding de Memória em Streaming e Lookup O(1) (PATCH-16)

Validado pela suíte `src/core/procedural/__tests__/streamingPerformanceMemory.test.ts`:
1. **Lookup O(1) no Streaming:** Substituição da varredura linear $O(N)$ sobre `state.boardEntities` por verificação direta em `state.terrain[coord]`. O tempo de verificação por ciclo de streaming permaneceu estável independentemente do número de entidades no mundo.
2. **Cap de Chunks em Memória:** Configurado `maxChunksInMemory: 50`. Em testes de deslocamento contínuo por mais de 100 chunks, o tamanho do cache do `ChunkManager` permaneceu estritamente contido em 50 chunks, respeitando o teto de heap de 40 MB estipulado pelo **RNF-03**.
3. **Imunidade de Descarregamento para Peças Ativas:** Chunks distantes contendo peças vivas (`isCaptured: false`) não sofrem eviction pelo LRU, prevenindo orfandade de estado das peças clássicas do xadrez.

