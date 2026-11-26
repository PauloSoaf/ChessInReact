# ChessInReact — Log Contínuo de Defeitos e Remediações

> **Classificação de Severidade:**
> - `P0 CRITICAL:` Corrupção de partida, movimentos ilegais, perda de dados, falha de segurança, resultados incorretos, travamento essencial, defeito que impede jogar.
> - `P1 HIGH:` Bot funcionalmente errado, requisito obrigatório incompleto, regras divergentes, minijogo não jogável, quebra importante de UI ou integração, falha de CI relevante.
> - `P2 MEDIUM:` Problemas de UX, performance, limpeza arquitetural, acessibilidade, inconsistências relevantes de apresentação e manutenção.
> - `P3 LOW:` Pequenos ajustes, comentários, nomenclatura e melhorias não bloqueantes.

---

## 1. Defeitos Remediados Recentemente

| ID | Severidade | SPEC | Arquivo(s) Afetado(s) | Descrição do Problema | Causa Raiz | Status | Commit / Fix |
|---|:---:|:---:|---|---|---|:---:|:---:|
| **DEF-001** | `P0 CRITICAL` | Spec 04 / Spec 01 | `src/engine/rules/RulesEngine.ts` | Duplicação de peças (tabuleiro corrompido com 48+ peças no 1º lance da IA). | Mutação in-place de `state.occupancy` durante simulação de lances em `validateMove` e `getLegalMoves`. Remediado definitivamente substituindo toda mutação in-place por clonagem isolada `{ ...state.occupancy }`, eliminando qualquer possibilidade de vazamento de ocupação. | `RESOLVED` | `bf3c0de` + HEAD |
| **DEF-002** | `P0 CRITICAL` | Spec 05 / Spec 12 | `src/workers/ai/strategies/SpellOptimizationStrategy.ts` | Travamento/congelamento de CPU (100%) em partidas de Spell Chess e testes do `UniversalMatchController`. | Laços `while (cx !== tx \|\| cy !== ty)` em `detectLethalJumpThreats`, `doesPieceAttackSquare` e `canSliderReachSquare` sem verificação de borda `cx >= 0 && cx < 8 && cy >= 0 && cy < 8`. | `RESOLVED` | `bf3c0de` |
| **DEF-003** | `P1 HIGH` | Spec 12 / Spec 15 | `src/workers/ai/strategies/SpellOptimizationStrategy.ts` | Bot de Spell Chess Nível 5 congelava o rei adversário incluindo sua própria peça atacante no raio 3x3. | Ausência de cálculo de centro de congelamento deslocado com offset seguro para o atacante. | `RESOLVED` | `bf3c0de` + HEAD |
| **DEF-004** | `P1 HIGH` | Spec 05 / Spec 16 | `src/matchmaking/config/MatchConfigurationManager.ts` | Atualização de papel de slot para IA não configurava orçamento de tempo compatível com a dificuldade do bot. | `updateSlotRole` preservava `thinkTimeMs` genérico em vez do orçamento calibrado por nível (150ms a 2500ms). | `RESOLVED` | `bf3c0de` |
| **DEF-005** | `P1 HIGH` | Spec 12 / Spec 13 | `VariantMatchBanner.tsx`, `MinigamesCatalogSection.tsx`, `MagicalVariantsCatalog.ts`, `SPEC_12_AUDIT.md` | Contradição de regras: banners e catálogo citavam "Freeze & Jump (2 Cargas)" e 2 cargas de Freeze, enquanto o Chess.com oficial e a engine adotam 5 Freezes e 2 Jumps. | Cargas de Freeze divergentes em banners e documentação antiga da auditoria da Spec 12. | `RESOLVED` | HEAD |
| **DEF-008** | `P1 HIGH` | Spec 12 / Spec 15 | `SpellOptimizationStrategy.ts`, `SpellChessPositionEvaluator.ts`, `SpellChessMoveGenerator.ts` | Bot de Spell Chess gastava Freeze em lances iniciais sem ganho tático, entrava em recarga e era congelado/mateado pelo jogador humano com peça atacante. | Ausência de princípio de conservação de Freeze (não gastar se oponente tem Freeze pronto), ausência de pontuação para xeque-mate por congelamento (`+80k` / `-80k`) e falta de janelas de congelamento com deslocamento 3x3 para o Rei. | `RESOLVED` | HEAD |
| **DEF-009** | `P1 HIGH` | Spec 12 / Spec 15 | `DuckChessPlannerStrategy.ts`, `VariantSpecializedStrategy.ts` | Bots de outros minijogos (Duck Chess e Atomic) vulneráveis a ataques diretos e sobrescrita indevida de avaliação. | Duck Chess não penalizava ataques inbloqueáveis de Cavalos/Peões contra o Rei (`-90k`); Atomic Chess permitia que busca clássica sobrescrevesse heurísticas atômicas com lances de autodetonação. | `RESOLVED` | HEAD |

---

## 2. Inconsistências e Defeitos Abertos em Investigação

| ID | Severidade | SPEC | Arquivo(s) / Documento(s) | Descrição do Problema | Impacto | Ação de Remediação |
|---|:---:|:---:|---|---|---|---|
| **DEF-006** | `P2 MEDIUM` | Spec 06 | `src/ui/components/hub/GameHub.tsx` | Componente central do Hub ainda possui mais de 1.200 linhas de código com acúmulo de responsabilidades de apresentação e orquestração. | Dificuldade de manutenção e testabilidade de sub-seções. | Extração modular em subcomponentes puros durante o ciclo da SPEC 06. |
| **DEF-007** | `P2 MEDIUM` | Spec 12 / Spec 05 | `src/analysis/GameReviewEngine.ts` | Algoritmo de classificação de lances pode gerar avaliações simplificadas sem busca profunda quando invocado fora do worker. | Acurácia exibida pode divergir da busca Minimax real. | Validar integração entre `GameReviewEngine` e `AIEngine.calculateBestMove` durante a auditoria da SPEC 12. |
