# Spec 09: Database SQL, ORM Prisma e Histórico Compressivo (Parte 1/4)

## A. OBRIGAÇÃO DE DENSIDADE E ABORDAGEM
Xadrez de Variantes Procedurais gera dados gigantescos se salvo incorretamente. No Xadrez Clássico, os bancos de dados salvam a FEN String (Ex: `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`) e a notação de cada lance num arquivo de texto plano chamado PGN.
Contudo, se um tabuleiro procedural `ChessInReact` de $4000$ casas possui elevações mapeadas e 48 peças de 4 jogadores, a "String FEN" desse estado se tornaria um Blob inútil e intransitável de 2 MegaBytes. 
O Banco de Dados relacional via Prisma exige tabelas especializadas que guardam os "Eventos Iniciais" (A Semente/Seed) e as "Ações" de forma log-based para garantir espaço $O(1)$.

## 1. OBJETIVO DO SUBSISTEMA DE BANCO DE DADOS
Persistir Identidades (Contas), Modelos Comunitários de Xadrez (Fairy Pieces Customizadas criadas por usuários), Lobbies Completados, e permitir *Replay* de partidas passadas guardando apenas a semente geradora e a fita de Input, integrando essas tabelas de forma robusta no PostgreSQL usando Prisma.

## 2. ESCOPO
**PERTENCE A ESTA SPEC:**
- Esquema de Tabelas (Prisma Schema).
- Armazenamento Baseado em Semente (Seed-based State Replay).
- Compactação de Lances (Compact Hex Notation).
- Estrutura de Modding no DB (Custom Fairy Pieces).
- Sistema de ELO Rating Tables (Glicko-2).

**NÃO PERTENCE:**
- Filas de Matchmaking (Ver Spec 08).
- Lógica Visual de Histórico/Paginador (Ver Spec 06).

## 3. REQUISITOS E CONSTRAINTS
### 3.1 Constraints de Compressão do Banco de Dados
- **Constraint:** Salvar o `ICoreState` JSON de 50 KB a cada jogada geraria $2.5$ MegaBytes de lixo relacional por partida. Em $1$ milhão de partidas, o banco exigiria dezenas de Terabytes inviáveis para sustentar uma startup.
- **Resolução Arquitetural:** Padrão "Event Sourcing". Nós não guardamos tabuleiros no Banco, nós guardamos o Delta Inicial (A Seed do Simplex Noise da Spec 02) + o Array linear de "Inputs" Validados. A Engine no Cliente processa a string e reconstrói o replay completo.

### 3.2 Constraints Relacionais e Modding
- **Constraint:** Se o jogador customizar uma Peça "Dragão" que anda como $Q + N$ (Amazon) no Lobby e o DB salvar `"piece": "Dragon"` no Log da partida, amanhã, se ele deletar essa peça customizada da conta, o Replay da partida corromperá.
- **Resolução Arquitetural:** Tabelas `VariantDefinition` são imutáveis após atreladas a uma Partida. Quando o usuário clica em "Deletar Dragão", aplica-se um Soft Delete. A Fita PGN guardada é self-contained (Embute as regras betza na Header Json).

## 4. PESQUISA MATRIX: FONTES EXTERNAS E GITHUBS VALIDADOS

### Fonte 1: "Portable Game Notation (PGN) Specification"
- **URL:** http://www.saremba.de/chessgml/standards/pgn/pgn-complete.htm
- **Problema Resolvido:** Como o mundo grava Xadrez em bases de dados desde 1994.
- **Conclusão Técnica:** O PGN possui Seven Tag Roster (Event, Site, Date, Round, White, Black, Result). Adaptaremos o *Tag Roster* para injetar JSON estruturado (P1, P2, P3, VarianteUUID, Seed do Mapa).

### Fonte 2: "Event Sourcing Pattern" (Martin Fowler)
- **Problema Resolvido:** Reconstrução de Estado Completo sem guardar DB Blob.
- **Decisão:** A Engine de Regras (Spec 04) já é completamente Determinística (A mesma entrada SEMPRE gera a mesma saída). Portanto, a tabela de banco de dados só grava o `seed` topológico (Ex: `A4b9z1`) e o `EventStream` (`["e2,e4", "e7,e5"]`).

### Fonte 3: "Glicko-2 Rating System" (Mark Glickman)
- **Problema Resolvido:** Elo clássico inflaciona em jogos de N-Players (onde o 2º lugar e o 3º lugar ganham o quê?).
- **Decisão:** O Glicko-2 avalia "Rating Volatility" e "Rating Deviation". O banco armazenará o RD e o Volatility em tabelas separadas para ajustar vitórias surpresas contra múltiplos Grandes Mestres em partidas caóticas de tabuleiro livre.

### Fonte 4: "Prisma Schema Optimization for Write-Heavy Apps"
- **Problema Resolvido:** Insert locks no PostgreSQL.
- **Decisão:** Como Partidas Terminadas são gravadas milhares de vezes por minuto, usaremos tipos Nativos otimizados e desabilitaremos as restrições síncronas agressivas de Constraint Foreign Key em logs não-vitais.

### Fonte 5: "Redis Pub/Sub to Postgres Flush (Write-Behind Pattern)"
- **Problema Resolvido:** Salvar cada jogada pingando o DB destrói conexões.
- **Decisão:** A Sala Colyseus (Spec 03) mantém a fita PGN na memória. Quando o jogo acaba, a Sala faz UM ÚNICO Insert Massivo no Prisma com o Replay completo. Se o servidor Node craschar antes, perdemos o histórico (Aceitável pelo Write-Behind).

### GitHub 1: prisma/prisma
- **Estrutura Estudada:** JSONB type em Postgres.
- **Decisão Influenciada:** Vamos guardar as Regras Betza Personalizadas da partida (`Metadata`) dentro de uma coluna JSONB, permitindo buscas de metadados tipo "Encontre todas as partidas onde foi usado a Fada N+B".

### GitHub 2: lila (Lichess Scala DB Models)
- **Problema Resolvido:** Como agrupar ELOs separados por "Tipo de Partida" (Blitz, Clássica, Antichess).
- **Decisão:** O Prisma conterá um Array de ELOs vinculado à tabela User, em que as chaves serão a `variantId`. Um jogador pode ser GM em Clássico mas Novato em Tabuleiro Triangular.

## 5. ESTRUTURA REAL DE DIRETÓRIOS E MÓDULOS (POSTGRES / PRISMA)

```text
prisma/
  schema.prisma             // Definição Declarativa O(1) do banco
src-backend/
  database/
    PrismaClient.ts         // Singleton gerado do Prisma
    repositories/
      MatchRepository.ts    // Insert Write-Behind
      RatingSystem.ts       // Math para calcular Delta Glicko2
```

(CONTINUA NA PARTE 2)
## 6. O MODELO RELACIONAL (PRISMA SCHEMA)

A Arquitetura de Tabelas abandona amarras rígidas onde elas fariam o sistema engasgar. Em vez de uma tabela relacional de ligação "PlayersInMatch", armazenaremos os arrays de participantes via Postgres Arrays ou JSON, reduzindo Queries (JOINs) caríssimas de Dashboard.

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String   @id @default(uuid())
  email         String   @unique
  username      String   @unique
  passwordHash  String
  createdAt     DateTime @default(now())

  // Glicko-2 Ratings separados por Variant ID
  // { "hex_4p": { rating: 1200, rd: 350, vol: 0.06 }, "standard": { rating: 1500 ... } }
  ratingsMap    Json     @default("{}")

  createdVariants CustomVariant[]
}

model MatchHistory {
  id            String   @id // Mantemos a MatchId gerada no Matchmaker
  endedAt       DateTime @default(now())
  variantId     String   @index
  
  // Tag Roster em JSON para manter metadados infinitos e abertos
  // Guarda: Topologia, Seed Procedural, Tamanho, Time Control, etc.
  metadata      Json

  // A lista ordenada dos UUIDs dos jogadores, e a lista dos resultados (Win, Loss, Draw)
  playerIds     String[]
  playerResults String[]

  // A "Fita PGN". Array de strings comprimidas. 
  // Exemplo: ["p1:0,1,-1>0,2,-2", "p2:..."]
  moveStream    String[]

  @@index([playerIds], type: Gin) // Usado para query rápia de "Minhas Partidas"
}

model CustomVariant {
  id          String   @id @default(uuid())
  authorId    String
  name        String
  
  // A string Betza que a RulesEngine consumirá (Spec 04)
  betzaRules  String   
  
  // Metadados Visuais (Qual arquivo GLTF usar)
  visualMeshUrl String?
  
  isPublic    Boolean  @default(false)
  author      User     @relation(fields: [authorId], references: [id])
}
```

## 7. SISTEMA WRITE-BEHIND DE GRAVAÇÃO (COLYSEUS -> POSTGRES)

Numa Sala (ChessRoom) o State inteiro e a MoveHistory ficam na RAM do NodeJS. Só acessamos o Banco no final.

```typescript
// src-backend/game-stateful/src/rooms/ChessRoom.ts
import { PrismaClient } from '@prisma/client';
import { Glicko2Engine } from '../database/RatingSystem';

const prisma = new PrismaClient();

export class ChessRoom extends Room {
    private moveTape: string[] = [];
    private matchSeed: string = "random_hash_987"; // Gerado na Spec 02

    // ... onMessage que ouve moves ...
    this.onMessage("PLAYER_MOVE", (client, move) => {
         if (isValid) {
             // Hex Notation Compacta: "5,1,-6>4,2,-6"
             this.moveTape.push(`${move.from}>${move.to}`);
         }
    });

    // Evento Ativado pelo Checkmate ou por Resignação Total
    async onDispose() {
        if (this.state.isGameOver) {
             const results = this.calculateFinalStandings();
             
             // 1. Atualiza Glicko-2 na Tabela Users O(N)
             await Glicko2Engine.updateRatings(this.state.players, results, this.options.variantId);
             
             // 2. Grava a Fita Histórica O(1)
             await prisma.matchHistory.create({
                 data: {
                     id: this.roomId,
                     variantId: this.options.variantId,
                     metadata: { seed: this.matchSeed, timeControl: "10+5" },
                     playerIds: Array.from(this.state.players.keys()),
                     playerResults: results,
                     moveStream: this.moveTape
                 }
             });
        }
    }
}
```

(CONTINUA NA PARTE 3)
## 8. RECONSTRUINDO O ESTADO (O VISUALIZADOR DE REPLAY)
Quando o usuário vai na aba "Histórico" (No painel React/NutriOpus da Spec 06), ele clica numa partida passada. Como ver os lances de um Array gigante tipo `["e4>e5"]`?

A *RulesEngine* Isomórfica (Spec 04) volta a brilhar aqui.

```typescript
// src/core/replay/ReplayEngine.ts
import { ChunkManager } from '../../engine/procedural/ChunkManager';
import { ICoreState } from '../interfaces/ICoreState';
import { MovePieceCommand } from '../commands/MoveCommand';

export class ReplayEngine {
   private statesList: ICoreState[] = []; // O(N) array de snapshots
   
   constructor(private dbMatch: MatchHistoryDTO) {
       this.compile();
   }

   private compile() {
       // 1. Cria a Root do Tabuleiro idêntico ao Frame Zero
       let currentState = this.bootstrapInitialState(this.dbMatch.metadata.seed);
       this.statesList.push(currentState);

       // 2. Toca a fita PGN, processando Comando a Comando O(1)
       for (const moveString of this.dbMatch.moveStream) {
           const [from, to] = moveString.split(">");
           
           // Identifica que peça estava em 'from' neste exato frame
           const pieceId = currentState.boardEntities[from].id;
           
           const command = new MovePieceCommand(pieceId, from, to, "SYSTEM_REPLAY");
           currentState = command.execute(currentState); // O(1) Mutação Imutável do Zustand
           
           this.statesList.push(currentState);
       }
   }

   public getStateAtTurn(turnIndex: number): ICoreState {
       return this.statesList[turnIndex];
   }
}
```
*Vantagem Absoluta:* O Frontend agora tem um Slider (Range Input) `<input type="range" max={statesList.length} />`. Ao arrastar o Slider, a State Injetada no Zustand muda instantaneamente, o ThreeJS InstancedMesh reflete o estado, e o usuário pode rebobinar o jogo do início ao fim a 60 FPS.

## 9. RATING SYSTEM (GLICKO-2 IMPLEMENTATION)

O Glicko-2 substitui o ELO Clássico. Um jogador que joga $100$ partidas possui Rating Deviation (RD) baixo. Um jogador que não joga há 6 meses possui RD alto (o sistema está incerto sobre ele).

### 9.1 A Variância N-Player
No Glicko-2 tradicional, há 2 jogadores: Resultado $1, 0$ ou $0.5$.
Num jogo FFA de 4 jogadores, usamos as **Pares de Combate** (Pairwise Matches). Se P1 ganhou, P2 ficou em 2º, P3 em 3º e P4 em 4º:
- P1 ganha de P2, P3 e P4. (3 Vitórias)
- P2 perde de P1, mas ganha de P3 e P4. (2 Vitórias, 1 Derrota)
- P3 perde de P1 e P2, ganha de P4.
- P4 perde de todos.
A Engine Matemática Glicko computa essas equações virtuais isoladas e ajusta a tupla JSONB de ratings do usuário no Banco de Dados.

## 10. FAILURE MODES E TRATAMENTO DE EDGE CASES DE BANCO

### 10.1 Failure Mode: Seed Desync no Patch da Engine
- **Cenário:** O jogador acessa um replay gravado 1 ano atrás (Versão 1.0). Mas a Engine de Xadrez (Spec 04) teve o seu algoritmo de Pathfinding ou de Topologia "Fixed" (Versão 1.2). A reconstrução da FITA PGN falha miseravelmente no lance 42 porque a regra atual acha aquele lance Ilegal e aborta a fita.
- **Resolução Arquitetural (Versionamento de Engine):** 
O `metadata` do DB salva a chave `engineVersion: "1.0.3"`. O repositório TS mantém funções de compatibilidade puras `RulesEngine_v1`, `RulesEngine_v2`. Se o replay for velho, carregamos o arquivo da regra legada (Facade Pattern). A fita PGN NUNCA vai quebrar retroativamente.

### 10.2 Failure Mode: Bloqueio de Tabela no Glicko-2
- **Cenário:** Final de campeonato (Match id: final), milhares de updates de Ranking simultâneos tentam travar e atualizar a Row do "Player A" no Postgres. Causa `RowLevelLockTimeout`.
- **Resolução Arquitetural (Upsert Transactions e Retry):**
Atualizações de Rating são encapsuladas no Prisma em `prisma.$transaction`. Se o backend (Write-Behind) falhar ao submeter o Score, aplicamos Backoff Exponencial (Retries de $500ms, 2s, 5s$). Falhas sistêmicas mandam o resultado de ELO para uma **Dead Letter Queue (Redis)** para intervenção manual do Admin, garantindo que ninguém perca seus preciosos pontos por culpa do SQL.

(CONTINUA NA PARTE 4)
## 11. PLANO DE IMPLEMENTAÇÃO DA SPEC 09
1. Iniciar o projeto Prisma (`npx prisma init`) na pasta `/src-backend/database` e criar as migrações Docker para o PostgreSQL 15.
2. Construir o serviço de API RESTful (Upload/Download de Fitas de Partidas). Quando o usuário carregar um Replay na UI do NutriOpus, a API fará um Select limitando payloads, enviando apenas o JSON do MatchHistory.
3. Escrever a Lógica de Rating Glicko-2 no Node.JS instanciando os Pairwise Vectors baseados no array `playerResults` final de uma Room.
4. Adaptar a UI do Frontend (`ChessEnvironment`) para receber um Array de Eventos e reconstruí-los instanciando a nova Classe `ReplayEngine.ts`. Implementar controle de "Setas Teclado" (ArrowLeft / ArrowRight) para avançar/voltar no tempo manipulando o índice da array gerada em `this.statesList`.

## 12. CRITÉRIOS DE ACEITE
1. **Zero-Loss Compactness:** Jogar uma partida bizarra (Atomic Chess, 6 Players, Tabuleiro Procedural, 500 lances no total) deve criar um Registro no Prisma de PGN stream menor que $5 KB$ provando a eficiência drástica do log sobre State-dumping.
2. **Replay Determinism:** Uma partida salva, carregada 1 mês depois pela UI de histórico, deve obrigatoriamente chegar no lance 500 com as posições EXATAMENTE nos mesmos Hexágonos e estados (Checkmate/Empate) que a partida final original possuía no momento da inserção. Nenhuma peça pode sair do lugar, sob pena de Bug Severo na Seed do Procedural Noise Generator ou na Regra Betza.
3. **Rating Multi-Dimensional:** Submeter 5 Partidas Triangulares de um jogador, e depois 1 partida Hexagonal, não deve alterar o Score de ELO do jogador na Fila Hexagonal, comprovando o isolamento do Rating Deviation da conta dependente de Modalidade/Variante e impedindo abuso cruzado de ranking.

---
*Fim da Spec 09. O Histórico comprime anos de xadrez em gigabytes minúsculos permitindo a existência dos Replays, e os Ratings recompensam os mestres do jogo. A última Spec, Spec 10, amarrará todos os conceitos documentados até aqui detalhando as Políticas de Monetização Comunitária, Criação de Eventos, API de Modding e Análise Telemetria.*


## 13. REPOSITÓRIOS GITHUB E REFERÊNCIAS EXTERNAS (BANCO DE DADOS, PRISMA E EVENT SOURCING)

Abaixo documentamos as fontes de modelagem relacional, motores ORM modernos e padrões de persistência baseada em eventos analisadas para a infraestrutura de dados do `ChessInReact`.

### 13.1 Projetos Open Source Analisados
1. **GitHub: `prisma/prisma`**
   - **Link:** https://github.com/prisma/prisma
   - **Resumo Técnico:** O ecossistema ORM de próxima geração para Node.js e TypeScript com tipagem estrita gerada a partir do schema declarativo, migrações automatizadas (`prisma migrate`) e consultas imunes a injeção SQL.
   - **Como Aproveitaremos no Projeto:** O acesso ao banco relacional é centralizado através do cliente Prisma gerado. Modelamos as relações de usuários, histórico de partidas, fitas de lances imutáveis e configurações de variantes com tipos estritos integrados ao pipeline TypeScript isomórfico.

2. **GitHub: `supabase/supabase`**
   - **Link:** https://github.com/supabase/supabase
   - **Resumo Técnico:** Plataforma de backend de código aberto baseada em PostgreSQL 15 com suporte nativo a Row Level Security (RLS), autenticação por tokens JWT e consultas relacionais via REST e GraphQL.
   - **Como Aproveitaremos:** O banco de dados PostgreSQL primário em produção é hospedado na camada gratuita do Supabase (500MB de armazenamento e 2 núcleos de computação). Políticas de Row Level Security (RLS) protegem as informações privadas de perfis, enquanto views otimizadas fornecem as tabelas de liderança competitiva.

3. **GitHub: `mliebelt/pgn-parser`**
   - **Link:** https://github.com/mliebelt/pgn-parser
   - **Resumo Técnico:** Biblioteca em JavaScript/TypeScript para parsing e geração de arquivos Portable Game Notation (PGN) de acordo com o padrão internacional FIDE.
   - **Como Aproveitaremos:** Adaptamos o parser para suportar tags estendidas: injetamos cabeçalhos customizados como `[Variant "Hexagonal-Gliński"]`, `[Topology "HEX"]`, `[Seed "884192"]` e `[Players "4"]`, permitindo exportar e importar partidas de variantes em formato de texto legível universal.

4. **GitHub: `pierrec/node-lz4`**
   - **Link:** https://github.com/pierrec/node-lz4
   - **Resumo Técnico:** Implementação em C++/Node.js do algoritmo de compressão sem perdas LZ4, focado em velocidades colossais de descompressão (> 1 GB/s por núcleo).
   - **Como Aproveitaremos:** Fitas de lances com mais de 100 movimentos são comprimidas com LZ4 antes da persistência em colunas `Bytes` do PostgreSQL. Isso reduz o tamanho do histórico de uma partida típica de 15KB para menos de 3KB, permitindo que a cota gratuita de 500MB do Supabase abrigue mais de 150.000 partidas completas.

5. **GitHub: `eventstore/EventStore` (Padrão Event Sourcing)**
   - **Link:** https://github.com/EventStore/EventStore
   - **Resumo Técnico:** Banco de dados de referência para arquiteturas de Event Sourcing e CQRS (Command Query Responsibility Segregation).
   - **Como Aproveitaremos:** Aplicamos a disciplina pura de Event Sourcing no design da tabela `MatchEventStream`: o banco nunca armazena o tabuleiro resultante de cada jogada; ele armazena unicamente o evento inicial de setup (Semente procedural) e a fita ordenada e imutável de comandos de movimentação submetidos. O replay e a visualização derivam o estado sob demanda no cliente.

6. **GitHub: `neondatabase/serverless`**
   - **Link:** https://github.com/neondatabase/serverless
   - **Resumo Técnico:** Driver PostgreSQL para ambientes serverless que realiza conexões sobre WebSockets com pool gerenciado.
   - **Como Aproveitaremos:** Utilizado como estratégia de conexão a partir das Serverless Functions da Vercel para o Supabase, eliminando o problema clássico de esgotamento do pool de conexões (Connection Pool Exhaustion) inerente a lambdas.

7. **GitHub: `kysely-org/kysely`**
   - **Link:** https://github.com/kysely-org/kysely
   - **Resumo Técnico:** Construtor de queries SQL com tipagem estrita para TypeScript de altíssima velocidade e zero overhead de abstração.
   - **Como Aproveitaremos:** Utilizado em rotas analíticas de alto volume de leitura para montar consultas complexas de agregações estatísticas de vitórias e taxas de escolha de peças fadas sem a sobrecarga de hidratação de objetos do ORM tradicional.

8. **GitHub: `MarkGlickman/glicko2`**
   - **Link:** https://www.glicko.net/glicko.html
   - **Resumo Técnico:** Publicações acadêmicas e especificações matemáticas oficiais do sistema de classificação Glicko-2 pelo Dr. Mark Glickman.
   - **Como Aproveitaremos:** Os modelos de tabelas relacionais de rating foram projetados para armazenar fielmente a trinca matemática $(Rating, RatingDeviation, Volatility)$ por usuário e por modalidade em colunas numéricas de precisão estrita.

9. **GitHub: `postgrest/postgrest`**
   - **Link:** https://github.com/PostgREST/postgrest
   - **Resumo Técnico:** Servidor web independente que transforma bancos de dados PostgreSQL diretamente em APIs RESTful completas respeitando as regras de RLS.
   - **Como Aproveitaremos:** Integrado nativamente através do cliente `@supabase/supabase-js`, permitindo que o cliente web consulte dados públicos de partidas e rankings diretamente com queries REST rápidas e sem necessidade de intermediários manuais.

10. **GitHub: `lukebarton/pg-escape`**
    - **Link:** https://github.com/lukebarton/pg-escape
    - **Resumo Técnico:** Utilitário para sanitização e escape de strings para queries SQL dinâmicas.
    - **Como Aproveitaremos:** Garante a segurança absoluta contra ataques de injeção em filtros dinâmicos de busca de variantes e apelidos de jogadores na barra de pesquisa da comunidade.

---

## 14. HISTÓRIAS DE USUÁRIO (USER STORIES) - BANCO DE DADOS E EVENT SOURCING

### 14.1 Histórias de Usuário do Jogador (Player Perspective)
1. **US09-P01:** Como jogador, quero acessar meu perfil e visualizar meu histórico completo com todas as partidas que disputei, exibindo data, adversários, variante jogada e resultado (Vitória, Derrota, Empate).
2. **US09-P02:** Como competidor em fase de estudo, quero abrir qualquer partida do meu histórico e usar uma barra de tempo deslizante (Slider de Lances) para rebobinar lance a lance a 60 FPS e analisar onde errei.
3. **US09-P03:** Como criador de conteúdo, quero exportar o arquivo PGN da minha partida favorita com um clique para compartilhá-lo em fóruns ou importá-lo em outros softwares de análise.
4. **US09-P04:** Como competidor, quero visualizar minha pontuação de classificação Glicko-2 atualizada para cada modalidade (ex: 1850 em Clássico, 1620 em Hexagonal FFA) com badge de ranking no meu perfil.
5. **US09-P05:** Como inventor de variantes, quero salvar peças fadas customizadas que criei em uma biblioteca pessoal no meu perfil para utilizá-las sempre que criar salas no Workshop.
6. **US09-P06:** Como espectador, quero poder pesquisar partidas recentes de Grandes Mestres e Campeonatos na plataforma por filtros de data e rating mínimo para assistir aos replays.
7. **US09-P07:** Como jogador em uma partida interrompida por queda acidental de energia, quero que o estado da partida esteja salvo com integridade para que os pontos de rating sejam distribuídos corretamente sem perda de dados.
8. **US09-P08:** Como usuário preocupado com privacidade, quero ter a opção de marcar partidas casuais como "Privadas", de modo que apenas os participantes da sala possam assistir ao replay no histórico.
9. **US09-P09:** Como participante de torneios, quero consultar a tabela de liderança global (Leaderboard) filtrada por variante e ver minha posição entre os 100 melhores jogadores da temporada.
10. **US09-P10:** Como jogador que disputou uma partida épica de 400 lances em um mapa procedural gigante, quero que a partida carregue no replay em menos de 1 segundo sem travar meu navegador.
11. **US09-P11:** Como competidor, se eu vencer um adversário de rating muito superior ao meu, quero ver a variação exata de pontos ganhos na tela de resumo da partida com cálculo transparente de Glicko-2.
12. **US09-P12:** Como usuário, quero poder alterar meu avatar, apelido público e tema de interface padrão, tendo essas preferências salvas com segurança no banco de dados da minha conta.
13. **US09-P13:** Como fã de estatísticas, quero visualizar no meu perfil gráficos de porcentagem de vitórias por cor/facção e abertura mais utilizada ao longo do último mês.
14. **US09-P14:** Como criador de variantes, quero poder publicar uma variante para a comunidade e ver um contador de quantas partidas já foram jogadas utilizando a minha criação.
15. **US09-P15:** Como usuário que deseja encerrar a conta (LGPD/GDPR), quero poder solicitar a exclusão dos meus dados pessoais, convertendo meus registros de partidas em usuário anônimo ("Conta Deletada") para preservar os replays dos meus adversários.

### 14.2 Histórias de Usuário do Desenvolvedor e Arquiteto (Developer/Architect Perspective)
1. **US09-D01:** Como arquiteto de banco de dados, quero que todo o histórico de partidas utilize o padrão Event Sourcing armazenando unicamente a semente inicial e o array de lances em JSONB/LZ4, limitando o peso médio por partida a menos de 5 Kilobytes.
2. **US09-D02:** Como engenheiro de dados, quero que as tabelas do PostgreSQL utilizem tipos de dados compactos (`UUID`, `INT4`, `TIMESTAMPTZ`, `BYTEA`) e índices B-Tree e GIN específicos para respeitar a cota gratuita de 500MB do Supabase.
3. **US09-D03:** Como desenvolvedor backend, quero que as gravações de encerramento de partida ocorram de forma assíncrona (Write-Behind) via fila de tarefas, sem bloquear a thread do servidor Colyseus na finalização do jogo.
4. **US09-D04:** Como mantenedor do código, quero que todo o acesso ao banco seja tipado com o Prisma ORM, garantindo migrações seguras e verificadas em ambiente de desenvolvimento e produção.
5. **US09-D05:** Como desenvolvedor de rating, quero que a atualização de pontuação Glicko-2 seja executada em uma transação atômica (`prisma.$transaction`) com retries e isolamento serializável para prevenir perda de dados por concorrência.
6. **US09-D06:** Como arquiteto de segurança, quero que as políticas de Row Level Security (RLS) do Supabase impeçam que qualquer usuário modifique partidas passadas ou altere manualmente seu próprio rating no banco.
7. **US09-D07:** Como desenvolvedor de compatibilidade, quero que a tabela de partidas armazene a versão exata da Rules Engine utilizada (`engineVersion`), garantindo que atualizações futuras de regras não corrompam a reconstrução de replays legados.
8. **US09-D08:** Como engenheiro de confiabilidade, quero que variantes de peças customizadas deletadas por usuários sofram apenas Soft Delete (`deletedAt IS NOT NULL`), mantendo intactas as referências de replays de partidas históricas.
9. **US09-D09:** Como desenvolvedor de testes, quero suítes de testes de integração que realizem o ciclo completo: gravar partida, carregar do banco e reconstruir todos os estados via `ReplayEngine`, validando hash de estado idêntico ao original.
10. **US09-D10:** Como operador DevOps, quero scripts automatizados de backup diário e purga de partidas anônimas incompletas mais velhas que 7 dias para preservar espaço livre no PostgreSQL.

---

## 15. REQUISITOS FUNCIONAIS (RF) - BANCO DE DADOS E EVENT SOURCING

Abaixo estão formalizados os 15 requisitos funcionais mandatórios do subsistema de banco de dados e persistência.

1. **RF-01 (Esquema Relacional Tipado com Prisma):** O sistema deve definir o esquema de banco relacional no arquivo `schema.prisma`, gerenciando migrações tipadas para as tabelas `User`, `Match`, `MatchEventStream`, `PlayerRating` e `VariantDefinition`.
2. **RF-02 (Persistência por Event Sourcing):** A tabela `MatchEventStream` deve armazenar o histórico de lances como uma fita linear ordenada de eventos (coordenada de origem, coordenada de destino, tempo e ID da peça), vinculada à semente de inicialização.
3. **RF-03 (Compressão de Lances com LZ4):** Partidas encerradas que ultrapassem 50 lances devem ter seus payloads de eventos comprimidos com o algoritmo LZ4 antes da gravação no banco, economizando espaço em disco.
4. **RF-04 (Reconstrução Determinística com ReplayEngine):** O cliente web deve carregar a fita de eventos e a semente procedural do banco de dados e reconstruir a partida lance a lance através da classe `ReplayEngine` a 60 FPS sem chamadas adicionais de rede.
5. **RF-05 (Exportação e Importação de PGN Expandido):** O sistema deve fornecer funções para exportar partidas em arquivo de texto PGN compatível com FIDE com tags estendidas para variantes e importar PGNs válidos para visualização.
6. **RF-06 (Armazenamento Multidimensional de Glicko-2):** A tabela `PlayerRating` deve armazenar separadamente o rating de cada jogador para cada variante (`variantId`), contendo colunas para `ratingValue`, `ratingDeviation` e `volatility`.
7. **RF-07 (Atualização Atômica de Ratings Pós-Partida):** Ao final de cada partida ranqueada, o backend deve calcular a variação de Glicko-2 para todos os participantes e persistir os novos valores em transação atômica única no Prisma.
8. **RF-08 (Biblioteca de Peças Fadas e Variantes Customizadas):** A tabela `VariantDefinition` deve armazenar as regras, strings Betza e links de malhas 3D de variantes criadas por usuários no modo Sandbox/Workshop.
9. **RF-09 (Soft Delete para Preservação Histórica):** Variantes e peças customizadas excluídas pelo criador devem receber marcação de `deletedAt` sem remoção física da linha no banco, assegurando que replays passados continuem funcionais.
10. **RF-10 (Versionamento de Engine em Metadados de Partida):** Todo registro de partida deve salvar a versão semântica da Rules Engine (`engineVersion: "1.0.0"`), permitindo que o cliente acione o motor de regras adequado na reconstrução de partidas legadas.
11. **RF-11 (Políticas de Segurança por Linha - Supabase RLS):** O banco de dados deve aplicar regras de Row Level Security garantindo que apenas o usuário autenticado possa alterar seus próprios dados de perfil e que partidas privadas sejam visíveis apenas aos participantes.
12. **RF-12 (Tabelas de Classificação Otimizadas com Índices):** O banco de dados deve possuir índices B-Tree compostos nas colunas `(variantId, ratingValue DESC)` para responder a consultas de Leaderboard em tempo inferior a 30ms.
13. **RF-13 (Gravação Assíncrona Write-Behind):** O servidor Colyseus deve enfileirar o dump da partida finalizada em uma fila assíncrona, desvinculando a resposta imediata da partida do tempo de escrita no banco de dados.
14. **RF-14 (Estatísticas de Perfil de Jogador):** O sistema deve manter agregadores de estatísticas de usuário (total de partidas, vitórias, derrotas, empates, precisão média de lances e tempo total jogado).
15. **RF-15 (Purga Automática de Sessões Incompletas):** Partidas casuais abandonadas com menos de 2 lances e salas com timeout de lobby devem ser expurgadas da base de dados por uma rotina agendada diária.

---

## 16. REQUISITOS NÃO-FUNCIONAIS (RNF) - PERSISTÊNCIA E CAPACIDADE DO BANCO

Abaixo estão formalizados os 15 requisitos não-funcionais que governam o subsistema de dados e persistência.

1. **RNF-01 (Teto de Armazenamento por Partida):** O registro completo de uma partida de até 100 lances no PostgreSQL (metadados + fita de eventos comprimida) não deve exceder **5 Kilobytes** de espaço em disco.
2. **RNF-02 (Tempo Máximo de Escrita da Partida):** A operação assíncrona de inserção da partida e atualização dos ratings de todos os jogadores no banco não deve ultrapassar **100 milissegundos**.
3. **RNF-03 (Capacidade da Cota Gratuita do Supabase):** A arquitetura deve permitir armazenar mais de **100.000 partidas completas e 10.000 perfis de usuários** operando estritamente dentro da cota gratuita de 500 Megabytes do Supabase PostgreSQL.
4. **RNF-04 (Latência de Consulta de Histórico de Usuário):** A rota de recuperação das últimas 20 partidas de um usuário com paginação deve responder em menos de **50 milissegundos**.
5. **RNF-05 (Isolamento de Conexões Serverless):** O driver de banco de dados deve utilizar o `@neondatabase/serverless` ou o Connection Pooler PgBouncer do Supabase na porta 6543 para não estourar o limite de conexões simultâneas da instância gratuita.
6. **RNF-06 (Conformidade com ACID Estrita):** Todas as atualizações de rating e registros de resultados de partidas competitivas devem cumprir isolamento ACID através de transações de banco, prevenindo corrupção de classificação por concorrência.
7. **RNF-07 (Tempo de Reconstrução de Replay no Cliente):** A reconstrução em memória dos 100 primeiros lances de uma partida pelo `ReplayEngine` no navegador deve ocorrer em menos de **150 milissegundos**.
8. **RNF-08 (Segurança contra SQL Injection):** Exatos **100% das consultas de banco de dados** devem ser parametrizadas através do Prisma Client, com auditoria contra queries dinâmicas cruas não sanitizadas.
9. **RNF-09 (Indexação Estratégica com GIN):** Colunas de configuração de variantes em formato `JSONB` devem utilizar índices GIN para permitir buscas por modificadores específicos (`{"atomic": true}`) em tempo sub-milissegundo.
10. **RNF-10 (Cobertura de Testes de Migrações e Schemas):** O esquema Prisma e as funções de cálculo de rating devem possuir suíte de testes de integração com cobertura superior a **90%** em ambiente de CI.
11. **RNF-11 (Determinismo Absoluto na Reconstrução de Replays):** Dada a semente do mapa e a fita de eventos, o `ReplayEngine` deve reproduzir os mesmos estados de tabuleiro com exatidão de 100% comprovada por comparação de hash SHA-256 de posições.
12. **RNF-12 (Tolerância a Falhas com Dead Letter Queue):** Em caso de indisponibilidade temporária do banco de dados relacional, as partidas encerradas devem ser retidas em uma fila segura no Redis por até 24 horas antes do descarte.
13. **RNF-13 (Anonimização de Dados em Conformidade com LGPD):** A exclusão de uma conta de usuário deve substituir nome e avatar por dados anônimos e manter integridade referencial com os replays dos demais jogadores.
14. **RNF-14 (Tempo de Execução de Migrações):** Novas migrações geradas pelo Prisma (`prisma migrate deploy`) devem executar em menos de **5 segundos** sem bloqueios prolongados de tabelas em produção.
15. **RNF-15 (Eficiência de Leitura em Leaderboards):** A listagem dos 100 melhores jogadores ranqueados em qualquer variante deve ser atendida em menos de **25 milissegundos** utilizando índices cobridores (Covering Indexes).

---

## 17. ARQUITETURA DE DEPLOYMENT GRATUITA (FREE TIER) PARA O BANCO DE DADOS

O armazenamento de dados persistentes do `ChessInReact` foi estruturado para viver indefinidamente dentro do plano gratuito (Hobby/Free Tier) das plataformas modernas:

1. **Supabase PostgreSQL Gerenciado (Free Tier - $0):** O Supabase fornece uma instância de PostgreSQL 15 completa com 500MB de espaço em disco em discos SSD NVMe, 2 núcleos virtuais compartilhados e até 500MB de RAM. Com nossa estratégia de Event Sourcing e compressão LZ4, cada partida consome menos de 4KB, permitindo armazenar mais de 120.000 partidas sem pagar $1 centavo de hosting.
2. **Conexões Gerenciadas via PgBouncer:** Para evitar esgotar o limite de conexões diretas do plano gratuito (teto de 60 conexões simultâneas), todas as chamadas de API serverless da Vercel conectam-se através da porta de pooling transacional do PgBouncer embutido no Supabase, permitindo que centenas de lambdas consultem o banco de forma transparente.
3. **Backup Automatizado em JSONB no GitHub Releases / R2:** Como rotina preventiva de segurança contra perda de dados, um script de cron agendado roda semanalmente, extrai o dump das partidas em formato JSON compactado e armazena o arquivo no Cloudflare R2 gratuito como snapshot frio de recuperação.

---

## 18. MODOS DE JOGO E SUAS PECULIARIDADES DE PERSISTÊNCIA

1. **Partida Clássica 1v1:**
   - Persistência em notação algébrica padrão PGN.
   - Atualização direta de rating clássico Glicko-2 na tabela `PlayerRating`.
2. **Partida Hexagonal 4-Player FFA:**
   - Persistência em notação H-PGN estendida com coordenadas cúbicas $(q, r, s)$.
   - O array de eventos grava o `playerId` associado a cada lance para diferenciar os 4 participantes.
   - Cálculo de Glicko-2 via sistema de pares combinados (Pairwise Combinations) distribuindo pontuação para os 4 jogadores conforme a ordem de eliminação.
3. **Partida Endless Procedural:**
   - O registro salva estritamente a string da semente matemática de 64 bits (`seed: "alpha_9481"`) e as alterações no terreno provocadas por eventos especiais de jogo.
   - A reconstrução gera milimetricamente as mesmas montanhas e hexágonos sob demanda no cliente.
4. **Partida Crazyhouse:**
   - A fita de eventos inclui eventos do tipo `DROP_PIECE(coord, pieceType)` além dos movimentos convencionais, reconstruindo perfeitamente o inventário de reserva durante o replay.

---

## 19. SCHEMAS DE DADOS, TIPOS TYPESCRIPT E SCHEMA PRISMA OFICIAL

Abaixo consta a definição formal do arquivo `schema.prisma` da infraestrutura:

```prisma
// src-backend/database/prisma/schema.prisma

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id           String         @id @default(uuid())
  email        String?        @unique
  displayName  String
  avatarUrl    String?
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  deletedAt    DateTime?
  
  ratings      PlayerRating[]
  matches      PlayerMatchResult[]
  createdVariants VariantDefinition[]
}

model PlayerRating {
  id              String   @id @default(uuid())
  userId          String
  variantId       String
  ratingValue     Float    @default(1500.0)
  ratingDeviation Float    @default(350.0)
  volatility      Float    @default(0.06)
  updatedAt       DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, variantId])
  @@index([variantId, ratingValue(sort: Desc)])
}

model Match {
  id             String    @id @default(uuid())
  variantId      String
  topology       String
  seed           String
  engineVersion  String
  isRanked       Boolean   @default(true)
  timeControlSec Int
  totalTurns     Int
  outcome        String    // 'CHECKMATE', 'RESIGNATION', 'TIMEOUT', 'STALEMATE', 'DRAW'
  createdAt      DateTime  @default(now())

  eventStream    MatchEventStream?
  playerResults  PlayerMatchResult[]

  @@index([variantId, createdAt(sort: Desc)])
}

model MatchEventStream {
  id           String   @id @default(uuid())
  matchId      String   @unique
  compressed   Boolean  @default(true)
  eventsData   Bytes    // Buffer binário comprimido com LZ4 contendo os lances

  match Match @relation(fields: [matchId], references: [id], onDelete: Cascade)
}

model PlayerMatchResult {
  id         String   @id @default(uuid())
  matchId    String
  userId     String
  factionIdx Int
  finalRank  Int      // 1º, 2º, 3º, 4º colocado
  ratingDelta Float

  match Match @relation(fields: [matchId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([matchId, userId])
}

model VariantDefinition {
  id          String    @id @default(uuid())
  authorId    String
  displayName String
  topology    String
  betzaRules  Json      // Definições de peças fadas e regras de jogo em JSONB
  isPublic    Boolean   @default(false)
  createdAt   DateTime  @default(now())
  deletedAt   DateTime?

  author User @relation(fields: [authorId], references: [id], onDelete: Cascade)
}
```

---

## 20. CONCLUSÃO ARQUITETURAL DA SPEC 09

A Spec 09 resolve de forma definitiva o problema de persistência em jogos de xadrez tático procedurais de grande escala. Ao rejeitar o modelo ineficiente de snapshots de estado completo e adotar com rigor o padrão Event Sourcing com compressão LZ4 de fitas de lances aliada a sementes geradoras, a plataforma viabiliza replays instantâneos a 60 FPS, classificações Glicko-2 multidimensionais por variante e bibliotecas comunitárias de peças customizadas, operando com integridade ACID impecável dentro da cota gratuita vitalícia do Supabase PostgreSQL.
