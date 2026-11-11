# ChessInReact | Test and CI Status

> **Status de Testes e Pipelines de Integração Contínua**  
> **Data:** 11/11/2026 08:45 (UTC-4)

---

## 1. Suíte Local de Testes e Cobertura

- **Total de Testes:** 676 testes aprovados em 84 arquivos de teste.
- **Falhas / Pulados:** 0 falhas, 0 testes pulados.
- **Cobertura de Topologia (Spec 02):** 98,21% (Requisito da governança: > 95%).
- **Duração Média da Suíte:** ~36 segundos (incluindo testes de stress Perft, shaders GLSL, batching instanciado, PGN e ReplayEngine).

---

## 2. Testes de Smoke e Integração Nativa

1. **Native Chromium Smoke Test (`node scripts/runChromiumSmoke.js`):**
   - Executado em Chromium real headless (`--headless=new`).
   - Verifica inicialização de Dedicated Web Worker real no browser.
   - Handshake PING/PONG verificado com sucesso.
   - Cálculo de A* pathfinding e lance de IA executados no worker nativo.

2. **Benchmark Isolado de Memória (`npm run bench:memory`):**
   - Executado com `node --expose-gc scripts/runMemoryBenchmark.js`.
   - 10.240 células ativas retidas em 40 macro-chunks procedurais.
   - Pico de heap: **21.67 MB** (orçamento formal: < 40 MB).
   - Deriva por ciclo após 10 iterações: **+0.0100 MB/ciclo** (sem vazamentos de memória).

3. **Aceite Funcional e Responsivo Chromium (`npm run acceptance`):**
   - 5 Viewports validadas: 360×800, 390×844, 768×1024, 1024×768, 1440×900 px.
   - 0 cortes de elementos, 0 transbordamentos horizontais.
   - 11 Fluxos comportamentais rigorosamente aprovados com assertions em tempo de execução.
   - Raycasting 3D nativo, resolução de lances e preservação de estado 3D/2D validados.

