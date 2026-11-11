# ChessInReact | Patch Backlog (Autonomous Spec Completion Engine)

> **Backlog Dinâmico de Patches Executáveis**  
> **Última Atualização:** 11/11/2026 09:44 (UTC-4)  
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
| `SPEC12-SPELL-CHESS-MANA-ENGINE-02` | Spec 12 / Minigames | Máquina de estados de Spell Chess: economia de mana (2-6), 7 feitiços canônicos, cooldowns e HUD | `HEAD` | **HOMOLOGADO** |

---

## 2. Patches em Fila de Execução

### `SPEC08-MATCHMAKING-QUEUE-AND-LOBBY-01` (Prioridade Máxima Atual)
- **Objetivo:** Implementar o motor de fila de matchmaking em memória / Redis-compatible com particionamento de janelas Elo, ciclo de vida de tickets (SEARCHING, MATCHED, EXPIRED) e gerenciador de salas/lobbies com handshake autoritativo.
- **Requisitos Atendidos:** `Spec 08`, `S08-RF01`, `S08-RF02`, `S08-RF03`, `S08-RF04`.

### `SPEC10-MODDING-API-RULESET-SANDBOX-01`
- **Objetivo:** Implementar o pipeline de Modding e Sandbox de regras customizadas: isolamento de execução para modificadores de movimento, registro declarativo de peças de fadas e parser de manifestos JSON de mods.
- **Requisitos Atendidos:** `Spec 10`, `S10-RF01`, `S10-RF02`, `S10-RF03`.

### `SPEC11-ADAPTIVE-BOT-RATING-ECOSYSTEM-01`
- **Objetivo:** Implementar o ecossistema de bots com avaliação adaptativa Glicko-2, perfis de personalidade de IA (Agressivo, Posicional, Tático, Caótico) e ajuste dinâmico de profundidade de busca com base no rating do jogador humano.
- **Requisitos Atendidos:** `Spec 11`, `S11-RF01`, `S11-RF02`, `S11-RF03`.

### `SPEC12-DUCK-CHESS-NEUTRAL-BLOCKER-03`
- **Objetivo:** Implementar as regras e entidades de Duck Chess: movimentação em 2 fases (Lance de Peça + Movimento Obrigatório do Pato), eliminação do conceito de xeque/xeque-mate e captura física do rei.
- **Requisitos Atendidos:** `Spec 12`, `S12-RF08`, `S12-RF18`.
