# ADR-003: Arquitetura de Integração Core → UI e Fonte Única de Verdade

- **Status:** `ACCEPTED`
- **Date:** 2026-10-09
- **Deciders:** Principal Software Engineer, React Specialist

---

## Context
O aplicativo `App.tsx` e o componente `ChessBoard.tsx` mantinham um estado local de matrizes 2D gerenciado via `useState(defaltChessDisplay)`. Enquanto isso, o novo Core baseado em Vanilla Zustand, Command Pattern e ECS existia em paralelo sem consumidores reais. Isso criava um estado duplo/duplicado, onde o jogo interativo na tela não refletia nem exercitava o Core (AUDIT-04).

---

## Decision
1. Estabelecer o Zustand Vanilla `gameStore` como a **Fonte Única de Verdade (Single Source of Truth)** do domínio.
2. Eliminar completamente o estado local `useState(defaltChessDisplay)` em `App.tsx`.
3. Inicializar a partida automaticamente via `bootstrapGame({ targetStore: gameStore })` no ciclo de vida da aplicação.
4. Refatorar `ChessBoard.tsx` para derivar reativamente a matriz de casas e peças diretamente de `domain.occupancy` e `domain.boardEntities`.
5. Delegar o clique e movimentação de peças exclusivamente a instâncias de `MovePieceCommand` despachadas através de `executeCommand(cmd)` no `gameStore`.
6. Conectar as operações de `Undo`, `Redo` e `Reset` aos comandos e histórico do Core (`HistoryManager`).
7. Preservar o isolamento: a UI gerencia fatias puramente cosméticas (destaques, foco) na fatia `ui` do store, sem poluir o snapshot de domínio.

---

## Alternatives Considered
- **Sincronização bidirecional entre `useState` e `gameStore`:** Complexa, propensa a loops infinitos de renderização e contradiz o princípio de fonte única de verdade.
- **Substituir o Vanilla Zustand por Context API do React:** Violaria o RNF-05 (Headless Core, independente de React para testes e CLI).

---

## Consequences
- **Positivas:** A aplicação web agora utiliza e valida o Core em tempo real; não há divergência de estado; Undo e Redo funcionam de forma determinística na interface; 100% aderente ao fluxo da Spec 01.
- **Negativas:** Nenhuma identificada.
