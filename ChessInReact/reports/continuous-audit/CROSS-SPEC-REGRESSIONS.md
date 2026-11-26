# ChessInReact — Matriz de Auditoria Cruzada e Prevenção de Regressões

> **Objetivo:** Garantir que modificações e homologações em uma SPEC não degradem contratos, interfaces e determinismos das demais SPECs do ecossistema.

---

## 1. Matriz de Interfaces Críticas Entre SPECs

| Interface Cruzada | SPECs Envolvidas | Contrato Arquitetural | Teste Comprovatório | Status |
|---|:---:|---|---|:---:|
| **Transição de Estado Legal** | Spec 01 + Spec 04 | Movimento legal aprovado pelo `RulesEngine` deve gerar transição atômica no `gameStore` via `MovePieceCommand` sem mutação colateral em `state.occupancy`. | `src/bindings/react/__tests__/ChessBoardRulesIntegration.test.tsx` | `VERIFIED` |
| **Topologia Ativa em Regras** | Spec 02 + Spec 04 | Regras em tabuleiros não-quadrados (Hex, Triangular, Cúbico, Toroidal) devem consultar `ITopology.getNeighbors` e coordenadas reais da geometria. | `src/engine/rules/__tests__/HexRulesIntegration.test.ts` | `VERIFIED` |
| **Legalidade Estrita de IA** | Spec 04 + Spec 05 | Nenhuma estratégia de IA pode retornar lance fora do conjunto retornado por `RulesEngine.getLegalMoves`. | `src/workers/ai/__tests__/AIEngine.test.ts` | `VERIFIED` |
| **Roteamento de IA por Variante** | Spec 05 + Spec 15 | `AIWorkerPool.selectStrategyForVariant` deve direcionar cada variante para a estratégia especializada correspondente com tempo e profundidade corretos. | `src/workers/ai/__tests__/AIWorkerPool.test.ts` | `VERIFIED` |
| **Isolamento HUD vs Canvas 3D** | Spec 06 + Spec 07 | Elementos de UI/HUD sobrepostos ao Canvas 3D não podem bloquear raycasting, seleção de peças ou controles de câmera OrbitControls quando não clicados. | `src/rendering/__tests__/Minigames3DParityAndOverlays.test.tsx` | `VERIFIED` |
| **Lobby para Sala Autoritativa** | Spec 03 + Spec 08 | Criação de partida no lobby deve instanciar e conectar à sala Colyseus correspondente com sincronização determinística. | `src/multiplayer/__tests__/multiplayerRulesE2E.test.ts` | `VERIFIED` |
| **Persistência de Minijogos** | Spec 09 + Spec 12 | Partidas com regras especiais (feitiços, pato, drops) devem serializar metadados completos em PGN e restaurar estados idênticos no replay. | `src/core/persistence/__tests__/PGNReplayEngine.test.ts` | `VERIFIED` |
| **Propagação de Configuração** | Spec 11 + Spec 16 | Nível de dificuldade (N1-N5), archetype e papel do slot configurados no Hub devem chegar inalterados ao `UniversalMatchController` e ao bot. | `src/controllers/__tests__/UniversalMatchController.test.ts` | `VERIFIED` |
| **Busca Composta em Spell Chess**| Spec 12 + Spec 15 | A IA de Spell Chess (Nível 5) deve avaliar turnos compostos [Feitiço + Lance] e considerar as respostas com magia do oponente. | `src/workers/ai/strategies/__tests__/SpellOptimizationJumpDefense.test.ts` | `VERIFIED` |
| **Arenas Massivas 3-12P** | Spec 13 + Spec 14 | Tabuleiros de 3 a 12 participantes devem operar rotação horária de turnos via `TurnCycleManager` e eliminação de facções. | `src/engine/multiplayer/arenas/__tests__/MultiplayerArenaTurnCycle.test.ts` | `VERIFIED` |
| **Repertório e Persistência** | Spec 17 + Spec 09 | Linhas teóricas de abertura e posições cadastradas no treinador SM-2 devem ser persistidas de forma determinística. | `src/core/persistence/__tests__/MatchRepository.test.ts` | `VERIFIED` |
| **Torneios e Estado Autoritativo**| Spec 18 + Spec 03 | Pareamentos do Sistema Suíço FIDE e pontuações de Arena Berserk não podem ser manipuláveis pelo cliente local. | `src/engine/tournaments/__tests__/SwissPairingEngine.test.ts` | `VERIFIED` |

---

## 2. Invariante de Reauditoria em Caso de Regressão
Se a correção de qualquer defeito em uma SPEC posterior (ex: Spec 07) modificar código ou tipos compartilhados com uma SPEC anterior (ex: Spec 01 ou Spec 04), a homologação da SPEC anterior é imediatamente suspensa e uma reauditoria completa de regressão deve ser executada antes de qualquer novo avanço.

