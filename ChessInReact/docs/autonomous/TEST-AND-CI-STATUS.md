# ChessInReact | Test and CI Status

## PATCH-15, 16, 16A e 17 (28/11/2026)

Local, código final: **1.606 de 1.606**. Com cobertura houve 4 falhas por tempo sob carga; um orçamento de teste foi ajustado e os arquivos afetados e os novos passaram isolados com cobertura (53 de 53). ESLint, build, worker no Chromium, 11 fluxos de aceitação, Spell Chess 2D/3D e a jornada `npm run acceptance:journey` (15 de 15) aprovados. A jornada nova não faz parte do CI. [Detalhes e limites](patches/PATCH-15-16-17-PRETAS-REPLAY-SALVAMENTO.md#verificações).

## PATCH-14 (27/11/2026)

Local, com cobertura: **1.584 de 1.586** na execução conjunta; os dois arquivos com falha (latência e timeout sob carga) passaram isolados, 16 de 16. ESLint, build, worker no Chromium e 11 fluxos de aceitação aprovados. O CI remoto deste commit deve ser conferido após o push. [Detalhes e limites](patches/PATCH-14-N5-MOTOR-COMPACTO.md#verificações-antes-do-push).

## Atualização local — PATCH-13 (27/11/2026)

[Relatório de segurança material](patches/PATCH-13-SPELL-CHESS-MATERIAL-SAFETY.md), [comparação das 12 partidas](patches/patch13-evidence/MATERIAL-COMPARISON.md) e [gates finais](patches/patch13-evidence/validation.json). Validação local final: **1.499 testes em 172 arquivos aprovados**, build, ESLint, onze fluxos gerais de aceitação e Spell Chess 2D/3D aprovados. O CI remoto de `95b88c1` não valida estas alterações locais.

## Atualização local — PATCH-12 (26/11/2026)

O [relatório do PATCH-12](patches/PATCH-12-SPELL-CHESS-N5.md) registra a validação atual, o benchmark e as limitações. Os sete erros da execução remota de `474377d` foram reproduzidos e corrigidos localmente. Build, ESLint, testes, aceitação geral e regressão Spell Chess em navegador real têm evidências em [validation.json](patches/patch12-evidence/validation.json).

Ampliação posterior: **126 casos novos de equivalência tática**, incluindo 14 defesas obrigatórias com Freeze; **142 testes direcionados aprovados** junto das 16 regressões anteriores. TypeScript e ESLint aprovados. [Linha calculada e matriz de casos](patches/patch12-evidence/TACTICAL-EQUIVALENCE.md). A última execução completa anterior à ampliação foi de 1329 testes aprovados; esses resultados são registrados separadamente.

O CI remoto da base continua sendo um resultado histórico. Commit e push do PATCH-12 foram autorizados pelo usuário em 26/11/2026; o resultado do CI desse novo commit deve ser consultado no GitHub Actions. Os números abaixo desta seção pertencem ao relatório anterior de 11/11/2026.

> **Status de Testes e Pipelines de Integração Contínua**  
> **Data:** 11/11/2026 10:12 (UTC-4)

---

## 1. Suíte Local de Testes e Cobertura

- **Total de Testes:** 789 testes aprovados em 96 arquivos de teste.
- **Falhas / Pulados:** 0 falhas, 0 testes pulados.
- **Cobertura de Topologia (Spec 02):** 98,21% (Requisito da governança: > 95%).
- **Duração Média da Suíte:** ~55 segundos (incluindo testes de stress Perft, shaders GLSL, batching instanciado, PGN, ReplayEngine, GameReviewEngine, SpellChessEngine, MatchmakingQueueEngine, BetzaValidatorSandbox, AdaptiveBotEcosystem, DuckChessEngine, PuzzleRushEngine, BughouseEngine, SupabaseEventSourcing, RedisMatchmakingCluster, PlayerHabitsAndTiers e ModAssetAndTournament).

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
   - Pico de heap: **35.11 MB** (orçamento formal: < 40 MB).
   - Deriva por ciclo após 10 iterações: **+0.0090 MB/ciclo** (sem vazamentos de memória).

3. **Aceite Funcional e Responsivo Chromium (`npm run acceptance`):**
   - 5 Viewports validadas: 360×800, 390×844, 768×1024, 1024×768, 1440×900 px.
   - 0 cortes de elementos, 0 transbordamentos horizontais.
   - 11 Fluxos comportamentais rigorosamente aprovados com assertions em tempo de execução.
   - Raycasting 3D nativo, resolução de lances e preservação de estado 3D/2D validados.
