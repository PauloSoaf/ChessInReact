# Relatório Técnico de Homologação e Reconciliação: SPEC06-FINAL-HOMOLOGATION
## Contrato de Ativação Progressiva 2D/3D, Acessibilidade por Teclado, Chunks Reais de Build e Matriz Formal Completa da Spec 06

**Data de Atualização:** 07 de Novembro de 2026  
**Branch:** `feat/spec06-ui-ux-game-hub-hud`  
**Escopo:** Correção (`SPEC06-FINAL-HOMOLOGATION-CORRECTION-01`) das inconsistências funcionais e documentais detectadas na auditoria do commit `e31d2faa3839`: contrato estrito de `progressive3DMode`, controle interativo acessível por teclado no fallback 2D, testes determinísticos sem falsos positivos, reconciliação dos chunks reais do Vite, remoção de alegações de métricas não medidas e separação formal entre o parecer da Interface Editorial e o parecer dos Requisitos Formais Completos da Spec 06.

---

## 1. Sumário das Correções Implementadas (`CORRECTION-01`)

### 1.1 Contrato Estrito do Controlador de Ativação Progressiva 3D (`GameHub.tsx`)
O controlador de estado em [`GameHub.tsx`](../../src/ui/components/hub/GameHub.tsx) foi refatorado para tratar a propriedade `progressive3DMode` (`'idle' | 'eager' | 'off'`) como uma máquina de estados determinística, sem overrides implícitos baseados em `NODE_ENV`:

- **`progressive3DMode="off"`:**
  - Nunca agenda `requestIdleCallback` ou `setTimeout`.
  - Bloqueia explicitamente qualquer ativação em `handleActivate3D` e `handleFallbackKeyDown` (`if (progressive3DMode !== 'idle') return;`), garantindo que eventos de hover (`mouseEnter`), toque (`touchStart`), foco (`focus`), clique (`click`) ou teclado (`Enter` / `Espaço`) jamais montem o componente `ChessPieceShowcase`.
  - Caso a prop mude para `'off'` após a montagem, redefine `is3DActive` para `false`, cancela callbacks pendentes e desmonta a árvore 3D.
- **`progressive3DMode="eager"`:**
  - Monta o `ChessPieceShowcase` imediatamente na montagem inicial e também quando a prop transita de `'off'` ou `'idle'` para `'eager'` em um `rerender`, sem agendar timers ou callbacks ociosos.
- **`progressive3DMode="idle"` (Padrão):**
  - Renderiza inicialmente o botão de fallback contendo o SVG vetorial (`ShowcaseFallback`).
  - Agenda a hidratação do componente 3D via `window.requestIdleCallback(..., { timeout: 1500 })` (ou `window.setTimeout(..., 1000)` quando `requestIdleCallback` não está disponível no navegador).
  - Permite ativação imediata por intenção explícita do usuário: hover (`onMouseEnter`), toque (`onTouchStart`), clique (`onClick`) ou acionamento por teclado (`Enter` / `Espaço`).
  - Ao ativar manualmente, transitar de modo ou desmontar o componente (`unmount`), o efeito limpa imediatamente o agendamento pendente via `cancelIdleCallback` / `clearTimeout` e sinaliza `cancelled = true`.

### 1.2 Acessibilidade do Controle de Ativação 2D → 3D (`GameHub.tsx`)
- O elemento de fallback interativo deixou de utilizar `<div role="region">` (semântica inadequada para controle acionável) e passou a ser um elemento nativo `<button type="button">` (`id="chess-piece-showcase-fallback-container"`, `data-testid="showcase-fallback-trigger"`).
- **Foco Visível e Não-Destrutivo (WCAG 2.1 SC 3.2.1):** Foi removido o `onFocus={handleActivate3D}` do contêiner pai para que a simples navegação com `Tab` não substitua o controle focado abruptamente. Ao receber foco por teclado, o botão preserva o foco e exibe o anel `:focus-visible` de `3px solid var(--border-active)` definido em `theme.css`.
- **Ativação por Teclado:** Suporta acionamento explícito pelas teclas `Enter` e `Espaço` (`' '`) quando em modo `'idle'`, permanecendo inativo (`aria-disabled="true"`) quando em modo `'off'`.

### 1.3 Correção dos Testes Automatizados (`Spec06ThemeAndHUD.test.tsx`)
O teste anterior verificava apenas a presença do contêiner pai `#chess-piece-showcase-container`, que permanece presente em ambos os estados (2D e 3D). Foram implementados 6 testes determinísticos em [`Spec06ThemeAndHUD.test.tsx`](../../src/ui/__tests__/Spec06ThemeAndHUD.test.tsx) que validam diretamente a presença/ausência do componente lazy montado (`data-testid="chess-piece-showcase"`), do gatilho 2D (`data-testid="showcase-fallback-trigger"`) e do fallback de Suspense (`data-testid="showcase-suspense-fallback"`):
1. **`Suspense` durante carregamento assíncrono e transição `off` → `eager` → `off`:** Verifica sincronamente que `showcase-suspense-fallback` é exibido enquanto a Promise do `React.lazy` está pendente e que, após a resolução assíncrona, `chess-piece-showcase` e os botões de material PBR (`#showcase-btn-finish-brass`) são efetivamente montados no DOM.
2. **Montagem imediata em `eager`:** Confirma que `requestIdleCallback` não é chamado e que `chess-piece-showcase` é montado diretamente.
3. **Ciclo completo em `idle` antes e depois de `requestIdleCallback`:** Usa mocks determinísticos de `requestIdleCallback` e `cancelIdleCallback`, comprovando que antes do callback apenas o SVG 2D está montado (`queryByTestId('chess-piece-showcase') === null`) e que após a execução do callback o `chess-piece-showcase` é montado.
4. **Cancelamento no `unmount`:** Comprova que `cancelIdleCallback` recebe o handle exato no `unmount` e que invocações tardias do callback após desmontagem são ignoradas com segurança.
5. **Bloqueio estrito em `off`:** Dispara `mouseEnter`, `touchStart`, `focus`, `click`, `Enter` e `Espaço` (via `fireEvent` e `userEvent`) e comprova que `queryByTestId('chess-piece-showcase')` permanece `null`.
6. **Ativação acessível por teclado (`Enter` e `Espaço`) em `idle`:** Comprova que focar (`focus`) ou pressionar teclas alheias (`Tab`, `Escape`, `a`) não ativa o 3D prematuramente, e que pressionar `Enter` ou `Espaço` monta o `chess-piece-showcase` e cancela o callback ocioso pendente.

### 1.4 Idioma do Documento HTML (`index.html`)
- Atualizado `<html lang="en">` para `<html lang="pt-BR">` em [`index.html`](../../index.html), refletindo o idioma predominante da interface e garantindo pronúncia adequada em leitores de tela, com teste automatizado correspondente.

---

## 2. Configuração Real de Build e Métricas Efetivas dos Chunks

### 2.1 Configuração do `vite.config.ts`
A configuração real em [`vite.config.ts`](../../vite.config.ts) agrupa `three` e `@react-three` em um único chunk de fornecedor 3D (`vendor-three`), enquanto o componente `ChessPieceShowcase` é separado automaticamente pelo `React.lazy` e o Web Worker é compilado em bundle dedicado:

```typescript
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three') || id.includes('node_modules/@react-three')) {
            return 'vendor-three';
          }
        },
      },
    },
  },
});
```

> **Nota de Reconciliação:** Não existem chunks separados denominados `vendor-r3f`, `vendor-ui` ou `vendor-network`. As bibliotecas `three` e `@react-three/*` residem juntas em `vendor-three`.

### 2.2 Artefatos Reais Produzidos por `npm run build`

| Artefato Gerado | Tamanho Minificado | Tamanho Gzip | Observação Arquitetural |
| :--- | :---: | :---: | :--- |
| `dist/index.html` | 1,23 kB | 0,63 kB | Shell HTML inicial (`lang="pt-BR"`), monta `#root`. |
| `dist/assets/index-*.css` | 5,14 kB | 1,81 kB | Tokens CSS dos 3 temas (abaixo do limite de 30 kB do RNF-03). |
| `dist/assets/ChessPieceShowcase-*.js` | 11,71 kB | 3,95 kB | Chunk assíncrono do showcase (`React.lazy`). |
| `dist/assets/engineWorker-*.js` | 90,72 kB | — | Bundle dedicado do Web Worker (IA, Pathfinding, Procedural). |
| `dist/assets/index-*.js` | 356,87 kB | 104,10 kB | Aplicação principal React, Core ECS, Zustand, HUD e SVG fallback. |
| `dist/assets/vendor-three-*.js` | 890,06 kB | 239,27 kB | Motor Three.js + React Three Fiber + Drei. |

- **Advertência de Build Conhecida:** O Rollup/Vite emite o aviso não-bloqueante `(!) Some chunks are larger than 500 kB after minification` devido ao tamanho intrínseco da biblioteca `three` + `@react-three` agrupada em `vendor-three` (890,06 kB minificado / 239,27 kB gzip).
- **Comportamento de Carregamento:** Como `index.html` contém apenas `<div id="root"></div>`, o SVG de fallback (`ShowcaseFallback`) é renderizado no cliente após o download e inicialização do bundle principal React (`index-*.js`). O carregamento dos chunks `ChessPieceShowcase-*.js` e `vendor-three-*.js` é adiado até que `shouldRender3D` se torne verdadeiro (por `requestIdleCallback` ou interação no modo `idle`). Métricas de Web Vitals (FCP, LCP, INP) e taxa de quadros em GPU física (FPS) **não foram medidas por telemetria de navegador** neste ambiente de CI e, portanto, não são declaradas como verificadas.

---

## 3. Matriz Formal Reconciliada da Spec 06 (RF-01 a RF-15 e RNF-01 a RNF-15)

### 3.1 Requisitos Funcionais (RF-01 a RF-15)

| ID | Requisito Funcional (Spec 06) | Classificação | Evidência Técnica / Justificativa |
| :--- | :--- | :---: | :--- |
| **RF-01** | Integração com Navbar e Sidebar / Layout Clínico | **PARTIAL** | `TopNavBar.tsx`, `GameHub.tsx` e `GameControlsBar.tsx` implementam a navegação e HUD em React+Vite (conforme ADR-004). O overlay sobre canvas 3D de partida completa aguarda a Spec 07. |
| **RF-02** | Alternância Sincronizada de Temas (DOM + 3D) | **VERIFIED** | `ThemeContext.tsx` sincroniza classes CSS (`midnight`, `ivory`, `synthwave`) e propaga o tema para `StudioEnvironment.tsx` (`THEME_LIGHTING`), testado em `Spec06ThemeAndHUD.test.tsx`. |
| **RF-03** | Interseção e Raycasting 3D com BVH | **DEFERRED (SPEC 07)** | Depende das malhas 3D do tabuleiro e `three-mesh-bvh` na arena 3D da Spec 07. Atualmente a seleção de casas opera na grade 2D DOM (`BoardSquare.tsx`). |
| **RF-04** | Isolamento de Eventos DOM vs WebGL | **PARTIAL** | No showcase 3D do Hub, os controles de acabamento sobrepostos isolam cliques em relação ao Canvas. O isolamento sobre o tabuleiro 3D completo aguarda a Spec 07. |
| **RF-05** | Sistema de Drag & Drop em Plano Matemático 3D | **DEFERRED (SPEC 07)** | Arrasto 3D sobre `THREE.Plane` pertence à renderização 3D do tabuleiro na Spec 07. |
| **RF-06** | Destaque Visual de Casas Válidas e de Captura | **VERIFIED** | `ChessBoard.tsx` e `BoardSquare.tsx` destacam destinos legais (`data-testid="legal-move-dot"`) e anéis de captura a partir do `RulesEngine`. |
| **RF-07** | Orientação Automática de Câmera Polar (N Jogadores) | **DEFERRED (SPEC 07)** | Depende do `CameraRig` orbital 3D para arenas multi-jogador na Spec 07. No tabuleiro 2D, a inversão de perspectiva (`flipBoard`) está verificada. |
| **RF-08** | Modal Acessível de Promoção de Peças | **PARTIAL** | O primitivo acessível `ModalShell.tsx` (focus trap, Escape, restituição de foco) está implementado e testado; o diálogo específico de escolha de peça na promoção aguarda integração dedicada. |
| **RF-09** | Painel de Relógios e Alerta de Tempo Crítico | **PARTIAL** | `PlayerCard.tsx` exibe estado de turno ativo e deliberação da IA; o cronômetro regressivo com alerta sonoro $< 10\text{s}$ ainda não está acoplado ao loop de tempo. |
| **RF-10** | Gaveta de Peças de Reserva (Crazyhouse HUD) | **DEFERRED (SPEC 07/04)** | A lógica de reserva Crazyhouse existe no Core/Rules, mas a gaveta visual de drag-and-drop no HUD ainda não foi construída. |
| **RF-11** | Minimapa Interativo para Tabuleiros Infinitos | **DEFERRED (SPEC 07)** | Depende da câmera e viewport de streaming 3D da Spec 07. |
| **RF-12** | Banner de Eventos de Jogo e Animações | **PARTIAL** | Estados de xeque, fim de jogo e deliberação são exibidos no HUD (`App.tsx`, `PlayerCard.tsx`); banners animados dedicados para todos os eventos de rede ficam para integração com Spec 03/07. |
| **RF-13** | Suporte a Gestos Mobile Multi-Touch (Pinch/Pan 3D) | **DEFERRED (SPEC 07)** | Gestos orbitais multi-touch pertencem à câmera 3D da Spec 07. |
| **RF-14** | Menu de Ações Rápidas de Partida | **PARTIAL** | `GameControlsBar.tsx` implementa Undo, Redo, Reset Match, Flip Board, alternância de Bot, dificuldade e tamanho do tabuleiro. Ações de rede (Oferecer Empate / Desistir online) dependem da UI multiplayer. |
| **RF-15** | Barra de Avaliação Posicional em Tempo Real | **VERIFIED** | `EvaluationBar.tsx` renderiza a vantagem posicional em centipawns calculada pelo motor de IA, verificada por testes unitários. |

### 3.2 Requisitos Não-Funcionais (RNF-01 a RNF-15)

| ID | Requisito Não-Funcional (Spec 06) | Classificação | Evidência Técnica / Justificativa |
| :--- | :--- | :---: | :--- |
| **RNF-01** | Taxa de Quadros Imune a Abertura de Menus ($\ge 60$ FPS) | **DEFERRED (GPU)** | O showcase usa `frameloop="demand"`, porém a medição de FPS em GPU real durante abertura de menus não é executada no ambiente headless/CI. |
| **RNF-02** | Latência de Resposta de Clique e Seleção ($< 16$ ms) | **PARTIAL** | Seleção 2D é síncrona via Zustand, mas a medição formal de frame-time $< 16\text{ ms}$ com raycasting 3D depende da Spec 07 e browser real. |
| **RNF-03** | Peso do Bundle de Estilos CSS ($\le 30$ KB gzip) | **VERIFIED** | Bundle CSS de produção compilado com **5,14 kB** minificado (**1,81 kB gzip**), muito abaixo do teto de 30 kB. |
| **RNF-04** | Conformidade de Acessibilidade Visual (WCAG AA $\ge 4.5:1$) | **VERIFIED** | Contrastes de texto $\ge 4.5:1$ nos 3 temas, `:focus-visible` de 3 px, focus trap no modal, roving tabindex $N \times N$ no tabuleiro e ativação por teclado no showcase testados em `Spec06ThemeAndHUD.test.tsx`. |
| **RNF-05** | Responsividade Extrema de Layout (360 px a 3840 px) | **VERIFIED** | Grids fluidos com `minmax(min(100%, 300px), 1fr)` e `clamp(...)` sem `overflow-x: hidden` mascarando cortes. |
| **RNF-06** | Integridade Absoluta do Código do NutriOpus | **VERIFIED** | Nenhum arquivo externo do NutriOpus foi modificado; arquitetura isolada conforme ADR-004. |
| **RNF-07** | Tempo de Resposta em Gestos de Toque (120 Hz) | **DEFERRED (SPEC 07)** | Depende da amostragem de gestos 3D em hardware mobile de 120 Hz. |
| **RNF-08** | Orçamento de Renderizações React (Transient Updates) | **VERIFIED** | A inclinação do cavalo 3D em `InteractiveKnightScene.tsx` muta a ref do grupo Three.js diretamente em `useFrame` com `invalidate()`, sem re-renderizar a árvore React. |
| **RNF-09** | Prevenção de Cliques Fantasma em Mobile (`touch-action: none`) | **VERIFIED** | `touchAction: 'none'` configurado no Canvas 3D e nos controles interativos. |
| **RNF-10** | Tempo de Transição de Câmera ($\le 800$ ms) | **DEFERRED (SPEC 07)** | Depende do `CameraRig` 3D da Spec 07. |
| **RNF-11** | Compatibilidade com Navegadores e Fallback sem WebGL | **VERIFIED** | Detecção de suporte WebGL, ErrorBoundary, listeners de `webglcontextlost`/`webglcontextrestored` e fallback vetorial 2D (`ShowcaseFallback.tsx`) verificados em testes. |
| **RNF-12** | Tolerância a Redimensionamento de Janela ($< 16$ ms) | **PARTIAL** | Layout CSS responsivo e Canvas fluido adaptam-se ao resize; telemetria de tempo de recalibração $< 16\text{ ms}$ em GPU não medida em CI. |
| **RNF-13** | Cobertura de Testes de Componentes UI ($> 85\%$) | **VERIFIED** | 53 testes em `Spec06ThemeAndHUD.test.tsx`; cobertura de linhas superior a 91% nos pacotes `ui/components/game` (98,54%), `ui/components/hub` (>93%), `ui/components/navigation` (98,18%), `ui/components/pieces` (100%), `ui/components/primitives` (91,58%) e `ui/theme` (98,59%). |
| **RNF-14** | Economia de Consumo Energético em Segundo Plano | **VERIFIED** | Renderização sob demanda (`frameloop="demand"`), pausa por `visibilitychange` quando a aba está oculta e pausa por `IntersectionObserver` quando fora da viewport. |
| **RNF-15** | Feedback Háptico em Dispositivos Móveis (`navigator.vibrate`) | **DEFERRED (SPEC 07/04)** | A ser integrado nos eventos de captura e xeque em dispositivos móveis. |

---

## 4. Resultados dos Quality Gates Locais

Todos os 6 quality gates obrigatórios do `GEMINI.md` foram executados e aprovados:

1. **`npx tsc --noEmit`**: 0 erros.
2. **`npm run lint`**: 0 erros, 0 warnings (`--max-warnings 0`).
3. **`npm run build`**: Compilado com sucesso (`index.css`: 1,81 kB gzip; `ChessPieceShowcase`: 3,95 kB gzip; `index.js`: 103,92 kB gzip; `vendor-three`: 239,27 kB gzip; aviso não-bloqueante de chunk > 500 kB para `vendor-three`).
4. **`npx vitest run`**: 79 arquivos de teste aprovados, **643 testes aprovados** (incluindo os 53 testes da suíte `Spec06ThemeAndHUD.test.tsx`), 0 falhas, 0 pulados. Cobertura de topologias $> 95\%$.
5. **`node scripts/runChromiumSmoke.js`**: Aprovado (`success: true`, `skipped: false`) em Chromium headless nativo.
6. **`npm run bench:memory`**: Aprovado (`PASS`, Delta incremental dentro do limite de $< 40\text{ MB}$, sem mascaramento de GC).

---

## 5. Pareceres Separados de Homologação

### 5.1 Parecer 1 — Interface Editorial da SPEC06 (Escopo Sprints 01–04 & Design Recovery)
- **Status:** **HOMOLOGADO TECNICAMENTE (Aguardando Avaliação Visual Humana Final)**
- **Justificativa:** Todos os defeitos apontados nas auditorias do Design Recovery (interatividade 3D sob demanda, contrato estrito de `progressive3DMode` em `'off' | 'eager' | 'idle'`, ativação acessível por teclado `Enter`/`Espaço` sem perda de foco, responsividade mobile em 360 px, contrastes WCAG 2.2 AA $\ge 4.5:1$, focus trap e restituição de foco no `ModalShell`, roving tabindex $N \times N$ com suporte a `flipBoard`, sincronização de iluminação por tema via Theme Bridge, ciclo de vida simétrico de `webglcontextlost`/`webglcontextrestored`, idioma `pt-BR` e testes determinísticos sem falsos positivos) estão resolvidos e comprovados por testes automatizados.

### 5.2 Parecer 2 — Requisitos Formais Completos da SPEC06 (RF-01 a RF-15 / RNF-01 a RNF-15)
- **Status:** **PARCIAL (`PARTIAL` / `DEFERRED`)**
- **Justificativa:** Conforme detalhado na Seção 3, a fundação de Design System, temas, HUD 2D, acessibilidade WCAG AA, barra de avaliação e showcase 3D do Hub está verificada (`VERIFIED`), mas os requisitos que dependem da arena de jogo 3D completa (raycasting BVH no tabuleiro 3D, drag-and-drop em plano matemático 3D, câmera orbital polar multi-jogador, minimapa procedural, gaveta Crazyhouse, gestos multi-touch 3D, feedback háptico e medições de FPS/latência em GPU física) permanecem classificados como `PARTIAL` ou `DEFERRED` para a Spec 07 / Spec 04 / Spec 03.
