# Spec 15: Arquitetura Universal de Bots e Motores de IA Plugáveis para Todas as Modalidades (Parte 1/4)

## A. OBRIGAÇÃO DE DENSIDADE E ABORDAGEM
Uma limitação crônica de plataformas de xadrez tradicionais é a incapacidade de oferecer adversários computacionais (Bots) além do xadrez clássico 1v1. Motores consolidados como Stockfish e Leela Chess Zero são especializados em tabuleiros quadrados de $8\times 8$ em soma-zero. Ao tentar aplicar esses motores a um tabuleiro de 6 jogadores, a uma variante de informação imperfeita (*Fog of War*), ao *Duck Chess* ou a um modo com feitiços arcanos (*Spell Chess*), a arquitetura entra em colapso:
- A poda Alpha-Beta pressupõe estritamente 2 jogadores adversários;
- A avaliação posicional desconhece custos de mana, drops de reservas e obstáculos móveis;
- A busca tradicional não suporta informação oculta sem trapacear (revelando peças invisíveis para a IA).

O `ChessInReact` resolve este desafio de forma definitiva através de uma **Arquitetura Universal de Estratégias de IA Plugáveis** (`IUniversalAIEngine`), desacoplada da interface do usuário através de um **Pool de WebWorkers Dedicado** (`AIWorkerPool`). Qualquer uma das dezenas de variantes do ecossistema possui um algoritmo de busca e avaliação nativo sob medida, permitindo partidas solo contra bots ou preenchimento de vagas com IAs em qualquer modalidade competitiva.

---

## 1. OBJETIVO DO SUBSISTEMA DE IA UNIVERSAL
1. **Garantia de Adversário Autônomo em 100% dos Modos:** Nenhuma variante ou arena do catálogo pode ser categorizada como "apenas para humanos locais". Todo modo dispõe de uma estratégia de IA dedicada.
2. **Taxonomia de 9 Famílias de Algoritmos Especializados:** Substituir o monolito do Minimax por solucionadores específicos para cada desafio matemático.
3. **Execução Estritamente Não-Bloqueante:** Toda busca profunda é processada em background por WebWorkers, com orçamento de tempo configurável ($100\text{ ms}$ a $3000\text{ ms}$) e salvaguarda de fallback linear emergencial em $< 2.0\text{ ms}$.
4. **Isenção de Trapaça em Fog of War:** Em modos de visão oculta, a IA opera via **Information Set MCTS (ISMCTS)**, tomando decisões baseadas exclusivamente no conjunto de crenças de casas visíveis, sem acessar peças ocultas na memória.

---

## 2. ESCOPO DO SUBSISTEMA

### Pertence a esta Spec:
- Matriz de 9 estratégias de busca e avaliação plugáveis (`AIEngineStrategy`).
- Algoritmos MaxN e Paranoid Search para arenas de 3 a 12 participantes.
- Solucionador ISMCTS para Fog of War com determinização de mundos plausíveis.
- Planejador conjunto lance-mais-pato (`JointMoveDuckPlanner`) para Duck Chess.
- Coordenador de reservas cruzadas (`BughousePartnerAgent`) para Bughouse 2v2.
- Otimizador de feitiços para Spell Chess Oficial (2 feitiços) e Spell Chess Expanded (7 feitiços).
- Simulador de taxa de resolução para Puzzle Battle vs Bot com distribuição de latência humana.
- Pool de Workers `AIWorkerPool` com balanceamento e fallback de emergência.

### Não Pertence a esta Spec:
- Validação legal de movimentos e regras do jogo (Ver Spec 04 e Spec 13).
- Armazenamento de partidas e replays no Supabase (Ver Spec 09).
- Telas de configuração de bot no HUD e seletores de dificuldade (Ver Spec 06 e Spec 16).
- Análise de acurácia pós-jogo CAPS2 (Ver Spec 12).

---

## 3. PESQUISA MATRIX: FONTES EXTERNAS E ARTIGOS CIENTÍFICOS VALIDADOS

### Fonte 1: "MaxN and Paranoid Search for Multi-Player Games" (Sturtevant & Korf)
- **Problema Resolvido:** Poda e avaliação tática em jogos com mais de 2 competidores independentes.
- **Conclusão Técnica:** O algoritmo MaxN retorna uma N-tupla de pontuações $(s_1, s_2, \dots, s_N)$, onde cada jogador no nó maximiza sua própria componente. A busca Paranoide simplifica a árvore assumindo que todos os outros $N-1$ jogadores formaram uma coalizão temporária para atacar o jogador foco, permitindo reaproveitar podas Alpha-Beta com alta eficácia.
- **Decisão no ChessInReact:** As arenas de 3 a 12 jogadores alternam dinamicamente entre MaxN (início de jogo posicional) e Paranoid Search (quando o rei do bot entra em risco iminente de mate).

### Fonte 2: "Information Set Monte Carlo Tree Search (ISMCTS)" (Cowling, Powley, Whitehouse)
- **URL:** https://ieeexplore.ieee.org/document/6145622
- **Problema Resolvido:** Como criar IAs inteligentes em jogos de informação imperfeita sem que o algoritmo consulte dados que o jogador humano não tem acesso.
- **Conclusão Técnica:** O ISMCTS gera múltiplos "mundos plausíveis determinizados" compatíveis com o histórico visível. Ele roda simulações de MCTS agregando as estatísticas na mesma árvore de decisão unificada.
- **Decisão no ChessInReact:** O bot de Fog of War constrói hipóteses sobre a posição das peças inimigas ocultas baseado nas casas que foram capturadas e lances anteriores, entregando uma disputa autêntica e justa.

### Fonte 3: "Coordinated Multi-Agent Search in Bughouse Chess"
- **Problema Resolvido:** Duas IAs jogando no mesmo time de Bughouse precisam colaborar.
- **Conclusão Técnica:** Não basta que a Mesa A jogue isolada da Mesa B. Se a Mesa A precisa urgentemente de um Cavalo para defender o rei, a IA da Mesa A envia uma requisição `REQUEST_PIECE_DROP(KNIGHT)` com alta prioridade para o bot da Mesa B, que passa a priorizar capturas de cavalos adversários em seu tabuleiro.
- **Decisão no ChessInReact:** Os bots de Bughouse utilizam um barramento de mensageria cruzada (`BughouseTeamCommunicationBus`).

---

## 4. MATRIZ DAS 9 ESTRATÉGIAS DE IA PLUGÁVEIS

```mermaid
flowchart TD
    Request[Requisição de Lance do Bot] --> Router{Seletor de Estratégia de Variante}
    Router -->|Clássico / 960 / NoCastling| S1[1. Minimax / Alpha-Beta + Zobrist]
    Router -->|Atomic / Crazyhouse / Capablanca| S2[2. Specialized Variant Engine]
    Router -->|3 a 12 Jogadores (Arenas)| S3[3. MaxN / Paranoid Search / MCTS N-Way]
    Router -->|Fog of War / Blindfold| S4[4. ISMCTS (Informação Oculta)]
    Router -->|Duck Chess| S5[5. Joint Move-Duck Planner]
    Router -->|Bughouse 2v2| S6[6. Coordinated Partner Agent]
    Router -->|Spell Chess (Oficial / Expandido)| S7[7. Spell & Mana Optimizer]
    Router -->|Puzzle Battle| S8[8. Calibrated Tactical Solver]
    Router -->|Diplomacy (Simultâneo)| S9[9. Concurrent Action Forecaster]
```

### Detalhamento das Estratégias:

1. **Estratégia 1 — Minimax com Poda Alpha-Beta, Zobrist e Quiescence:**
   - Aplicada a: Xadrez Clássico, Chess960, Three-Check, Five-Check, King of the Hill, Racing Kings.
   - Avaliação: Tabelas de valor de peças (PST), mobilidade, segurança de rei e contagem de xeques acumulados.
2. **Estratégia 2 — Motor de Variantes Especializadas:**
   - Aplicada a: Atomic Chess (cálculo de risco de detonação em cadeia), Crazyhouse (avaliação de utilidade de peças em reserva), Capablanca Chess (incorporação de Arcebispo e Chanceler).
3. **Estratégia 3 — MaxN & Paranoid Search Multi-Party:**
   - Aplicada a: Arenas de 3 a 12 jogadores (Four-Player FFA, Six-Player, Nexus, Dodecagon).
   - Avaliação de N-tuplas vetorizadas, priorizando sobrevivência do próprio rei e caça a reis vulneráveis para colher os 20 pontos de eliminação.
4. **Estratégia 4 — ISMCTS (Information Set MCTS) para Fog of War:**
   - Opera sob visibilidade restrita. Gera de 100 a 500 determinizações por lance, simulando rollouts sem invadir a névoa de guerra do oponente.
5. **Estratégia 5 — Planejador Conjunto Lance + Pato (Duck Chess):**
   - Avalia a tupla $(Lance, PosicaoPato)$. O algoritmo avalia não apenas a qualidade do movimento da peça, mas escolhe a casa do pato que simultaneamente bloqueia o melhor contra-ataque adversário e preserva as linhas de ataque próprias.
6. **Estratégia 6 — Agentes Coordenados com Mensageria (Bughouse 2v2):**
   - Agentes das mesas irmãs sincronizam intenções. O bot da Mesa A avalia o valor dos drops disponíveis na sua mão enquanto monitora a reserva da Mesa B, ajustando o ritmo de jogo para esperar peças do parceiro quando necessário.
7. **Estratégia 7 — Otimizador Tático de Feitiços e Mana:**
   - **Spell Chess Oficial:** Avalia o momento crítico para aplicar o Freeze em áreas de grande aglomeração e usar o Jump para assaltar o rei sem aviso.
   - **Spell Chess Expanded:** Planeja a curva de mana ao longo de múltiplos turnos, guardando mana para combos táticos com portais, escudos e armadilhas.
8. **Estratégia 8 — Solucionador Tático Calibrado (Puzzle Battle):**
   - Não joga com tabuleiro fixo; resolve problemas sequenciais com latência humana simulada ($1.5\text{s}$ a $8\text{s}$ por puzzle) e precisão calibrada por ELO (ex: Bot Iniciante erra 30% dos puzzles; Bot Mestre acerta 95%).
9. **Estratégia 9 — Previsor de Ações Simultâneas (Diplomacy Chess):**
   - Constrói matrizes de densidade de probabilidade para os lances de cada adversário no turno concorrente, escolhendo o lance que minimiza risco de colisão negativa (*Bounce*) e maximiza ganhos territoriais.

---

## 5. ESTRUTURA DE DIRETÓRIOS E MÓDULOS

```text
src/
  workers/
    ai/
      AIWorkerPool.ts                 // Gerenciador de threads de IA
      strategies/
        AlphaBetaMinimaxStrategy.ts   // Estratégia 1
        VariantSpecializedStrategy.ts // Estratégia 2
        MaxNMultiplayerStrategy.ts    // Estratégia 3
        ISMCTSFogOfWarStrategy.ts     // Estratégia 4
        DuckChessPlannerStrategy.ts   // Estratégia 5
        BughouseCoordinatedAgent.ts   // Estratégia 6
        SpellOptimizationStrategy.ts  // Estratégia 7
        PuzzleBattleBotStrategy.ts    // Estratégia 8
        SimultaneousForecaster.ts     // Estratégia 9
      fallbacks/
        LinearEmergencyFallback.ts    // Fallback instantâneo O(1)
```

---

## 6. CONTRATOS DE DADOS E INTERFACES TYPESCRIPT

```typescript
// src/workers/ai/interfaces/IUniversalAIEngine.ts

import { IDomainState } from '../../../core/state/gameState';
import { ITopology } from '../../../core/topology/ITopology';
import { PlayerId } from '../../../core/coordinates/types';

export interface IAIDecisionRequest {
  readonly matchId: string;
  readonly variantId: string;
  readonly domain: IDomainState;
  readonly topology: ITopology;
  readonly actingPlayer: PlayerId;
  readonly difficultyLevel: 1 | 2 | 3 | 4 | 5;
  readonly timeBudgetMs: number;
  readonly specializedContext?: Record<string, unknown>;
}

export interface IAIDecisionResponse {
  readonly move: {
    from: string;
    to: string;
    pieceId: string;
    promotion?: string;
  };
  readonly secondaryAction?: {
    type: 'PLACE_DUCK' | 'CAST_SPELL' | 'DROP_PIECE';
    payload: Record<string, unknown>;
  };
  readonly evaluationCentipawns: number;
  readonly depthReached: number;
  readonly nodesEvaluated: number;
  readonly elapsedMs: number;
}

export interface IAIEngineStrategy {
  computeBestAction(request: IAIDecisionRequest): Promise<IAIDecisionResponse>;
}
```

---

## 7. REQUISITOS DO SISTEMA

### 7.1 Requisitos Funcionais (RF)
- **RF-15-01:** O sistema DEVE fornecer um solucionador de IA autônomo para todas as variantes do catálogo sem exceção.
- **RF-15-02:** O sistema DEVE implementar o algoritmo MaxN e Paranoid Search para tomada de decisão em partidas de 3 a 12 jogadores.
- **RF-15-03:** O sistema DEVE implementar a busca ISMCTS para Fog of War, garantindo que o bot tome decisões sem acessar peças ocultas na memória.
- **RF-15-04:** O sistema DEVE implementar o planejador conjunto `DuckChessPlannerStrategy`, escolhendo o lance da peça e o local do pato de forma unificada.
- **RF-15-05:** O sistema DEVE implementar agentes de IA coordenados em `BughouseCoordinatedAgent`, suportando solicitação e transferência de peças entre tabuleiros parceiros.
- **RF-15-06:** O sistema DEVE fornecer avaliação de feitiços para o Spell Chess Oficial (cargas e recargas) e Spell Chess Expandido (economia de mana e cartas).
- **RF-15-07:** O sistema DEVE implementar o simulador de IA para o modo Puzzle Battle com resolução progressiva de puzzles calibrada por nível.
- **RF-15-08:** O sistema DEVE despachar todas as buscas profundas para o `AIWorkerPool`, mantendo a thread principal da interface livre de travamentos.

### 7.2 Requisitos Não-Funcionais (RNF)
- **RNF-15-01 (Orçamento de Tempo Rígido):** A execução da IA DEVE respeitar o temporizador configurado (ex: $1500\text{ ms}$), retornando o melhor lance encontrado até o momento da interrupção.
- **RNF-15-02 (Salvaguarda de Fallback Linear):** Caso o WebWorker sofra crash ou timeout crítico, o sistema DEVE executar um fallback linear de lance legal em $< 2.0\text{ ms}$.

---

## 8. CRITÉRIOS DE ACEITE E TESTES HOMOLOGATÓRIOS
1. **MaxN Vector Output:** Teste automatizado em arena de 4 jogadores confirma que o bot avalia o tabuleiro gerando um vetor de 4 pontuações independentes e escolhe a jogada que maximiza seu índice.
2. **Fog of War Fair Play:** Teste de auditoria de memória valida que durante a execução do ISMCTS, nenhuma informação de peças sob a névoa é injetada na heurística de avaliação.
3. **Duck Placement Legality:** Teste automatizado confirma que o bot de Duck Chess sempre retorna uma tupla com movimento legal de peça e posicionamento válido do pato em casa livre.
4. **Emergency Recovery Under Timeout:** Teste com injeção de rejeição assíncrona comprova que o fallback linear recupera a partida sem travar a thread de renderização.

