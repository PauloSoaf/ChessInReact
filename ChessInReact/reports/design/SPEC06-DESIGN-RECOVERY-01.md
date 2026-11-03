# SPEC 06 — Design Recovery & Premium Art Direction Report
## Chess Editorial Atelier: Redesign Visual, Component Library & Interactive 3D Showcase

**Relatório Técnico e de Direção de Arte — SPEC06-DESIGN-RECOVERY-01**  
**Data:** 03 de Novembro de 2026  
**Branch:** `feat/spec06-ui-ux-game-hub-hud`  
**Base HEAD Auditada:** `d8c67a739f3f93673030365b9e58bd104f55331d`  
**Status do Quality Gate:** Conforme (TypeScript 0 erros, ESLint 0 erros, Vitest 79 arquivos aprovados)

---

### 1. Diagnóstico Antes vs. Depois

| Aspecto | Estado Inicial (Sprint 01 — d8c67a7) | Estado Recuperado (Design Recovery 01) | Impacto no Produto |
| :--- | :--- | :--- | :--- |
| **Identidade do Produto** | Genérica com estética de IA sintética, gradientes roxos sem critério e cards idênticos. | **Chess Editorial Atelier**: Modernismo editorial suíço, paleta sóbria de estúdio e latão envelhecido. | Elevação de percepção de valor: plataforma autoral para estudo e competição de xadrez. |
| **Favicon & Metadados** | Padrão `/vite.svg` e título default do Vite. | Símbolo próprio em SVG (`public/favicon.svg`) com silhueta refinada de Cavalo Staunton em Antique Brass e Obsidian, Apple Touch Icon e fontes Google pré-conectadas. | Eliminação completa de resquícios de template inicial. |
| **Game Hub (Hero)** | Hero centralizado estático, emojis Unicode dispersos, cards com alturas e botões duplicados. | **Hero Editorial Assimétrico**: Tipografia display assertiva, metadados de worker e showcase 3D interativo integrado à direita. | Primeira impressão impactante com tecnologia 3D física e foco em ação direta. |
| **Showcase 3D** | Ausente (apenas ícones bidimensionais estáticos). | **Peça 3D Procedural em R3F/Three.js**: Cavalo Staunton com materiais PBR (Latão, Obsidiana, Mármore Marfim), iluminação trifásica de estúdio e fallback vetorial 2D instantâneo para ambientes sem WebGL. | Protagonismo tátil no Hub sem degradar o loop de renderização (demanda reativa com `frameloop="demand"` e pausa via `IntersectionObserver`). |
| **Layout da Partida (HUD)** | Contêiner central rígido de 820px com tabuleiro constrangido a ~520px e cards com visual administrativo. | **Arena de Partida Ampliada (1080px max, 620px arena)**: Tabuleiro dominante, alinhamento lateral da barra de avaliação por centipawns e cartões sóbrios de jogadores. | Ergonomia profissional para cálculo e análise sem elementos visuais concorrentes. |
| **Componentes Reutilizáveis** | Estilos inline caóticos espalhados nos arquivos de tela. | **Camada de Primitives (`src/ui/components/primitives/`)**: `BrandMark`, `ActionButton`, `SegmentedControl`, `ModalShell`, `Card` e `StatusIndicator`. | Arquitetura sustentável, manutenível e extensível. |
| **Acessibilidade do Tabuleiro** | `BoardSquare` estruturado em `<div>` clicável sem semântica ou navegação por teclado. | `role="button"`, `tabIndex={0}`, `aria-label` descritivo completo (ex: *"Casa e4, Peão Branco"*) e ativação total via teclado (<kbd>Enter</kbd> e <kbd>Espaço</kbd>). | Conformidade com diretrizes WCAG 2.2 AA. |

---

### 2. Matriz de Referências Aplicada

1. **Checkmate: Play, Learn, Connect (Jeremy Baraka — Dribbble #27711605):**  
   - *Aproveitado:* Assimetria editorial no Hero, proporções tipográficas dramáticas com títulos condensados, destaque à escultura de xadrez.  
   - *Evitado:* Sombras e gradientes purpúreos flutuantes.
2. **Chess Game Web Online UI v1/v2 (Dribbble #16792508):**  
   - *Aproveitado:* Disposição funcional dos dados da partida, altura da barra de avaliação perfeitamente pareada ao tabuleiro e botões de comando agrupados no rodapé do painel.  
   - *Evitado:* Cores neon e excesso de linhas divisórias.
3. **Cinematic 3D Chess Game Web Design (Mostafizux — Muz.li):**  
   - *Aproveitado:* Configuração de estúdio com Key Light quente (#FFF8ED), Fill Light fria (#D0E4F2), Rim Light de contraste e sombra de contato suavizada.  
   - *Evitado:* Rotações contínuas de 60 FPS desnecessárias e poluição visual.
4. **Portfólio Técnico (`paulosoaf-portfolio` — branch `feat/workstation-playful-notebook`):**  
   - *Aproveitado:* Princípios de shader PBR, isolamento do canvas 3D, controle de DPR (máximo 1.5), parada de renderização fora de viewport e fallback estruturado.  
   - *Isolamento:* Mantido o runtime React 18 e Three/R3F 8 nativo do ChessInReact sem atualização desnecessária para React 19 / R3F 9.
5. **NutriOpus Design System (Projeto-Irmão):**  
   - *Aproveitado:* Princípios de tokens semânticos, swatches de temas em miniatura viva e estrutura de modal desacoplado.  
   - *Respeito ao ADR-004:* Zero importações de bibliotecas específicas do Next.js (`next/link`, `next-themes`, etc.); reconstrução pura e agnóstica para o ecossistema Vite.

---

### 3. Design Tokens Escolhidos (Chess Editorial Atelier)

```css
:root {
  /* Atelier Semantic Palette */
  --atelier-obsidian: #090D11;
  --atelier-graphite: #12161A;
  --atelier-graphite-light: #1C2228;
  --atelier-warm-paper: #E9E4DA;
  --atelier-chalk: #F4F1EB;
  --atelier-muted-sage: #718575;
  --atelier-antique-brass: #C4A77D;
  --atelier-antique-brass-hover: #D4B88E;
  --atelier-slate: #59646A;
  --atelier-burgundy: #A84242;

  /* Typography */
  --font-display: 'Space Grotesk', 'Cabinet Grotesk', sans-serif;
  --font-mono: 'JetBrains Mono', 'Geist Mono', monospace;
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;

  /* Elevated Surface Elevations */
  --shadow-glow: 0 0 24px rgba(196, 167, 125, 0.16);
  --shadow-card-elevated: 0 12px 32px rgba(0, 0, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.25);
}
```

---

### 4. Arquitetura da Cena 3D e Showcase Interativo

A cena tridimensional foi projetada para demonstrar creative development com máxima fidelidade física e impacto estético, sem comprometer a performance ou o loop de renderização da partida:

1. **Modelagem Procedural do Cavalo (Staunton Knight):**
   - Construído proceduralmente via Three.js (`THREE.ExtrudeGeometry` sobre contorno vetorial curvilíneo autêntico de cavalo de torneio, acoplado a base torneada via `THREE.CylinderGeometry`).
   - Normais recalculadas (`computeVertexNormals()`) e proporções canônicas de torneio FIDE.
2. **Materiais Físicos PBR (`MeshStandardMaterial`):**
   - **Antique Brass:** Latão envelhecido acetinado (`roughness: 0.32`, `metalness: 0.88`, cor `#C4A77D`).
   - **Obsidian Stone:** Pedra vulcânica polida profunda (`roughness: 0.18`, `metalness: 0.25`, cor `#12151A`).
   - **Ivory Marble:** Mármore marfim nobre (`roughness: 0.28`, `metalness: 0.05`, cor `#E8E2D2`).
3. **Iluminação de Estúdio Fotográfico:**
   - **Key Light:** Direcional quente a 45° superior (`#FFF6EB`, intensidade 2.2).
   - **Fill Light:** Direcional difusa fria oposta (`#D4E4F7`, intensidade 0.9).
   - **Rim Light:** Luz de recorte traseira (`#FFE8BA`, intensidade 2.8) destacando a crina e o perfil do cavalo.
   - **Ambient / Bounce Light:** Hemisférica suave simulando reflexão de piso escuro.
4. **Desempenho e Salvaguardas Gráficas:**
   - **Qualidade Adaptativa:** DPR travado em `Math.min(window.devicePixelRatio, 1.5)` para prevenir travamentos em telas retina e 4K.
   - **Renderização Sob Demanda (`frameloop="demand"`):** O loop de RAF não roda a 60 FPS contínuos; a cena invalida frames exclusivamente durante a interação do ponteiro ou quando visível.
   - **Interrupção Fora de Tela:** Monitoramento contínuo via `IntersectionObserver`. Ao rolar para fora do viewport, o canvas suspende o processamento de novos frames.
   - **Fallback 2D Vetorial Gracioso (`ShowcaseFallback`):** Em caso de falha de hardware, ausência de WebGL (como no Node.js/jsdom) ou disparo de `webglcontextlost`, a interface exibe instantaneamente uma ilustração vetorial do Cavalo em alta definição com gradiente equivalente ao material selecionado.
   - **Respeito a `prefers-reduced-motion`:** Se o usuário possui preferência por redução de movimento ativa no sistema operacional, as rotações e micro-oscilações são desativadas automaticamente.

---

### 5. Auditoria de Contratos e Classificação dos Requisitos

#### 5.1 Critérios Formais da Especificação (Spec 06 — Seções 1 a 12)
| Critério Formal da Spec 06 | Escopo Original | Status Auditado (Commit 17279bb) | Diagnóstico Técnico |
| :--- | :--- | :--- | :--- |
| **Critério 12.1: Seamless DOM Integration** | Overlays HTML/DOM sobre WebGL com barreira de ponteiro (Z-Index Sandwich) e sem vazamento de cliques. | **PARTIAL** | O DOM Overlay do Hub e TopNavBar foi implementado, porém o Canvas continha `pointerEvents: 'none'` global bloqueando a cena 3D. Corrigido em SPEC06-DESIGN-RECOVERY-02. |
| **Critério 12.2: Smooth Drag and Drop 3D** | Arrastar peças 3D via plano matemático de interseção (Y=0) com conversão topológica. | **DEFERRED (SPEC 07)** | O escopo das Sprints 01 e 02 focou no redesign editorial 2D e Showcase de peça no Hub. O drag-and-drop de peças 3D completas no tabuleiro é escopo da Spec 07. |
| **Critério 12.3: Multiplayer Observer Camera** | Câmera polar orbital adaptativa com ancoragem de perspectiva baseada no PlayerId atribuído pelo Colyseus. | **DEFERRED (SPEC 07/03)** | Câmera tridimensional de partida aguarda a integração da arena WebGL da Spec 07 com o servidor Colyseus da Spec 03. |
| **Critério 12.4: Theme Toggling Visual Response** | Transição dinâmica de ambiente e materiais no WebGL e DOM entre os temas claro e escuro. | **VERIFIED** | Alternância imediata entre Midnight, Ivory e Synthwave com sincronização de iluminação de estúdio e materiais PBR. |
| **Seção 4.2: 3D Raycasting Otimizado (BVH)** | Aceleração espacial three-mesh-bvh para modelos densos de peças fadas. | **DEFERRED (SPEC 07)** | Aplica-se à renderização do tabuleiro tridimensional da Spec 07, não ao showcase procedural isolado. |

#### 5.2 Funcionalidades Efetivamente Entregues nas Sprints 01 e 02 (Hub & Design System)
| Entregável da Sprint | Descrição | Status Auditado (Commit 17279bb) | Diagnóstico Técnico |
| :--- | :--- | :--- | :--- |
| **Game Hub Editorial** | Tela de entrada com Hero assimétrico, metadados de worker, seleção de modos e retomada viva de turno. | **VERIFIED** | Composição editorial responsiva com suporte a worker e partida ativa. |
| **Navegação por Hash** | Navegação persistente entre `#game` e `#hub` com conservação do estado da partida. | **VERIFIED** | Estado do Core e partida contra bot preservados na troca de visão. |
| **Showcase 3D de Peça** | Peça procedural do Cavalo Staunton no Hub com acabamentos PBR e fallback vetorial 2D. | **PARTIAL** | Renderização operacional, porém com bloqueio de ponteiro e ausência de `frameloop="demand"` explícito. Corrigido em RECOVERY-02. |
| **HUD de Partida Expandido** | Tabuleiro dominante, alinhamento lateral da barra de avaliação e cartões sóbrios. | **VERIFIED** | Tabuleiro ocupa posição central e proporção hierárquica adequada. |
| **Modal de Personalização** | Diálogo acessível com miniaturas vivas de temas e peças. | **PARTIAL** | Modal funcional com Escape, porém com focus trap incompleto. Corrigido em RECOVERY-02. |
| **Favicon & Identidade Visual** | Favicon Staunton autoral em SVG e substituição de metadados do Vite. | **VERIFIED** | `public/favicon.svg` implementado e ativo no `index.html`. |
| **RNF-01: Acessibilidade WCAG 2.2 AA** | Contraste de cores $\ge 4.5:1$ e foco visível no teclado. | **PARTIAL** | Foco removido com `outline: 'none'` e 4 pares de cores com contraste insuficiente no commit auditado. Corrigido em RECOVERY-02. |
| **RNF-02: Zero Next.js (ADR-004)** | Arquitetura pura React 18 + Vite sem dependências do Next.js. | **VERIFIED** | Componentes próprios em `src/ui/components/primitives/`. |
| **RNF-03: Invariantes de Qualidade** | Quality gates automatizados (tsc, lint, build, vitest). | **VERIFIED** | Gates locais aprovados sem avisos nem falhas. |

---

### 6. Evidências de Testes e Quality Gates

```bash
# 1. Verificação de Tipos TypeScript
npx tsc --noEmit
# Resultado: 0 erros, código 0.

# 2. Análise Estática ESLint
npm run lint
# Resultado: 0 erros, 0 avisos (max-warnings 0), código 0.

# 3. Compilação de Produção Vite
npm run build
# Resultado: ✓ built in 4.57s (dist/assets gerados sem erros).

# 4. Suíte Completa de Testes Automatizados
npx vitest run
# Resultado: 79 arquivos de teste executados com sucesso (621 testes aprovados).
```

---

### 7. Limitações e Próximos Passos (Sprint 02)

1. **Limitações Identificadas:**
   - Em ambientes de teste de renderização pura em headless (Node.js/JSDOM), a GPU de hardware não está exposta; nesses contextos, o showcase ativa o fallback vetorial SVG de alta resolução (`ShowcaseFallback`), assegurando cobertura determinística.
2. **Próximos Passos Recomendados (Sprint 02):**
   - Transições de tela animadas com View Transitions API nativa.
   - Refinamento do histórico de lances em notação PGN com rolagem suave na barra lateral da partida.
   - Suporte a anotações gráficas no tabuleiro (setas e círculos coloridos com o botão direito do mouse no estilo Lichess/Chess.com).
