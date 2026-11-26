# ChessInReact | Patch Backlog (Autonomous Spec Completion Engine)

> **Backlog Dinâmico de Patches Executáveis**  
> **Última Atualização:** 11/11/2026 10:12 (UTC-4)  
> **Ordem de Prioridade:** Falhas críticas > Erros de regras > Falhas de build/CI > Contratos arquiteturais > Funcionalidades fundamentais > Otimizações > Polimento visual.

---

## 1. Patches Concluídos e Homologados

| Patch ID | Escopo | Objetivo Principal | Commit | Status |
| :--- | :--- | :--- | :--- | :---: |
| `SPEC07-CHECK-FEEDBACK-CI-HOTFIX-01` | Spec 07 / CI | Desacoplamento lazy do 3D, correção de ESLint e teste de rejeição de Worker | `64498a9` | **HOMOLOGADO** |
| `SPEC07-3D-TEST-AND-WORKER-CLEANUP-01` | Spec 07 / IA | Limpeza de mocks Three.js (0 warnings), fallback assíncrono não-bloqueante e fluxo de xeque 2D | `f2ab2ac` | **HOMOLOGADO** |
| `SPEC07-REAL-WEBGL-ACCEPTANCE-02` | Spec 07 / WebGL | Resolução de buffer WebGL (> 300x150), raycasting real 3D, evidências visuais e medição de latência | `060f3fb` | **HOMOLOGADO** |
| `SPEC07-CAMERA-LERP-AND-ANIMATION-01` | Spec 07 / Animação | Interpolação suave de câmera orbital via lerp em useFrame e arco parabólico em lances de peças 3D | `804dc5b` | **HOMOLOGADO** |
| `SPEC07-GLSL-HOLOGRAM-SHADERS-02` | Spec 07 / Shaders | Shaders GLSL customizados com pulso holográfico e scanlines para peças selecionadas e xeque | `655e20a` | **HOMOLOGADO** |
| `SPEC07-INSTANCED-PIECE-BATCHING-03` | Spec 07 / Batching | Agrupamento de peças com THREE.InstancedMesh reduzindo draw calls para <= 6 (meta < 20) | `a0fd296` | **HOMOLOGADO** |
| `SPEC09-PGN-PARSER-AND-PERSISTENCE-01` | Spec 09 / PGN | Serializador Seven Tag Roster FIDE, parser de tags/lances, ReplayEngine determinístico e arquivo local | `5d5e222` | **HOMOLOGADO** |
| `SPEC12-GAME-REVIEW-EVAL-GRAPH-01` | Spec 12 / Análise | Gráfico SVG interativo de vantagem, classificação FIDE/Chess.com de jogadas e fórmula CAPS2 | `2f5a6de` | **HOMOLOGADO** |
| `SPEC12-SPELL-CHESS-MANA-ENGINE-02` | Spec 12 / Minigames | Máquina de estados de Spell Chess: economia de mana (2-6), 7 feitiços canônicos, cooldowns e HUD | `aae907a` | **HOMOLOGADO** |
| `SPEC08-MATCHMAKING-QUEUE-AND-LOBBY-01` | Spec 08 / Matchmaker | Motor de fila de matchmaking por janelas dinâmicas de Elo, tickets com heartbeat/TTL e LobbyManager | `d280f4f` | **HOMOLOGADO** |
| `SPEC10-MODDING-API-RULESET-SANDBOX-01` | Spec 10 / Modding | Sandbox de validação Betza (< 2.0ms), parser de manifestos com unranked taint e LiveOps MotD | `02e6f2d` | **HOMOLOGADO** |
| `SPEC11-ADAPTIVE-BOT-RATING-ECOSYSTEM-01` | Spec 11 / Bots | Ladder de 19 bots calibrados (0-2200+), motor adaptativo com Zobrist blunders (LRU 500) e Glicko-2 | `162f9e7` | **HOMOLOGADO** |
| `SPEC12-DUCK-CHESS-NEUTRAL-BLOCKER-03` | Spec 12 / Minigames | Movimentação em 2 fases (Peça + Pato), bloqueador absoluto e captura física do rei | `54905df` | **HOMOLOGADO** |
| `SPEC12-PUZZLE-RUSH-TACTICAL-ENGINE-04` | Spec 12 / Minigames | Modos Sobrevivência (3 vidas, 600-2600+), Contra o Relógio (3m/5m) e sincronização 1v1 | `42c0694` | **HOMOLOGADO** |
| `SPEC12-BUGHOUSE-TWIN-BOARD-ENGINE-05` | Spec 12 / Minigames | Tabuleiros gêmeos 2v2 (Mesa A/B), transferência cruzada de capturas e Drop Moves | `590ccc3` | **HOMOLOGADO** |
| `SPEC09-SUPABASE-EVENT-SOURCING-02` | Spec 09 / Supabase | Esquema Prisma relacional, Event Sourcing com compressão LZ4 de fita e RLS | `7ee2cee` | **HOMOLOGADO** |
| `SPEC08-REDIS-MATCHMAKING-CLUSTER-02` | Spec 08 / Matchmaker | Penalidade Anti-Dodge (60s/300s/900s), Relay PubSub de Espectadores e Presença | `161a010` | **HOMOLOGADO** |
| `SPEC11-PLAYER-HABIT-AND-TIER-UNLOCK-02` | Spec 11 / Bots | Perfilagem tática de hábitos, injeção de blunders (< 800) e desbloqueio de Tiers | `3e235f2` | **HOMOLOGADO** |
| `SPEC10-MOD-COMMUNITY-WORKSHOP-02` | Spec 10 / Modding | Validador GLTF (2MB, Magic, SHA256), motor de torneios e quarentena de mods | `HEAD` | **HOMOLOGADO** |

---

## 2. Patches em Fila de Execução

### `PATCH-10` — Separação entre busca tática e resultado executado (26/11/2026)

Implementação local concluída para este escopo; validação manual 2D/3D pendente. [Regras, alterações e evidências de validação](patches/PATCH-10-KING-CAPTURE-ONLY.md).

- `SPELL_CHESS_KING_CAPTURE_ONLY` identifica o modo personalizado “Captura obrigatória”, com `winCondition: 'KING_CAPTURE_ONLY'`. O modo oficial mantém sua configuração independente.
- Xeque é uma ameaça. Mate convencional e vitória futura calculada não atribuem vencedor. A busca retorna uma ação; o jogador precisa executar seus feitiços e movimentos, podendo perder a oportunidade.
- A vitória por captura exige o rei marcado como capturado. O resultado usa `KING_CAPTURE`, separado de `CHECKMATE`. Não há empate por material insuficiente para mate nesse modo; ausência de ações executáveis resulta em empate, considerando Jump disponível antes da decisão. Tempo, desistência e demais políticas de empate permanecem independentes.
- Regressões cobrem a sequência até `5.Bxc6`, com e sem Freeze em d7, os dois reis vivos, turno das pretas, SAN sem xeque falso e a defesa `bxc6`. Também cobrem busca sem mutação da partida, Jump + captura executada, Undo/Redo e oportunidade vencedora desperdiçada.
- Escopo desta alteração: regra de encerramento e regressões relacionadas. A auditoria ampla e os benchmarks de força do N5 dos anexos não estão homologados por esta entrega.
- Validação: build aprovado e regressões direcionadas aprovadas. A suíte completa registrou 1287 testes aprovados e 8 falhas: sete reproduzidas no HEAD original `df109d6` (interface e uma expectativa de consumo de feitiço pelo bot) e uma de latência do Perft que passou na execução isolada. Não houve homologação manual do fluxo em 2D/3D nesta alteração.

### `AUTONOMOUS-CONSOLIDATION-AND-FINAL-AUDIT-01` (Prioridade Máxima Atual)
- **Objetivo:** Consolidação final de conformidade de todas as especificações (Specs 01 a 12), auditoria rigorosa de integridade e fechamento de ciclo autônomo.

### `SPEC12-BUGHOUSE-TWIN-BOARD-ENGINE-05`
- **Objetivo:** Motor de Bughouse 2v2: Gerenciamento dos tabuleiros gêmeos (Mesa A e Mesa B), cores cruzadas, transferência imediata de peças capturadas para a reserva do parceiro, Drop Move em casas vazias e término compartilhado no primeiro xeque-mate.
- **Requisitos Atendidos:** `Spec 12`, `S12-RF10`, `S12-RF11`.

### `SPEC09-SUPABASE-EVENT-SOURCING-02`
- **Objetivo:** Camada de persistência relacional e Event Sourcing: Esquema Prisma, fita linear de eventos `MatchEventStream`, compressão LZ4 para partidas > 50 lances e RLS.
- **Requisitos Atendidos:** `Spec 09`, `S09-RF01`, `S09-RF02`, `S09-RF03`, `S09-RF06`.
