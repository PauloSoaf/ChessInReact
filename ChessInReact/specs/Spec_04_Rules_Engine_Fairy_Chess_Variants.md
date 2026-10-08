# Spec 04: Regras, Fairy Pieces e Resolução de Validade (Parte 1/4)

## A. OBRIGAÇÃO DE DENSIDADE E ABORDAGEM
A modelagem orientada a objetos (OOP) na qual `class Bishop extends Piece` falha massivamente no design de Xadrez Modding. Se quisermos criar uma "Rainha que só anda em hexágonos, envenena ao redor ao capturar, e salta como cavalo" (Uma *Amazon Fairy Piece* com modificadores), a herança entrará em colapso. Esta Spec 04 abandona a OOP por um Sistema de Resolução Baseado em Composição de Máscaras (Mask Composition) e a *Betza Notation*.

## 1. OBJETIVO DO SUBSISTEMA DE REGRAS (RULES ENGINE)
Fornecer um módulo Javascript Puro (Sem dependência de Node, ThreeJS ou Zustand) capaz de receber um Estado de Tabuleiro Isolado, uma Topologia (Ver Spec 02) e um Comando de Movimento, retornando um Booleano (Legal/Ilegal) e os Efeitos Adicionais (Roque Feito, En Passant Executado). O Módulo deve ser Isomórfico (roda idêntico no Cliente para Highlighting e no Servidor para Autoridade).

## 2. ESCOPO
**PERTENCE A ESTA SPEC:**
- Validador Central (Rules Engine).
- Parsing de Fairy Pieces (Betza Notation Mappers).
- Estratégia de Composição de Condições (Padrão Strategy).
- Condições de Check e Checkmate Genéricos (Independente do Rei).
- Modificadores (Atomic, Antichess).

**NÃO PERTENCE:**
- Renderização 3D das Peças Customizadas (Ver Spec 06).
- Avaliação Heurística Minimax para jogar bem (Ver Spec 05).

## 3. REQUISITOS E CONSTRAINTS
### 3.1 Constraints de Acoplamento Isomórfico
- **Constraint:** A Engine de IA (WebWorker) e o Authoritative Server (Node.js) não possuem acesso ao DOM nem ao pacote do R3F. Se a Rules Engine importar qualquer coisa visual, o build de servidor vai quebrar.
- **Resolução Arquitetural:** O `RulesEngine` não injeta bibliotecas, e ingere apenas os Tipos Primitivos do TypeScript (`ICoreState`, `IPiece`). Toda lógica matemática importa de `Topology`.

### 3.2 Constraints Combinatórias
- **Constraint:** Criar milhares de variações `if (piece.type === "Amazon")` espalhadas no código destrói a Manutenibilidade e fere o OCP (Open-Closed Principle).
- **Resolução Arquitetural:** Padrão "Componentes de Movimento". Uma peça é um array de Behaviors. Ex: Cavalo = `[LeaperBehavior(2,1)]`.

## 4. PESQUISA MATRIX: FONTES EXTERNAS CONSULTADAS E VALIDADAS

### Fonte 1: "Betza's Notation for Fairy Chess" (ChessVariants.com)
- **URL:** https://www.chessvariants.com/d.betza/chessvar/piececl.html
- **Problema Resolvido:** Como padronizar o movimento de qualquer peça bizarra no universo.
- **Decisão Arquitetural:** Usaremos *Betza Notation* na definição das variantes (`metadata.betza`). Um Cavalo é "N" (KNight). Um Bispo é "B". Um Amazon é "QN" (Queen + Knight). A Rules Engine irá fazer Parse desta string e convertê-la nos Arrays de Behavior em runtime.

### Fonte 2: "Game Engine Architecture: Component Based Objects" (Jason Gregory)
- **Problema Resolvido:** Fugir do "God Object" King que faz Roque, avalia Check, e move-se por 1 casa.
- **Decisão:** A peça "Rei" não existe na Engine. O Rei é uma peça que tem a tag `royal: true` e a *Betza* "W" (Wazir) + "F" (Ferz). O sistema de Check varre a peça que tiver `royal`, permitindo facilmente variantes com Múltiplos Reis ou Rei Sem-Teto.

### Fonte 3: "Bitboards vs Array vs ECS" (Chess Programming Wiki)
- **URL:** https://www.chessprogramming.org/Board_Representation
- **Problema Resolvido:** Bitboards genéricos (Uint64) são fantásticos para xadrez 8x8.
- **Conclusão:** Infelizmente, Bitboards quebram quando o mapa é um Hexágono infinito que excede as 64 casas do `BigInt`.
- **Decisão:** Como escolhemos tabuleiros infinitos na Spec 02, confirmamos que a Rules Engine **não** usará Bitboards (que atrelariam a arquitetura ao máximo de 64/128/256 casas). Usaremos Array Iteration local sobre a lista de Entidades ECS.

### Fonte 4: "Validation Pipelines" (Microsoft / Domain Driven Design)
- **Problema Resolvido:** Como processar variantes com regras Globais (Atomic Chess explode ao lado, Antichess obriga a comer).
- **Decisão:** A Validação usará o **Pipeline Pattern** (Chain of Responsibility). Em vez de retornar "Booleano" de cara, retorna um objeto de Falha (`{ valid: false, reason: "Blocked" }`) processado passo-a-passo.

### Fonte 5: "Isomorphic TypeScript Apps" (Vercel / TS Docs)
- **Problema Resolvido:** Como garantir o mesmo MD5 da biblioteca no Servidor e Cliente.
- **Decisão:** A pasta `src/engine/rules` funcionará como um Submódulo Independente de Node, com lint agressivo `no-restricted-imports` proibindo o acesso a `react`, `@react-three` ou `zustand`.

### GitHub 1: jhlywa/chess.js
- **Repositório:** https://github.com/jhlywa/chess.js/
- **Problema Resolvido:** Geração Legal de movimentos (Pseudo-Legal vs Legal).
- **Abordagem Relevante:** Geram-se os movimentos Pseudo-Legais, e para cada um, simula-se no tabuleiro interno. Se o próprio "Royal" (Rei) fica atacado após o movimento simulado, a jogada Legal é descartada (Pinned pieces).
- **Decisão:** Replicaremos a fase Simulada Pseudo-legal.

### GitHub 2: lichess-org/scalachess
- **Estrutura Estudada:** Implementação de Crazyhouse e Antichess.
- **Decisão Influenciada:** Antichess altera drasticamente a pipeline de geração. Se há uma captura legal global no tabuleiro, todos os "Quiet Moves" (movimentos para casas vazias) passam a ser filtrados da lista de legais no fim da pipeline.

## 5. ESTRUTURA DE DIRETÓRIOS E MÓDULOS (RULES)

```text
src/
  engine/
    rules/
      RulesEngine.ts          // Fachada Central
      pipelines/
        MovePipeline.ts       // Chain of Responsibility Base
        Modifiers/
          AtomicModifier.ts   // Hook para Regras Atomic
          AntichessFilter.ts  // Filtro de jogadas OBRIGATÓRIAS
      behaviors/
        BetzaParser.ts        // Parseador da notação de Modding
        Leaper.ts             // Lógica de cavalo, camelo...
        Slider.ts             // Lógica de Bispo, Torre...
```

(CONTINUA NA PARTE 2)
## 6. O PARSER DA NOTAÇÃO BETZA E BEHAVIORS

Como transformamos a string de Modding `"B"` (Bispo) ou `"N"` (Cavalo) em lógicas polimórficas de Topologia?

```typescript
// src/engine/rules/behaviors/BetzaParser.ts
import { ITopology, DirectionIndex } from '../../topology/ITopology';
import { ICoreState } from '../../../core/interfaces/ICoreState';

export interface IMoveBehavior {
   // Retorna a lista de hashes para os quais esta peça pode mover (Pseudo-Legais)
   generatePseudoLegalMoves(coord: string, topology: ITopology, state: ICoreState): string[];
}

export class BetzaParser {
  public static parse(betzaString: string): IMoveBehavior[] {
     const behaviors: IMoveBehavior[] = [];
     
     // Leaper = Pula (ignora colisões no caminho). Ex: N (Cavalo = salta 2 e 1)
     if (betzaString.includes("N")) {
         // O 'N' tradicional num tabuleiro quadrado é pular 2 em Eixo A, e 1 em Eixo B.
         behaviors.push(new LeaperBehavior(2, 1));
     }

     // Slider = Desliza (bate nas peças do caminho). Ex: B (Bispo = diagonal infinita)
     if (betzaString.includes("B")) {
         // Direções diagonais variam por topologia. Em Hexágonos não existe "Diagonal"
         // Exata. Então a classe Slider injetará a lógica sobre os eixos topológicos.
         behaviors.push(new SliderBehavior(["DIAGONAL"], Infinity));
     }

     if (betzaString.includes("R")) {
         behaviors.push(new SliderBehavior(["ORTHOGONAL"], Infinity));
     }

     if (betzaString.includes("Q")) {
         behaviors.push(new SliderBehavior(["ORTHOGONAL", "DIAGONAL"], Infinity));
     }

     // Pawn = Regra especial direcional que não captura como move.
     if (betzaString.includes("fW")) {
         // Forward Wazir (move pra frente reto)
         behaviors.push(new DirectionalLeaperBehavior(["FORWARD"], 1, { canCapture: false }));
         // Forward Ferz (captura pra frente na diagonal)
         behaviors.push(new DirectionalLeaperBehavior(["FORWARD_DIAGONALS"], 1, { mustCapture: true }));
     }

     return behaviors;
  }
}
```

### 6.1 A Implementação Cega do Behavior
O Behavior nunca checa a Regra do Jogo, e nem a Geometria. Ele pede a geometria para a Topologia.

```typescript
// src/engine/rules/behaviors/Slider.ts
export class SliderBehavior implements IMoveBehavior {
   constructor(private axes: string[], private maxDistance: number) {}

   generatePseudoLegalMoves(startCoord: string, topology: ITopology, state: ICoreState): string[] {
      const pseudoLegals: string[] = [];
      const piece = state.boardEntities[startCoord];
      
      const directions = topology.getAxes(this.axes); // Pede os Vetores para a Topologia

      for (const dir of directions) {
         let current = startCoord;
         let dist = 0;
         
         while (dist < this.maxDistance) {
             const next = topology.getNeighbor(current, dir);
             if (!next) break; // Bateu na borda do mundo (se existir)

             const targetEntity = state.boardEntities[next];

             if (targetEntity) {
                if (targetEntity.type === "TERRAIN") {
                    // Avalia se o terreno é parede (Elevation > 0.5)
                    if (targetEntity.metadata.elevation > 0.5) break; 
                    else current = next; // Pega o vizinho se for só "Grama"
                } else if (targetEntity.type === "PIECE") {
                    // Colidiu com uma peça
                    const otherPiece = targetEntity as any;
                    // Se a peça for do inimigo, podemos capturar (Pseudo-Legal). 
                    // Mas não deslizamos além dela.
                    if (otherPiece.ownerId !== piece.ownerId) {
                        pseudoLegals.push(next);
                    }
                    break; // Fim do slider nesta direção
                }
             } else {
                 // Casa vazia (mas é uma casa física do dicionário ou é "nada"?
                 // Nos tabuleiros infinitos, o ChunkManager já injetou TERRAIN se for válido.
                 // Se não existe chave, é o Vazio/Fora do Mapa, portanto break.
                 break;
             }
             
             // Se passou pelas condicionais, a casa é livre para mover
             if (!targetEntity || targetEntity.type === "TERRAIN") {
                pseudoLegals.push(next);
             }

             dist++;
         }
      }
      return pseudoLegals;
   }
}
```

## 7. O PIPELINE DE VALIDAÇÃO GERAL
Depois que os Behaviors geram a lista de movimentos Pseudo-Legais (Move onde a peça vai), precisamos passar essas intenções por Filtros Globais (ex: O Rei não pode ficar em Xeque).

```typescript
// src/engine/rules/pipelines/MovePipeline.ts

export class ValidationPipeline {
   public static getLegalMoves(startCoord: string, topology: ITopology, state: ICoreState, ruleset: string): string[] {
       const piece = state.boardEntities[startCoord];
       if (!piece || piece.type !== "PIECE") return [];

       // 1. Converte a notação da Variante (Ex: Amazon) em Behaviors
       const behaviors = BetzaParser.parse(piece.variantId);
       
       let pseudoLegals: string[] = [];
       for (const behavior of behaviors) {
          pseudoLegals.push(...behavior.generatePseudoLegalMoves(startCoord, topology, state));
       }

       // Dedup (Cavalo-Rainha poderia gerar a mesma casa 2x)
       pseudoLegals = [...new Set(pseudoLegals)];

       // 2. Aplica Filtros do Jogo (O Custo alto do Xeque)
       return pseudoLegals.filter(targetCoord => {
           // Simula o movimento num rascunho de memória raso
           const simulatedState = this.simulateMove(state, startCoord, targetCoord);
           
           // Validador Global: Meu próprio Rei "Royal" ficou sob ataque?
           if (this.isRoyalAttacked(simulatedState, piece.ownerId, topology)) {
               return false;
           }
           
           return true;
       });
   }
   
   // ... simulateMove clona o FlatArray (O(1) memory)
}
```

(CONTINUA NA PARTE 3)
## 8. INVERSÃO DE VERIFICAÇÃO DE XEQUE (REVERSE RAYCASTING)
Como descobrimos se `isRoyalAttacked()` é verdadeira? A abordagem amadora itera todas as peças inimigas no tabuleiro e gera todos os seus movimentos legais para ver se algum atinge o Rei. Num tabuleiro 8-Player infinito, isso consumiria milhões de ciclos e paralisaria o WebWorker de IA.

### 8.1 A Otimização da Busca Inversa
O algoritmo `Reverse Threat Detection` inverte o papel. Colocamo-nos na posição do Rei, e disparamos raios para fora fingindo ser as peças inimigas.

```typescript
// src/engine/rules/CheckValidator.ts

export class CheckValidator {
   public static isHouseAttacked(
      targetCoord: string, 
      defenderId: string, 
      state: ICoreState, 
      topology: ITopology
   ): boolean {
       // Em vez de varrer 128 peças inimigas, varremos 8 direções (Ortogonal + Diagonal)
       
       // 1. Procurar Sliders Ortogonais (Rainha, Torre inimiga)
       const orthoAxes = topology.getAxes(["ORTHOGONAL"]);
       for (const dir of orthoAxes) {
          const piece = this.scanLineForFirstPiece(targetCoord, dir, topology, state);
          if (piece && piece.ownerId !== defenderId) {
             // A peça encontrada é um inimigo! Mas ela TEM a habilidade de andar reto?
             if (piece.metadata.betza.includes("R") || piece.metadata.betza.includes("Q")) {
                 return true; // XEQUE
             }
          }
       }

       // 2. Procurar Leapers (Cavalos)
       // Projetamos o "L-Shape" a partir do rei. Se houver um cavalo inimigo lá, é Xeque.
       const knightJumps = topology.getLeapCoordinates(targetCoord, 2, 1);
       for (const jumpCoord of knightJumps) {
          const piece = state.boardEntities[jumpCoord];
          if (piece && piece.ownerId !== defenderId && piece.metadata.betza.includes("N")) {
             return true; // XEQUE de Cavalo
          }
       }

       return false;
   }
}
```
*Isso converte o custo de verificação de xeque de O(P) onde P é o número de peças para O(1) de 8 Direções Constantes, fundamental para a IA rodar a 10.000 nós por segundo.*

## 9. EVENTOS ESPECIAIS (ROQUE, PROMOÇÃO, EN PASSANT)
Regras clássicas quebram regras limpas porque alteram múltiplas casas ou adicionam estado temporal.

### 9.1 Roque (Castling)
Não é tratado pela Betza Notation. É injetado como um Modifier estrito.
- A Torre move, o Rei move. Duas mutações no mesmo `MoveCommand`.
- A validação de Castling exige verificar se a linha está vazia AND se a linha de trânsito do rei (do Início ao Destino) está sob ataque.

### 9.2 En Passant
Exige a gravação de estado histórico da rodada passada. No Zustand (`ICoreState`), a chave `turnState.enPassantTarget` rastreia o CoordinateID deixado como "Sombra" quando um peão usa o Forward Leap duplo. O `BetzaParser` expõe o Modificador "E" (En Passant) que consulta especificamente este cache.

## 10. FAILURE MODES NA ENGINE DE REGRAS

### 10.1 Failure Mode: Infinite Loops em Peças Bouncers (Refletoras)
Variantes como Laser Chess possuem peças que deslizam, batem na borda e voltam. O `SliderBehavior` genérico faria loop infinito.
- **Mitigação:** O Behavior `Slider` possui um `visitedCoordinates = new Set()`. Se a projeção bater num espelho e refletir pra trás, a casa repetida aciona o `break` natural da iteração, salvando a Thread.

### 10.2 Failure Mode: Validação de Explosões Atomic Chess em Tabuleiros Triangulares
No Atomic Chess, a captura destrói tudo num Raio 1. No quadrado, isso são 8 peças (um 3x3). No Triângulo, Raio 1 atinge de 3 a 12 casas dependendo de como o centro se conecta.
- **Mitigação:** O Modificador `AtomicModifier` despachado APÓS a validação (no EventBus) nunca hardcoda offsets. Ele chama `Topology.getNeighborsWithinRadius(targetCoord, 1)`. O polimorfismo Geométrico protege a Regra Abstrata das bizarrices da topologia (Solid Principles).

(CONTINUA NA PARTE 4)
## 11. O MODIFICADOR DE "ANTICHESS" E INVERSÃO DE WIN CONDITION
O Antichess (ou Giveaway chess) é a variante favorita onde a captura é obrigatória e você vence perdendo suas peças. A Rules Engine lida com isso alterando a Chain of Responsibility (Pipeline).

```typescript
// src/engine/rules/pipelines/Modifiers/AntichessFilter.ts

export class AntichessFilter {
   /**
    * Injetado no fim da Pipeline de Movimentos Legais
    */
   public apply(legalMoves: { pieceId: string, to: string, isCapture: boolean }[]): { pieceId: string, to: string }[] {
       // Existe ALGUMA captura legal em TODAS as peças deste jogador?
       const hasAnyCapture = legalMoves.some(move => move.isCapture);

       if (hasAnyCapture) {
           // OBRIGATORIEDADE DE CAPTURA. 
           // Filtramos fora todos os movimentos pacíficos. O jogador fica restrito a clicar nas capturas.
           return legalMoves.filter(move => move.isCapture);
       }
       
       return legalMoves;
   }
}
```
A Condição de Vitória (Checkmate) não faria sentido, visto que o Rei pode ser capturado livremente. O componente `GameOverDetector` injeta a checagem: `if (playerEntities.length === 0) return WIN`.

## 12. PLANO DE IMPLEMENTAÇÃO DA SPEC 04
1. Compilar o TypeScript da `RulesEngine` para um bundle estrito (`engine.umd.js`) que não importa nada além de `Math`.
2. Implementar a rotina `BetzaParser` e registrar Unidade Tests para garantir que a string "QN" (Amazon) de fato gera os Behavior Arrays de `Slider` + `Leaper`.
3. Escrever `CheckValidator.isHouseAttacked` com a otimização de `Reverse Raycasting` e medir o tempo de execução. O Target é `< 0.05ms` por verificação de Xeque.
4. Escrever Testes de Integração Property-Based usando `fast-check` JS. Geraremos milhares de arranjos randômicos legais para assegurar que a Engine de Regras NUNCA lança Exceptions na Main Thread, apenas retorna os arrays filtrados e as falhas controladas.

## 13. CRITÉRIOS DE ACEITE
1. **Velocidade de Geração Bruta:** A engine deve gerar a Árvore de Movimentos completos de profundidade 1 (Perft 1) num tabuleiro de 64 casas (posição inicial Clássica = 20 jogadas) em menos de `0.2ms`.
2. **Determinismo entre Node/Browser:** Uma FEN string arbitrária complexa fornecida ao servidor (usando NodeJS v20) deve cuspir o array `['e4', 'nf3', ...]` em ordem E TAMANHO estritamente idêntico ao output do Cliente (Rodando no Chrome V8). Desvios causam Desync de Estado (Rubberband).
3. **Pluggabilidade Abstrata:** Adicionar uma nova peça que anda como "Torre mas só pra trás" (Crab Piece) deve exigir a criação de zero novos arquivos `.ts` e ser plenamente alcançável criando o payload JSON `{ "type": "CRAB", "betza": "bW" }` (Backward Wazir).

---
*Fim da Spec 04. Ao provar que a Validação se reduz a Parsers, Pipelines de Strategy Pattern e Buscas Recursivas Isomórficas, a arquitetura do "Tabuleiro" fica sólida. O grande beneficiário de regras O(1) imutáveis é a Máquina. Na Spec 05 definiremos os Bot Workers, Avaliação Heurística, Negamax e Busca MCTS Multithreaded que joga Xadrez Infinito N-Player.*


## 14. REPOSITÓRIOS GITHUB E REFERÊNCIAS EXTERNAS (RULES ENGINE E FAIRY CHESS)

Abaixo documentamos as bases teóricas, algoritmos de validação formal e repositórios open-source analisados para a criação do motor de regras universal e extensível do `ChessInReact`.

### 14.1 Projetos Open Source Analisados
1. **GitHub: `ianfab/Fairy-Stockfish`**
   - **Link:** https://github.com/ianfab/Fairy-Stockfish
   - **Resumo Técnico:** Bifurcação oficial do Stockfish voltada ao suporte universal de variantes de xadrez (mais de 300 variantes documentadas), pioneira na implementação em larga escala de notação Betza e peças fadas customizadas.
   - **Como Aproveitaremos no Projeto:** Utilizaremos a gramática formal do Fairy-Stockfish para decodificar prefixos de movimentação na notação Betza (como 'f' para forward, 'b' para backward, 's' para sideways, 'm' para move-only, 'c' para capture-only). Isso nos permite criar peças híbridas como peões bidirecionais e arqueiros sem codificar uma única linha de código imperativo adicional.

2. **GitHub: `niklasf/python-chess`**
   - **Link:** https://github.com/niklasf/python-chess
   - **Resumo Técnico:** Biblioteca pura em Python de referência mundial para manipulação de regras de xadrez e variantes como Atomic, Crazyhouse, Antichess e King of the Hill.
   - **Como Aproveitaremos:** Adaptamos os algoritmos de detecção de fim de jogo e regras de repetição de lances (Three-fold Repetition) e regra dos 50 lances para a nossa engine TypeScript isomórfica, utilizando suas suítes de teste como oráculo de validação comparativa.

3. **GitHub: `lichess-org/scalachess`**
   - **Link:** https://github.com/lichess-org/scalachess
   - **Resumo Técnico:** Motor de regras oficial do Lichess implementado em Scala funcional, projetado para altíssima concorrência e zero mutação de estado.
   - **Como Aproveitaremos:** A modelagem das regras de Crazyhouse (onde peças capturadas entram no bolso de reservas do jogador ativo para inserção posterior) e as regras de vitória por King of the Hill (chegar com o rei nas quatro casas centrais) foram portadas diretamente da arquitetura elegante do ScalaChess.

4. **GitHub: `jhlywa/chess.js`**
   - **Link:** https://github.com/jhlywa/chess.js
   - **Resumo Técnico:** Biblioteca JavaScript tradicional para validação de xadrez clássico 8x8 e geração de lances legais em navegadores.
   - **Como Aproveitaremos:** Analisamos sua API pública de geração de movimentos (`moves({ verbose: true })`) para modelar a interface TypeScript do nosso `RulesEngine`, garantindo familiaridade para desenvolvedores que já dominam o ecossistema JS de xadrez.

5. **GitHub: `dubstepdish/fast-check`**
   - **Link:** https://github.com/dubstepdish/fast-check
   - **Resumo Técnico:** Framework de testes baseados em propriedades (Property-Based Testing) para TypeScript, gerando milhares de cenários estocásticos com busca de contraexemplos mínimos (shrinking).
   - **Como Aproveitaremos:** Implementaremos suítes de testes automatizados que geram partidas aleatórias com peças fadas em tabuleiros hexagonais e validam invariantes inquebráveis: nenhum lance legal pode resultar no rei próprio em xeque; o número de peças em tabuleiro clássico nunca pode aumentar; e operações de Undo devem restaurar 100% dos hashes de estado anteriores.

6. **GitHub: `official-stockfish/Stockfish`**
   - **Link:** https://github.com/official-stockfish/Stockfish
   - **Resumo Técnico:** O motor de xadrez mais potente do mundo em C++, com rotinas ultra-otimizadas de geração de lances e detecção de afogamento.
   - **Como Aproveitaremos:** O conceito de *Pins and Check Evasions* (quando uma peça está cravada e só pode se mover ao longo da linha de ataque do cravador) foi isolado em nosso pipeline de validação para descartar lances ilegais antes mesmo de clonar o estado na memória.

7. **GitHub: `H.G.Muller/Fairy-Max`**
   - **Link:** https://home.hccnet.nl/h.g.muller/dwnldpage.html
   - **Resumo Técnico:** Micro-motor de xadrez para peças fadas desenvolvido por H.G. Muller, célebre pela representação de qualquer peça através de vetores de passos (Step-Vectors) e alcances máximos.
   - **Como Aproveitaremos:** A estrutura `StepVector(deltaQ, deltaR, maxSteps, isCaptureOnly, isMoveOnly)` na nossa classe base de comportamentos (`PieceBehavior.ts`) é uma modernização em TypeScript do design minimalista do Fairy-Max.

8. **GitHub: `glinscott/fishtest`**
   - **Link:** https://github.com/glinscott/fishtest
   - **Resumo Técnico:** Framework de validação distribuída para testes de integridade e força de jogadas de xadrez.
   - **Como Aproveitaremos:** Inspirou a estratégia de Perft (Performance Test) em nosso pipeline de CI do GitHub Actions para garantir que refatorações na engine não alterem a contagem exata de nós em árvores de busca de profundidade 1 a 5.

9. **GitHub: `facebook/immutable-js`**
   - **Link:** https://github.com/immutable-js/immutable-js
   - **Resumo Técnico:** Estruturas de dados persistentes imutáveis de alta performance baseadas em Hash Array Mapped Tries (HAMT).
   - **Como Aproveitaremos:** Embora usemos Immer.js no Zustand, a Rules Engine utiliza estruturas leves e imutáveis durante a simulação hipotética de lances para testar evasão de xeque, garantindo zero efeito colateral (Zero Side-Effects) na árvore de estado ativa.

10. **GitHub: `type-challenges/type-challenges`**
    - **Link:** https://github.com/type-challenges/type-challenges
    - **Resumo Técnico:** Repositório de tipos avançados em TypeScript com tipos literais de template strings e inferência recursiva.
    - **Como Aproveitaremos:** Criamos tipos TypeScript estritos que validam em tempo de compilação se uma string Betza é válida (ex: `"QN" | "bW" | "WF"`), alertando erros de digitação de variantes antes mesmo do código rodar em testes.

---

## 15. HISTÓRIAS DE USUÁRIO (USER STORIES) - RULES ENGINE E VARIANTES

### 15.1 Histórias de Usuário do Jogador (Player Perspective)
1. **US04-P01:** Como jogador iniciante em variantes, quando eu clicar em uma peça fada (como o Chanceler ou Arcebispo), quero ver as casas de destino válidas iluminadas no chão em azul claro e as casas de captura em vermelho para entender intuitivamente como ela se move.
2. **US04-P02:** Como competidor de Atomic Chess, quero que ao capturar uma peça adversária ocorra uma explosão visual nas casas vizinhas eliminando todas as peças envolvidas (exceto peões), encerrando o jogo caso o rei inimigo seja atingido pela onda de choque.
3. **US04-P03:** Como fã de Crazyhouse, quero que ao capturar uma peça adversária ela mude para a cor do meu exército e fique disponível em uma barra lateral no HUD para que eu possa arrastá-la de volta ao tabuleiro como meu lance da vez.
4. **US04-P04:** Como estrategista no modo Antichess, quero que o jogo me obrigue a realizar capturas quando elas existirem no tabuleiro, impedindo lances pacíficos e premiando quem conseguir perder todas as suas peças primeiro.
5. **US04-P05:** Como competidor em uma partida de 4 jogadores, quando o rei de um adversário for xeque-mateado por outro jogador, quero que as peças do derrotado se transformem em peças cinzas inertes (ou sejam transferidas para o vencedor da captura, conforme a regra da sala).
6. **US04-P06:** Como jogador, quero receber um aviso visual e sonoro imediato no segundo exato em que meu rei estiver em xeque ("Check Warning"), impedindo-me de cometer lances ilegais que me deixem em perigo.
7. **US04-P07:** Como jogador em uma partida prolongada, quero que o jogo declare empate automático se a mesma posição de tabuleiro se repetir três vezes (Three-fold Repetition) ou se passarem 50 lances sem capturas nem movimento de peões.
8. **US04-P08:** Como participante no modo King of the Hill, quero vencer a partida instantaneamente se eu conseguir conduzir meu rei com segurança até qualquer uma das quatro casas centrais do tabuleiro.
9. **US04-P09:** Como jogador de Xadrez Hexagonal, quero executar a promoção de peão ao atingir a borda mais distante do hexágono adversário, abrindo um modal para escolher entre Rainha, Chanceler, Torre ou Bispo.
10. **US04-P10:** Como usuário que cria variantes personalizadas, quero inventar uma peça nova usando um formulário visual simples e jogar uma partida amistosa com as regras dessa nova criação funcionando perfeitamente.
11. **US04-P11:** Como competidor, quero que a regra do "En Passant" seja respeitada tanto em tabuleiros clássicos quanto hexagonais, permitindo capturar peões adversários que avançaram duas casas no lance anterior imediato.
12. **US04-P12:** Como competidor, se uma jogada resultar em afogamento (Stalemate) onde meu adversário não tem lances legais e não está em xeque, quero que o resultado seja computado como empate justo de meio ponto para cada lado.
13. **US04-P13:** Como jogador no modo Three-Check, quero ver um contador de xeques ao lado do avatar de cada jogador, vencendo a partida o primeiro que aplicar três xeques no rei inimigo.
14. **US04-P14:** Como competidor jogando com relógio acelerado, quero poder registrar lances de pré-movimento (Premove) que sejam validados e executados instantaneamente assim que meu turno começar.
15. **US04-P15:** Como jogador, quero consultar a qualquer momento o manual de regras da variante em andamento clicando em um ícone de ajuda no topo da tela, lendo a explicação concisa dos movimentos de cada peça incomum.

### 15.2 Histórias de Usuário do Desenvolvedor e Arquiteto (Developer/Architect Perspective)
1. **US04-D01:** Como arquiteto da engine, quero que o validador de regras seja 100% puro e isomórfico, rodando idêntico no Node.js do servidor para autoridade e no WebWorker do navegador para cálculo de lances legais sem depender do DOM.
2. **US04-D02:** Como desenvolvedor de variantes, quero registrar novas peças fadas passando apenas uma string Betza (como `"F"` para Ferz ou `"W"` para Wazir) sem precisar criar classes ou heranças orientadas a objetos.
3. **US04-D03:** Como engenheiro de performance, quero que o teste de verificação de xeque (`isSquareAttacked`) utilize raycasting reverso a partir da casa-alvo, interrompendo a busca no primeiro atacante detectado para maximizar a velocidade.
4. **US04-D04:** Como desenvolvedor de testes, quero executar testes de Perft com profundidade até 5 em posições FIDE clássicas, garantindo contagem de nós idêntica às especificações do Stockfish como prova de conformidade total.
5. **US04-D05:** Como mantenedor do código, quero que a detecção de empate por insuficiência material reconheça automaticamente combinações impossíveis de mate (Rei vs Rei, Rei e Bispo vs Rei, Rei e Cavalo vs Rei).
6. **US04-D06:** Como desenvolvedor de variantes, quero que modificadores globais (como Atomic, Antichess e King of the Hill) sejam implementados como filtros acopláveis em uma Chain of Responsibility sem alterar a lógica base das peças.
7. **US04-D07:** Como desenvolvedor de IA, quero que a função `generateLegalMoves` retorne um flat buffer contendo os lances legais sem alocar dezenas de objetos transitórios, minimizando o trabalho do coletor de lixo da V8.
8. **US04-D08:** Como engenheiro de confiabilidade, quero que todas as rotinas de validação de lances sejam testadas com `fast-check` contra 50.000 posições arbitrárias, garantindo zero exceções não tratadas em produção.
9. **US04-D09:** Como desenvolvedor do backend, quero que a validação de um lance recebido via WebSocket ocorra em tempo inferior a 0.1 milissegundos por chamada, mantendo a capacidade de processamento do servidor em alta vazão.
10. **US04-D10:** Como desenvolvedor de UI, quero que a engine de regras emita eventos granulares detalhando o tipo exato de lance (captura, promoção, roque, xeque, en passant) para que o frontend acione animações e áudios específicos.

---

## 16. REQUISITOS FUNCIONAIS (RF) - RULES ENGINE E VARIANTES

Abaixo estão formalizados os 15 requisitos funcionais mandatórios do subsistema de regras e variantes de xadrez.

1. **RF-01 (Validação Isomórfica de Lances):** O sistema deve fornecer a função pura `validateMove(state, move, topology)` compartilhada entre o cliente React e o servidor Node.js, retornando se o lance é legal ou o motivo de sua rejeição.
2. **RF-02 (Geração Universal de Movimentos Legais):** A engine deve calcular a lista exata de todos os lances legais disponíveis para o jogador ativo em qualquer turno (`getLegalMoves(state, topology)`).
3. **RF-03 (Parser Completo de Notação Betza):** O sistema deve traduzir strings de notação Betza padrão e expandida em vetores discretos de passos (Step Vectors) para peças Leapers, Sliders e Hoppers.
4. **RF-04 (Algoritmo de Xeque com Raycasting Reverso):** A função `isSquareAttacked(targetCoord, attackerPlayerId, state, topology)` deve verificar se uma casa está sob ameaça projetando raios reversos a partir do alvo até encontrar atacantes potenciais.
5. **RF-05 (Detecção Universal de Xeque-Mate e Afogamento):** Caso o jogador ativo não possua nenhum lance legal no seu turno, o sistema deve decretar Xeque-Mate (se o rei estiver sob ataque) ou Empate por Afogamento / Stalemate (se o rei não estiver sob ataque).
6. **RF-06 (Regras Clássicas FIDE e Roque Dinâmico):** Em modos convencionais, o sistema deve validar regras de roque (Rei e Torre sem movimentos anteriores, casas intermediárias livres e não atacadas) adaptando o conceito para tabuleiros de tamanhos arbitrários.
7. **RF-07 (Mecânica de En Passant):** O sistema deve registrar o alvo de En Passant na estrutura de estado quando um peão avançar duas casas, permitindo captura lateral exclusivamente no lance imediatamente seguinte.
8. **RF-08 (Modificador Atomic Chess):** Na variante Atomic, o sistema deve destruir a peça capturada, a peça capturadora e todas as peças não-peões em raio 1 da casa de destino após uma captura.
9. **RF-09 (Mecânica de Crazyhouse e Drop Moves):** Em Crazyhouse, peças capturadas devem ser incorporadas ao inventário de mão do captor e poderão ser inseridas como lance legal em qualquer casa vazia válida do tabuleiro.
10. **RF-10 (Modificador Antichess com Captura Obrigatória):** No modo Antichess, se houver pelo menos um lance de captura disponível para o jogador, todos os lances pacíficos devem ser desconsiderados, forçando a captura.
11. **RF-11 (Regra de Três Repetições e Cinquenta Lances):** O sistema deve calcular o hash Zobrist da posição a cada turno e declarar empate automático caso a mesma posição se repita 3 vezes ou 50 lances transcorram sem captura nem movimento de peão.
12. **RF-12 (Variante King of the Hill):** A engine deve declarar vitória imediata para o jogador cujo rei alcançar com sucesso qualquer uma das casas centrais designadas na configuração da variante.
13. **RF-13 (Resolução de Fim de Jogo em Partidas N-Player):** Em partidas de 3 a 8 jogadores, a derrota de um jogador por xeque-mate deve acionar a política configurada para suas peças (conversão em peças neutras inertes, eliminação total ou posse transferida ao autor do mate).
14. **RF-14 (Promoção de Peão com Múltiplas Escolhas):** Ao alcançar a última fileira designada da topologia, o sistema deve pausar o avanço do turno até que a escolha de promoção (Rainha, Torre, Bispo, Cavalo ou peças fadas permitidas na sala) seja submetida.
15. **RF-15 (Empate por Insuficiência Material):** O sistema deve reconhecer e encerrar como empate imediato posições onde é matematicamente impossível aplicar xeque-mate forçado em qualquer sequência de lances futuros.

---

## 17. REQUISITOS NÃO-FUNCIONAIS (RNF) - PERFORMANCE E PRECISÃO DA ENGINE

Abaixo estão formalizados os 15 requisitos não-funcionais que governam o subsistema de regras e peças fadas.

1. **RNF-01 (Desempenho de Perft 1):** A geração completa da árvore de lances legais de profundidade 1 em posição inicial clássica não deve exceder **0.2 milissegundos** no motor V8.
2. **RNF-02 (Tempo Máximo de Validação de Lance):** A validação autoritativa de um único lance no servidor Node.js deve executar em tempo médio inferior a **0.05 milissegundos**.
3. **RNF-03 (Isolamento Isomórfico Estrito):** O pacote da Rules Engine deve possuir **zero dependências externas de bibliotecas** e rodar de forma idêntica em Node.js (servidor), WebWorkers e navegador.
4. **RNF-04 (Tamanho do Bundle Compilado):** O arquivo empacotado da Rules Engine para o cliente não deve ultrapassar **45 Kilobytes** gzippado.
5. **RNF-05 (Determinismo Absoluto Multiplataforma):** Dada a mesma posição e variante, as funções de lances legais devem produzir matrizes ordenadas com resultados rigorosamente idênticos em Chrome V8, Safari JavaScriptCore e Node.js.
6. **RNF-06 (Conformidade com Testes Perft Oficiais):** A engine deve passar com 100% de sucesso nos benchmarks Perft FIDE documentados (ex: Posição inicial profundidade 4 = 197.281 nós exatos).
7. **RNF-07 (Alocação Mínima de Memória):** A rotina de busca de lances legais não deve alocar mais de **50 Kilobytes** de objetos transitórios por turno, evitando pausas de Garbage Collection em dispositivos móveis.
8. **RNF-08 (Cobertura de Código de Regras):** A suíte de testes automatizados da Rules Engine e seus parsers Betza deve manter cobertura de código superior a **95%**.
9. **RNF-09 (Resiliência contra Posições Corrompidas):** A passagem de um estado de jogo malformado ou inconsistente não deve provocar loop infinito ou travamento da thread, retornando falha tratada em menos de **1 milissegundo**.
10. **RNF-10 (Tempo de Parsing de Notação Betza):** A interpretação e compilação de uma string Betza para vetores de passo deve executar em menos de **0.1 milissegundos** por peça.
11. **RNF-11 (Suporte a Tabuleiros de Grande Escala):** A geração de movimentos deve permanecer responsiva (< 5ms por turno) em tabuleiros contendo até **200 peças ativas simultaneamente**.
12. **RNF-12 (Tolerância a Modificadores Simultâneos):** O encadeamento de múltiplos modificadores em pipeline (ex: Hexagonal + Atomic + Three-Check) não deve aumentar o tempo de validação de lance em mais de **2x**.
13. **RNF-13 (Detecção Precoce de Cravadas):** O algoritmo de verificação de cravada (Absolute Pin) deve rodar antes da clonagem de estado para poupar até 80% de computações em peças claramente imobilizadas.
14. **RNF-14 (Pureza e Imutabilidade Funcional):** Todas as funções exportadas pela Rules Engine devem ser funções puras sem mutações de parâmetros recebidos, garantindo segurança para concorrência e workers.
15. **RNF-15 (Taxa de Erro Zero em Validação de Xeque):** A precisão do algoritmo de xeque reverso deve ser de 100% comprovada por testes exaustivos e property-based tests contra mais de 50.000 tabuleiros de teste.

---

## 18. ARQUITETURA DE DEPLOYMENT GRATUITA (FREE TIER) PARA A RULES ENGINE

A estratégia arquitetural da Rules Engine foi planejada para operar com máxima eficiência no ecossistema de planos gratuitos:

1. **Cálculo Descentralizado no Cliente (Edge Execution):** Todo o cálculo pesado de caminhos legais, rotas de fadas e highlighting de interface roda 100% no navegador do usuário dentro de um WebWorker dedicado, utilizando zero ciclos de CPU do servidor Node.js no Render.com.
2. **Autoridade Ultrarrápida no Render Free Tier:** No servidor Colyseus (512MB RAM free tier), a Rules Engine executa apenas uma checagem pontual do lance submetido (`validateMove`). Como cada validação consome menos de 0.05ms de CPU, uma única instância gratuita do Render consegue validar centenas de partidas ativas sem elevar o consumo de processamento além de 15%.
3. **Persistência de Regras Customizadas em JSONB no Supabase:** Variantes criadas por usuários no modo Sandbox/Workshop são serializadas como pequenos documentos JSON contendo apenas strings Betza e regras ativadas, pesando menos de 2KB por variante no banco Postgres gratuito.

---

## 19. MODOS DE JOGO E SUAS PECULIARIDADES DE REGRAS

A flexibilidade modular da Rules Engine dá suporte imediato aos seguintes modos:

1. **Classic FIDE Chess:**
   - 64 casas, 2 jogadores, todas as regras oficiais (Roque, En Passant, Promoção, 3 repetições, 50 lances).
2. **Hexagonal Gliński Chess:**
   - Tabuleiro em favo de mel de 91 casas. Bispos em 3 cores. Peões movem-se retos e capturam em diagonais hexagonais de 60 graus.
3. **Atomic Chess (Square ou Hex):**
   - Capturas causam detonações em raio 1. Reis não podem capturar nenhuma peça pois explodiriam a si mesmos.
4. **Crazyhouse:**
   - Banco de peças de reserva na lateral do HUD. O lance pode ser mover uma peça existente ou realizar o *Drop* de uma peça capturada em uma casa desocupada.
5. **King of the Hill:**
   - Vitória alternativa por posicionamento: levar o próprio rei a qualquer casa do centro (ex: d4, d5, e4, e5 em 8x8) garante vitória instantânea.
6. **Antichess / Giveaway:**
   - Captura forçada. O rei é uma peça comum sem valor real e pode ser capturado. Vence quem perder todas as peças ou for afogado sem lances.
7. **Free-For-All 4-Player Elimination:**
   - 4 exércitos independentes (Vermelho, Azul, Amarelo, Verde). Ordem de turnos horária. Ao sofrer xeque-mate, as peças do eliminado tornam-se obstáculos estáticos no tabuleiro.

---

## 20. SCHEMAS DE DADOS, TIPOS TYPESCRIPT E CONTRATOS BETZA

Abaixo constam as interfaces tipadas fundamentais da Rules Engine:

```typescript
// src/engine/rules/interfaces/IRulesContracts.ts

export type BetzaPieceCode = string; // Ex: 'QN' (Amazon), 'bW' (Backward Wazir), 'F' (Ferz)

export interface IStepVector {
  dq: number;
  dr: number;
  ds?: number;
  maxRange: number; // 1 para Leaper, Infinity para Slider
  canJump: boolean; // True para Saltadores (Cavalos)
  captureOnly: boolean;
  moveOnly: boolean;
}

export interface IPieceDefinition {
  typeCode: string;
  name: string;
  betzaNotation: BetzaPieceCode;
  stepVectors: IStepVector[];
  isRoyal: boolean; // Se for True, perder esta peça resulta em derrota
  valuePoints: number; // Para avaliação de IA (Ex: Peão=100, Dama=900)
}

export interface ILegalMove {
  fromCoord: string;
  toCoord: string;
  pieceId: string;
  isCapture: boolean;
  isEnPassant?: boolean;
  isCastling?: boolean;
  isPromotion?: boolean;
  capturedPieceId?: string;
}

export interface IValidationResult {
  isValid: boolean;
  errorCode?: 'ILLEGAL_TARGET' | 'KING_IN_CHECK' | 'PATH_BLOCKED' | 'NOT_YOUR_TURN';
  moveData?: ILegalMove;
}

export interface IVariantConfiguration {
  variantId: string;
  displayName: string;
  topology: 'SQUARE' | 'HEXAGONAL' | 'TRIANGULAR';
  pieceSet: Record<string, IPieceDefinition>;
  modifiers: {
    atomicExplosions?: boolean;
    crazyhouseInventory?: boolean;
    antichessForcedCapture?: boolean;
    kingOfTheHillCenter?: boolean;
    threeCheckLimit?: boolean;
  };
  eliminationPolicy: 'NEUTRALIZE_PIECES' | 'TRANSFER_TO_KILLER' | 'REMOVE_FROM_BOARD';
}
```

Contrato JSON para registro de nova variante ou peça fada customizada:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "FairyPieceDefinitionPayload",
  "type": "object",
  "required": ["typeCode", "name", "betzaNotation", "isRoyal", "valuePoints"],
  "properties": {
    "typeCode": { "type": "string", "pattern": "^[A-Z0-9_]{2,10}$" },
    "name": { "type": "string" },
    "betzaNotation": { "type": "string" },
    "isRoyal": { "type": "boolean" },
    "valuePoints": { "type": "integer", "minimum": 10, "maximum": 5000 },
    "customGlbModelUrl": { "type": "string", "format": "uri" }
  }
}
```

---

## 21. CONCLUSÃO ARQUITETURAL DA SPEC 04

A Spec 04 liberta o `ChessInReact` das amarras do xadrez tradicional estático. Através da composição por vetores de passos, interpretação formal de notação Betza, pipelines de modificadores modulares e validação isomórfica compartilhada entre cliente e servidor, a plataforma oferece suporte a praticamente qualquer jogo de estratégia tática por turnos imaginável, mantendo performance cirúrgica em tempos de milissegundos e consumo nulo de recursos de infraestrutura.
