# Spec 11: Ecossistema de Bots, Progressão de Rating e Aprendizado Adaptativo (Zero-Server Cost)

## A. OBRIGAÇÃO DE DENSIDADE E ABORDAGEM
Enquanto a Spec 05 estabeleceu os algoritmos fundamentais de IA (MCTS, Max-N e Stockfish WASM) e a Spec 08 desenhou o pareamento entre humanos, a **Spec 11** projeta a espinha dorsal de um ecossistema completo de jogo PVE (Player vs Environment) inspirado na popular arena de bots do Chess.com, mas com uma inovação arquitetural profunda: **Bots Adaptativos Evolutivos que aprendem com seus próprios erros e com os hábitos do jogador humano em tempo real, sem nenhum custo de servidores de inferência**.

A maioria das plataformas de xadrez oferece bots estáticos cuja única diferença é um limitador arbitrário de profundidade de busca (`depth`) ou uma taxa artificial de lances errôneos (`blunder injection`). No `ChessInReact`, introduzimos uma hierarquia de bots com ratings calibrados desde o rating zero absoluto até 2200+, onde uma categoria de bots permanece estática para servir como benchmark de habilidade, enquanto outra categoria (**Adaptive Evolutionary Bots**) atualiza memórias de erros, livros de aberturas e pesos heurísticos locais diretamente no navegador do usuário via IndexedDB e WebWorkers.

---

## 1. OBJETIVO DO SUBSISTEMA DE BOTS E ADAPTAÇÃO
1. **Escalada Competitiva PVE:** Prover uma jornada de progressão contínua onde o jogador inicia enfrentando bots fracos (Ratings 0 a 500), sobe gradualmente de rating, e desbloqueia novos desafios até alcançar bots de nível mestre (2000 a 2200+).
2. **Aprendizado Contínuo a Custo Zero ($0/mês):** Permitir que bots adaptativos aprendam com derrotas passadas através de três pilares: Mutação de Livro de Aberturas (Opening Book Mutation), Tabela de Memória de Gafes (Blunder Memory Cache) e Ajuste Fino de Pesos Heurísticos/NNUE, executados 100% no dispositivo do jogador sem servidores caros de aprendizado por reforço.
3. **Calibração Rigorosa de Rating:** Garantir que cada bot possua comportamento condizente com seu ELO nominal (ex: o Bot 300 comete gafes primárias de pendurar peças sem proteção, enquanto o Bot 1700 calcula táticas de 3 lances e domina finais básicos).

---

## 2. ESCOPO
**PERTENCE A ESTA SPEC:**
- Ladder completa de bots com ratings nominais: 0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1600, 1700, 1800, 1900, 2000, 2200+.
- Arquitetura de aprendizado adaptativo local baseada em IndexedDB (`dexie.js`) e WebWorkers.
- Algoritmo de Blunder Injection probabilístico calibrado por rating.
- Sistema de mutação de pesos de árvores de abertura (Dynamic Opening Book Polyglot).
- Memória de Nemesis (perfilagem das fraquezas e preferências do jogador humano).
- Sistema de Glicko-2 individualizado para bots adaptativos (ratings que evoluem conforme o bot melhora).
- Interface de seleção de bots, avatares expressivos e diálogos de personalidade antes e após as partidas.

**NÃO PERTENCE:**
- Regras universais de validação de lances de xadrez (Ver Spec 04).
- Renderização 3D das malhas de peças e tabuleiro (Ver Spec 07).
- Persistência global em nuvem relacional PostgreSQL (Ver Spec 09).

---

## 3. REQUISITOS E CONSTRAINTS ARQUITETURAIS

### 3.1 Constraint de Custo de Computação ($0 Cloud Compute)
- **Constraint:** Treinar modelos de aprendizado por reforço (Reinforcement Learning) em nuvem como AlphaZero ou KataGo exige clusters de GPUs custando milhares de dólares por mês, inviabilizando o requisito mandatório de $0 de custo de infraestrutura.
- **Resolução Arquitetural:** O aprendizado adaptativo do `ChessInReact` é **Estritamente Client-Side e Baseado em Heurística Diferencial**. O bot não treina uma rede neural convolucional gigante do zero. Ele utiliza:
  1. *Punishing Tables:* Gravação dos hashes Zobrist das posições que causaram sua derrota recente, atribuindo peso negativo extremo ao lance causador da gafe.
  2. *Opening Book Weighting:* Ajuste probabilístico das linhas de abertura no IndexedDB local do navegador.
  3. *Micro-SGD no WebWorker:* Micro-ajustes de gradiente estocástico em uma camada densa superficial de pesos posicionais rodando no tempo ocioso pós-partida.

### 3.2 Constraint de Latência de Resposta do Bot (< 1.500ms)
- **Constraint:** Em níveis altos (Rating 2000+), cálculos profundos de árvore podem demorar vários segundos, degradando a experiência do usuário que busca uma partida dinâmica e sem esperas monótonas.
- **Resolução Arquitetural:** Adotamos um orçamento de tempo dinâmico (`Time Budget`). O bot calcula continuamente no WebWorker e interrompe a busca instantaneamente assim que atinge a profundidade alvo daquele rating ou quando o cronômetro atinge o teto de 1.200ms, retornando o melhor lance encontrado até o momento com base na ordenação pré-ordenada (Principal Variation Move).

### 3.3 Constraint de Humanização dos Níveis Baixos (Anti-Robot Feel)
- **Constraint:** Reduzir a força de um motor clássico simplesmente cortando a profundidade para 1 lance faz o bot jogar de forma bizarra: ele joga 9 lances perfeitos de mestre e no 10º lance comete um erro absurdo inexplicável.
- **Resolução Arquitetural:** Implementamos o modelo de **Blunder Probabilístico Contínuo** inspirado no projeto *Maia Chess*. Em ratings baixos (100 a 700), o bot avalia os lances candidatos com ruído gaussiano adicionado à avaliação e com limitação proposital de alcance visual (Cegueira tática de casas desprotegidas), reproduzindo com fidelidade a forma como iniciantes humanos realmente jogam.

---

## 4. PESQUISA MATRIX: FONTES EXTERNAS E PROJETOS GITHUB VALIDADOS

Abaixo documentamos as 15 referências técnicas e projetos de código aberto analisados para sustentar a criação da ladder de bots e a arquitetura de aprendizado:

### 4.1 Projetos Open Source Analisados
1. **GitHub: `CSSLab/maia-chess`**
   - **Link:** https://github.com/CSSLab/maia-chess
   - **Resumo Técnico:** Rede neural de código aberto treinada especificamente em milhões de partidas humanas para prever o lance que um humano de rating 1100, 1500 ou 1900 jogaria, em vez de buscar a melhor jogada absoluta da máquina.
   - **Como Aproveitaremos no Projeto:** O modelo conceitual do Maia fundamenta nossa modelagem de distribuição de erros. Extraímos a curva probabilística de gafes por faixa de rating (ex: taxa de erro de pendurar peças cai 12% a cada 200 pontos de ELO), servindo de base para o nosso algoritmo de perturbação de lances.

2. **GitHub: `official-stockfish/Stockfish` (Módulo UCI Skill Level & LimitStrength)**
   - **Link:** https://github.com/official-stockfish/Stockfish
   - **Resumo Técnico:** Implementação oficial dos parâmetros `UCI_LimitStrength` e `UCI_Elo` no Stockfish clássico, que utiliza cálculo de erro ponderado sobre a busca minimax para simular ratings entre 1320 e 3190 ELO.
   - **Como Aproveitaremos:** Adaptamos os algoritmos de mapeamento de tempo de reflexão e podas seletivas do Stockfish para os nossos bots de níveis intermediários e avançados (Ratings 1200 a 2200).

3. **GitHub: `dexie/Dexie.js`**
   - **Link:** https://github.com/dexie/Dexie.js
   - **Resumo Técnico:** Biblioteca minimalista e tipada em TypeScript para abstração de alta velocidade sobre a API IndexedDB dos navegadores.
   - **Como Aproveitaremos:** O `Dexie.js` é o motor de persistência do aprendizado adaptativo local. As memórias de erros dos bots, as árvores de aberturas modificadas e os históricos de partidas contra o jogador são armazenados em tabelas locais no navegador, com consultas indexadas por chave primária composta em menos de 1ms e custo zero de tráfego de nuvem.

4. **GitHub: `asdfjkl/neural-chessboard` / NNUE Research**
   - **Link:** https://github.com/asdfjkl/neural-chessboard
   - **Resumo Técnico:** Implementação pedagógica de redes neurais NNUE (Efficiently Updatable Neural Network) com transformações afins incrementais em JavaScript e WebAssembly.
   - **Como Aproveitaremos:** O bot adaptativo de topo de ladder (Rating 2200) utiliza uma arquitetura NNUE simplificada (Feature Transformer de 768 entradas x 128 neurônios). Ao final de uma derrota para o jogador humano, o WebWorker executa 10 épocas de ajuste fino (Fine-Tuning) nos pesos dos nós associados às casas de ruptura da partida.

5. **GitHub: `niklasf/python-chess` (Módulo Polyglot Opening Book)**
   - **Link:** https://github.com/niklasf/python-chess
   - **Resumo Técnico:** Biblioteca com parser e gerador de arquivos binários Polyglot (.bin) contendo livros de aberturas estruturados como grafos direcionados com pesos de probabilidade de transição por lance.
   - **Como Aproveitaremos:** Construímos um leitor e mutador de livros Polyglot em TypeScript. Quando o bot adaptativo perde em uma abertura específica (ex: cai no Gambito do Rei), a probabilidade daquela aresta específica no grafo local é decrementada, forçando o bot a variar o repertório de aberturas nas partidas seguintes.

6. **GitHub: `microsoft/onnxruntime-web`**
   - **Link:** https://github.com/microsoft/onnxruntime
   - **Resumo Técnico:** Runtime otimizado de inferência de modelos abertos ONNX para web com aceleração nativa via WebAssembly SIMD e WebGPU.
   - **Como Aproveitaremos:** Utilizado para executar inferências instantâneas de modelos quantizados de estilo de jogo humano sem onerar o loop de renderização do Three.js.

7. **GitHub: `m-lundberg/glicko2-js`**
   - **Link:** https://github.com/m-lundberg/glicko2-js
   - **Resumo Técnico:** Implementação matemática estrita do sistema Glicko-2 em JavaScript.
   - **Como Aproveitaremos:** Aplicamos o Glicko-2 para calibrar dinamicamente o rating do próprio jogador e dos bots adaptativos. Quando um bot adaptativo vence consecutivamente após aprender com suas derrotas, seu rating interno sobe proporcionalmente à sua nova força tática.

8. **GitHub: `bkiers/simple-chess-ai`**
   - **Link:** https://github.com/bkiers/simple-chess-ai
   - **Resumo Técnico:** Motor pedagógico em JavaScript demonstrando piece-square tables, avaliação de mobilidade e ordenação de lances simples.
   - **Como Aproveitaremos:** Serviu de molde para os bots mais simples da ladder (Ratings 0 a 400), onde introduzimos distorções propositais nas matrizes de valores posicionais para gerar erros cômicos e acessíveis a iniciantes.

9. **GitHub: `google-deepmind/open_spiel`**
   - **Link:** https://github.com/google-deepmind/open_spiel
   - **Resumo Técnico:** Framework da Google DeepMind para pesquisa em teoria dos jogos e algoritmos de aprendizado por reforço multiagente.
   - **Como Aproveitaremos:** As rotinas de *Fictitious Play* e *Counterfactual Regret Minimization (CFR)* simplificado inspiraram o módulo do "Nemesis Bot", que calcula arrependimento cumulativo para lances descartados e ajusta a estratégia de longo prazo contra o jogador humano.

10. **GitHub: `jhelwig/zobrist-hash`**
    - **Link:** https://github.com/jhelwig/zobrist-hash
    - **Resumo Técnico:** Gerador de hashes Zobrist pseudoaleatórios para tabelas de transposição em tempo constante.
    - **Como Aproveitaremos:** O Zobrist Hash é a chave primária que conecta o estado do tabuleiro à memória de erros no IndexedDB. Se a posição atual corresponder a uma gafe fatal catalogada no passado do bot, o lance é automaticamente expurgado da árvore de busca.

11. **GitHub: `lichess-org/lila` (Bot Arena & Maia Integration)**
    - **Link:** https://github.com/lichess-org/lila
    - **Resumo Técnico:** O código-fonte do backend e frontend do Lichess, documentando a integração de bots comunitários e perfis de inteligência artificial.
    - **Como Aproveitaremos:** O design da interface de seleção de bots em cartões visuais (Bot Cards), com avatares estilizados, biografias humorísticas e citações dinâmicas de vitória e derrota foi desenhado com base nos padrões testados do Lichess.

12. **GitHub: `ianfab/Fairy-Stockfish`**
    - **Link:** https://github.com/ianfab/Fairy-Stockfish
    - **Resumo Técnico:** O motor de referência para peças mágicas e variantes.
    - **Como Aproveitaremos:** Garante que os bots da ladder consigam disputar partidas não apenas no xadrez clássico, mas também nas variantes de peças fadas catalogadas na Spec 04 com calibração de dificuldade coerente.

13. **GitHub: `davidbau/seedrandom`**
    - **Link:** https://github.com/davidbau/seedrandom
    - **Resumo Técnico:** Gerador de números pseudoaleatórios determinístico.
    - **Como Aproveitaremos:** Permite congelar a semente de aleatoriedade dos bots em testes de regressão de qualidade e homologação de ratings.

14. **GitHub: `glinscott/nnue-pytorch`**
    - **Link:** https://github.com/glinscott/nnue-pytorch
    - **Resumo Técnico:** Ferramentas de treinamento de redes NNUE para xadrez.
    - **Como Aproveitaremos:** Extração de pesos pré-treinados compactos para quantização e embedding direto no bundle web do cliente.

15. **GitHub: `cure53/DOMPurify`**
    - **Link:** https://github.com/cure53/DOMPurify
    - **Resumo Técnico:** Sanitizador XSS para texto gerado dinamicamente.
    - **Como Aproveitaremos:** Sanitização de comentários e frases personalizadas emitidas pelos bots no chat do jogo.

---

## 5. A LADDER COMPLETA DE BOTS: PERFIS DE RATING DE 0 A 2200+

O ecossistema divide-se em 19 degraus de habilidade detalhados na tabela abaixo, alternando entre bots de benchmark estático (comportamento imutável) e bots adaptativos evolutivos (que aprendem e guardam memória contra você):

| Bot ID | Nome do Bot | Rating ELO | Tipo de Bot | Taxa de Blunder (%) | Depth Máx | Tempo Máx | Abertura Padrão | Arquétipo de Personalidade |
|---|---|---|---|---|---|---|---|---|
| `bot_000` | **Bebê Peão** | **0** | Estático | 90% | 1 | 100ms | Nenhuma (Aleatório) | Totalmente caótico. Move peças aleatoriamente sem objetivo. |
| `bot_100` | **Pipoca** | **100** | Estático | 75% | 1 | 150ms | 1. e4 ou 1. h4 | Distraído. Avança peões laterais e pendura peças desprotegidas. |
| `bot_200` | **Estagiário** | **200** | Estático | 60% | 1 | 200ms | 1. a4 ou 1. e4 | Afobado. Tenta avançar o rei cedo e ignora ameaças diretas. |
| `bot_300` | **Faísca** | **300** | **Adaptativo (Tier 1)** | 50% | 2 | 250ms | Abertura de Peão Central | Começa cometendo erros bobos, mas aprende a não cair no Pastor. |
| `bot_400` | **Recruta** | **400** | Estático | 42% | 2 | 300ms | 1. e4 e5 2. Qh5 | Agressivo ingênuo. Tenta dar Mate do Pastor em todas as partidas. |
| `bot_500` | **Camponês** | **500** | Estático | 35% | 2 | 350ms | Giuoco Piano simples | Passivo. Não calcula trocas de peças e esquece peças cravadas. |
| `bot_600` | **Capivara Audaz** | **600** | **Adaptativo (Tier 1)** | 30% | 3 | 400ms | Italiana Básica | Guarda memória das capturas sofridas na partida anterior. |
| `bot_700` | **Sentinela** | **700** | Estático | 24% | 3 | 450ms | Francesa / Caro-Kann | Defensivo. Protege peças mas falha em garfos de cavalo. |
| `bot_800` | **Escudeiro** | **800** | Estático | 18% | 3 | 500ms | Ruy Lopez Elementar | Tenta controlar o centro mas erra a ordem de movimentos táticos. |
| `bot_900` | **Cavaleiro Errante** | **900** | **Adaptativo (Tier 2)** | 14% | 4 | 600ms | Gambito da Dama | Adapta as linhas de abertura após perder para armadilhas conhecidas. |
| `bot_1000` | **Comandante** | **1000** | Estático | 10% | 4 | 700ms | Sistema London Sólido | Muito sólido. Raras gafes simples; exige visão tática para vencer. |
| `bot_1100` | **Artilheiro** | **1100** | Estático | 7% | 4 | 750ms | Defesa Siciliana Aberta | Tático agressivo. Busca ataques na ala do rei adversário. |
| `bot_1200` | **Gladiador** | **1200** | **Adaptativo (Tier 2)** | 5% | 5 | 800ms | Abertura Inglesa | Monitora as peças mais perigosas do jogador e busca neutralizá-las. |
| `bot_1600` | **Estrategista** | **1600** | Estático | 2.5% | 6 | 900ms | Defesa Índia do Rei | Nível de clube intermediário. Conhece finais de peões e torres. |
| `bot_1700` | **Inquisidor** | **1700** | **Adaptativo (Tier 3)** | 1.8% | 6 | 950ms | Nimzo-Índia / Catala | Perfila o repertório de aberturas do jogador e prepara antídotos. |
| `bot_1800` | **Mestre de Armas** | **1800** | Estático | 1.0% | 7 | 1000ms | Eslava / Grunfeld | Jogador de primeira categoria. Castiga erros posicionais sutis. |
| `bot_1900` | **Arquiduque** | **1900** | **Adaptativo (Tier 3)** | 0.6% | 7 | 1100ms | Todas as linhas FIDE | Tabela de gafes ativa. Nunca comete o mesmo erro duas vezes. |
| `bot_2000` | **Grão-Chanceler** | **2000** | Estático | 0.2% | 8 | 1200ms | Teoria Profunda FIDE | Nível Candidato a Mestre (CM). Quase impecável em tática. |
| `bot_2200` | **Nemesis Supremo** | **2200+** | **Adaptativo (Full NNUE)** | 0.05% | 9+ | 1200ms | Repertório Dinâmico | O ápice da máquina adaptativa. Realiza fine-tuning após cada jogo. |

---

## 6. ARQUITETURA DO APRENDIZADO ADAPTATIVO LOCAL (CLIENT-SIDE)

O ciclo de vida do aprendizado adaptativo é executado inteiramente na máquina do usuário através de três módulos sinérgicos:

### 6.1 Módulo 1: Dynamic Opening Book Mutation (Árvore de Abertura no IndexedDB)
O bot inicia com uma árvore de aberturas padrão (grafo com pesos inteiros de probabilidade em cada lance).
1. Quando uma partida é concluída com derrota do bot, a fita PGN é analisada pelo `OpeningAnalyzer`.
2. O sistema localiza o último lance de abertura executado pelo bot antes da avaliação posicional cair mais de 1.5 centipawns em desfavor do bot.
3. No IndexedDB (`dexie.js`), o peso daquele lance perdedor é reduzido através de decaimento multiplicativo:
   $$	ext{Weight}_{	ext{novo}} = \max(1, \lfloor 	ext{Weight}_{	ext{antigo}} 	imes 0.5 floor)$$
4. Simultaneamente, lances alternativos na mesma posição ganham um bônus de exploração, garantindo que na próxima partida contra o mesmo jogador o bot opte por linhas diferentes.

### 6.2 Módulo 2: Blunder Memory Cache (Tabela de Gafes Zobrist)
Para impedir que o bot cometa a mesma gafe tática repetidas vezes:
1. Durante a partida, se o jogador humano realizar uma combinação tática vencedora (ex: garfo de cavalo que captura a dama do bot), o lance imediatamente anterior do bot é classificado como `CRITICAL_BLUNDER`.
2. O estado do tabuleiro antes do lance é convertido em um Hash Zobrist de 64 bits (`zobristKey`).
3. Uma entrada é gravada no repositório `BlunderStore`:
   ```typescript
   {
     botId: "bot_1900",
     zobristHash: "9a4f2c0188b7e21a",
     penalizedMove: "c3d5",
     penaltyCentipawns: -15000,
     timestamp: Date.now()
   }
   ```
4. Em partidas futuras, durante a geração e ordenação de lances (Move Ordering), se o `zobristHash` bater com a tabela de gafes, o lance recebe penalidade artificial de $-15.000$ pontos, caindo para o final da lista de lances avaliados e sendo sumariamente descartado pela busca.

### 6.3 Módulo 3: Player Habit Profiler (Modelagem do Perfil Humano)
O módulo `PlayerHabitProfiler` acumula métricas de comportamento do jogador humano ao longo de múltiplas partidas:
- **Agressividade Precoce:** Frequência com que o jogador desenvolve a Rainha antes do lance 6.
- **Preferência Estrutural:** Predisposição para Roque curto vs Roque longo.
- **Fraqueza de Finais:** Taxa de conversão de finais com peão a mais.
- **Comportamento sob Pressão de Tempo:** Frequência de erros quando restam menos de 30 segundos no relógio.
O bot adaptativo consulta essas métricas no início da partida e altera os pesos de sua função heurística (ex: prioriza trocar peças e acelerar para o final caso o jogador tenha histórico de técnica fraca em finais).

---

## 7. DIAGRAMAS ARQUITETURAIS MERMAID

### 7.1 Fluxo do Ciclo de Aprendizado Adaptativo do Bot

```mermaid
graph TD
    User([Jogador Humano]) -->|1. Realiza Lance Tático Vencedor| Engine[Rules Engine Client-Side]
    Engine -->|2. Detecta Vitória / Checkmate| Evaluator[Post-Game Game Analyzer]
    
    Evaluator -->|3. Identifica Lance Crítico Perdedor| Learner[Adaptive Learning Worker]
    
    Learner -->|4. Atualiza Pesos de Abertura| BookDB[(IndexedDB: OpeningBookTable)]
    Learner -->|5. Grava Zobrist Hash do Erro| BlunderDB[(IndexedDB: BlunderMemoryTable)]
    Learner -->|6. Atualiza Perfil do Humano| ProfileDB[(IndexedDB: PlayerHabitProfile)]
    Learner -->|7. Micro-SGD Weights (Tier 2200)| NNUEStore[(IndexedDB: LocalNNUEWeights)]
    
    BookDB -.->|Partida Seguinte: Nova Rota de Abertura| BotEngine[Bot Decision Engine]
    BlunderDB -.->|Partida Seguinte: Penaliza Lance Fatal| BotEngine
    ProfileDB -.->|Partida Seguinte: Explora Fraqueza| BotEngine
    BotEngine -->|8. Lance Melhorado e Mais Forte| User
```

### 7.2 Escalada de Rating e Desbloqueio da Ladder de Bots

```mermaid
graph LR
    Tier0["Tier 1: Iniciantes (0 - 500)<br>• Bebê Peão (0)<br>• Pipoca (100)<br>• Estagiário (200)<br>• Faísca (300)*<br>• Recruta (400)<br>• Camponês (500)"]
    -->|Vença 3 partidas para desbloquear|
    Tier1["Tier 2: Intermediários (600 - 1100)<br>• Capivara Audaz (600)*<br>• Sentinela (700)<br>• Escudeiro (800)<br>• Cavaleiro (900)*<br>• Comandante (1000)<br>• Artilheiro (1100)"]
    -->|Atinja ELO 1200|
    Tier2["Tier 3: Avançados (1200 - 1800)<br>• Gladiador (1200)*<br>• Estrategista (1600)<br>• Inquisidor (1700)*<br>• Mestre de Armas (1800)"]
    -->|Atinja ELO 1800|
    Tier3["Tier 4: Mestres & Nemesis (1900 - 2200+)<br>• Arquiduque (1900)*<br>• Grão-Chanceler (2000)<br>• Nemesis Supremo (2200+)*"]
```
*\* Bots com marcador de asterisco possuem o ícone de cérebro indicando capacidade de aprendizado adaptativo ativo.*

---

## 8. HISTÓRIAS DE USUÁRIO (USER STORIES) - ECOSSISTEMA DE BOTS

### 8.1 Histórias de Usuário do Jogador (Player Perspective)
1. **US11-P01:** Como jogador iniciante absoluto, quero começar jogando contra o "Bebê Peão (Rating 0)" e vencer minhas primeiras partidas facilmente para ganhar confiança e entender como as peças capturam.
2. **US11-P02:** Como competidor, quero ver meu próprio rating subir na tela após derrotar cada bot da escada, recebendo troféus visuais ao completar cada degrau de 100 em 100 pontos.
3. **US11-P03:** Como estrategista, quero que o bot adaptativo "Faísca (300)" aprenda a não cair no Mate do Pastor após eu aplicar esse truque duas vezes consecutivas, forçando-me a jogar aberturas reais.
4. **US11-P04:** Como jogador, quero visualizar na tela de seleção de bots um card interativo com o avatar animado de cada bot, sua pontuação de rating, biografia divertida e um ícone distintivo de "Cérebro" para identificar bots que aprendem.
5. **US11-P05:** Como competidor em treino sério, quero jogar contra o "Comandante (Rating 1000)" e ter certeza de que ele manterá seu nível de jogo rigorosamente consistente e calibrado como um benchmark confiável.
6. **US11-P06:** Como usuário jogando no celular, quero poder disputar partidas contra todos os bots mesmo quando estiver completamente offline no modo avião sem internet.
7. **US11-P07:** Como jogador em uma partida emocionante, quero que o bot emita balões de chat expressivos e engraçados quando cometer uma gafe ou quando aplicar um belo ataque tático contra mim.
8. **US11-P08:** Como fã de desafios, quero desbloquear o "Nemesis Supremo (Rating 2200+)" e sentir que ele estuda meu estilo a cada jogo, tornando cada revanche mais desafiadora e personalizada.
9. **US11-P09:** Como estudante de xadrez, quero poder solicitar uma "Análise do Bot" ao final do jogo, vendo o momento exato em que o bot percebeu que cometeu uma gafe que custou a partida.
10. **US11-P10:** Como usuário, quero um botão "Resetar Memória do Bot" nas configurações caso eu queira reiniciar o histórico de aprendizado de um bot adaptativo específico e começar do zero.
11. **US11-P11:** Como competidor focado em velocidade, quero jogar contra bots em formatos Blitz (3 min) e Bullet (1 min) com a garantia de que o bot responderá seus lances rapidamente sem estourar o relógio.
12. **US11-P12:** Como jogador que cometeu um deslize bobo, quero poder usar a opção "Pedir Desculpas / Desfazer Lance" contra bots de ratings até 1000 sem que o jogo penalize meu rating.
13. **US11-P13:** Como entusiasta de variantes, quero que a ladder de bots permita disputar partidas tanto no Xadrez Clássico quanto no Xadrez Hexagonal de 4 Jogadores com bots especializados em cada geometria.
14. **US11-P14:** Como competidor de alto nível, quando eu atingir rating 2000, quero receber um certificado digital comemorativo e ser convidado para o modo "Desafio dos Grão-Mestres".
15. **US11-P15:** Como usuário que joga em múltiplos dispositivos, quero exportar o arquivo JSON com as memórias dos meus bots e meu progresso de ladder para importar no meu notebook sem perder o histórico.

### 8.2 Histórias de Usuário do Desenvolvedor e Arquiteto (Developer/Architect Perspective)
1. **US11-D01:** Como arquiteto do sistema, quero que todo o ecossistema de bots execute estritamente em WebWorkers isolados na máquina do cliente, garantindo zero despesas de servidores de computação de IA na nuvem.
2. **US11-D02:** Como desenvolvedor de IA, quero que a injeção de gafes nos bots de rating baixo utilize distribuição probabilística com ruído gaussiano sobre as piece-square tables, evitando o comportamento artificial de robô perfeito com falhas aleatórias bizarras.
3. **US11-D03:** Como engenheiro de persistência, quero utilizar o `Dexie.js` para gerenciar as tabelas do IndexedDB com índices otimizados por `botId` e `zobristHash`, assegurando leituras e gravações em menos de 1ms.
4. **US11-D04:** Como engenheiro de testes, quero suítes de testes de regressão automatizadas que coloquem bots de cada nível para disputar 100 partidas entre si (ex: Bot 1000 vs Bot 800) e comprovem que a taxa de vitória do bot superior respeita a curva teórica do ELO (aprox. 75% de vitórias).
5. **US11-D05:** Como desenvolvedor de UI, quero que o componente de seleção de bots seja modular e consuma o array declarativo de bots via Zustand, permitindo adicionar novos bots sazonais com apenas uma linha de configuração JSON.
6. **US11-D06:** Como mantenedor do código, quero que a Tabela de Gafes (Blunder Memory) implemente limite de capacidade com política LRU (máximo de 500 entradas por bot), prevenindo inchaço do armazenamento local do navegador.
7. **US11-D07:** Como desenvolvedor de performance, quero que as rotinas de busca minimax e MCTS dos bots utilizem os buffers contíguos de memória `Int32Array` descritos na Spec 01, eliminando alocações de objetos durante o cálculo da melhor jogada.
8. **US11-D08:** Como desenvolvedor de áudio e imersão, quero que cada bot possua gatilhos de eventos sonoros mapeados no `EventBus` (`BOT_TAUNT_EVENT`, `BOT_BLUNDER_EVENT`, `BOT_VICTORY_EVENT`) para acionar vozes sintetizadas via Web Speech API leve.
9. **US11-D09:** Como operador de produto, quero que os bots de rating fixo (Benchmarks) tenham suas sementes e pesos matemáticos protegidos contra mutações para servir como padrão métrico inalterável para calibrar o ELO real do jogador.
10. **US11-D10:** Como desenvolvedor de segurança, quero que o rating PVE do jogador contra bots seja armazenado de forma independente do rating PVP multiplayer da Spec 08, impedindo qualquer contaminação entre ligas ranqueadas.

---

## 9. REQUISITOS FUNCIONAIS (RF) - BOTS E APRENDIZADO ADAPTATIVO

Abaixo estão formalizados os 15 requisitos funcionais mandatórios do subsistema de bots e progressão:

1. **RF-01 (Hierarquia Completa de 19 Bots Calibrados):** O sistema deve disponibilizar uma ladder contendo exatamente os 19 bots especificados na Seção 5, com ratings nominais variando de 0 a 2200+, com perfis visuais, nomes e estilos distintos.
2. **RF-02 (Categorização Estática vs Adaptativa):** O sistema deve diferenciar formalmente bots de referência imutável (Benchmark Estático) de bots com inteligência evolutiva (Adaptativo), exibindo um indicador visual de cérebro ativo nos bots que aprendem.
3. **RF-03 (Mutação Local de Livros de Abertura):** Ao final de uma derrota do bot adaptativo, o sistema deve registrar a linha de abertura jogada no IndexedDB e reduzir o peso de probabilidade do lance perdedor em 50%, incentivando variação nas partidas seguintes.
4. **RF-04 (Tabela de Memória de Gafes Zobrist):** O sistema deve indexar posições onde o bot sofreu desvantagem tática crítica através do Zobrist Hash de 64 bits e aplicar penalidade artificial de -15.000 centipawns ao lance penalizado em partidas futuras contra o mesmo jogador.
5. **RF-05 (Perfilagem de Hábitos do Jogador Humano):** O módulo `PlayerHabitProfiler` deve acumular dados estatísticos sobre o estilo tático do usuário (agressividade de abertura, preferências de roque e comportamento de tempo) e adaptar a ponderação heurística do bot.
6. **RF-06 (Algoritmo de Blunder Gradual para Níveis Baixos):** Em bots de rating inferior a 800, o sistema deve injetar perturbações ponderadas na avaliação posicional e limitar a profundidade de cálculo, garantindo comportamento humano e acessível.
7. **RF-07 (Sistema de Rating Glicko-2 para PVE):** O sistema deve manter uma pontuação de rating Glicko-2 exclusiva para o modo contra bots, atualizando a pontuação do jogador e dos bots adaptativos ao término de cada partida oficial da escada.
8. **RF-08 (Orçamento Estrito de Tempo de Reflexão):** O motor de cálculo do bot deve respeitar rigidamente o teto de tempo alocado para o lance (entre 100ms e 1.200ms conforme o nível), interrompendo a busca e retornando o melhor lance obtido caso o tempo se esgote.
9. **RF-09 (Execução 100% em WebWorkers):** Todas as rotinas de busca de árvore, avaliação estocástica e atualizações de aprendizado do bot devem ser executadas em WebWorkers dedicados, mantendo 60 FPS inabaláveis no canvas 3D do Three.js.
10. **RF-10 (Persistência Offline em IndexedDB com Dexie.js):** Todas as memórias de erros, pesos de abertura adaptados e histórico de partidas contra bots devem ser armazenados localmente no navegador, funcionando perfeitamente sem conexão com a internet.
11. **RF-11 (Sistema de Diálogos e Personalidades Expressivas):** Cada bot deve emitir frases contextuais de chat em momentos-chave da partida (início de jogo, captura de dama, xeque, gafe própria e derrota), com sanitização estrita via DOMPurify.
12. **RF-12 (Desbloqueio Progressivo de Tiers):** O jogador deve começar com acesso ao Tier 1 (Iniciantes: 0 a 500) e desbloquear os tiers seguintes à medida que conquistar vitórias e acumular rating na escada de progressão.
13. **RF-13 (Função de Reset de Aprendizado do Bot):** O sistema deve oferecer um botão nas configurações permitindo que o usuário limpe a tabela de gafes e o livro de aberturas de um bot específico, retornando-o ao estado de fábrica inicial.
14. **RF-14 (Exportação e Importação de Perfil de Bots):** O sistema deve disponibilizar rotinas para exportar o progresso da ladder e as memórias dos bots em formato de arquivo JSON criptografado/assinado e importá-lo em outros dispositivos.
15. **RF-15 (Suporte a Variantes com Peças Fadas):** Os bots devem ser plenamente compatíveis com as regras de variantes catalogadas na Spec 04 (Hexagonal FFA, Atomic Chess, Crazyhouse), ajustando seus valores de peças para os pontos de fadas atribuídos.

---

## 10. REQUISITOS NÃO-FUNCIONAIS (RNF) - PERFORMANCE E RESTRIÇÕES

Abaixo estão formalizados os 15 requisitos não-funcionais que governam o subsistema de bots e inteligência adaptativa:

1. **RNF-01 (Custo Mensal de Servidores de IA $0.00):** Exatos **100% dos cálculos de IA, simulações de árvores de decisão e aprendizados adaptativos** devem rodar no hardware do cliente web, consumindo zero centavos de computação em nuvem.
2. **RNF-02 (Taxa de Quadros Imune a Cálculos de IA):** A execução do WebWorker da engine de bots não deve provocar nenhuma queda de taxa de quadros abaixo de **60 FPS** na thread principal do Three.js durante a movimentação ou interpolação de peças.
3. **RNF-03 (Tempo Máximo de Resposta por Lance):** O tempo de resposta de qualquer bot da ladder não deve exceder **1.200 milissegundos**, assegurando dinamismo nas partidas.
4. **RNF-04 (Teto de Memória das Tabelas do IndexedDB):** O armazenamento consolidado de memórias de gafes, árvores de abertura e histórico de bots no IndexedDB não deve ultrapassar **25 Megabytes** no disco local do navegador.
5. **RNF-05 (Tempo de Consulta à Tabela de Gafes Zobrist):** A busca por correspondência de uma posição na tabela de gafes locais do IndexedDB deve executar em tempo inferior a **2 milissegundos**.
6. **RNF-06 (Conformidade com a Curva Teórica de ELO):** Em testes automatizados de 100 partidas entre o Bot 1000 e o Bot 800, a taxa de vitórias do Bot 1000 deve se situar no intervalo de **70% a 80%**, comprovando calibração matemática rigorosa.
7. **RNF-07 (Tamanho do Bundle de Livros de Abertura):** O conjunto inicial de livros de abertura comprimidos de todos os 19 bots não deve exceder **1.5 Megabytes** gzippados no download inicial.
8. **RNF-08 (Zero Alocação no Heap do JS Main Thread):** O envio de estados de jogo e a recepção de lances do bot via WebWorker deve utilizar objetos transferíveis (`Transferable Objects`) sem clonagem pesada de strings ou objetos na Main Thread.
9. **RNF-09 (Capacidade da Memória LRU de Gafes):** A tabela de memórias de gafes de cada bot deve reter no máximo **500 posições críticas**, descartando as posições mais antigas e menos frequentes para evitar vazamentos de memória.
10. **RNF-10 (Cobertura de Testes Automatizados de Bots):** A suíte de testes unitários para os algoritmos de blunder injection, mutação de aberturas e cálculo Glicko-2 deve manter cobertura de código superior a **90%**.
11. **RNF-11 (Funcionamento 100% Offline):** Todo o ecossistema PVE de bots deve ser totalmente jogável sem conexão com a internet através de Service Workers e cache estático PWA.
12. **RNF-12 (Consumo de Bateria em Dispositivos Móveis):** Em partidas contínuas no celular, o bot deve limitar o uso de CPU a no máximo 1 núcleo lógico (1 Worker ativo), mantendo a temperatura do aparelho estável.
13. **RNF-13 (Tempo de Inicialização do Bot Worker):** A instanciação e carregamento dos pesos e do livro de abertura do bot selecionado no WebWorker deve ocorrer em menos de **80 milissegundos**.
14. **RNF-14 (Isolamento Estrito de Dados entre Usuários):** Em navegadores compartilhados, as memórias de bots adaptativos devem ser vinculadas ao ID de perfil ativo, evitando que os erros de um jogador influenciem as partidas de outro usuário na mesma máquina.
15. **RNF-15 (Tolerância a Falhas com Fallback Imediato):** Caso o WebWorker do bot sofra um encerramento inesperado de memória no mobile, o sistema deve reiniciar o worker em menos de 300ms e executar um lance heurístico de emergência sem travar o jogo.

---

## 11. ARQUITETURA DE DEPLOYMENT GRATUITA (FREE TIER) PARA O ECOSSISTEMA DE BOTS

A viabilidade econômica do `ChessInReact` é assegurada pela completa descentralização do processamento de inteligência artificial:

1. **Computação na Borda Descentralizada (Edge Client Execution):** Em modelos tradicionais de e-learning de xadrez, servidores dedicados com placas Nvidia alocam instâncias caras para rodar motores de rede neural. Em nosso design, 100% da inteligência artificial é empacotada em WebWorkers leves em WebAssembly (WASM) e JavaScript que rodam no processador do próprio usuário. O custo de computação para o operador da plataforma é estritamente **$0.00**.
2. **Assets Estáticos via Cloudflare R2 e Vercel:** Os avatares visuais em alta resolução dos bots, os áudios de personalidade e os arquivos binários compactos de abertura são armazenados no Cloudflare R2 com taxa de saída gratuita e distribuídos na CDN da Vercel no Hobby Tier gratuito, garantindo distribuição ilimitada sem custos de transferência de dados.
3. **Persistência Serverless Desacoplada:** Como o aprendizado adaptativo é persistido no IndexedDB local do cliente, não há nenhuma sobrecarga de escrita em bancos de dados relacionais na nuvem, preservando com total tranquilidade os limites do plano gratuito de 500MB do Supabase.

---

## 12. MODOS DE JOGO E PECULIARIDADES DO ECOSSISTEMA DE BOTS

1. **Modo Bot Gauntlet (A Escalada dos Mestres):**
   - Modo de campanha linear onde o jogador começa no Bot 0 e precisa derrotar cada bot da escada para avançar para o próximo nível.
   - Sistema de classificação por estrelas (1 estrela: vitória com auxílio de desfazer lance; 2 estrelas: vitória com relógio padrão; 3 estrelas: vitória impecável sem gafes).
2. **Modo Nemesis Dedicado (Seu Rival Pessoal):**
   - Um bot adaptativo de design sombrio que acompanha a evolução do jogador ao longo do tempo.
   - O Nemesis estuda ativamente todas as vitórias e derrotas do jogador, ajusta aberturas para punir os pontos fracos do usuário e possui diálogos altamente personalizados que citam partidas passadas ("Vejo que você ainda insiste na Defesa Siciliana que derrotei ontem...").
3. **Modo Benchmark de Rating Calibrado:**
   - Partidas oficiais de 10 minutos contra os bots estáticos de referência (Ratings 500, 1000, 1500, 2000).
   - O bot não aprende com os erros, servindo como uma régua de medição imutável para avaliar a evolução técnica real do jogador ao longo dos meses.
4. **Modo Treino com Feedback Imediato (Coach Mode):**
   - O bot faz o lance e, caso o jogador cometa um erro grave, o bot pausa o relógio e oferece uma dica tática: "Tem certeza desse lance? Olhe com atenção para o seu bispo em c4".

---

## 13. SCHEMAS DE DADOS, TIPOS TYPESCRIPT E TABELAS DO INDEXEDDB

Abaixo constam as interfaces tipadas de gerenciamento de bots, memórias de gafes e banco IndexedDB:

```typescript
// src/ai/bots/interfaces/IBotEcosystemContracts.ts

export type BotArchetype = 'CHAOTIC' | 'AGGRESSIVE' | 'PASSIVE' | 'SOLID' | 'TACTICAL' | 'ADAPTIVE_EVOLUTIONARY';

export interface IBotProfile {
  id: string; // Ex: 'bot_000', 'bot_300', 'bot_2200'
  name: string;
  ratingElo: number;
  isAdaptive: boolean;
  avatarUrl: string;
  bioDescription: string;
  archetype: BotArchetype;
  blunderRate: number; // 0.0 a 1.0
  maxDepth: number;
  maxThinkTimeMs: number;
  openingBookFileName: string;
  dialogueLines: {
    gameStart: string[];
    onCapturePlayerQueen: string[];
    onOwnBlunder: string[];
    onCheckmateDelivered: string[];
    onDefeated: string[];
  };
}

// Estruturas de Persistência no IndexedDB via Dexie.js
export interface IBlunderMemoryRecord {
  id?: number; // Auto-increment
  botId: string;
  zobristHash: string; // Hash de 64 bits em hex
  penalizedMove: string; // Ex: 'e2e4'
  penaltyScore: number;
  lossTimestamp: number;
  occurrenceCount: number;
}

export interface IAdaptiveBookMutationRecord {
  id?: number;
  botId: string;
  fenPositionKey: string;
  moveString: string;
  weightMultiplier: number; // 0.0 a 2.0
  updatedAt: number;
}

export interface IPlayerHabitProfileRecord {
  userId: string;
  totalGamesAgainstBots: number;
  queenEarlyDevelopmentRate: number;
  castlingPreference: 'KINGSIDE' | 'QUEENSIDE' | 'NONE';
  endgameConversionAccuracy: number;
  timePanicErrorRate: number;
  lastUpdated: number;
}
```

Esquema de banco de dados local do Dexie.js para o ecossistema de bots:

```typescript
// src/ai/bots/storage/BotLearningDatabase.ts
import Dexie, { Table } from 'dexie';
import { 
  IBlunderMemoryRecord, 
  IAdaptiveBookMutationRecord, 
  IPlayerHabitProfileRecord 
} from '../interfaces/IBotEcosystemContracts';

export class BotLearningDatabase extends Dexie {
  blunders!: Table<IBlunderMemoryRecord, number>;
  bookMutations!: Table<IAdaptiveBookMutationRecord, number>;
  playerHabits!: Table<IPlayerHabitProfileRecord, string>;

  constructor() {
    super('ChessInReact_BotEcosystemDB');
    this.version(1).stores({
      blunders: '++id, botId, zobristHash, [botId+zobristHash], lossTimestamp',
      bookMutations: '++id, botId, [botId+fenPositionKey], updatedAt',
      playerHabits: 'userId, lastUpdated'
    });
  }
}

export const botLearningDB = new BotLearningDatabase();
```

Contrato JSON para requisição de partida contra Bot:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "StartBotMatchRequestPayload",
  "type": "object",
  "required": ["botId", "playerColor", "timeControlSeconds", "isRankedLadder"],
  "properties": {
    "botId": { "type": "string", "pattern": "^bot_[0-9]{3,4}$" },
    "playerColor": { "enum": ["WHITE", "BLACK", "RANDOM"] },
    "timeControlSeconds": { "type": "integer", "minimum": 60, "maximum": 3600 },
    "isRankedLadder": { "type": "boolean" },
    "enableCoachHints": { "type": "boolean" },
    "variantId": { "type": "string", "default": "classic_square" }
  }
}
```

---

## 14. CONCLUSÃO ARQUITETURAL DA SPEC 11

A Spec 11 transforma o `ChessInReact` em uma das plataformas mais completas e inovadoras de xadrez computacional moderno. Ao aliar a consagrada fórmula de uma ladder de bots de rating calibrado (de 0 a 2200+) a uma arquitetura engenhosa de **aprendizado adaptativo local em IndexedDB e WebWorkers**, a plataforma cria adversários virtuais vivos que sentem as derrotas, abandonam linhas falhas e aprendem com os truques do jogador humano, mantendo uma experiência imersiva e responsiva a 60 FPS inquebráveis e com **custo de infraestrutura rigorosamente zero**.
