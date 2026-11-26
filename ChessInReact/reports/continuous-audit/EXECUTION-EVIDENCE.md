# ChessInReact — Evidências Empíricas de Execução em Ambiente Real

> **Commit HEAD Testado:** `bf3c0de`  
> **Branch:** `feat/spec07-3d-rendering-webgl`  
> **Ambiente:** Windows 11, Node.js v22.20.0, Google Chrome 157.0.8103.79  
> **Data:** 26/11/2026

---

## 1. Verificação Estática de Tipagem (TypeScript)

- **Comando:** `npx tsc --noEmit`
- **Saída:** 0 erros encontrados.
- **Status:** `PASS`
- **Evidência:** Compilação estrita sem flags de supressão (`strict: true` em `tsconfig.json`).

---

## 2. Análise Estática de Código (ESLint)

- **Comando:** `npm run lint` (`eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0`)
- **Saída:** 0 erros, 0 warnings.
- **Status:** `PASS`
- **Evidência:** Validação de regras de acessibilidade, clean code, descarte de variáveis não utilizadas e ausência de emojis nos componentes principais.

---

## 3. Compilação de Produção (Vite Build)

- **Comando:** `npm run build` (`tsc && vite build`)
- **Saída:**
  ```text
  vite v5.2.10 building for production...
  transforming...
  ✓ 816 modules transformed.
  rendering chunks...
  computing gzip size...
  dist/index.html                                 1.23 kB │ gzip:   0.62 kB
  dist/assets/engineWorker-BBSCqXfL.js          123.74 kB
  dist/assets/index-C_E-8ge9.css                 21.11 kB │ gzip:   5.06 kB
  dist/assets/ChessPieceShowcase-h48MEEHg.js     18.01 kB │ gzip:   5.47 kB
  dist/assets/ChessBoard3D-DC0324YB.js           27.40 kB │ gzip:   9.24 kB
  dist/assets/index-Cniseq4K.js                 779.25 kB │ gzip: 209.83 kB
  dist/assets/vendor-three-VaViipCL.js        1,122.38 kB │ gzip: 311.02 kB
  ✓ built in 8.97s
  ```
- **Status:** `PASS`

---

## 4. Teste em Navegador Real (Chromium Web Worker Smoke Test)

- **Comando:** `node scripts/runChromiumSmoke.js`
- **Navegador Detectado:** `C:\Program Files\Google\Chrome\Application\chrome.exe` (Google Chrome 157.0.8103.79)
- **Modo:** Headless real (`--headless=new`, porta CDP dedicada, servidor Vite em localhost)
- **Saída:**
  ```json
  {
    "success": true,
    "skipped": false,
    "browserPath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "browserVersion": "Google Chrome 157.0.8103.79",
    "result": "SUCCESS: {\"handshake\":\"PONG\",\"entityCount\":1,\"cellCount\":256,\"pathFound\":true,\"pathLength\":5,\"voronoiVerified\":true,\"aiVerified\":true,\"aiBestMove\":{\"fromCoord\":\"0,7\",\"toCoord\":\"0,0\",\"pieceId\":\"b_r\"},\"reactIntegrationVerified\":true}"
  }
  ```
- **Status:** `PASS` (Execução autêntica comprovada, `skipped: false`).

---

## 5. Benchmark Isolado de Memória Procedural (RNF-03)

- **Comando:** `node --expose-gc scripts/runMemoryBenchmark.js`
- **Condições:** V8 Garbage Collector explícito habilitado via `--expose-gc`. Sem clamping artificial (`Math.max(0, ...)` proibido).
- **Métricas:**
  - Células retidas em memória: 10.240 células distribuídas em 40 macro-chunks.
  - Heap Base (Baseline): 21.02 MB.
  - Heap Pico (Loaded): 37.01 MB.
  - Delta Incremental Bruto: **+15.99 MB** (Limite da Spec: $< 40.00\text{ MB}$).
  - Heap Pós-Descarregamento (GC): 21.14 MB.
  - Delta Retido Bruto: +0.12 MB.
  - Deriva Média em 10 Ciclos: +0.0090 MB / ciclo.
- **Veredito:** `PASS`

---

## 6. Suites de Testes Automatizados Executadas

| Suite / Domínio | Arquivos | Testes | Duração | Status |
|---|:---:|:---:|:---:|:---:|
| `src/core/` (Spec 01 + Spec 02) | 53 | 415 | 15.66s | `PASS` |
| `UniversalMatchController.test.ts` (Spec 16 + Spec 15 + Spec 12) | 1 | 15 | 565ms | `PASS` |
| `VariantMapsSkinsAndRules.test.tsx` (Spec 13 + Spec 07 + Spec 04) | 1 | 10 | 2.42s | `PASS` |

