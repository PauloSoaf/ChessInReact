# Test Results Report — Spec 01: Core State Architecture & Remediation

- **Date:** 2026-10-14
- **Branch:** `feat/core-state-architecture`
- **Baseline SHA:** `fe247acc49fe33927493bbed537afac5295cc7a3`
- **Environment:** Windows (PowerShell) / Node.js `v22.20.0`
- **Package Manager:** `npm 10.9.3`

---

## 📊 Summary of Quality Gates

| Gate | Status | Details |
|---|---|---|
| **Unit, Integration, Visual & Mounted Tests** | `PASS` | 150 passed, 0 failed across 18 test files (hotfix run; 145 at 7207005) |
| **TypeScript Typecheck** | `PASS` | 0 errors (`npx tsc --noEmit` clean) |
| **ESLint Validation** | `PASS` | 0 errors, 0 warnings (`--max-warnings 0`) |
| **Production Build** | `PASS` | Vite built production bundle clean (`dist/`) |
| **End-to-End Integration** | `PASS` | Multi-layer pipeline passed (`integration.test.ts`) |
| **Visual Board Integration** | `PASS` | React SSR pipeline passed (`ChessBoardVisual.test.tsx`) |
| **Mounted Interactive Board Tests** | `PASS` | Full interactive click, move, reactive rerender, undo, redo, reset passed (`ChessBoardMounted.test.tsx`) |
| **Real Multi-threaded Worker Integration** | `PASS` | Native OS thread transfer, ArrayBuffer zero-copy detachment (`EngineBridge.test.ts`) |
| **Adversarial Fault-Injection** | `PASS` | 14 edge/failure cases passed (`adversarial.test.ts`) |
| **Core Isolation** | `PASS` | 0 imports of React/Three/DOM in Core (`isolation.test.ts`) |

---

## 🧪 Test Suites Breakdown (Final Remediation Execution)

```text
 ✓ src/core/bootstrap/__tests__/bootstrap.test.ts          (3 tests)
 ✓ src/core/coordinates/__tests__/coordinates.test.ts      (6 tests)
 ✓ src/core/entities/__tests__/entities.test.ts            (34 tests - atomic replacement, whitelist, defensive copying)
 ✓ src/core/events/__tests__/events.test.ts                (4 tests)
 ✓ src/core/history/__tests__/history.test.ts              (5 tests - stack limits, fault injection safety)
 ✓ src/core/commands/__tests__/commands.test.ts            (16 tests - turn state undo/redo, non-piece capture prevention)
 ✓ src/core/persistence/__tests__/persistence.test.ts      (3 tests)
 ✓ src/core/state/__tests__/store.test.ts                  (7 tests)
 ✓ src/core/serialization/__tests__/serialization.test.ts  (15 tests - hex/square geometry, protocol validation)
 ✓ src/core/optimistic/__tests__/optimistic.test.ts        (4 tests)
 ✓ src/bindings/r3f/__tests__/PieceAnimationSystem.test.ts (3 tests)
 ✓ src/bindings/react/__tests__/ChessBoardVisual.test.tsx  (5 tests - visual SSR integration)
 ✓ src/bindings/react/__tests__/ChessBoardMounted.test.tsx (3 tests - mounted JSDOM reactive interaction)
 ✓ src/core/__tests__/isolation.test.ts                    (1 test)
 ✓ src/core/__tests__/integration.test.ts                  (2 tests)
 ✓ src/core/__tests__/adversarial.test.ts                  (14 tests)
 ✓ src/core/workers/__tests__/EngineBridge.test.ts          (17 tests - mock worker, real OS thread, shared protocol, browser handler)
 ✓ src/core/benchmarks/__tests__/benchmarks.test.ts        (2 tests)

Test Files  18 passed (18)
Tests       145 passed (145)
Duration    ~3.2s
```

### 📜 Histórico de Execuções

- **Execução Inicial (Baseline alegado):** 69 testes (não reproduzidos isoladamente).
- **Primeira Auditoria:** 98 testes em 16 arquivos (commit `f93f9d4`).
- **Segunda Auditoria:** 111 testes em 17 arquivos.
- **Terceira Auditoria (Baseline `fe247acc`):** 117 testes em 17 arquivos.
- **Auditoria Corretiva Final (PATCH-01 a PATCH-12):** 145 testes em 18 arquivos (28 novos testes cobrindo substituição transacional, whitelist estrita em runtime, isolamento profundo de metadados, sincronização de turno no Undo/Redo, proteção contra captura de terreno/obstáculo, distinção explícita de geometria quadrada vs hex cúbica, validação integral do protocolo binário, thread real com detecção de desanexação de buffer, segurança de falha no HistoryManager e testes interativos montados no React).

---

## 📈 Code Coverage (v8)

```text
-------------------|---------|----------|---------|---------|
File               | % Stmts | % Branch | % Funcs | % Lines |
-------------------|---------|----------|---------|---------|
 src/core/state    |   99.41 |    95.08 |   91.66 |   99.41 |
 src/core/serial... |   92.93 |    79.48 |     100 |   92.93 |
 src/core/commands |   94.86 |    81.48 |     100 |   94.86 |
 src/core/coord... |   95.74 |     87.5 |     100 |   95.74 |
 src/core/entities |   93.43 |    83.63 |     100 |   93.43 |
 src/core/events   |    98.2 |     91.3 |     100 |    98.2 |
 src/core/history  |   94.11 |    86.66 |    90.9 |   94.11 |
 src/core/optim... |   95.23 |       80 |    87.5 |   95.23 |
 src/core/persis...|    92.3 |    78.57 |      90 |    92.3 |
 src/core/boot...  |     100 |      100 |     100 |     100 |
 src/bindings/r3f  |   98.29 |    83.33 |    87.5 |   98.29 |
 src/core/bench... |   98.24 |    90.32 |     100 |   98.24 |
 src/core/workers  |   62.39 |     72.3 |      84 |   62.39 |
 src/bindings/react|   82.25 |    83.33 |      40 |   82.25 |
-------------------|---------|----------|---------|---------|
```

---

## 🛠️ Known Exclusions & Justifications

- **Exclusion:** `src/components/layout/` e `src/components/theme/` em `tsconfig.json` e `.eslintrc.cjs`.
- **Justificativa:** Arquivos Next.js copiados em commit anterior (`758523e`) não utilizados no aplicativo atual e sem relação com a Spec 01. Destinados à futura **Spec 06 (HUD & UI)** quando a casca do app for migrada/adaptada. Documentado formalmente no [ADR-004](reports/decisions/ADR-004-handling-unadapted-nutriopus-assets.md).
- **Repositório Externo NutriOpus:** Inalterado (`UNCHANGED`).
