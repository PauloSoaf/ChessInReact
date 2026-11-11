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
| `SPEC12-DUCK-CHESS-NEUTRAL-BLOCKER-03` | Spec 12 / Minigames | Movimentação em 2 fases (Peça + Pato), bloqueador absoluto e captura física do rei | `HEAD` | **HOMOLOGADO** |

---

## 2. Patches em Fila de Execução

### `SPEC12-PUZZLE-RUSH-TACTICAL-ENGINE-04` (Prioridade Máxima Atual)
- **Objetivo:** Motor de Puzzle Rush e Puzzle Battle: Modo Sobrevivência (3 vidas, rating progressivo de 600 a 2600+), Modo Contra o Relógio (3 min / 5 min com pontuação por tempo) e sincronização 1v1 para Puzzle Battle.
- **Requisitos Atendidos:** `Spec 12`, `S12-RF09`, `S12-RNF-11`.

### `SPEC12-BUGHOUSE-TWIN-BOARD-ENGINE-05`
- **Objetivo:** Motor de Bughouse 2v2: Gerenciamento dos tabuleiros gêmeos (Mesa A e Mesa B), cores cruzadas, transferência imediata de peças capturadas para a reserva do parceiro, Drop Move em casas vazias e término compartilhado no primeiro xeque-mate.
- **Requisitos Atendidos:** `Spec 12`, `S12-RF10`, `S12-RF11`.

### `SPEC09-SUPABASE-EVENT-SOURCING-02`
- **Objetivo:** Camada de persistência relacional e Event Sourcing: Esquema Prisma, fita linear de eventos `MatchEventStream`, compressão LZ4 para partidas > 50 lances e RLS.
- **Requisitos Atendidos:** `Spec 09`, `S09-RF01`, `S09-RF02`, `S09-RF03`, `S09-RF06`.
