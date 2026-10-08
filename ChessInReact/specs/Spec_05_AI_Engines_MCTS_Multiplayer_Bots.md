# Spec 05: IA, Bots N-Player e Avaliação Heurística (Parte 1/4)

## A. OBRIGAÇÃO DE DENSIDADE E ABORDAGEM
A criação de um Bot para Xadrez padrão é um problema resolvido (Stockfish, AlphaBeta Pruning). No entanto, tentar plugar o Stockfish numa Engine de Xadrez Hexagonal de 8 Jogadores ou numa variante "Atomic Chess" resulta em falha catastrófica: O Stockfish compila Bitboards de 64 bits rigidamente hardcodados (A1..H8) e sua heurística pressupõe xadrez de soma-zero (Zero-Sum Game) de 2 jogadores.
O `ChessInReact` necessita de uma AI Customizada, baseada em TypeScript (Isomórfica), implementando o Padrão MCTS (Monte Carlo Tree Search) ou MaxN para lidar com alianças não-ditas entre 8 pessoas.

## 1. OBJETIVO DO SUBSISTEMA DE INTELIGÊNCIA ARTIFICIAL
Oferecer oponentes (Bots) competentes e de diferentes dificuldades para qualquer layout topológico, com qualquer quantidade de jogadores. Em segundo plano, oferecer uma "Setinha de Ajuda" (Engine Evaluation Arrow) que sugere o melhor lance ao jogador usando computação paralela via WebWorkers no browser, desafogando o servidor.

## 2. ESCOPO
**PERTENCE A ESTA SPEC:**
- Algoritmo MaxN para N-Jogadores (vs Minimax).
- Monte Carlo Tree Search (MCTS) com UCT.
- Funções de Avaliação Heurística Dinâmica.
- Transposition Tables (Cache Zobrist).
- WebWorkers Off-Main-Thread Architecture.

**NÃO PERTENCE:**
- Geração dos Movimentos Legais (Ver Spec 04).
- WebAssembly Wrappers do Stockfish (Apenas mencionado como fallback pra modo Clássico).

## 3. REQUISITOS E CONSTRAINTS
### 3.1 Constraints de Paralelismo
- **Constraint:** A CPU do navegador é Single-Threaded em sua janela primária. Se a rotina de Minimax levar 2000ms simulando milhões de nós recursivos, o React Three Fiber ficará sem pintar o Frame, resultando em FPS caindo para 0 (Tela Congelada).
- **Resolução Arquitetural:** Obrigatoriedade de desacoplar a IA usando `Web Workers` (`Worker` API). O Dicionário Zustand envia apenas ArrayBuffers (Ver `Spec 01`), o Worker executa `Promise<BestMove>` sem contato com UI.

### 3.2 Constraints Matemáticas: O Paradoxo N-Player
- **Constraint:** O Minimax clássico de xadrez presume que "O que é ruim pro oponente é bom pra mim" (Alpha-Beta Pruning). Num jogo com 4 jogadores, o Jogador B matar o Jogador C não ajuda o Jogador A. A eliminação da "Soma Zero" desabilita o Alpha-Beta Pruning puro.
- **Resolução Arquitetural:** Para jogos > 2 jogadores, a arquitetura abandona o Minimax e foca no **MaxN Algorithm** ou no modelo Estocástico (MCTS) onde as simulações pesam o Payoff global de cada entidade.

## 4. PESQUISA MATRIX: FONTES EXTERNAS CONSULTADAS E VALIDADAS

### Fonte 1: "MaxN Algorithm for Multiplayer Games" (Luckhardt & Irani)
- **Problema Resolvido:** Poda Alpha-Beta não funciona para $>2$ jogadores.
- **Conclusão:** MaxN assume que todo jogador tentará maximizar seu próprio ganho. Diferente do Minimax clássico, retorna uma N-Tuple de avaliações (Ex: Para 3 jogadores, retorna `[scoreA, scoreB, scoreC]`).
- **Decisão Arquitetural:** O algoritmo base para o Custom Bot em salas de 3-8 jogadores será o MaxN associado a "Paranoid Search" (O bot assume que TODOS os outros jogadores estão em uma aliança secreta para atacá-lo).

### Fonte 2: "Information Set Monte Carlo Tree Search (ISMCTS)" 
- **Problema Resolvido:** Como processar turnos Simultâneos (Onde a jogada do oponente é secreta até o fim do turno).
- **Decisão:** Minimax falha em jogos de informação imperfeita. O MCTS resolve o xadrez simultâneo rodando 10.000 simulações de "rollouts" estocásticos por segundo, prevendo os movimentos probabilísticos sem construir uma árvore rígida perfeita.

### Fonte 3: "Stockfish WASM Compiler"
- **URL:** https://github.com/nmrugg/stockfish.js/
- **Decisão:** Quando a sala de jogo for detectada puramente como "2 Jogadores, Topologia Quadrada, Peças Clássicas", o `ChessInReact` carregará o WASM Worker do Stockfish para prover uma experiência Grandmaster, economizando a bateria do celular em vez de rodar TypeScript Minimax.

### Fonte 4: "Zobrist Hashing in Chess" (Chess Programming Wiki)
- **Problema Resolvido:** Identificar transições de posições. Chegar num estado através de `C3->D5` é o mesmo que `C3->B1->D5`. Não devemos recalcular a heurística duas vezes.
- **Decisão:** A IA implementa *Transposition Tables*. O hash Zobrist é gerado por operações de XOR nos bits do `Int32Array` do `IGameState`. Se o Hash existir, cortamos a busca na hora (Cache Hit).

### Fonte 5: "Evaluation Functions in Non-Standard Chess Variants"
- **Problema Resolvido:** A pontuação clássica de peças (Peão = 1, Torre = 5) não reflete tabuleiros procedurais com relevo (Montanhas/Rios).
- **Decisão:** A `Heuristic Engine` considerará `Mobility` (Quantas casas posso mover) como peso majoritário. Uma Torre rodeada por Montanhas que limitam sua visão vale o mesmo que um Peão. `Score = MaterialValue * MobilityMultiplier`.

### GitHub 1: tomhoule/chess-rs
- **Estrutura Estudada:** `evaluation.rs`.
- **Decisão Influenciada:** Uso das "Piece-Square Tables" (PST). O bot não joga apenas pelo material, mas pela posição central. Adaptaremos para "Piece-Distance-To-Center Tables" em topologias hexagonais infinitas.

### GitHub 2: lhartikk/simple-chess-ai
- **Problema Resolvido:** Como integrar e estruturar o Negamax num código legível.
- **Conclusão:** O código foca na simplicidade iterativa em Javascript. Aproveitamos o padrão de "Quiescence Search" para não parar de calcular no meio de uma cadeia de capturas consecutivas, evitando a ilusão do "Horizon Effect".

## 5. ESTRUTURA REAL DE DIRETÓRIOS E MÓDULOS (AI & BOTS)

```text
src/
  workers/
    ai/
      CustomBotWorker.ts        // Ponto de entrada do WebWorker
      algorithms/
        MaxN.ts                 // Minimax N-player adaptado
        MCTS.ts                 // Simulador Estocástico
        Quiescence.ts           // Validação Profunda de Capturas
      heuristics/
        MaterialEvaluator.ts    // Peso Estático das fadas e variantes
        MobilityEvaluator.ts    // Dinâmico: Quão livre está a peça?
        ZobristHasher.ts        // Memoization de estados do tabuleiro
```

(CONTINUA NA PARTE 2)
## 6. O CONTRATO DE AVALIAÇÃO HEURÍSTICA (STATIC EVALUATION)
O Bot baseia-se num sistema de pontuação para medir a "qualidade" do tabuleiro. Diferente do Minimax clássico onde `Brancas = 1.0` e `Pretas = -1.0`, o sistema N-Player retorna um Dicionário de Pontuações Absolutas.

```typescript
// src/workers/ai/heuristics/MaterialEvaluator.ts
import { ICoreState, PlayerID } from '../../../core/interfaces/ICoreState';
import { ITopology } from '../../../engine/topology/ITopology';
import { ValidationPipeline } from '../../../engine/rules/pipelines/MovePipeline';

export interface ScoreTuple {
  P1: number; P2: number; P3: number; P4: number; // etc
}

export class BoardEvaluator {
   // Avaliações base baseadas em Betza Notation. 
   // Leapers puros (Cavalos) valem menos em mapas infinitos que Sliders (Torres)
   private static getPieceValue(variantId: string): number {
       if (variantId === "P") return 100;
       if (variantId === "N") return 300;
       if (variantId === "B") return 320;
       if (variantId === "R") return 500;
       if (variantId === "Q") return 900;
       if (variantId === "K") return 100000;
       
       // Heurística de fallback para Fairy Pieces usando análise da string Betza
       let score = 100;
       if (variantId.includes("Q")) score += 800;
       else if (variantId.includes("R")) score += 400;
       if (variantId.includes("N")) score += 200;
       return score;
   }

   public static evaluate(state: ICoreState, topology: ITopology): ScoreTuple {
       const scores = { P1: 0, P2: 0, P3: 0, P4: 0, P5: 0, P6: 0, P7: 0, P8: 0, NONE: 0 };
       
       for (const coord in state.boardEntities) {
           const entity = state.boardEntities[coord];
           if (entity.type === "PIECE") {
               let pieceValue = this.getPieceValue(entity.variantId);
               
               // MODIFICADOR DE MOBILIDADE: 
               // Gera os pseudo-legals rapidamente e soma 5 pontos por casa livre.
               // Uma rainha emparedada por montanhas valerá 900 + 0 = 900.
               // Uma rainha no centro vale 900 + (25 casas * 5) = 1025.
               // (Esta chamada é memoizada pelo worker)
               const mobility = ValidationPipeline.getLegalMoves(coord, topology, state, state.variant).length;
               pieceValue += (mobility * 5);
               
               scores[entity.ownerId] += pieceValue;
           }
       }
       return scores;
   }
}
```

## 7. ALGORITMO MAX-N E PARANOID SEARCH
Como Minimax Alpha-Beta corta ramos provando que a pior jogada não precisa ser avaliada, ele economiza 90% do tempo. No **Paranoid Search** para Xadrez FFA (Free-For-All) com 4 jogadores, o bot joga a favor de si mesmo (Max) e presume que TODOS os outros 3 jogadores são aliados contra ele (Min conjunto). Isso restaura o Alpha-Beta Pruning com eficiência quase aceitável.

```typescript
// src/workers/ai/algorithms/MaxN.ts

export class ParanoidSearch {
  private transpositionTable = new Map<number, number>();

  /**
   * @param depth - Profundidade remanescente
   * @param isMaximizer - Se True, é o turno do Bot. Se False, é de *qualquer* outro inimigo.
   * @param alpha - Melhor opção garantida do Bot
   * @param beta - Pior cenário garantido pelos Inimigos
   */
  public search(
     state: ICoreState, 
     depth: number, 
     isMaximizer: boolean, 
     alpha: number, 
     beta: number,
     botPlayerId: string,
     topology: ITopology
  ): number {
      
      const zobristHash = ZobristHasher.hash(state);
      if (this.transpositionTable.has(zobristHash)) {
          return this.transpositionTable.get(zobristHash)!;
      }

      if (depth === 0 || state.isGameOver) {
          // AVALIAÇÃO: No Paranoid Search, o Score é (Meus Pontos - Soma dos Inimigos)
          const scores = BoardEvaluator.evaluate(state, topology);
          let enemySum = 0;
          for (const key in scores) {
              if (key !== botPlayerId && key !== "NONE") enemySum += scores[key as PlayerID];
          }
          const evalScore = scores[botPlayerId as PlayerID] - (enemySum * 0.33); // Fator de mitigação Paranóico
          
          return this.quiescenceSearch(state, alpha, beta, botPlayerId, evalScore); // Aprofunda em capturas
      }

      const allLegalMoves = this.generateAllMovesForActivePlayer(state, topology);

      if (isMaximizer) {
          let maxEval = -Infinity;
          for (const move of allLegalMoves) {
              const nextState = this.simulateMove(state, move);
              
              // Se o próximo a jogar for Bot de novo (improvável), mantém Max. Senão Min.
              const nextIsMax = nextState.activePlayer === botPlayerId;
              const ev = this.search(nextState, depth - 1, nextIsMax, alpha, beta, botPlayerId, topology);
              
              maxEval = Math.max(maxEval, ev);
              alpha = Math.max(alpha, ev);
              if (beta <= alpha) break; // ALPHA-BETA PRUNING RESTAURADO!
          }
          this.transpositionTable.set(zobristHash, maxEval);
          return maxEval;
      } else {
          // Fase Paranoica (Todos os inimigos são 1 único Super-Inimigo unificado)
          let minEval = Infinity;
          for (const move of allLegalMoves) {
              const nextState = this.simulateMove(state, move);
              const nextIsMax = nextState.activePlayer === botPlayerId;
              
              const ev = this.search(nextState, depth - 1, nextIsMax, alpha, beta, botPlayerId, topology);
              
              minEval = Math.min(minEval, ev);
              beta = Math.min(beta, ev);
              if (beta <= alpha) break; // CORTA RAMO
          }
          this.transpositionTable.set(zobristHash, minEval);
          return minEval;
      }
  }
}
```

(CONTINUA NA PARTE 3)
## 8. ALGORITMO MCTS PARA TURNOS SIMULTÂNEOS
Quando a política de turnos é Simultânea (Spec 03), o "Paranoid Search" falha completamente porque não há "Turno". O Bot não sabe o que os oponentes vão fazer.
A solução arquitetural exigida é o ISMCTS (Information Set Monte Carlo Tree Search).

### 8.1 Rollout e UCB1
O Bot joga milhares de partidas inteiras e aleatórias (Rollouts) até o Checkmate num tabuleiro virtual na memória. Ele guarda o índice de vitórias de cada ramo. A fórmula `UCB1` equilibra a exploração de jogadas desconhecidas contra a repetição de jogadas que parecem promissoras.

```typescript
// src/workers/ai/algorithms/MCTS.ts

class MCTSNode {
   visits = 0;
   wins = 0;
   children: Map<string, MCTSNode> = new Map();
   
   get UCB1(): number {
      if (this.visits === 0) return Infinity; // Força exploração
      const explorationParam = Math.sqrt(2);
      // parent.visits é omitido por brevidade no pseudo-código
      return (this.wins / this.visits) + explorationParam * Math.sqrt(Math.log(1000) / this.visits);
   }
}

export class MonteCarloSimultaneous {
   // Roda assincronamente por N ms antes do Timeout do Servidor
   public async searchForTimeLimit(state: ICoreState, timeLimitMs: number, botId: string) {
       const root = new MCTSNode();
       const startTime = performance.now();
       
       while (performance.now() - startTime < timeLimitMs) {
          // 1. SELECTION: Desce a árvore usando UCB1
          let node = root;
          let simState = this.clone(state);
          
          while(node.children.size > 0) {
             const bestChildMove = this.getHighestUCB1(node);
             simState = this.simulateSimultaneousRound(simState, bestChildMove);
             node = node.children.get(bestChildMove)!;
          }
          
          // 2. EXPANSION: Cria os nós filhos
          const legalMoves = this.generateSimultaneousMoves(simState, botId);
          if (legalMoves.length > 0) {
              const move = legalMoves[Math.floor(Math.random() * legalMoves.length)];
              const newNode = new MCTSNode();
              node.children.set(move, newNode);
              simState = this.simulateSimultaneousRound(simState, move);
              node = newNode;
          }
          
          // 3. SIMULATION (Rollout Aleatório até o fim)
          const result = this.playRandomMatchToEnd(simState, botId);
          
          // 4. BACKPROPAGATION: Sobe pontuando
          this.backpropagate(node, result === "WIN");
       }
       
       // Retorna a jogada com mais Visitas (Robusta)
       return this.getMostVisitedChild(root);
   }
}
```

## 9. GERENCIAMENTO DE MEMÓRIA NO WEBWORKER (ZOBRIST E GC)

A função `search()` da Inteligência Artificial instancia centenas de milhares de ramificações (`simState = this.simulateMove(state, move)`). Fazer `JSON.parse(JSON.stringify(state))` em JS demoraria $2ms$ por clonagem, logo a IA calcularia menos de 500 posições/segundo (Péssimo).

### 9.1 Clonagem de Estado O(1) com Immer / FlatArray
Lembra do `FlatArraySerializer` desenhado na Spec 01? O Bot nunca instancia Objetos JS. O Board é manipulado exclusivamente escrevendo e sobrescrevendo ponteiros no `Int32Array`. 

- O `ZobristHasher` é um array de 3 dimensões gerado via seed pseudo-randômica na montagem do Worker: `Table[SquareID][PieceType][Color] = Random64BitInt`.
- A cada movimento do Bot na busca profunda, fazemos uma operação Binária XOR (`^`) do Hash Atual com a peça antiga saindo e a peça nova entrando. Isso atualiza o State Hash em $O(1)$ sem recalcular todo o tabuleiro, essencial para a *Transposition Table*.

## 10. FAILURE MODES E TRATAMENTO DE EDGE CASES DA IA

### 10.1 Failure Mode: O Efeito Horizonte (Horizon Effect)
O Bot vê que pode capturar a Rainha Inimiga na profundidade limite (Ex: Depth = 4). Ele pontua o estado com `+900` e escolhe essa jogada. Porém, se o Bot pudesse ver o Depth = 5 (apenas 1 lance além), ele veria que há um Peão imediatamente pronto para recapturá-lo, sendo uma armadilha.
- **Resolução Arquitetural (Quiescence Search):**
Quando o `ParanoidSearch` atinge o `depth === 0`, ele NÃO para de buscar se a última jogada avaliada for uma *Captura* ou um *Check*. O código invoca uma Busca de Aquiescência (`QuiescenceSearch`), que continua a árvore restrita APENAS a lances de Captura, até que a poeira baixe (Estado Quiescente) e só então chama a `BoardEvaluator`.

### 10.2 Failure Mode: Congelamento Isolado do Worker (OOM)
Um mapa com 8 jogadores, profundidade 6 sem cortes alpha-beta eficientes, pode gerar $50^6 = 15$ Bilhões de Nós de busca. A tabela `TranspositionTable` (Map) excederá os 2GB de RAM alocados por aba do V8 e craschará silenciosamente o Worker (OOM - Out of Memory), travando a partida Singleplayer.
- **Resolução Arquitetural (Size-Capped Map):**
O `TranspositionTable` não usa um `Map` infinito. Usamos um LRU Cache (Least Recently Used) ou um Array cíclico estrito (e.g. `new Float64Array(1048576)` = 8MB). Se houver colisão de Hash, o cálculo mais raso é sobrescrito, sacrificando um pouco de performance mas salvando a aba de Crash. O Worker também roda um `Performance.now()` check a cada 1.000 nós. Se exceder o Time Limit de `2.0s`, a busca sofre um Early Return (Iterative Deepening Search).

(CONTINUA NA PARTE 4)
## 11. O "EVALUATION ARROW" UI (COMPONENTE DE UX)
Parte da integração da Inteligência Artificial é não só jogar contra humanos, mas auxiliar o humano num modo de Treino.

O Worker de IA recebe na inicialização uma flag estática.
Se `isAssistanceMode = true`, a IA não precisa esperar o turno dela. Ela é invocada a cada alteração da Source of Truth do `Zustand` (`Spec 01`).
O componente React visual intercepta o EventBus:
```tsx
// src/rendering/effects/EvaluationArrow.tsx
import { useEffect, useState } from 'react';
import { GlobalEventBus } from '../../core/events/EventBus';
import { ArrowHelper, Vector3 } from 'three';

export function EvaluationArrow() {
  const [bestMove, setBestMove] = useState(null);

  useEffect(() => {
     // Atualizado sempre que a Main Thread recebe uma sugestão do Worker
     const unsub = GlobalEventBus.subscribe("AI_EVALUATION_READY", (payload) => {
         setBestMove(payload.bestMove);
     });
     return unsub;
  }, []);

  if (!bestMove) return null;

  // Lógica Omitida para brevidade: Desenhar o Vector3 Arrow do R3F do 'from' até 'to'.
  // ...
}
```

## 12. PLANO DE IMPLEMENTAÇÃO DA SPEC 05
1. Configurar o Webpack/Vite para buildar arquivos `*.worker.ts` separadamente da main thread. Instanciar o `EngineBridge` (Spec 01) ligando o Zustand a ele.
2. Escrever `BoardEvaluator.evaluate()` garantindo cobertura de testes unitários onde posições vantajosas de 3 jogadores falhem ao passar para o inimigo, e calculem perfeitamente na tupla.
3. Montar a base recursiva do Algoritmo `MaxN` em TypeScript sem Alpha-Beta. (Versão 1.0)
4. Embutir a Transposition Table `LRU Cache` usando os buffers Int32. (Versão 1.1)
5. Adicionar a flag "Paranoid Search" ativando Pseudo-Alpha-Beta pruning para jogos $> 2$. Medir Benchmarks. O alvo é atingir Depth 4 num jogo de 4 jogadores em menos de 1000ms.
6. Refatorar o validador de Turnos Simultâneos para instanciar a classe separada de `ISMCTS`. (Versão 2.0).

## 13. CRITÉRIOS DE ACEITE
1. **Thread Isolation Absoluta:** Disparar uma simulação Minimax/MaxN de "Depth 5" (profundidade pesada) durante o arrastar de uma peça pelo jogador humano NÃO deve dropar nenhum frame (0 stutter) nas animações 3D da UI do ThreeJS.
2. **Determinismo Avaliativo:** Submeter um estado congelado ao Worker 10 vezes deve retornar estritamente a mesma nota de Avaliação Heurística, garantindo a solidez das equações de mobilidade e material.
3. **Escalabilidade Multijogador:** O Bot MCTS deve suportar de 2 a N jogadores no mesmo loop simultâneo, sem nenhuma injeção condicional no algoritmo principal de descida/propagação (O código MCTS independe da topologia).
4. **Zobrist Cache Hit-Rate:** Nas suítes de Benchmark, a implementação do `ZobristHasher` deve comprovar mais de $30\%$ de hits no Transposition Table durante um Quiescence Search de captura forçada, atestando economia significativa da CPU V8.

---
*Fim da Spec 05. A Inteligência Artificial é inteiramente dependente das regras desenhadas na Spec 04. Com as mecânicas, regras e "Cérebro" consolidados fora da Main Thread, a Spec 06 pode focar inteiramente na casca: Interatividade, Raycasting BVH, Renderização 3D, Interface de Usuário e reaproveitamento do NutriOpus.*


## 14. REPOSITÓRIOS GITHUB E REFERÊNCIAS EXTERNAS (IA, BOTS E HEURÍSTICAS)

Abaixo documentamos as fontes de inteligência artificial aplicada a jogos, motores de busca em árvores de decisão e projetos open-source analisados para a criação dos bots do `ChessInReact`.

### 14.1 Projetos Open Source Analisados
1. **GitHub: `nmrugg/stockfish.js`**
   - **Link:** https://github.com/nmrugg/stockfish.js
   - **Resumo Técnico:** Port oficial do motor Stockfish em WebAssembly (WASM) e asm.js para execução direta dentro de navegadores via WebWorkers.
   - **Como Aproveitaremos no Projeto:** O Stockfish WASM será utilizado como motor padrão de IA para o modo Clássico 1v1 (8x8) e para o painel de análise pós-jogo. A execução é realizada 100% no cliente com transferência de mensagens assíncronas UCI (Universal Chess Interface), provendo força de jogo nível Grande Mestre (ELO > 3200) com custo de servidor absolutamente nulo.

2. **GitHub: `jvanvugt/mcts`**
   - **Link:** https://github.com/jvanvugt/mcts
   - **Resumo Técnico:** Implementação genérica e modular do algoritmo Monte Carlo Tree Search (MCTS) com seleção por fórmula UCT (Upper Confidence bounds applied to Trees).
   - **Como Aproveitaremos:** Adaptamos a estrutura de árvore do MCTS para ser o núcleo do bot em variantes de 3 a 8 jogadores e tabuleiros com topologias exóticas. A cada iteração, o algoritmo realiza fases de Seleção, Expansão, Simulação (Playout) e Retropropagação (Backpropagation), lidando naturalmente com cenários de alta ramificação onde a poda alfa-beta tradicional é inviável.

3. **GitHub: `google-deepmind/open_spiel`**
   - **Link:** https://github.com/google-deepmind/open_spiel
   - **Resumo Técnico:** Framework da Google DeepMind dedicado a pesquisas em teoria dos jogos, jogos multijogador simultâneos e algoritmos como Max-N e Information Set MCTS (ISMCTS).
   - **Como Aproveitaremos:** Incorporamos os fundamentos do *Paranoid Search Algorithm* (onde o bot adota a heurística pessimista de que todos os adversários cooperam tacitamente para eliminá-lo) e o *Information Set MCTS* para gerenciar rodadas com turnos simultâneos e jogadas ocultas.

4. **GitHub: `niklasf/fishnet`**
   - **Link:** https://github.com/niklasf/fishnet
   - **Resumo Técnico:** Servidor distribuído em Rust para paralelização e distribuição de análises de xadrez em larga escala utilizado pela infraestrutura do Lichess.
   - **Como Aproveitaremos:** Analisamos sua estratégia de limitação de threads e priorização de tarefas de computação em background para estruturar o `EngineBridge`, garantindo que dispositivos móveis não aqueçam excessivamente e que a bateria seja preservada durante cálculos contínuos.

5. **GitHub: `jhelwig/zobrist-hash`**
   - **Link:** https://github.com/jhelwig/zobrist-hash
   - **Resumo Técnico:** Gerador de hashes Zobrist baseado em números pseudoaleatórios de 64 bits para indexação instantânea de posições de tabuleiro.
   - **Como Aproveitaremos:** Implementamos a tabela de transposição (Transposition Table) da nossa IA em TypeScript. Cada peça e cada casa possui um bitmask aleatório associado; alterações de posição aplicam operações XOR atômicas, permitindo identificar posições idênticas alcançadas por ordens de lances diferentes (transposições) em tempo constante O(1).

6. **GitHub: `microsoft/onnxruntime` (onnxruntime-web)**
   - **Link:** https://github.com/microsoft/onnxruntime
   - **Resumo Técnico:** Mecanismo de inferência de redes neurais otimizado para WebAssembly e WebGPU no navegador, executando modelos no formato aberto ONNX.
   - **Como Aproveitaremos:** Avaliado e planejado para avaliação posicional em tempo real: modelos compactos de redes neurais pré-treinadas (estilo NNUE de 1.5MB quantizados em INT8) executam inferências em menos de 1ms no navegador, atribuindo notas de avaliação precisas para peças fadas e geometrias hexagonais sem regras manuais engessadas.

7. **GitHub: `maksimKorzh/chess-programming`**
   - **Link:** https://github.com/maksimKorzh/chess-programming
   - **Resumo Técnico:** Tutoriais e motores de xadrez pedagógicos com foco em Quiescence Search, Move Ordering (MVV-LVA) e tabelas de avaliação por peças e casas (Piece-Square Tables).
   - **Como Aproveitaremos:** A heurística de ordenação de lances MVV-LVA (Most Valuable Victim - Least Valuable Attacker) foi portada diretamente para ordenar os lances antes do branching no Max-N, permitindo podas substanciais logo nos primeiros nós da árvore.

8. **GitHub: `davidbau/seedrandom`**
   - **Link:** https://github.com/davidbau/seedrandom
   - **Resumo Técnico:** Gerador determinístico de números pseudoaleatórios em JavaScript.
   - **Como Aproveitaremos:** Utilizado nas simulações estocásticas do MCTS (fase de playout/rollout) com uma semente fixa em modos de teste para reproduzir exatamente as mesmas árvores de decisão em testes de regressão de qualidade da IA.

9. **GitHub: `glinscott/nnue-pytorch`**
   - **Link:** https://github.com/glinscott/nnue-pytorch
   - **Resumo Técnico:** Arquitetura Efficiently Updatable Neural Network (NNUE) pioneira no Stockfish para avaliação rápida de posições baseada em transformações afins incrementais.
   - **Como Aproveitaremos:** Adotamos a técnica de atualização diferencial da avaliação posicional: ao mover uma peça, o bot não recalcula o valor do tabuleiro inteiro do zero; ele apenas subtrai o valor da casa antiga e soma o da nova casa na pontuação cumulativa.

10. **GitHub: `turfjs/turf`**
    - **Link:** https://github.com/Turfjs/turf
    - **Resumo Técnico:** Módulos geoespaciais e de análise de proximidade.
    - **Como Aproveitaremos:** O conceito de cálculo de centróide e distância de Manhattan poligonal é aproveitado na heurística de centralização e controle de território (King Safety e King Centralization no final de jogo).

---

## 15. HISTÓRIAS DE USUÁRIO (USER STORIES) - INTELIGÊNCIA ARTIFICIAL E BOTS

### 15.1 Histórias de Usuário do Jogador (Player Perspective)
1. **US05-P01:** Como jogador iniciante, quero jogar contra um Bot no nível "Fácil" que cometa deslizes táticos ocasionais e jogue de forma humana, permitindo-me aprender o jogo sem frustração.
2. **US05-P02:** Como competidor experiente, quero enfrentar um Bot no nível "Mestre" que calcule combinações táticas profundas e me puna com rigor por qualquer erro de posicionamento.
3. **US05-P03:** Como jogador em uma partida hexagonal de 4 jogadores, se um jogador humano abandonar a partida no meio, quero que um Bot assuma imediatamente o controle do seu exército mantendo a partida fluida.
4. **US05-P04:** Como usuário jogando offline no celular ou avião, quero disputar partidas completas contra bots inteligentes sem necessidade de qualquer conexão com a internet.
5. **US05-P05:** Como competidor em treino tático, quero ativar a "Seta de Sugestão de Lance" (Evaluation Arrow) para visualizar a melhor jogada recomendada pela engine em tempo real.
6. **US05-P06:** Como espectador ou analista, quero visualizar uma barra de avaliação gráfica que mostre qual jogador tem vantagem posicional e material ao longo da partida.
7. **US05-P07:** Como jogador em variantes com peças fadas (como Atomic ou Antichess), quero enfrentar bots que compreendam as regras especiais do modo e não suicidem suas peças de forma estúpida.
8. **US05-P08:** Como usuário jogando em notebook básico, quero que o bot tome suas decisões em no máximo 1 a 2 segundos por lance, sem congelar a tela nem fazer o ventilador do computador disparar.
9. **US05-P09:** Como entusiasta de xadrez, quero escolher bots com diferentes personalidades de jogo (ex: "Bot Agressivo" que busca ataques violentos ao rei, "Bot Posicional" que prioriza estrutura e "Bot Caótico" que joga variantes de surpresa).
10. **US05-P10:** Como competidor em partida com turnos simultâneos, quero que os bots submetam suas jogadas dentro do prazo estipulado pelo cronômetro da sala sem atrasar a resolução da rodada.
11. **US05-P11:** Como jogador, quero pausar e retomar a partida contra o bot a qualquer momento sem perder o progresso ou reiniciar o tabuleiro.
12. **US05-P12:** Como estudante, quero poder solicitar uma "Dica" (Hint) durante o jogo contra o bot, recebendo uma explicação textual curta sobre a razão estratégica do lance recomendado.
13. **US05-P13:** Como jogador, quero que o bot ofereça ou aceite empate automaticamente caso a posição no tabuleiro atinja um estado de empate teórico comprovado.
14. **US05-P14:** Como competidor que cometeu um clique errado contra o bot, quero usar o botão "Desfazer Lance" (Takeback) para voltar um turno atrás e tentar uma linha tática diferente.
15. **US05-P15:** Como jogador analisando uma partida recém-concluída, quero um relatório com o gráfico de precisão (Accuracy Score) e a identificação dos lances brilhantes, erros e gafes cometidos durante o jogo.

### 15.2 Histórias de Usuário do Desenvolvedor e Arquiteto (Developer/Architect Perspective)
1. **US05-D01:** Como arquiteto do sistema, quero que todo o processamento de busca e heurística da IA seja executado estritamente em WebWorkers isolados, garantindo 60 FPS inabaláveis na thread principal de renderização.
2. **US05-D02:** Como desenvolvedor de IA, quero que a árvore MCTS opere com buffers de memória contíguos (`Int32Array`) transferíveis via Zero-Copy (`Transferable Objects`) para maximizar o throughput de nós por segundo (NPS).
3. **US05-D03:** Como engenheiro de testes, quero executar suítes de benchmarks automatizados de Perft e nós por segundo, garantindo que o algoritmo Max-N ultrapasse a meta de 15.000 NPS em navegadores modernos.
4. **US05-D04:** Como mantenedor do código, quero que a tabela de transposição Zobrist utilize uma política de substituição LRU (Least Recently Used) com tamanho máximo fixado em 32MB para proteger contra estouro de memória no Safari iOS.
5. **US05-D05:** Como desenvolvedor de variantes, quero que a função de avaliação de material e mobilidade receba os valores de pontos declarados no `IPieceDefinition` de cada peça, adaptando-se instantaneamente a qualquer peça fada.
6. **US05-D06:** Como operador de infraestrutura gratuita, quero que nenhuma computação de inteligência artificial de bots ou análises pós-jogo ocorra no servidor Node.js/Render, mantendo o consumo de CPU do backend próximo a zero.
7. **US05-D07:** Como desenvolvedor de bots multijogador, quero que o algoritmo Paranoid Search assuma que os $N-1$ adversários priorizam ataques ao jogador em vantagem, gerando comportamento tático desafiador em arenas de 4 a 8 participantes.
8. **US05-D08:** Como engenheiro de performance, quero que a rotina de Quiescence Search seja ativada apenas para lances de captura e xeque na profundidade terminal, eliminando o "Horizon Effect" sem explodir o tempo de cálculo.
9. **US05-D09:** Como desenvolvedor de UI, quero que o WebWorker emita mensagens parciais de progresso de busca (`depthReached`, `nps`, `currentBestMove`) a cada 200ms para alimentar a barra de progresso do modo treino.
10. **US05-D10:** Como desenvolvedor de balanceamento, quero que a curva de dificuldade do bot ajuste dinamicamente o tempo máximo de reflexão (100ms no Fácil até 2000ms no Difícil) e a taxa de randomização estocástica dos lances.

---

## 16. REQUISITOS FUNCIONAIS (RF) - INTELIGÊNCIA ARTIFICIAL E BOTS

Abaixo estão formalizados os 15 requisitos funcionais mandatórios do subsistema de inteligência artificial e bots.

1. **RF-01 (Múltiplos Níveis de Dificuldade):** O sistema deve oferecer pelo menos 5 níveis de dificuldade configuráveis para os bots (Iniciante, Casual, Intermediário, Avançado e Mestre), variando tempo de busca e profundidade.
2. **RF-02 (Execução Isolada em WebWorkers):** Todos os cálculos de busca de jogadas, rollouts MCTS e inferências de IA devem ser executados em WebWorkers dedicados sem bloquear o ciclo de eventos do navegador.
3. **RF-03 (Algoritmo Max-N para Partidas Multijogador):** Em salas com 3 ou mais jogadores, o sistema deve utilizar o algoritmo Max-N para avaliar árvores de decisão retornando tuplas de payoff individual para cada participante.
4. **RF-04 (Algoritmo MCTS para Turnos Simultâneos):** Em variantes com decisões simultâneas e informação imperfeita, o bot deve utilizar Monte Carlo Tree Search (UCT) para simular playouts probabilísticos rápidos.
5. **RF-05 (Integração com Stockfish WASM):** Em partidas clássicas 1v1 FIDE (8x8), o sistema deve permitir carregar o worker compilado do Stockfish WASM para prover jogo de altíssimo nível e análise formal.
6. **RF-06 (Tabela de Transposição com Zobrist Hashing):** O motor de busca deve armazenar posições visitadas em uma tabela de transposição indexada por chave Zobrist de 64 bits, recuperando avaliações pré-computadas em tempo $O(1)$.
7. **RF-07 (Busca de Quietude - Quiescence Search):** Ao atingir a profundidade máxima de busca, a engine deve estender a análise exclusivamente para sequências de capturas pendentes até atingir um estado calmo (Quiet State).
8. **RF-08 (Avaliação Heurística Dinâmica e Territorial):** A função de avaliação deve considerar pontuação de material, mobilidade de peças (quantidade de casas legais alcançáveis) e controle de território central.
9. **RF-09 (Heurística de Paranoid Search):** No modo FFA de 4 ou mais jogadores, o bot deve incorporar a heurística Paranoid para prever e neutralizar ataques coordenados de adversários temporariamente aliados.
10. **RF-10 (Seta de Sugestão Tática em Tempo Real):** No modo de treino ou análise, a engine deve emitir a melhor jogada encontrada (`bestMove`) e renderizar uma seta tridimensional de auxílio visual sobre o tabuleiro.
11. **RF-11 (Geração de Barra de Vantagem Posicional):** O sistema deve computar e atualizar uma barra de avaliação gráfica na lateral da tela demonstrando o equilíbrio de forças em centipawns (ou percentual de vitória).
12. **RF-12 (Substituição Automática de Jogador Desconectado):** Caso um participante humano abandone uma partida multijogador sem chance de retorno, o sistema deve acionar um Bot de nível correspondente para assumir o controle do exército.
13. **RF-13 (Compreensão de Regras de Variantes e Peças Fadas):** O bot deve respeitar rigorosamente as particularidades de cada variante (explosões no Atomic, capturas obrigatórias no Antichess e drops no Crazyhouse).
14. **RF-14 (Controle Estrito de Orçamento de Tempo):** O tempo de deliberação do bot deve respeitar rigidamente o limite máximo de tempo configurado para a jogada (ex: máximo de 1.500ms), retornando o melhor lance encontrado até aquele instante caso o tempo se esgote.
15. **RF-15 (Relatório de Precisão e Análise Pós-Jogo):** Ao final de uma partida, a IA deve realizar uma varredura dos lances executados e classificar cada movimento como "Excelente", "Bom", "Imprecisão", "Erro" ou "Gafe", calculando a porcentagem de precisão de cada jogador.

---

## 17. REQUISITOS NÃO-FUNCIONAIS (RNF) - DESEMPENHO E ARQUITETURA DA IA

Abaixo estão formalizados os 15 requisitos não-funcionais que governam a arquitetura de inteligência artificial.

1. **RNF-01 (Taxa de Quadros Imune a Cálculos da IA):** O processamento da IA no WebWorker não deve provocar nenhuma queda de taxa de quadros abaixo de **60 FPS** na thread principal do Three.js em nenhuma circunstância.
2. **RNF-02 (Tempo Máximo de Resposta em Partidas Casuais):** Em níveis de dificuldade padrão (até nível 3), o bot deve submeter o seu lance em menos de **1.000 milissegundos**.
3. **RNF-03 (Throughput de Busca - Nós por Segundo):** O motor de busca em TypeScript compilado deve atingir rendimento mínimo de **10.000 nós por segundo (NPS)** em processadores de smartphone modernos.
4. **RNF-04 (Teto de Memória da Tabela de Transposição):** A tabela de transposição Zobrist não deve alocar mais do que **32 Megabytes** de memória heap para evitar problemas de restrição de memória em abas mobile.
5. **RNF-05 (Custo de Infraestrutura $0 de Servidor):** Exatos **100% dos cálculos de IA para partidas contra bots e análises locais** devem ser executados no cliente web do usuário, consumindo zero quota de processamento do backend Render.
6. **RNF-06 (Tempo de Inicialização do WebWorker):** O carregamento e instanciação do WebWorker da engine no navegador deve ocorrer em menos de **100 milissegundos** após a montagem do componente.
7. **RNF-07 (Tamanho do Pacote do Stockfish WASM):** O módulo binário do Stockfish WASM (quando requisitado no modo FIDE) deve ser carregado via lazy loading sob demanda e pesar menos de **1.5 Megabytes** gzippado.
8. **RNF-08 (Taxa de Acertos da Tabela de Transposição):** Em buscas com profundidade superior a 3 lances, a taxa de acertos (Hit Rate) na tabela de transposição Zobrist deve ser de pelo menos **25%**.
9. **RNF-09 (Cancelamento Instantâneo de Busca):** Se o usuário reiniciar a partida ou desistir enquanto a IA estiver pensando, a chamada de busca em andamento deve ser abortada imediatamente em menos de **10 milissegundos** via sinal de interrupção no worker.
10. **RNF-10 (Cobertura de Testes de Heurísticas):** As funções de avaliação matemática e algoritmos Max-N/MCTS devem manter cobertura de testes unitários superior a **90%**.
11. **RNF-11 (Determinismo de Resposta da IA com Semente):** Quando fornecida uma semente determinística em testes automatizados, a IA deve retornar exatamente os mesmos lances e notas heurísticas repetidas vezes.
12. **RNF-12 (Consumo de Bateria em Dispositivos Móveis):** O cálculo da IA deve limitar o número de workers a 1 ou 2 threads concorrentes para evitar superaquecimento e drenagem rápida de bateria em smartphones.
13. **RNF-13 (Comunicação Zero-Copy via Transferable Objects):** A transferência de grandes buffers de posições entre a thread principal e o worker deve utilizar `ArrayBuffer.transfer` ou transferência direta de propriedade, evitando clonagem pesada de strings ou objetos JSON.
14. **RNF-14 (Resiliência contra Falha de Worker):** Caso o WebWorker da engine sofra um encerramento inesperado por memória do navegador, a aplicação principal deve detectar a falha, reiniciar o worker em menos de 500ms e manter a partida sem travamento da UI.
15. **RNF-15 (Acurácia de Avaliação de Material):** O cálculo de material em posições idênticas de peças em cores opostas deve retornar nota estritamente simétrica (Score = 0.0), garantindo imparcialidade matemática no algoritmo.

---

## 18. ARQUITETURA DE DEPLOYMENT GRATUITA (FREE TIER) PARA INTELIGÊNCIA ARTIFICIAL

O desenvolvimento de motores de IA em jogos é historicamente o elemento mais oneroso em infraestrutura de nuvem quando executado em servidores centrais (demandando servidores com GPUs ou instâncias com dezenas de núcleos de CPU). O `ChessInReact` resolve essa barreira orçamentária através da **Descentralização Total na Borda (Edge Client Execution)**:

1. **Computação 100% Descentralizada no Navegador:** Toda a computação dos bots (seja via WebAssembly com Stockfish ou via TypeScript com MCTS/Max-N) é realizada diretamente no hardware do próprio jogador através da API padrão de WebWorkers. O servidor de backend não aloca um único ciclo de clock de CPU para processar jogadas de inteligência artificial.
2. **Assets Estáticos via CDN Global da Vercel:** O arquivo compilado do Stockfish WASM e os workers de IA são distribuídos como assets estáticos compactados via Vercel Edge CDN, beneficiando-se da cota gratuita de 100GB de largura de banda mensal com latência de download mínima em qualquer parte do planeta.
3. **Persistência de Avaliações em Cache Local:** Análises e relatórios de partidas gerados pela IA são armazenados no `IndexedDB` do navegador do próprio jogador, sem consumir o limite de armazenamento do PostgreSQL no Supabase.

---

## 19. MODOS DE JOGO E SUAS PECULIARIDADES DE IA

1. **Modo Clássico 1v1 (Stockfish WASM):**
   - Utilização do protocolo UCI padrão para envio de posições FEN e recepção de lances ponderados.
   - Suporte a níveis de habilidade através da configuração `Skill Level` (de 0 a 20) do Stockfish.
2. **Modo Hexagonal FFA (4 a 8 Jogadores):**
   - Execução do algoritmo Max-N com avaliação vetorial n-dimensional.
   - Ponderação heurística especial de sobrevivência: o bot prioriza manter peças de proteção ao redor do rei e evita expor fraquezas que possam ser exploradas por múltiplos adversários em sequência.
3. **Modo Simultâneo (Turnos Ocultos):**
   - O bot utiliza MCTS estocástico com 5.000 playouts aleatórios para simular as jogadas mais prováveis que os oponentes submeterão simultaneamente na mesma janela de tempo.
4. **Modo Atomic Chess:**
   - Heurística de perigo extremo: a IA atribui penalidade matemática colossal a qualquer lance que permita ao oponente capturar uma peça adjacente ao seu rei, priorizando proteção contra detonações em cadeia.
5. **Modo Crazyhouse:**
   - O branching factor aumenta exponencialmente devido à possibilidade de inserir peças de reserva (Drops). A IA utiliza ordenação tática para avaliar drops de xeque e garfos táticos com prioridade máxima.

---

## 20. SCHEMAS DE DADOS, TIPOS TYPESCRIPT E CONTRATOS DO WORKER

Abaixo constam as interfaces tipadas de comunicação entre a thread principal e o WebWorker de IA:

```typescript
// src/workers/ai/interfaces/IAIEngineContracts.ts

export type AIDifficultyLevel = 1 | 2 | 3 | 4 | 5;

export interface IAIWorkerRequest {
  taskId: number;
  type: 'CALCULATE_BEST_MOVE' | 'START_CONTINUOUS_EVALUATION' | 'STOP_EVALUATION';
  payload: {
    stateBuffer: ArrayBuffer; // Flat buffer Int32 do estado
    activePlayerId: string;
    variantId: string;
    difficulty: AIDifficultyLevel;
    timeBudgetMs: number;
    depthLimit?: number;
    isMultiplayerFFA?: boolean;
    playerCount?: number;
  };
}

export interface IAIWorkerResponse {
  taskId: number;
  success: boolean;
  bestMove: {
    fromCoord: string;
    toCoord: string;
    pieceId: string;
  };
  evaluationScore: number; // Em centipawns (Ex: +150 = +1.5)
  depthReached: number;
  nodesCalculated: number;
  calculationTimeMs: number;
  pvLine: string[]; // Linha principal (Principal Variation)
}

export interface IPostGameAnalysisReport {
  matchId: string;
  playerAccuracies: Record<string, number>; // Ex: { "P1": 89.4, "P2": 76.2 }
  movesClassification: {
    moveNumber: number;
    player: string;
    moveString: string;
    classification: 'BRILLIANT' | 'GREAT' | 'BEST' | 'EXCELLENT' | 'GOOD' | 'INACCURACY' | 'MISTAKE' | 'BLUNDER';
    scoreDelta: number;
  }[];
}
```

Contrato JSON para requisição de auxílio ou lance de bot:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AIBestMoveRequestPayload",
  "type": "object",
  "required": ["taskId", "activePlayerId", "difficulty", "timeBudgetMs"],
  "properties": {
    "taskId": { "type": "integer" },
    "activePlayerId": { "type": "string" },
    "difficulty": { "type": "integer", "minimum": 1, "maximum": 5 },
    "timeBudgetMs": { "type": "integer", "minimum": 50, "maximum": 10000 },
    "variantId": { "type": "string" },
    "isAssistanceMode": { "type": "boolean" }
  }
}
```

---

## 21. CONCLUSÃO ARQUITETURAL DA SPEC 05

A Spec 05 resolve com maestria o desafio de inteligência artificial em ambientes de jogos táticos complexos e não-convencionais. Combinando a robustez histórica do Stockfish WASM para cenários clássicos com a versatilidade de algoritmos de ponta como MCTS e Max-N para arenas caóticas de 3 a 8 participantes em WebWorkers isolados, o `ChessInReact` entrega oponentes taticamente desafiadores, análise de lances em tempo real e relatórios de precisão, mantendo a experiência a 60 FPS contínuos e sem custo de infraestrutura de servidores.
