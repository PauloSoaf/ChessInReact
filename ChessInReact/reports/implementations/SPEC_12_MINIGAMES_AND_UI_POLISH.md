# Relatório de Implementação: Minijogos, Interface Tática & Referências Open-Source (GitHub)

> **Subsistemas Impactados:** Spec 01 (ECS & Commands), Spec 04 (Rules & Fairy Variants), Spec 06 (UI/UX & HUD), Spec 12 (Minijogos & Spell Chess), Spec 13 (Variantes Históricas e Fadas)  
> **Data:** 20/11/2026  
> **Status:** Homologado com aprovação integral em todos os 6 Quality Gates mandatórios

---

## 1. Visão Geral e Motivação

Durante a evolução das variantes e modos especiais do `ChessInReact`, identificou-se a necessidade de alinhar a fidelidade das mecânicas à experiência de usuário no navegador:
1. **Perda de Estado em Desfazer/Refazer:** O Undo clássico revertia comandos físicos de movimentação, mas deixava contadores de cargas de feitiço (`freezeCharges`, `jumpCharges`, `mana`, `frozenCoordinates`) e posicionamento de pato desincronizados.
2. **Ausência de Retícula de Alvo (Targeting Preview):** O jogador acionava poderes sem visualizar a área de efeito (por exemplo, os 9 quadrados impactados pelo Freeze ou o raio de detonação no Atomic Chess).
3. **Falta de Cancelamento Seguro:** Não havia opção intuitiva de cancelar uma ação armada sem cometer um erro de clique.

---

## 2. Matriz de Referências Open-Source Consultadas (GitHub)

| Projeto / Repositório | Link GitHub | Aplicação no ChessInReact |
| :--- | :--- | :--- |
| **`lichess-org/lila`** | [github.com/lichess-org/lila](https://github.com/lichess-org/lila) | Padrão de atalhos rápidos (`[1]`, `[2]`, `[Esc]`, `[Z]`), disposição da gaveta de peças de reserva (Pocket Pieces) e arquitetura de feedback tático. |
| **`lichess-org/chessground`** | [github.com/lichess-org/chessground](https://github.com/lichess-org/chessground) | Separação entre a geometria lógica e a camada vetorial interativa de overlays e retículas. |
| **`duckchess/duckchess`** | [github.com/duckchess/duckchess](https://github.com/duckchess/duckchess) | Especificação formal das regras de Duck Chess por Tim Paulden: remoção de regras de xeque, vitória por captura do rei e obrigatoriedade da fase `PLACE_DUCK`. |
| **`ianfab/Fairy-Stockfish`** | [github.com/ianfab/Fairy-Stockfish](https://github.com/ianfab/Fairy-Stockfish) | Regras canônicas de detonação em Xadrez Atômico (raio Chebyshev 1 eliminando atacante, vítima e vizinhos não-peões) e proibição de suicídio por captura com o rei. |
| **`nicolodavis/boardgame.io`** | [github.com/nicolodavis/boardgame.io](https://github.com/nicolodavis/boardgame.io) | Padrão de snapshots imutáveis para garantir reversibilidade (Undo/Redo) determinística em turnos que envolvem cartas, mana e tempos de recarga. |
| **`nmrugg/stockfish.js`** | [github.com/nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js) | Execução desacoplada de IA e motores analíticos via WebWorkers com canal de mensagens estrito. |
| **`pmndrs/react-three-fiber` & `drei`** | [github.com/pmndrs/react-three-fiber](https://github.com/pmndrs/react-three-fiber) | Context Bridging entre DOM e WebGL Canvas; renderização de planos matemáticos de interseção. |
| **`gkjohnson/three-mesh-bvh`** | [github.com/gkjohnson/three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) | Otimização BVH para detecção de ponteiro e raycasting acelerado em malhas 3D. |

---

## 3. Arquitetura das Modificações Realizadas

### 3.1. Reversibilidade Total (Undo/Redo Lossless)
- **`DropPieceCommand.ts`:** Criado em `src/core/commands/DropPieceCommand.ts` para formalizar a inserção de peças vindas da reserva no ECS com suporte a reversão atômica via `undo()`.
- **`UniversalMatchController.ts`:**
  - Introduzidas pilhas `minigameUndoStack` e `minigameRedoStack`.
  - Captura estrutural de snapshots a cada lance, conjuração de feitiço ou colocação de pato.
  - Ao acionar `undo()`, as cargas de feitiço, contadores de mana, casas congeladas e inventários são restaurados ao estado imediatamente anterior.

### 3.2. Retícula de Mira Dinâmica e Projeção de Área
- **`IHoverPreviewInfo` em `Interfaces.tsx`:** Contrato de dados contendo `type: 'FREEZE' | 'JUMP' | 'DUCK' | 'DROP' | 'PORTAL' | 'TRAP' | 'ATOMIC_EPICENTER' | 'ATOMIC_BLAST'`.
- **`BoardSquare.tsx`:** Renderização de gradientes, bordas tracejadas e ícones dedicados (`❄️`, `⚡`, `🦆`, `💥`, `⚠️`, fantasma de peça).
- **`ChessBoard.tsx`:**
  - Cálculo de área 3×3 para Freeze (`freezeBlastArea`).
  - Cálculo de área 3×3 para detonação no Atomic Chess (`atomicBlastArea`).
  - Barra superior de ação interativa com botão `✕ Cancelar (Esc)`.

### 3.3. Elementos Visuais e Ergonomia
- **`OfficialSpellBar.tsx`:** Adicionados orbes de cristal luminosos (cyan para Freeze, purple para Jump) que refletem visualmente as 2 cargas disponíveis por jogador, além de badges `<kbd>` indicando as teclas de atalho.
- **`ReserveDropsBar.tsx`:** Badges de tecla para seleção imediata (`[P]`, `[N]`, `[B]`, `[R]`, `[Q]`), multiplicadores de estoque e botão de cancelamento.
- **`theme.css`:** Inclusão de `@keyframes spellPulse` e `@keyframes blastGlow`.

---

## 4. Evidências de Validação dos Quality Gates

- `npx tsc --noEmit` -> 0 erros.
- `npm run lint` -> 0 erros, 0 warnings.
- `npm run build` -> Sucesso em 4.72s.
- `vitest run` -> 925 testes aprovados em 113 arquivos (0 falhas).
- `node scripts/runChromiumSmoke.js` -> `skipped: false, success: true`.
- `npm run bench:memory` -> Peak Heap: 35.93 MB (< 40.00 MB), Drift: +0.0090 MB.

