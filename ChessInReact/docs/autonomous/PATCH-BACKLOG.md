# ChessInReact | Patch Backlog (Autonomous Spec Completion Engine)

> **Backlog Dinâmico de Patches Executáveis**  
> **Última Atualização:** 11/11/2026 08:44 (UTC-4)  
> **Ordem de Prioridade:** Falhas críticas > Erros de regras > Falhas de build/CI > Contratos arquiteturais > Funcionalidades fundamentais > Otimizações > Polimento visual.

---

## 1. Patches Concluídos e Homologados

| Patch ID | Escopo | Objetivo Principal | Commit | Status |
| :--- | :--- | :--- | :--- | :---: |
| `SPEC07-CHECK-FEEDBACK-CI-HOTFIX-01` | Spec 07 / CI | Desacoplamento lazy do 3D, correção de ESLint e teste de rejeição de Worker | `64498a9` | **HOMOLOGADO** |
| `SPEC07-3D-TEST-AND-WORKER-CLEANUP-01` | Spec 07 / IA | Limpeza de mocks Three.js (0 warnings), fallback assíncrono não-bloqueante e fluxo de xeque 2D | `f2ab2ac` | **HOMOLOGADO** |
| `SPEC07-REAL-WEBGL-ACCEPTANCE-02` | Spec 07 / WebGL | Resolução de buffer WebGL (> 300x150), raycasting real 3D, evidências visuais e medição de latência | `060f3fb` | **HOMOLOGADO** |
| `SPEC07-CAMERA-LERP-AND-ANIMATION-01` | Spec 07 / Animação | Interpolação suave de câmera orbital via lerp em useFrame e arco parabólico em lances de peças 3D | `804dc5b` | **HOMOLOGADO** |
| `SPEC07-GLSL-HOLOGRAM-SHADERS-02` | Spec 07 / Shaders | Shaders GLSL customizados com pulso holográfico e scanlines para peças selecionadas e xeque | `HEAD` | **HOMOLOGADO** |

---

## 2. Patches em Fila de Execução

### `SPEC07-INSTANCED-PIECE-BATCHING-03` (Prioridade Máxima Atual)
- **Objetivo:** Agrupar peças idênticas (16 peões, 4 torres, etc.) em buffers de instâncias `THREE.InstancedMesh` únicos com `setMatrixAt`, reduzindo o número total de draw calls para $< 20$.
- **Requisitos Atendidos:** `S07-RF09`, `RNF-01`.

### `SPEC09-PGN-PARSER-AND-PERSISTENCE-01`
- **Objetivo:** Implementar parser e exportador PGN compatível com standard FIDE para histórico de partidas com persistência local e download.
- **Requisitos Atendidos:** `Spec 09`, `S09-RF01`, `S09-RF02`.

### `SPEC12-GAME-REVIEW-EVAL-GRAPH-01`
- **Objetivo:** Implementar painel de Game Review com gráfico de vantagem por lance baseado em avaliações do motor e classificação de jogadas (Brilliant, Best, Mistake, Blunder).
- **Requisitos Atendidos:** `Spec 12`, `S12-RF01`, `S12-RF02`.

