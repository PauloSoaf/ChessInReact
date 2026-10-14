# Performance & Benchmark Report — Spec 01: Core State Architecture

- **Date:** 2026-10-14
- **Platform:** Windows x64 / Node.js `v22.20.0`
- **CPU Clock / Runtime:** V8 Engine via Node / Vitest Benchmarking Harness
- **Methodology:** Warm-up execution (500 discarded entities) followed by multiple sampling (10 samples for 64 entities, 5 samples for 1,000 and 4,000 entities, 3 samples for 10,000 entities). Statistics reported in **median** and **95th percentile (p95)**.

---

## 📊 Matriz de Desempenho Empírica (Pós-Patch Final)

| Escala (Entidades) | Amostras | Inicialização (mediana / p95) | Lookup por ID (mediana / p95) | Lookup Espacial (mediana / p95) | Movimentação Atômica (mediana / p95) | Despacho Command + Histórico (mediana / p95) | Snapshot JSON (mediana / p95) | Serialização Int32 (mediana / p95) | Serialização JSON (mediana / p95) | Aceleração Int32 vs JSON |
|---|---|---|---|---|---|---|---|---|---|---|
| **64 (FIDE Real)** | 10 | 0.284 ms / 0.740 ms | 0.069 µs / 0.203 µs | 0.106 µs / 0.235 µs | 0.452 µs / 1.462 µs | **0.010 ms** / 0.013 ms | 0.116 ms / 0.280 ms | 0.206 ms / 0.606 ms | 0.093 ms / 0.119 ms | 0.45x (JSON pequeno) |
| **1.000** | 5 | 3.574 ms / 4.248 ms | 0.102 µs / 0.186 µs | 0.190 µs / 0.266 µs | 0.450 µs / 0.537 µs | **0.013 ms** / 0.023 ms | 1.775 ms / 2.155 ms | 2.633 ms / 4.193 ms | 1.959 ms / 2.593 ms | 0.74x |
| **4.000** | 5 | 10.357 ms / 15.349 ms | 0.161 µs / 0.162 µs | 0.250 µs / 0.306 µs | 0.623 µs / 0.994 µs | **0.013 ms** / 0.015 ms | 7.888 ms / 8.928 ms | 6.257 ms / 11.515 ms | 7.348 ms / 12.474 ms | **1.17x mais rápido** |
| **10.000 (Stress)** | 3 | 19.516 ms / 27.957 ms | 0.113 µs / 0.126 µs | 0.193 µs / 0.245 µs | 0.555 µs / 0.614 µs | **0.010 ms** / 0.015 ms | 19.283 ms / 26.570 ms | 17.249 ms / 24.799 ms | 13.278 ms / 21.864 ms | 0.77x (throughput limite) |

---

## 🔍 Classificação das Métricas

- **Measured (Medido diretamente):**
  - Tempo de despacho de `MovePieceCommand` com gravação de histórico: **0.010ms a 0.013ms** (meta do Critério de Aceite 1: `< 1.0ms` — **Aprovado com folga de 98.7%**).
  - Consulta amortizada de ID (`manager.getEntity()`): **0.069µs a 0.161µs** (< 1µs).
  - Consulta espacial amortizada (`manager.getOccupant()`): **0.106µs a 0.250µs** (< 1µs).
  - Inicialização do tabuleiro para 64 peças: **0.284ms** (meta: `< 50ms` — **Aprovado com folga de 99.4%**).
  - Tamanho serializado do snapshot JSON de 64 peças: **~4.2 KB** (meta do RNF-10: `< 25 KB` — **Aprovado**).
- **Derived (Derivado):**
  - Fator de aceleração da serialização Int32 versus JSON: até 1.17x para 4.000 entidades.
  - Alocação zero-copy: transferência via `ArrayBuffer.transfer` / Transferable List comprovada com desanexação de buffer (`byteLength === 0`).
- **Estimated (Estimado):**
  - Impacto de renderização no frame rate: a execução de despacho leva ~0.01ms do orçamento de frame de 16.6ms a 60 FPS (menos de 0.1% do tempo total do frame gasto no Core de estado).

---

## 🛠️ Como Reproduzir Localmente

Para reproduzir os resultados de benchmark:
```bash
cd ChessInReact
npx vitest run src/core/benchmarks/__tests__/benchmarks.test.ts
```
Ou executar diretamente o script via Node:
```bash
npx tsx src/core/benchmarks/coreBenchmarks.ts
```
