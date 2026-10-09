# Test Results Report — Spec 01: Core State Architecture & Remediation

- **Date:** 2026-10-09
- **Branch:** `feat/core-state-architecture`
- **Base Commit:** `bba6811` (feat(core): implement Spec 01 Core State Architecture & ECS)
- **Environment:** Windows (PowerShell)
- **Node.js Version:** `v22.20.0`
- **Package Manager:** `npm 10.9.3`

---

## 📊 Summary of Quality Gates

| Gate | Status | Details |
|---|---|---|
| **Unit & Integration Tests** | `PASS` | 98 passed, 0 failed across 16 test files |
| **TypeScript Typecheck** | `PASS` | 0 errors (`tsc --noEmit` clean) |
| **ESLint Validation** | `PASS` | 0 errors, 0 warnings (`--max-warnings 0`) |
| **Production Build** | `PASS` | Vite built production bundle in 9.79s (`dist/`) |
| **End-to-End Integration** | `PASS` | Multi-layer test passed (`integration.test.ts`) |
| **Adversarial Fault-Injection** | `PASS` | 14 edge/failure cases passed (`adversarial.test.ts`) |
| **Core Isolation** | `PASS` | 0 imports of React/Three/DOM in Core (`isolation.test.ts`) |

---

## 🧪 Test Suites Breakdown

```text
 ✓ src/core/bootstrap/__tests__/bootstrap.test.ts        (3 tests)
 ✓ src/core/coordinates/__tests__/coordinates.test.ts    (6 tests)
 ✓ src/core/entities/__tests__/entities.test.ts          (17 tests)
 ✓ src/core/events/__tests__/events.test.ts              (4 tests)
 ✓ src/core/history/__tests__/history.test.ts            (5 tests)
 ✓ src/core/commands/__tests__/commands.test.ts          (10 tests)
 ✓ src/core/persistence/__tests__/persistence.test.ts    (3 tests)
 ✓ src/core/state/__tests__/store.test.ts                (7 tests)
 ✓ src/core/serialization/__tests__/serialization.test.ts(6 tests)
 ✓ src/core/optimistic/__tests__/optimistic.test.ts      (4 tests)
 ✓ src/bindings/r3f/__tests__/PieceAnimationSystem.test.ts(3 tests)
 ✓ src/core/__tests__/isolation.test.ts                  (1 test)
 ✓ src/core/__tests__/integration.test.ts                (2 tests)
 ✓ src/core/__tests__/adversarial.test.ts                (14 tests)
 ✓ src/core/workers/__tests__/EngineBridge.test.ts        (8 tests)
 ✓ src/core/benchmarks/__tests__/benchmarks.test.ts      (2 tests)

Test Files  16 passed (16)
Tests       98 passed (98)
Duration    5.00s
```

---

## 📈 Code Coverage (v8)

```text
-------------------|---------|----------|---------|---------|
File               | % Stmts | % Branch | % Funcs | % Lines |
-------------------|---------|----------|---------|---------|
 src/core/state    |    99.4 |    93.33 |   91.42 |    99.4 |
 src/core/serial... |   96.31 |    69.41 |     100 |   96.31 |
 src/core/commands |   94.47 |    84.37 |     100 |   94.47 |
 src/core/coord... |   95.74 |     87.5 |     100 |   95.74 |
 src/core/entities |   92.12 |    76.25 |     100 |   92.12 |
 src/core/events   |    98.2 |    90.47 |     100 |    98.2 |
 src/core/history  |   93.47 |    86.66 |    90.9 |   93.47 |
 src/core/optim... |   95.23 |    77.77 |    87.5 |   95.23 |
 src/core/persis...|    92.3 |       80 |    90.9 |    92.3 |
 src/core/boot...  |     100 |     87.5 |     100 |     100 |
 src/bindings/r3f  |   98.27 |    83.33 |    87.5 |   98.27 |
 src/core/bench... |   98.24 |    90.32 |     100 |   98.24 |
 src/core/workers  |   82.41 |    75.51 |   84.21 |   82.41 |
-------------------|---------|----------|---------|---------|
```

---

## 🛠️ Known Exclusions & Justifications

- **Exclusion:** `src/components/layout/` e `src/components/theme/` em `tsconfig.json` e `.eslintrc.cjs`.
- **Justificativa:** Arquivos Next.js copiados em commit anterior (`758523e`) não utilizados no aplicativo atual e sem relação com a Spec 01. Destinados à futura **Spec 06 (HUD & UI)** quando a casca do app for migrada/adaptada. Documentado formalmente no [ADR-004](file:///c:/Projetos/ChessInReact/ChessInReact/reports/decisions/ADR-004-handling-unadapted-nutriopus-assets.md).
- **Repositório Externo NutriOpus:** Inalterado (`UNCHANGED`).
