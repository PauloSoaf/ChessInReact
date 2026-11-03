# SPEC 06 — Visual Research & Art Direction Matrix
## Chess Editorial Atelier: Redesign Premium & Interactive 3D Showcase

---

### 1. Visão Geral e Contexto de Design

A interface da Sprint 01 do `ChessInReact` garantiu estabilidade funcional e conformidade arquitetural (611 testes aprovados, persistência e determinismo), mas revelou problemas estéticos típicos de geração sintética de IA:
- Excesso de estilos inline dispersos e inconsistentes.
- Uso de gradientes purpúreos genéricos e emojis espalhados como substitutos de iconografia profissional.
- Layout engessado em um contêiner central estreito de 820px, reduzindo a expressividade do tabuleiro.
- Ausência de direção de arte unificada e composição editorial autoral.

A nova direção de arte — **Chess Editorial Atelier** — reposiciona o produto como um clube contemporâneo de estratégia e análise de alto nível. Combina o rigor geométrico do modernismo suíço, o calor de materiais nobres de xadrez tradicional (madeiras, mármores, grafite e latão escovado) e o impacto imersivo de um showcase 3D interativo com iluminação fotográfica.

---

### 2. Matriz de Análise de Referências Visuais

| Referência & Autor | URL / Fonte | O que Funciona na Composição | Paleta & Iluminação | O que Evitar | Aplicação no ChessInReact |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Checkmate: Play, Learn, Connect** (Jeremy Baraka) | [Dribbble #27711605](https://dribbble.com/shots/27711605-Checkmate-Play-Learn-Connect) | Composição editorial assimétrica, tipografia display imponente, peças de xadrez tratadas como esculturas de arte. | Monocromático de alto contraste, Obsidian (#090D11) com Chalk (#F4F1EB) e detalhes em latão. | Cards flutuantes com sombras exageradas e bordas arredondadas infantis. | Estrutura principal do **Game Hub**: Hero assimétrico com tipografia display e peça 3D escultórica. |
| **Chess Game Web Online UI v1 & v2** | [Dribbble #16792508](https://dribbble.com/shots/16792508-Chess-Game-Web-Online-UI-v2) | Densidade equilibrada de dados, barra de avaliação posicional elegante integrada à margem do tabuleiro, clareza cirúrgica de turnos. | Ardósia neutra (#1E293B), toques de esmeralda (#0F766E) e cinza grafite. | Elementos brilhantes que distraem a leitura posicional das peças. | Layout da **Arena de Partida (HUD)**: Alinhamento vertical da barra de avaliação ao tabuleiro. |
| **Cinematic 3D Chess Game Web Design** (Mostafizux) | [Muz.li Publication](https://me.muz.li/mostafizux/cinematic-3d-chess-game-web-design) | Iluminação de estúdio fotográfico (rim lighting suave, key light difusa), materialidade PBR com reflexos suaves e rugosidade realista. | Luz ambiente quente (#E9E4DA), sombras de contato suaves e superfícies táteis de cerâmica e bronze. | Iluminação excessivamente escura ou reflexos especulares estourados que prejudicam a silhueta. | Shader e iluminação do **Showcase 3D**: Cavalo procedural com material acetinado e iluminação trifásica de estúdio. |
| **Chess.com & Lichess Analysis** | [Chess.com](https://www.chess.com/analysis) / [Lichess](https://lichess.org/analysis) | Ergonomia de jogo impecável: tabuleiro dominante, navegação intuitiva de bot e histórico de lances sem poluição visual. | Esquemas de cores sóbrios que previnem fadiga ocular em sessões prolongadas. | Fragmentação de controles em menus secundários inacessíveis durante a partida. | Dimensões do tabuleiro na partida (ocupando o centro visual) e controles de partida agrupados ergonomicamente. |
| **NutriOpus Design System** (Projeto-Irmão) | [NutriOpus Core](https://www.nutriopus.com.br/) | Layout clínico refinado, navegação lateral expansível, tokens semânticos de superfície, swatches de temas interativos com preview vivo. | Superfícies translúcidas em vidro fosco (`backdrop-filter`), contrastes WCAG AA rigorosos. | Dependência de frameworks pesados de terceiros (Next.js) incompatíveis com SPA Vite estrita. | Arquitetura de **Primitives Reutilizáveis**: AppShell, SegmentedControl, ModalShell e ThemeSwatch nativos em Vanilla CSS. |

---

### 3. Síntese da Direção de Arte: "Chess Editorial Atelier"

#### 3.1 Pilares Conceituais
1. **Espaço e Respiro Editorial:** Uso generoso de espaço negativo, hierarquia tipográfica assertiva e eliminação de bordas e cards repetitivos desnecessários.
2. **Materialidade Fidedigna:** O xadrez é um jogo milenar de objetos físicos táteis. As superfícies digitais refletem essa nobreza através de tons de grafite, papel aquecido, ardósia, alabastro e latão escovado.
3. **Escultura 3D como Protagonista do Hub:** Em vez de ilustrações genéricas ou ícones minúsculos, o Game Hub recebe uma peça de xadrez tridimensional interativa que responde ao ponteiro do usuário com física e iluminação de estúdio.
4. **Precisão Analítica na Arena:** Durante a partida, todo o ruído visual se dissipa; o tabuleiro 2D de alta definição se torna o protagonista absoluto, acompanhado por cartões de jogadores sóbrios e avaliação de centipawns precisa.

#### 3.2 Paleta Semântica Primária ("Atelier Slate & Brass")
- **Obsidian Dark (Base):** `#090D11` — Profundidade pura para interfaces escuras sem esmagar o contraste.
- **Graphite Deep (Superfície):** `#12161A` — Superfícies elevadas e fundos de tabuleiros.
- **Warm Paper (Luz Suave):** `#E9E4DA` — Texto e acentos claros com temperatura quente e elegante.
- **Antique Brass (Acento Primário):** `#C4A77D` — Realce de botões primários, seleções e destaques metálicos.
- **Muted Sage (Acento Secundário):** `#718575` — Indicadores de sucesso, precisão e casas verdes de torneio.
- **Burgundy Accent (Acento de Risco):** `#A84242` — Indicadores de xeque, capturas e derrotas.

---

### 4. Diretrizes de Implementação Técnica

1. **Aproveitamento e Isolamento do NutriOpus:**
   - Não importar arquivos Next.js (`next/link`, `next-themes`, `lucide-react`).
   - Construir uma camada nativa de primitives agnósticos (`src/ui/components/primitives/`) compatível com React 18 e Vite.
   - Preservar a elegância dos swatches de temas e navegação lateral compacta.
2. **Showcase 3D em Three.js / R3F (React 18 / R3F 8):**
   - Geometria procedural otimizada de um Cavalo de torneio clássico (Staunton Knight).
   - Materiais PBR (`MeshStandardMaterial`) com `roughness: 0.35`, `metalness: 0.15` e iluminação tripla (Key, Fill, Rim).
   - Renderização sob demanda (`frameloop="demand"`) com invalidação apenas em interação do ponteiro e idle controlado.
   - Suporte estrito a `prefers-reduced-motion` e fallback 2D vetorial gracioso caso o WebGL seja desativado ou sofra perda de contexto (`webglcontextlost`).
3. **Acessibilidade WCAG 2.2 AA:**
   - Casas do tabuleiro (`BoardSquare`) com atributos semânticos (`role="button"`, `tabIndex={0}`, `aria-label="Peão Branco em e4"`) e acionamento por teclado (<kbd>Enter</kbd> / <kbd>Espaço</kbd>).
   - Contraste visual mínimo de 4.5:1 para texto normal e 3:1 para elementos de interface.
   - Navegação por foco acessível no modal de customização com tecla <kbd>Escape</kbd> e bloqueio de atalhos globais de partida enquanto o modal estiver aberto.
