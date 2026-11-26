# ChessInReact — Catálogo de Referências Normativas e Externas

> **Hierarquia de Autoridade:**
> 1. Regras oficiais do jogo, padrões formais e documentação normativa internacional (FIDE, Chess.com regras oficiais, WCF).
> 2. Contratos e critérios explícitos das especificações formais do projeto (`specs/`).
> 3. ADRs válidos do projeto (`reports/decisions/`).
> 4. Documentação técnica oficial das bibliotecas adotadas (Three.js, React Three Fiber, Colyseus, Zustand, Vitest).
> 5. Implementações open-source tecnicamente verificadas e de referência (Fairy-Stockfish, PyChess, Lichess, spell-chess-bot de AlexCMarty).
> 6. Artigos, discussões técnicas e bases de dados abertas (Poly Haven CC0, ECO Encyclopaedia of Chess Openings).
> 7. Testes e relatórios históricos do próprio projeto.

---

## 1. Referências por Especificação

### SPEC 01: Core State Architecture, ECS & Commands
- **Padrão Arquitetural:** Entity-Component-System (ECS) desacoplado, Fowler Command Pattern com `execute()` e `undo()`.
- **Invariante ADR-001:** Mutação zero em queries de ocupação, integridade de `occupancy` mapeada por coordenadas unívocas.
- **Invariante ADR-002:** Serialização contígua em `ArrayBuffer` transferível (V8 Transferable) com bijeção estrita na `stringTable`.

### SPEC 02: Procedural Boards, Geometry & Topology
- **Padrão Matemático:** Redes hexagonais axiais de Amit Patel (Red Blob Games — Axial/Cube coordinates $x+y+z=0$).
- **Geração Procedural:** Algoritmo de ruído Simplex/Perlin determinístico indexado por seed fixa, macro-chunks 16×16 com descarregamento dinâmico.
- **Pathfinding:** Algoritmo A* com heurística de distância Manhattan (Square) e distância hexagonal Manhattan $\max(|dx|, |dy|, |dz|)$.

### SPEC 03: Multiplayer Networking & Authoritative Server
- **Framework de Servidor:** Colyseus Authoritative Server (Node.js/WebSocket).
- **Protocolo de Rede:** Simulação determinística de tick rate a 20 Hz, reconciliação otimista no cliente, janela de tolerância de 60 segundos para reconexão de socket.

### SPEC 04: Rules Engine, Fairy Pieces & Modifiers
- **Padrão FIDE:** Leis Oficiais do Xadrez da FIDE (Edição 2023) — Roque, En Passant, Promoção, 3-fold repetition, 50-move rule, insuficiência de material.
- **Peças Fadas:** Notação Betza (Ralph Betza, *The Chess Variant Pages*) para descrição vetorial de peças atípicas (Archbishop = BN, Chancellor = RN, Amazon = QN).
- **Variantes Oficiais:** Regras internacionais do Lichess/Chess.com para Antichess (captura obrigatória, vitória sem peças), Atomic (explosão 3×3 excluindo peões) e Crazyhouse (reservas e drops).

### SPEC 05 & SPEC 15: AI Engines, MCTS & Universal Bot Intelligence
- **Algoritmos Canônicos:** Negamax com poda Alpha-Beta, Quiescence Search, Transposition Table com Zobrist Hashing.
- **Multiplayer e Variantes:** Algoritmo MaxN (Luckhardt, 1986) para arenas multijogador de 3 a 12 facções; Information Set MCTS (Cowling, Ward, Powley, 2012) para Fog of War.
- **Spell Chess Bot Reference:** `spell-chess-bot` (AlexCMarty, MIT License) — modelo de busca de turnos compostos [Ação de Feitiço + Lance de Peça] com avaliação integrada.

### SPEC 06: UI/UX, HUD & Design System
- **Ergonomia e Clareza:** Padrões editoriais modernos do Lichess e Chess.com (tabuleiro como elemento focal absoluto, HUD desacoplado, sem poluição de emojis nos ícones de ação principal).
- **Responsividade:** Suporte estrito a viewports móveis (360px, 390px), tablets (768px, 1024px) e desktops widescreen (1440px+), sem overflow horizontal.

### SPEC 07: 3D WebGL Rendering
- **Modelos Staunton:** Poly Haven Chess Set (CC0 — Creative Commons Zero, uso comercial irrestrito, geometria escaneada PBR em marfim e ônix).
- **Assets de Referência de Iluminação e Materiais:** Khronos Group "A Beautiful Game" (glTF Sample Asset, CC BY 4.0).
- **Engine Gráfica:** Three.js r163+, React Three Fiber v8+, `InstancedBufferGeometry` para redução de draw calls.

### SPEC 08: Matchmaking & Lobbies
- **Sistema de Filas:** Redis Sorted Sets com emparelhamento por proximidade de rating Glicko-2 ($\pm 100$, expandindo a cada 10s).

### SPEC 09: Database, Event Sourcing & PGN
- **Padrão PGN:** Portable Game Notation Standard (Steven J. Edwards, 1994) — Tags Seven Tag Roster, SAN (Standard Algebraic Notation), UCI (Universal Chess Interface).

### SPEC 10: Modding API, CI/CD & Deployment
- **Isolamento de Segurança:** Modding API via Web Workers isolados (sem acesso a `window`, `document`, nem APIs de rede arbitrárias).
- **CI/CD:** Workflows em GitHub Actions automatizados para Node 22 em Ubuntu e compatibilidade multiplataforma.

### SPEC 11: Bot Ecosystem & Ratings
- **Sistema de Rating:** Algoritmo Glicko-2 com desvio de rating (RD) e volatilidade $\sigma$.

### SPEC 12: Game Review, Minigames & Spell Chess
- **Spell Chess Oficial (Chess.com):**
  - **Recursos Iniciais Oficiais:** 5 cargas de Freeze, 2 cargas de Jump por partida.
  - **Cooldown Oficial:** 2 turnos sem uso após conjuração do feitiço.
  - **Mecânica de Freeze:** Congela área 3×3; peças congeladas não se movem e não atacam nem dão xeque por 2 plies (1 turno completo do adversário, expira no início do próximo turno do conjurador).
  - **Mecânica de Jump:** Peça selecionada torna-se transitável/saltável para peças deslizantes aliadas ou adversárias.
  - **Condição de Vitória:** Xeque-mate ou captura direta do Rei adversário.
  - **Ação por Turno:** No máximo 1 feitiço antes do movimento obrigatório de peça.
- **Spell Chess Expanded (Modalidade Própria ChessInReact):**
  - Sistema de Mana (2 a 6), catálogo com 7 feitiços (Freeze, Jump, Fireball, Portal, Shield, Stealth, Resurrection).
  - As duas modalidades devem permanecer estritamente isoladas para impedir contaminação de regras.

### SPEC 13: Expanded Variant Universe
- **Enciclopédia de Variantes:** *The Oxford Companion to Chess* (Hooper & Whyld) e *Variant Chess Magazine* (British Chess Variants Society).
- **Regras Oficiais Orientais:** Shogi (Japan Shogi Association), Makruk (Thailand Chess Association), Xiangqi (World Xiangqi Federation).

### SPEC 14: Massive Multiplayer Arenas
- **Padrão 4PlayerChess+:** Arenas de 4 a 12 facções, regras de pontuação FFA (+1 por peão, +3 por menor, +5 por torre, +9 por dama, +20 por eliminação de rei), turnos em sentido horário.

### SPEC 16: Universal Match Configurator
- **Padrão de Configuração:** Esquema unificado `IMatchConfiguration` com slots parametrizáveis (`HUMAN_LOCAL`, `AI_BOT`, `HUMAN_REMOTE`, `BOT_STANDIN`).

### SPEC 17: Interactive Opening Explorer
- **Classificação Canônica:** Encyclopaedia of Chess Openings (ECO codes A00 a E99).
- **Algoritmo Pedagógico:** Algoritmo SuperMemo-2 (SM-2) / Leitner Box para repetição espaçada de repertório.

### SPEC 18: Competitive Tournaments
- **Padrão FIDE:** FIDE Handbook C.04.1 (Dutch Pairing System) — pareamento por pontuação, invariante de não-repetição de confronto, balanço de cores.
- **Arena Berserk:** Padrão Lichess Arena — redução de 50% de tempo, multiplicador de vitórias em sequência.

