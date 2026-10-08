# Spec 08: Backend Global, Matchmaker, Lobbies e Arquitetura Redis (Parte 1/4)

## A. OBRIGAÇÃO DE DENSIDADE E ABORDAGEM
A Spec 03 abordou como 2 a 8 jogadores jogam juntos numa partida **já iniciada** (Netcode/Rooms). Mas como eles se encontram? Como evitar que 20.000 jogadores na fila derrubem o Banco de Dados com polling? Como fazer CDN de Espectadores?
O Backend Macro exige a separação do *Game Server* (Stateful Colyseus Node) do *Matchmaker Server* (Stateless HTTP/Redis) criando uma malha distribuída de Microsserviços e Webhooks.

## 1. OBJETIVO DO SUBSISTEMA MATCHMAKER
Fornecer Lobbies em tempo real e Filas de Elo (Ranked Matchmaking) escaláveis para milhares de jogadores, garantindo tolerância a falhas (Stateless Servers), propagação global Pub/Sub para espectadores, e integração correta de JWT Auth para proteção Anti-Smurf.

## 2. ESCOPO
**PERTENCE A ESTA SPEC:**
- API Gateway (Stateless REST/GraphQL).
- Matchmaker de ELO (Redis Sorted Sets).
- Distribuição de Lobbies (Colyseus Presence / Redis).
- Relay de Espectadores via CDN (Pub/Sub).
- Arquitetura de Load Balancing (NGINX/HAProxy).

**NÃO PERTENCE:**
- Estrutura de Tabelas de Usuário Postgres/Prisma (Ver Spec 09).
- Serialização das Peças In-Game (Ver Spec 03).

## 3. REQUISITOS E CONSTRAINTS
### 3.1 Constraints de Persistência no Matchmaker
- **Constraint:** Armazenar os Lobbies (Salas aguardando players) numa Variável de Memória RAM na porta 3000 impede escalar o servidor. Se rodarmos `pm2 scale api 4`, o Lobby criado no Processo 1 será invisível pro jogador logado no Processo 2.
- **Resolução Arquitetural:** Servidores Node.js são 100% Stateless. O Estado do Lobby existe exclusivamente no Redis. Utilizamos a interface do `RedisPresence` do Colyseus para que todos os nodes do cluster tenham a mesma visão do pareamento em nanossegundos.

### 3.2 Constraints de Polling na Fila (Queue Constraints)
- **Constraint:** 10.000 jogadores aguardando partida de "Xadrez Triangular N-Player" efetuando GET requests (`/api/match/status`) a cada segundo derrubarão as instâncias EC2 e esgotarão o Pool de conexões do Banco.
- **Resolução Arquitetural:** Abolição completa de Polling REST. O fluxo "Fila -> Partida" se dá via SSE (Server-Sent Events) estritos na camada NGINX ou, mais barato, por Inscrição Pub/Sub numa fila temporária no Redis, gerenciada pelo Worker de Pareamento.

## 4. PESQUISA MATRIX: FONTES EXTERNAS E VALIDAÇÃO DE ARQUITETURA

### Fonte 1: "Matchmaking Algorithm for Multiplayer Games" (AWS Docs / FlexMatch)
- **URL:** https://aws.amazon.com/gamelift/flexmatch/
- **Problema Resolvido:** Como agrupar 8 pessoas com ELOs similares antes de lançar o servidor.
- **Decisão Arquitetural:** Adotamos o modelo "Ticket-Based". O jogador pede pra jogar e recebe um Ticket. Um Microserviço Worker (desacoplado do HTTP Server) varre a fila do Redis (Usando `ZREVRANGEBYSCORE` para pegar ELOs em janelas dinâmicas, ex: $\pm 50$ ELO, se demorar $>30s$, expande para $\pm 100$ ELO).

### Fonte 2: "Redis Pub/Sub vs Streams for Event Sourcing"
- **Problema Resolvido:** Se o servidor Node.js craschar, Pub/Sub perde as mensagens "Match Found" enviadas.
- **Decisão:** O Matchmaker não enviará as aprovações via Pub/Sub puro, utilizará Redis Streams (`XADD`). O Worker gera o Match, joga no Stream. A API Node consome, lê e notifica os clientes (Ack). Se a API morrer no processo, outra instância reinvidica a leitura Pendente.

### Fonte 3: "Scaling WebSockets in Node.js" (Uber Engineering Blog)
- **Problema Resolvido:** O gargalo das 65.535 portas do protocolo TCP (Ephemeral Ports) e consumo de RAM.
- **Decisão:** A Sala de Jogo (Colyseus) é pesada (Stateful). Para o Lobby e Matchmaking, os WebSockets do cliente não conectam ao GameServer. Eles conectam a um **Relay Stateless leve** (Socket.io puro sem Colyseus ou SSE). Apenas quando o Match é confirmado, o cliente recebe a URL assinada (JWT Token) para migrar a conexão TCP para o Servidor Stateful do Colyseus.

### Fonte 4: "Twitch / Lichess Spectator Scale" (Lichess Open Source Analysis)
- **Problema Resolvido:** Um streamer puxa 20.000 espectadores ao vivo pra dentro do jogo.
- **Conclusão Técnica:** Se o Game Server do Colyseus tentar enviar o delta do tabuleiro pra 20.000 sockets simultaneamente na mesma aba do Node, o Event Loop bloqueará por $>50ms$ e o servidor ficará inacessível pros próprios jogadores (Rubberband imediato).
- **Decisão:** A Sala de jogo Colyseus manda exatamente 1 mensagem para o Redis Pub/Sub: `PUBLISH "spectate:matchId" payload`.
O Load Balancer distribui os 20k espectadores entre 20 servidores "Relay" baratos na ponta (Edge). Cada Relay ouve o Redis e duplica a mensagem para 1.000 sockets. A latência sobe $\sim 20ms$, o que é irrelevante para espectadores.

### GitHub 1: colyseus/colyseus-redis-presence
- **Repositório:** https://github.com/colyseus/colyseus-redis-presence
- **Decisão influenciada:** Utilizar o driver nativo para fazer o match `room.create()` no backend sem expor diretamente o Game Server no NGINX raiz. A `matchMake` API distribui o tráfego.

### GitHub 2: Lichess (scala)
- **Estrutura Estudada:** `Fishnet` (Sistema distribuído de Análise de CPU).
- **Problema Resolvido:** Jogadores pedindo a IA pra analisar a partida no Servidor.
- **Decisão influenciada:** A IA de análise (Stockfish/MaxN) nunca roda no Servidor Central. A Spec 05 rodava no Browser do usuário. Se o usuário quiser análise pós-jogo no Cloud, usaremos Filas (RabbitMQ/Redis) e Workers "Fishnet" Serverless que recebem o FEN, gastam sua própria CPU e salvam a resposta.

## 5. ESTRUTURA REAL DE DIRETÓRIOS DO BACKEND DISTRIBUÍDO

```text
microservices/
  api-gateway/
    src/
      controllers/           // Validação JWT e Endpoints Stateless
      routes/matchmaker.ts   // Acesso ao Redis Queue
  matchmaker-worker/
    src/
      EloMatcher.ts          // Busca ZREVRANGE constante no Redis
      RoomAllocator.ts       // Avisa Colyseus pra gerar a Sala
  game-stateful/
    src/
      rooms/                 // As salas da Spec 03
  edge-relay/
    src/
      SpectatorRelay.ts      // Ouve o Redis e cospe WebSockets Leves
```

(CONTINUA NA PARTE 2)
## 6. O FLUXO DE MATCHMAKING (ZREVRANGEBYSCORE)

Quando um jogador solicita uma partida, o Frontend bate no Gateway (Stateless):
`POST /api/matchmaking/join { variant: "N_PLAYER_HEX", players: 4 }`
O Gateway insere o Ticket no Redis Sorted Set (`ZADD`) usando o ELO do jogador como Score.

### 6.1 O Ticket e a Fila Dinâmica no Worker

O Worker, um processo Node.js em background que não recebe HTTP, possui o Loop de Matchmaking:

```typescript
// microservices/matchmaker-worker/src/EloMatcher.ts
import { Redis } from 'ioredis';

const redis = new Redis();

export async function matchLoop() {
  setInterval(async () => {
     // Exemplo de Fila: Variante Xadrez Hexagonal de 4 Jogadores
     const queueKey = `queue:variant_hex4`;
     
     // 1. Pegamos todos os usuários aguardando
     // No mundo real, usaríamos LUA Scripts atômicos
     const waitingPlayers = await redis.zrange(queueKey, 0, -1, 'WITHSCORES');
     
     // Logica de agrupamento flexível baseada em Tempo de Fila (Expandindo Janela de ELO)
     const matchGroups = formValidMatches(waitingPlayers, 4 /* groupSize */);
     
     for (const group of matchGroups) {
         // Remove da fila atomicamente
         await redis.zrem(queueKey, ...group.map(p => p.playerId));
         
         // 2. Chama a API interna do Colyseus (Game-Stateful) pra reservar Sala
         const roomId = await requestRoomAllocation(group);
         
         // 3. Notifica via Redis Pub/Sub os clientes que a sala tá pronta com o Ticket JWT
         await redis.publish(`match_ready`, JSON.stringify({
             roomUrl: `ws://game.server.io/match/${roomId}`,
             players: group
         }));
     }
  }, 1000); // 1 Tick por segundo no Matchmaker
}

function formValidMatches(players: any[], groupSize: number) {
    // Ordena por tempo de espera (quem entrou antes)
    players.sort((a,b) => a.timestamp - b.timestamp);
    // Agrupa 4 jogadores cuja diferença de ELO (score) seja menor que o threshold expandido pelo tempo de fila
    // ... omitido por brevidade
}
```

## 7. SISTEMA DE AUTORIDADE E ANTI-SMURF JWT

No Xadrez Clássico, os servidores sofrem com jogadores criando 1.000 contas gratuitas e abandonando partidas (Smurfs / Trolls). O Game Server Stateful precisa confiar em quem conecta.

### 7.1 JWT Handsake no Colyseus

```typescript
// microservices/game-stateful/src/rooms/ChessRoom.ts
import { Room } from '@colyseus/core';
import jwt from 'jsonwebtoken';

export class ChessRoom extends Room {
   async onAuth(client, options, request) {
       // O cliente deve provar que veio do Matchmaker, e não de um F5 manual da porta WebSocket.
       const token = options.matchTicket;
       if (!token) throw new Error("Missing Auth");

       try {
           const payload = jwt.verify(token, process.env.JWT_SECRET);
           
           // O Matchmaker embutiu no JWT que este cara PERTENCE a esta sala (matchId).
           if (payload.matchId !== this.roomId) {
               throw new Error("Wrong Room Ticket");
           }
           
           // Validação extra: Previne que o mesmo usuário logue em 2 abas na mesma cadeira
           if (this.state.players.has(payload.userId)) {
               throw new Error("Already connected");
           }

           // Retorna os dados do usuário, que o Colyseus atrela ao `client.userData`
           return { userId: payload.userId, elo: payload.elo };
       } catch (e) {
           return false; // Connection Rejected no Handshake (Baixíssimo consumo CPU)
       }
   }
}
```

(CONTINUA NA PARTE 3)
## 8. RELAY DE ESPECTADORES E PRESENÇA (REDIS PRESENCE)
Para implementar a lista de "Amigos Online" e Lobbies no NutriOpus Sidebar sem pingar o DB, o Colyseus RedisPresence salva a listagem de salas ativas eficientemente.
Contudo, se um campeonato entre 4 Grandes Mestres ocorre na sala `id=grand_final`, e $20.000$ pessoas querem assistir:

### 8.1 A Desvinculação do Espectador (Edge Relay)
O `game-stateful` nodeJS emite um Redis Broadcast.

```typescript
// No ChessRoom.ts (Game Server)
this.onMessage("PLAYER_MOVE", (client, moveData) => {
    // validação do movimento...
    
    // Broadcast para quem tiver interessado (Não gasta RAM do Game Server!)
    redis.publish(`spectate:${this.roomId}`, JSON.stringify(moveData));
});
```

Um servidor auxiliar, chamado de `edge-relay` (Hospedado na Cloudflare Workers ou AWS ECS), possui uma rota simples `/api/spectate/:roomId` usando **SSE (Server-Sent Events)** ou Websocket leve.

```typescript
// microservices/edge-relay/src/SpectatorRelay.ts
import express from 'express';
import { Redis } from 'ioredis';

const app = express();
const redis = new Redis();

app.get('/api/spectate/:roomId', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    
    const channel = `spectate:${req.params.roomId}`;
    
    // O Relay server se inscreve no Redis (apenas 1 conexão Redis pro Relay, independentemente
    // de ter 10 ou 1.000 espectadores pendurados nesta rota SSE localmente).
    const subscriber = redis.duplicate();
    subscriber.subscribe(channel);
    
    subscriber.on('message', (ch, message) => {
        if (ch === channel) {
            res.write(`data: ${message}\n\n`); // Cospe no browser
        }
    });

    req.on('close', () => {
        subscriber.unsubscribe();
        subscriber.quit();
    });
});
```
*O Client R3F do Espectador engole os SSE via API DOM e despacha no Zustand O(1) usando o `syncState` idêntico ao do jogador. Como resultado, o Frontend tem Zero mudanças de arquitetura para suportar o Spectate.*

## 9. FAILURE MODES NO BACKEND GLOBAL

### 9.1 Failure Mode: "Fila Zumbi" (Zombie Queue Lock)
- **Cenário:** O jogador clica em "Procurar Partida". O Ticket dele é criado no Redis. O browser dele crascha 1 segundo depois (Fechou aba sem disparar `beforeunload`). O Worker processa a fila, vê o Ticket, aloca a sala Colyseus pesada e manda o Match_Ready via PubSub. A sala Colyseus fica eternamente vazia ocupando memória porque o jogador "sumiu", e a partida não inicia pros outros 3 coitados.
- **Resolução Arquitetural (Heartbeat & TTL):** 
Os tickets no Sorted Set da Fila recebem um Score (Timestamp). O Cliente Frontend, enquanto estiver na tela "Buscando oponente...", precisa fazer um ping leve na rota de Gateway (REST) `/api/matchmaking/ping` a cada 5 segundos para renovar a "Vida" do ticket. O Worker Roda uma Cleanup Job: remove todos os elementos do SortedSet onde `score < Date.now() - 15_000ms`. Se o cara caiu, o ticket evapora antes da sala alocar.

### 9.2 Failure Mode: "Race Condition na Criação de Sala Colyseus"
- **Cenário:** Numa arquitetura multi-node (`Worker A` e `Worker B` lendo do Redis), ambos os Workers varrem o `queue:variant_hex4`, pegam os MESMOS 4 jogadores num intervalo de nanossegundos, e emitem duas ordens de `createRoom()`. O sistema gera 2 partidas duplicadas e quebra os clientes.
- **Resolução Arquitetural (Distributed Lock com Redlock):** 
Para acessar a fila de uma variante específica e popar arrays, os Workers precisam solicitar um Lock no Redis:
`SET lock:hex4_queue 1 NX PX 100`. Apenas o Worker que adquirir o lock pode rodar o ZRANGE e ZREM. Isso garante estrito processamento single-thread do Matchmaker em micro-janelas de 100ms, sem perda de escalabilidade.

(CONTINUA NA PARTE 4)
## 10. INTEGRAÇÃO COM A INFRAESTRUTURA DOCKER/K8S
Como testamos a orquestração do Matchmaker, Colyseus, Redis e Postgres localmente?

### 10.1 `docker-compose.yml` (Arquitetura)
```yaml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    
  matchmaker-api:
    build: ./microservices/api-gateway
    environment:
      - REDIS_URL=redis://redis:6379
    ports: ["3000:3000"]
    depends_on: [redis]

  matchmaker-worker:
    build: ./microservices/matchmaker-worker
    environment:
      - REDIS_URL=redis://redis:6379
    # O Worker não expõe porta TCP!
    depends_on: [redis]

  game-server:
    build: ./microservices/game-stateful
    environment:
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=local_dev_secret
    ports: ["2567:2567"]
    deploy:
      replicas: 2 # Simulando Load Balancing stateful
```

## 11. PLANO DE IMPLEMENTAÇÃO DA SPEC 08
1. Criar repositórios/pastas desacopladas em Node.js TS para `gateway`, `worker` e `game-server`.
2. Modelar o JWT de Matchmaking na biblioteca `jsonwebtoken` e validá-lo no Hook `onAuth` da sala ChessRoom (Colyseus).
3. Escrever a LUA Script de Matchmaking que consome a Sorted Set (ELO), agrupa $N$ players em Tuplas e os deleta atomicamente usando Node `ioredis`.
4. Programar o Edge-Relay em Express, roteando o PubSub Redis para chamadas SSE text/event-stream do navegador.
5. Inserir a mecânica de `Ping/TTL` na UI de "Waiting Match" no Frontend React para gerenciar Fila Zumbi e evitar o travamento de Lobbies mortos no backend.

## 12. CRITÉRIOS DE ACEITE
1. **Matchmaker Horizontally Scalable:** Lançar 5 instâncias simultâneas do `matchmaker-worker` apontadas pro mesmo cluster Redis não pode causar erros duplicados de criação de sala (Testado sob carga de milhares de tickets). O Lock Distribuído garante processamento Exclusivo em janela.
2. **Spectator Edge-Scale:** O Frontend deve conseguir se conectar via rota REST SSE a uma partida existente. Sem abrir nenhuma conexão WebSocket pesada (Colyseus), o estado visual O(1) do tabuleiro R3F tem que espelhar 100% fielmente a partida em tempo real, consumindo menos de `1KB/s` de banda de download.
3. **Resiliência Anti-DDoS no Auth:** Jogadores não-autenticados ou com Token forjado não conseguirão iniciar a negociação de Upgrade WSS com o NodeJS principal do Colyseus. A queda ocorre no `onAuth` primitivo antes do Colyseus alocar as sessões internas do MapSchema, blindando as CPUs do servidor estadual contra floods TCP.

---
*Fim da Spec 08. O Frontend e o Backend estão conectados por um Matchmaker maduro com Filas seguras. Mas todo Xadrez online precisa armazenar o histórico de jogos, PGN, Variantes da Comunidade, e Rankings na conta do usuário num Banco de Dados SQL sólido. A Spec 09 trará a Arquitetura Postgres/Prisma focado no Ecosistema e Histórico.*


## 13. REPOSITÓRIOS GITHUB E REFERÊNCIAS EXTERNAS (MATCHMAKER, REDIS E LOBBIES)

Abaixo documentamos as fontes de arquitetura de microsserviços distribuídos, bancos de dados em memória e sistemas de filas de pareamento de alta escala analisadas para o `ChessInReact`.

### 13.1 Projetos Open Source Analisados
1. **GitHub: `redis/ioredis`**
   - **Link:** https://github.com/redis/ioredis
   - **Resumo Técnico:** O cliente Redis mais completo e performático para Node.js, com suporte nativo a pipelines, Pub/Sub, Sentinel, Cluster e execução atômica de scripts Lua customizados.
   - **Como Aproveitaremos no Projeto:** Toda a transação de match de jogadores é executada através de um script Lua atômico (`EVALSHA`) no Redis. O script consulta os Sorted Sets de ELO, extrai a tupla de $N$ jogadores que se enquadram na janela de pontuação, remove os tickets da fila e cria a sala em uma única operação indivisível, impedindo condições de corrida onde um jogador seja alocado em duas salas ao mesmo tempo.

2. **GitHub: `upstash/redis-js`**
   - **Link:** https://github.com/upstash/redis-js
   - **Resumo Técnico:** Cliente HTTP/REST serverless para Redis gerenciado pela Upstash, dispensando a necessidade de manter conexões TCP ativas permanentes.
   - **Como Aproveitaremos:** Utilizaremos o SDK da Upstash nas rotas de API serverless do Matchmaker hospedadas na Vercel. Cada requisição HTTP de "Entrar na Fila" ou "Checar Status" executa uma query REST rápida ao Redis e finaliza imediatamente, operando dentro do plano gratuito da Upstash (10.000 comandos diários) com custo operacional de $0.

3. **GitHub: `googleforgames/open-match`**
   - **Link:** https://github.com/googleforgames/open-match
   - **Resumo Técnico:** Framework flexível de matchmaking de código aberto criado pela Google Cloud e Unity para orquestrar filas de jogos competitivos em larga escala.
   - **Como Aproveitaremos:** Adotamos os princípios de design do Open Match: separação clara entre a emissão de tickets (Ticket Lifecycle), funções de correspondência de regras (Match Function) e atribuição de servidores (Assignment Service), permitindo plugar novos filtros de variantes com facilidade.

4. **GitHub: `m-lundberg/glicko2-js`**
   - **Link:** https://github.com/m-lundberg/glicko2-js
   - **Resumo Técnico:** Implementação em JavaScript do sistema de rating Glicko-2 desenvolvido pelo Dr. Mark Glickman, utilizado oficialmente pela FIDE, Lichess e Valve.
   - **Como Aproveitaremos:** O cálculo de pontuação competitiva dos jogadores do `ChessInReact` é governado pelo Glicko-2. O sistema armazena a trinca $(Rating, RD, \sigma)$ de cada jogador no banco de dados e calcula a incerteza de habilidade (Rating Deviation), prevenindo que contas inativas distorçam o equilíbrio das partidas ranqueadas.

5. **GitHub: `taskforcesh/bullmq`**
   - **Link:** https://github.com/taskforcesh/bullmq
   - **Resumo Técnico:** Sistema de processamento de filas de tarefas assíncronas e agendamento de jobs para Node.js baseado inteiramente em streams e estruturas do Redis.
   - **Como Aproveitaremos:** Utilizado pelo worker de background para tarefas periódicas: expirar lobbies inativos após 10 minutos sem interação, auditar partidas abandonadas e acionar arquivamento assíncrono de PGNs no Supabase sem onerar o fluxo em tempo real.

6. **GitHub: `auth0/node-jsonwebtoken`**
   - **Link:** https://github.com/auth0/node-jsonwebtoken
   - **Resumo Técnico:** Biblioteca para emissão, assinatura criptográfica (HMAC-SHA256 ou RSA) e verificação de tokens JSON Web Token (JWT).
   - **Como Aproveitaremos:** Quando o Matchmaker forma uma partida com sucesso, ele emite um `MatchTicketToken` assinado com validade efêmera de 30 segundos. Esse token contém o `roomId`, o `assignedPlayerId` e o `factionIndex`. O servidor Colyseus só aceita a conexão WebSocket se o token for matematicamente verificado no handshake inicial.

7. **GitHub: `honojs/hono`**
   - **Link:** https://github.com/honojs/hono
   - **Resumo Técnico:** Framework web ultrarrápido e minimalista em TypeScript projetado para rodar em runtimes de Edge (Cloudflare Workers, Vercel Edge, Deno, Node.js).
   - **Como Aproveitaremos:** As rotas REST do Matchmaker Gateway são construídas sobre o Hono. Por não carregar dependências pesadas do Express, o tempo de inicialização a frio (Cold Start) nas funções serverless da Vercel cai para menos de 10ms.

8. **GitHub: `colyseus/presence-redis`**
   - **Link:** https://github.com/colyseus/colyseus
   - **Resumo Técnico:** Módulo de presença distribuída para o Colyseus que utiliza Redis como barramento de sincronização entre múltiplos processos Node.js.
   - **Como Aproveitaremos:** Permite que servidores Colyseus distribuídos compartilhem a lista de salas abertas, capacidade de jogadores e contagem de espectadores sem requisições HTTP manuais entre instâncias.

9. **GitHub: `upstash/ratelimit`**
   - **Link:** https://github.com/upstash/ratelimit
   - **Resumo Técnico:** Algoritmo de controle de taxa de requisições baseado em Token Bucket e Sliding Logs sobre Redis.
   - **Como Aproveitaremos:** Protege as rotas de busca de partidas contra cliques repetidos de bots e abusos: cada usuário autenticado é limitado a no máximo 2 solicitações de fila por segundo.

10. **GitHub: `socketio/socket.io`**
    - **Link:** https://github.com/socketio/socket.io
    - **Resumo Técnico:** Biblioteca clássica para comunicação bidirecional em tempo real para web com fallback automático para HTTP Long-Polling.
    - **Como Aproveitaremos:** Utilizada como camada de fallback leve para os relays de chat global do saguão e notificações sociais, mantendo o tráfego recreativo isolado das portas TCP competitivas do Colyseus.

---

## 14. HISTÓRIAS DE USUÁRIO (USER STORIES) - MATCHMAKING E LOBBIES

### 14.1 Histórias de Usuário do Jogador (Player Perspective)
1. **US08-P01:** Como jogador competitivo, quero clicar em "Jogar Ranqueada" e ser pareado em menos de 15 segundos com um adversário com pontuação ELO próxima à minha (diferença de até 50 pontos).
2. **US08-P02:** Como competidor em fila de espera, quero poder clicar no botão "Cancelar Busca" a qualquer momento antes do início da partida e sair da fila imediatamente sem perda de pontos.
3. **US08-P03:** Como participante de um modo hexagonal de 4 jogadores, quero que o matchmaker encontre 3 oponentes de níveis equilibrados para formar uma arena justa e emocionante.
4. **US08-P04:** Como fã de variantes malucas, quero navegar por uma lista pública de "Lobbies Casuais" criados pela comunidade e entrar em salas abertas com um único clique.
5. **US08-P05:** Como anfitrião de uma partida amistosa, quero criar uma sala privada protegida por senha ou código alfanumérico curto (ex: `HEX-8841`) e compartilhar o link com meus amigos no WhatsApp ou Discord.
6. **US08-P06:** Como espectador, quero abrir a aba "Assistir ao Vivo" no saguão e ver a lista de partidas ranqueadas dos melhores jogadores do servidor no momento, clicando para assistir instantaneamente.
7. **US08-P07:** Como jogador, quero visualizar o tempo estimado de espera na fila e o número de pessoas buscando partidas no mesmo modo em tempo real.
8. **US08-P08:** Como competidor em horário de baixo movimento, se a busca demorar mais de 30 segundos, quero que a janela de tolerância de ELO se expanda gradualmente de forma transparente para encontrar uma partida sem espera infinita.
9. **US08-P09:** Como usuário que acabou de encontrar uma partida, quero ouvir um aviso sonoro claro de alerta ("Partida Encontrada!") e ver um botão de confirmação ("Aceitar Partida") com contagem regressiva de 10 segundos.
10. **US08-P10:** Como líder de uma sala personalizada, quero poder configurar regras específicas da partida (tempo de relógio, variante de tabuleiro, permissão de espectadores e bots) antes de iniciar o jogo.
11. **US08-P11:** Como jogador casuais, quero poder criar uma partida anônima rápida sem necessidade de login prévio, sendo atribuído a uma fila casual com identificação temporária.
12. **US08-P12:** Como competidor sério, se eu recusar a partida após o alerta de pareamento ou não aceitar dentro do prazo, quero que o sistema me aplique uma pausa de espera de 1 minuto antes de permitir entrar na fila novamente (Penalidade Anti-Dodge).
13. **US08-P13:** Como usuário em tela mobile, quero que a tela de busca de partida exiba uma animação estilosa no HUD enquanto o pareamento ocorre em segundo plano.
14. **US08-P14:** Como participante de um torneio suíço organizado no site, quero que as rodadas sejam emparelhadas automaticamente pelo sistema ao final de cada rodada com tabela de classificação atualizada.
15. **US08-P15:** Como jogador, quero salvar minhas variantes favoritas no saguão para criar salas com essas regras pré-configuradas com um único toque.

### 14.2 Histórias de Usuário do Desenvolvedor e Arquiteto (Developer/Architect Perspective)
1. **US08-D01:** Como arquiteto backend, quero que o serviço de API do Matchmaker seja 100% Stateless e hospedado em funções serverless da Vercel, delegando todo o estado compartilhado para o Upstash Redis.
2. **US08-D02:** Como desenvolvedor de concorrência, quero que o emparelhamento de jogadores execute scripts Lua atômicos no Redis para garantir que nenhum jogador seja alocado simultaneamente em duas salas diferentes.
3. **US08-D03:** Como engenheiro de performance, quero que os tickets de busca de jogadores possuam Time-To-Live (TTL) de 30 segundos no Redis com renovação automática via heartbeat do frontend, eliminando jogadores "fantasmas" que fecharam a aba.
4. **US08-D04:** Como mantenedor de infraestrutura gratuita, quero que a arquitetura respeite o limite de 10.000 requisições diárias do plano gratuito do Upstash Redis através de agrupamento em pipelines e ausência de polling desnecessário.
5. **US08-D05:** Como engenheiro de segurança, quero que o token de acesso à sala (`MatchTicketToken`) seja assinado criptograficamente com HMAC-SHA256 e expire em 30 segundos, prevenindo spoofing e entrada de intrusos nas salas.
6. **US08-D06:** Como desenvolvedor de rede, quero que a transmissão de eventos da partida para milhares de espectadores utilize Redis Pub/Sub e conexões SSE (Server-Sent Events) distribuídas em instâncias Edge leves, preservando a CPU do servidor Colyseus.
7. **US08-D07:** Como operador de banco de dados, quero que o Matchmaker nunca realize consultas pesadas ao PostgreSQL durante o processo ativo de fila, buscando ratings em cache rápido no Redis.
8. **US08-D08:** Como desenvolvedor de testes, quero suítes de testes de carga que simulem 1.000 requisições concorrentes de entrada na fila e validem a integridade das tuplas geradas sem duplicação de tickets.
9. **US08-D09:** Como engenheiro de confiabilidade, quero que falhas temporárias na conexão com o Redis sejam tratadas com retry exponencial e aviso claro na interface do usuário sem crashar as funções serverless.
10. **US08-D10:** Como desenvolvedor de balanceamento, quero que as janelas de ELO do algoritmo de pareamento sejam configuráveis por variáveis de ambiente no Vercel Dashboard sem necessidade de novo deploy do código.

---

## 15. REQUISITOS FUNCIONAIS (RF) - MATCHMAKER, LOBBIES E FILAS

Abaixo estão formalizados os 15 requisitos funcionais mandatórios do subsistema de matchmaking e gerenciamento de salas.

1. **RF-01 (Emissão e Ciclo de Vida de Tickets):** O endpoint REST `/api/matchmaker/queue` deve autenticar o usuário, criar um ticket de busca com timestamp, modo e rating no Redis e retornar um `ticketId` exclusivo para o cliente.
2. **RF-02 (Algoritmo de Pareamento por Sorted Sets de ELO):** O worker de pareamento deve indexar tickets em Sorted Sets do Redis (`queue:variantId`) ordenados por pontuação ELO, realizando buscas de tuplas compatíveis via scripts Lua atômicos.
3. **RF-03 (Expansão Dinâmica da Janela de ELO):** Se um ticket permanecer na fila por mais de 15 segundos, o intervalo aceitável de diferença de ELO deve se expandir automaticamente a cada 15 segundos (ex: $\pm 50 \rightarrow \pm 100 \rightarrow \pm 200$), priorizando formação de partida sobre tempo de espera.
4. **RF-04 (Suporte a Matchmaking Multijogador de 3 a 8 Jogadores):** Em variantes com mais de 2 participantes, o sistema deve agrupar tuplas completas de $N$ jogadores respeitando o equilíbrio da média de ratings de todos os participantes.
5. **RF-05 (Heartbeat de Fila e Expiração Automática de Tickets):** O cliente na fila deve enviar um ping de renovação a cada 5 segundos; tickets sem atualização por mais de 15 segundos devem ser descartados automaticamente pelo TTL do Redis.
6. **RF-06 (Criação de Lobbies Privados e Protegidos):** O sistema deve permitir que qualquer usuário crie uma sala privada com senha ou código de acesso de 6 caracteres alfanuméricos, gerando um link direto de compartilhamento.
7. **RF-07 (Listagem Pública de Salas Casuais):** O endpoint `/api/lobbies/public` deve retornar a lista de salas abertas aguardando jogadores, com filtros por variante, topologia, limite de tempo e status.
8. **RF-08 (Emissão de Token Assinado de Sala - Room JWT):** Ao formar uma partida com sucesso, o sistema deve registrar a sala no Colyseus e emitir um JWT assinado contendo os metadados necessários para o cliente realizar o handshake de WebSocket.
9. **RF-09 (Notificação Instantânea de Partida Encontrada):** O cliente na fila deve ser notificado sobre a partida encontrada via Server-Sent Events (SSE) ou polling leve espaçado em 2 segundos sem bloquear a thread.
10. **RF-10 (Penalidade Anti-Dodge por Abandono de Fila):** Jogadores que recusarem a partida formada ou deixarem o tempo de confirmação expirar devem receber uma trava temporária impedindo reentrada na fila por 60 segundos.
11. **RF-11 (Relay de Transmissão para Espectadores):** O servidor Colyseus deve publicar deltas da partida no canal Redis Pub/Sub `match:matchId:events`, permitindo que servidores relay distribuídos transmitam as jogadas para espectadores via SSE sem tocar no servidor de jogo.
12. **RF-12 (Limitação de Taxa de Requisições - Rate Limiting):** A API do Matchmaker deve limitar cada usuário autenticado a no máximo 2 requisições de fila por segundo, frustrando tentativas de flood e ataques de negação de serviço.
13. **RF-13 (Cálculo e Atualização de Rating Glicko-2):** Ao término oficial da partida, o servidor deve calcular a atualização dos ratings dos jogadores utilizando a fórmula do Glicko-2 e atualizar os valores no banco de dados e no cache do Redis.
14. **RF-14 (Sincronização de Presença de Usuários):** O sistema deve rastrear e exibir a contagem de jogadores online no saguão e em cada modalidade através de contadores atômicos com HyperLogLog no Redis.
15. **RF-15 (Purga e Coleta de Lobbies Inativos):** Lobbies criados que permaneçam sem início de partida e sem movimentação por mais de 10 minutos devem ser encerrados e removidos da listagem automaticamente.

---

## 16. REQUISITOS NÃO-FUNCIONAIS (RNF) - ESCALABILIDADE E LATÊNCIA DO MATCHMAKER

Abaixo estão formalizados os 15 requisitos não-funcionais que governam o subsistema de matchmaking e Redis.

1. **RNF-01 (Latência Máxima de Resposta da API Gateway):** As rotas HTTP do Matchmaker devem responder com latência média inferior a **40 milissegundos** no Vercel Edge.
2. **RNF-02 (Tempo de Execução do Script Lua no Redis):** A execução do script de emparelhamento no Redis não deve ultrapassar **2 milissegundos** por invocação.
3. **RNF-03 (Conformidade com Free Tier do Upstash Redis):** A arquitetura deve limitar o volume total de comandos no Redis a menos de **10.000 requisições por dia**, respeitando com margem o plano gratuito da Upstash.
4. **RNF-04 (Isolamento Stateless de Instâncias):** Exatos **0% de estado de salas ou filas** podem ser armazenados em variáveis de memória locais de processos Node.js, garantindo escalabilidade horizontal e tolerância a reinicializações.
5. **RNF-05 (Capacidade de Concorrência na Fila):** A estrutura de filas no Redis deve suportar até **2.000 jogadores simultâneos** aguardando partidas sem degradação de performance.
6. **RNF-06 (Tempo de Expiração de Tokens de Sala):** Os tokens JWT emitidos para handshake na sala devem expirar em exatamente **30 segundos**, impedindo uso indevido posterior por terceiros.
7. **RNF-07 (Tamanho do Payload de Ticket de Fila):** O tamanho de cada objeto de ticket armazenado no Redis deve ser inferior a **250 bytes**, minimizando consumo de memória do banco.
8. **RNF-08 (Disponibilidade e Tolerância a Quedas):** Em caso de falha de conexão temporária com o Redis, a API deve responder com status HTTP 503 claro e instruir o cliente a tentar novamente em 3 segundos sem congelamento da UI.
9. **RNF-09 (Segurança Criptográfica de Assinatura):** O segredo criptográfico (`JWT_SECRET`) utilizado para assinar os tickets deve possuir entropia mínima de 256 bits, configurado exclusivamente por variáveis de ambiente seguras.
10. **RNF-10 (Throughput de Transmissão para Espectadores):** A arquitetura de relay via SSE/PubSub deve suportar até **1.000 espectadores simultâneos** por partida com impacto inferior a 1% na CPU do servidor Colyseus da partida.
11. **RNF-11 (Precisão de Classificação Glicko-2):** A fórmula de atualização de Glicko-2 deve calcular ratings com precisão de ponto flutuante de 64 bits, registrando histórico de desvio para auditoria competitiva.
12. **RNF-12 (Prevenção Absoluta de Duplicação de Pareamento):** A taxa de alocação de um mesmo jogador em mais de uma sala simultânea deve ser rigorosamente **zero (0%)**, garantida por transações atômicas exclusivas no Redis.
13. **RNF-13 (Cobertura de Testes de Pareamento e Filas):** Os scripts Lua e controladores de matchmaking devem possuir cobertura de testes de integração automatizados superior a **90%**.
14. **RNF-14 (Economia de Conexões TCP com Upstash REST):** O uso de HTTP REST para consultas ao Upstash Redis deve manter zero conexões TCP persistentes abertas em ambiente serverless, eliminando o problema clássico de esgotamento de conexões (Connection Exhaustion).
15. **RNF-15 (Tempo de Pré-Aquecimento do Servidor Colyseus):** A requisição de pré-aquecimento enviada pelo Matchmaker ao servidor Render.com deve disparar com antecedência para garantir que a instância Node.js esteja 100% pronta para receber conexões WebSocket.

---

## 17. ARQUITETURA DE DEPLOYMENT GRATUITA (FREE TIER) PARA O MATCHMAKER

A infraestrutura de matchmaking do `ChessInReact` foi projetada para operar inteiramente dentro dos limites dos planos gratuitos das provedoras cloud modernas:

1. **Vercel Serverless Functions (Hobby Tier - $0):** Os endpoints de API do Matchmaker são empacotados como funções serverless que executam sob demanda e dormem quando inativas. Com limite gratuito de 100.000 execuções mensais e execução na borda (Edge Network), a API atende a milhares de requisições diárias sem gerar nenhum custo de hospedagem de servidores dedicados.
2. **Upstash Serverless Redis (Free Tier - $0):** O Upstash oferece plano gratuito de Redis gerenciado com suporte a até 10.000 comandos diários sem necessidade de cartão de crédito. Utilizando pipelines para agrupar comandos e substituindo polling agressivo por notificações SSE, o consumo diário de comandos permanece em torno de 2.000 a 4.000 requisições, operando com ampla folga dentro da gratuidade.
3. **Comunicação por Tokens JWT Efêmeros:** Em vez de manter instâncias EC2 caras para coordenar a passagem de bastão entre a fila e a sala de jogo, utilizamos tokens JWT assinados pelo Gateway da Vercel. O jogador recebe a autorização diretamente no navegador e a apresenta na porta do Colyseus no Render.com, eliminando a necessidade de serviços intermediários pagos.

---

## 18. MODOS DE JOGO E SUAS PECULIARIDADES DE MATCHMAKING

1. **Fila Ranqueada 1v1 Clássica:**
   - Janela de tolerância de ELO restrita: início em $\pm 40$ pontos de rating, expandindo para no máximo $\pm 150$ após 45 segundos de busca.
   - Ponderação estrita de controle de tempo (ex: 3+0 Blitz, 5+3 Rápido, 1+0 Bullet) em filas isoladas.
2. **Fila Hexagonal 4-Player FFA:**
   - Agrupamento em tuplas de 4 jogadores com balanceamento de soma de ratings: a diferença entre o maior e o menor ELO da sala não pode ultrapassar 300 pontos na busca inicial.
   - Distribuição equilibrada de posições iniciais (spawns) na arena para evitar privilégio de quadrante.
3. **Fila 8-Player Chaos:**
   - Janela de tolerância ampla para viabilizar partidas rápidas: pareamento prioriza tempo de formação sobre precisão estrita de rating.
4. **Lobbies da Comunidade e Workshop:**
   - Não utilizam cálculo de ELO nem filas automatizadas. Jogadores criam salas abertas com identificadores personalizados e aguardam participantes voluntários no saguão público.

---

## 19. SCHEMAS DE DADOS, TIPOS TYPESCRIPT E CONTRATOS DO REDIS

Abaixo constam as interfaces tipadas de gerenciamento de filas e tokens de pareamento:

```typescript
// src/matchmaking/interfaces/IMatchmakingContracts.ts

export interface IMatchTicket {
  ticketId: string;
  userId: string;
  displayName: string;
  eloRating: number;
  ratingDeviation: number;
  variantId: string;
  topology: string;
  playerCount: number; // 2, 4, 6, 8
  createdAtTimestamp: number;
  ttlSeconds: number;
}

export interface IMatchFoundPayload {
  matchId: string;
  roomId: string;
  serverUrl: string; // Ex: wss://chess-game-server.onrender.com
  assignedPlayerId: string;
  factionIndex: number;
  matchTicketToken: string; // JWT assinado válido por 30s
  expiresAt: number;
}

export interface ILobbySummary {
  lobbyId: string;
  title: string;
  hostName: string;
  variantId: string;
  currentPlayers: number;
  maxPlayers: number;
  isPrivate: boolean;
  timeControlSeconds: number;
  createdAt: number;
}
```

Contrato JSON para solicitação de entrada na fila:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "JoinMatchmakingQueueRequestPayload",
  "type": "object",
  "required": ["variantId", "playerCount", "timeControlSeconds"],
  "properties": {
    "variantId": { "type": "string" },
    "playerCount": { "type": "integer", "enum": [2, 3, 4, 6, 8] },
    "timeControlSeconds": { "type": "integer", "minimum": 60, "maximum": 3600 },
    "isRanked": { "type": "boolean" },
    "preferredFaction": { "type": "integer", "minimum": 0, "maximum": 7 }
  }
}
```

---

## 20. CONCLUSÃO ARQUITETURAL DA SPEC 08

A Spec 08 completa o anel de escalabilidade externa do `ChessInReact`. Ao dissociar a camada de matchmaking sem estado (Stateless Vercel API + Upstash Redis) do servidor autoritativo com estado (Colyseus Stateful Node), a plataforma adquire capacidade para gerenciar milhares de jogadores simultâneos em filas de pareamento com scripts Lua atômicos, lobbies customizados e relays de transmissão para espectadores, operando com latências de dezenas de milissegundos e custo zero de infraestrutura na nuvem.
