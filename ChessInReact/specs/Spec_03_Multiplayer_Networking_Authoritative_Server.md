# Spec 03: Multiplayer, N-Players e Sincronização de Estado (Parte 1/4)

## A. OBRIGAÇÃO DE DENSIDADE E ABORDAGEM
Xadrez Multiplayer entre N-Jogadores com regras variadas e tabuleiros gigantes destrói a premissa de um backend simples que apenas confia no cliente. O `ChessInReact` é arquitetado com *Authoritative Server* com mecanismos de *Rollback e Client-Side Prediction*, similar a um RTS (Real-Time Strategy) ou FPS, mas operando em cima da topologia por turnos e ticks definida nas Specs 01 e 02.

## 1. OBJETIVO DO SUBSISTEMA NETCODE
Garantir que múltiplos jogadores interajam com o mesmo Grid Topológico de forma justa, determinística e resiliente a lags. O subsistema Netcode (Backend in-game) resolve o Padrão de Autoridade, Sincronização de Relógios (Clocks) e Turn Policies (Simultâneo vs Sequencial).

## 2. ESCOPO
**PERTENCE A ESTA SPEC:**
- Node.js Game Server com Colyseus.
- Lógica de Authoritative Server vs Client Prediction.
- Serialização Delta de pacotes.
- Padrões de Turno (Strict Sequential vs Resolved Simultaneous).
- Spectator Mode e Reconnection Flows.

**NÃO PERTENCE:**
- Matchmaker / Lobbies (Ver Spec 08).
- Geração da Topologia Física (Ver Spec 02).

## 3. REQUISITOS E CONSTRAINTS
### 3.1 Constraints de Latência
- **Constraint:** Em modos N-Player (8 jogadores FFA), latências entre continentes podem passar de 250ms. Se os turnos forem simultâneos (todos clicam ao mesmo tempo e o movimento ocorre), o jogador de ping alto joga em severa desvantagem visual.
- **Resolução Arquitetural:** Implementação obrigatória de **Command Buffering** no Backend. O servidor roda a "Tick Rate" fixa. Os comandos dos clientes são "enfileirados" no Tick T, e a resolução ocorre no Tick T+1, garantindo justiça de Frame.

### 3.2 Constraints de Trapaça (Anti-Cheat)
- **Constraint:** Modificar pacotes WebSocket no Client-side enviando `{"from":"e2", "to":"e8"}` para uma peça que não tem range (Hack de Teleporte).
- **Resolução Arquitetural:** A `Engine` do Cliente e a `Engine` do Servidor compartilham 100% da biblioteca de Regras (TypeScript Isomórfico - Ver Spec 04). O Cliente valida primeiro para economizar rede (Client-side Prediction). O Servidor valida de novo na chegada do pacote. Se as validações divergirem, o Servidor ganha e força o Cliente a aplicar um *Rollback Snapshot*.

## 4. PESQUISA MATRIX: FONTES EXTERNAS E GITHUBS VALIDADOS

### Fonte 1: "Fast-Paced Multiplayer (Client-Side Prediction and Server Reconciliation)" (Gabriel Gambetta)
- **URL:** https://www.gabrielgambetta.com/client-server-game-architecture.html
- **Problema Resolvido:** Delay visual em jogos com Servidor Autoritativo.
- **Decisão:** Aplicaremos a Teoria Gambetta. O Cliente "desenha" a peça movida instantaneamente no R3F e guarda o Comando Otimista numa Pilha (Zustand `optimisticUpdate`). Quando o Servidor responder "OK" (Sync Ack), o Comando Otimista é validado e consolidado no `boardEntities` base.

### Fonte 2: "Colyseus State Synchronization"
- **URL:** https://docs.colyseus.io/state/overview/
- **Problema Resolvido:** Como sincronizar o Dicionário ECS do Zustand (`Spec 01`) de forma binária com os clientes conectados, poupando largura de banda.
- **Decisão:** Utilizaremos a biblioteca `@colyseus/schema` em vez de JSON puro. O `@colyseus/schema` compila structs para binário e só propaga "Deltas" (mudanças). Se um peão mover de `1,0,0` para `2,0,0`, o payload de rede só terá esses 2 hashes, economizando 99% de banda comparado a mandar o tabuleiro inteiro (que em mapas grandes travaria a rede do usuário).

### Fonte 3: "Diplomacy Game Engine and Simultaneous Turns"
- **URL:** https://en.wikipedia.org/wiki/Diplomacy_(game) / Arquiteturas de Boardgames Simutâneos.
- **Problema Resolvido:** Como processar colisões quando 3 jogadores tentam invadir a mesma casa no mesmo turno.
- **Conclusão Técnica:** O Backend necessita de um *Resolution Engine Phase*.
- **Decisão:** Na variante Simultânea, o servidor altera o estado do jogo para "RESOLVING". Aplica as regras de prioridade (Piece Weight, ou Dice Roll em modos Chaos).

### Fonte 4: "Reconnecting dropped WebSocket connections in games" (GDC)
- **Problema Resolvido:** O mobile Safari/Chrome frequentemente "dorme" conexões WS em background.
- **Decisão:** Usaremos o recurso de `allowReconnection` do Colyseus e guardaremos o `sessionId` no `localStorage` do browser do cliente.

### GitHub 1: colyseus/colyseus
- **Repositório:** https://github.com/colyseus/colyseus
- **Decisão influenciada:** O State compartilhado de Schema (`RoomState`) não pode herdar diretamente do `IGameState` do Zustand do cliente para não violar a separação Cliente/Servidor. O Servidor terá o seu Modelo, e o Cliente mapeará os `onAdd` e `onChange` do Colyseus disparando Ações do Zustand.

### GitHub 2: lila (Lichess Scala Backend)
- **Estrutura Estudada:** `modules/round/src/main/SocketHandler.scala`
- **Padrão aproveitado:** Eles marcam o relógio no Servidor (não no cliente) mitigando Time Hacks (Speedhacks).
- **Decisão:** O TurnTimer (`secondsLeft`) será um `setInterval` atachado ao GameLoop do Colyseus no backend. O cliente usa o valor de rede apenas como "Hint" visual.

## 5. ESTRUTURA REAL DE DIRETÓRIOS E MÓDULOS (MULTIPLAYER E REDE)

```text
src/
  multiplayer/
    ColyseusClient.ts          // Encapsula o WebSocket do browser
    StateSyncBridge.ts         // Converte Colyseus Schema -> Zustand Store O(1)
src-backend/
  game-server/
    rooms/
      ChessRoom.ts             // Colyseus Room Implementation
      TurnResolver.ts          // Processador de Fila de Comandos (Simultaneous)
    schemas/
      RoomStateSchema.ts       // Entidades Binárias mapeáveis
```

(CONTINUA NA PARTE 2)
## 6. O CONTRATO DE ESTADO COMPARTILHADO (SCHEMA)
Para que o Colyseus otimize o payload binário via rede, os Dicionários (Maps) definidos no Zustand Client devem ser espelhados na estrutura de Schema.

```typescript
// src-backend/schemas/RoomStateSchema.ts
import { Schema, MapSchema, type } from "@colyseus/schema";

export class NetworkEntity extends Schema {
  @type("string") id: string;
  @type("string") type: string; // "PIECE" | "TERRAIN"
  @type("string") position: string; // Hash (ex: "5,1,2")
  @type("string") ownerId: string;
  @type("string") variantId: string;
  @type("boolean") hasMoved: boolean;
  @type("boolean") isCaptured: boolean;
}

export class RoomStateSchema extends Schema {
  @type("string") matchId: string;
  @type("boolean") isGameOver: boolean;
  @type("string") activePlayer: string;
  
  // MapSchema é traduzido eficientemente para Record<> O(1) no cliente
  @type({ map: NetworkEntity }) boardEntities = new MapSchema<NetworkEntity>();

  // SequenceNumber para a Reconciliação do Gabriel Gambetta
  @type("number") lastProcessedSequenceId: number = 0;
}
```

## 7. O FLUXO DE RECONCILIAÇÃO E PREVISÃO CLIENT-SIDE
O *Input Delay* afasta os jogadores de um jogo na web. Se ao arrastar uma peça, ela demorar 250ms para encaixar na casa (esperando o servidor validar), o UX é terrível.

### 7.1 Padrão: Optimistic UI com Rollback
```typescript
// src/multiplayer/StateSyncBridge.ts
import { useGameStore } from '../core/store/gameStore';
import { ICommand, MovePieceCommand } from '../core/commands/MoveCommand';

export class StateSyncBridge {
  private colyseusRoom: any;
  private pendingClientCommands: Map<number, ICommand> = new Map();
  private sequenceCounter = 0;

  public sendOptimisticMove(from: string, to: string, pieceId: string) {
     const seqId = ++this.sequenceCounter;
     const command = new MovePieceCommand(pieceId, from, to, useGameStore.getState().myPlayerId);
     
     // 1. Applica visualmente INSTANTANEAMENTE no R3F
     useGameStore.getState().optimisticUpdate(command);
     
     // 2. Guarda na Pilha de Pendentes
     this.pendingClientCommands.set(seqId, command);

     // 3. Envia para o Backend (Authoritative Server)
     this.colyseusRoom.send("PLAYER_MOVE", { from, to, pieceId, seqId });
  }

  // Hookado no evento onChange do Colyseus Schema
  public onServerStateUpdate(serverSequenceId: number) {
     // O Servidor acknowledge e processou o Comando X.
     // Removemos todos os comandos locais <= X, pois o estado do Servidor
     // que acabou de chegar já engloba o resultado deles.
     
     const keys = Array.from(this.pendingClientCommands.keys());
     for (const key of keys) {
        if (key <= serverSequenceId) {
           this.pendingClientCommands.delete(key);
        }
     }

     // O que restou na pilha são movimentos que o Cliente fez, mas o Servidor
     // ainda NÃO processou (estão viajando na rede).
     // Devemos reaplicar esses "Rascunhos" (Reconciliation).
     
     const serverBaseState = this.copySchemaToGameState(this.colyseusRoom.state);
     useGameStore.getState().syncState(serverBaseState); // Força Source of Truth

     // Re-aplica visualmente os deltas do futuro por cima da Source of Truth
     for (const [_, pendingCmd] of this.pendingClientCommands) {
         useGameStore.getState().optimisticUpdate(pendingCmd);
     }
  }
}
```

## 8. TURN POLICIES (POLÍTICAS DE TURNO MULTIPLAYER)
O Xadrez N-Player possui dois modos drásticos de ritmo de jogo que impactam as threads do servidor NodeJS.

### 8.1 Strict Sequential (Turno Tradicional em Roda)
O `activePlayer` no Zustand alterna: `P1 -> P2 -> P3 -> P1`.
O servidor recusa o pacote WS de `P2` se ele tentar emitir a ação no turno de `P1`. 
*Risco Técnico:* P1 demora 5 minutos pensando e os outros N-1 jogadores abandonam a aba (Troll/Stall).
*Solução Core:* Integração do `TimeWarning EventBus` (Ver Spec 01) e Forçar Timeout/Random Move/Kick via Cron no Backend.

### 8.2 Resolved Simultaneous (Fase de Planejamento -> Fase de Ação)
Inspirado em jogos "Diplomacy". Todos os jogadores jogam ao mesmo tempo. Ninguém enxerga a jogada do outro (Fog of War temporal).
A interface visual R3F mostra a peça na nova casa, mas *translúcida*.
Quando o Cronômetro zera (Ex: 30 segundos), o Backend engole a Fila inteira de Comandos de uma vez.

```typescript
// src-backend/game-server/rooms/TurnResolver.ts

interface QueuedMove {
  playerId: string;
  from: string;
  to: string;
}

export class TurnResolver {
  public resolveSimultaneousCollisions(moves: QueuedMove[], state: RoomStateSchema) {
    // 1. Previne dois jogadores movendo a mesma peça (Mind Control Rule)
    // 2. Previne Collision: Dois jogadores movendo pra mesma casa
    
    const targets = new Map<string, string[]>(); // targetHash -> [playerId1, playerId2]
    
    for (const move of moves) {
       if (!targets.has(move.to)) targets.set(move.to, []);
       targets.get(move.to)!.push(move.playerId);
    }
    
    for (const [targetHouse, actors] of targets.entries()) {
       if (actors.length > 1) {
          // COLISÃO FÍSICA NO TABULEIRO!
          // Aplica Heurística do Jogo: Peça mais forte fica? Ambos morrem (Atomic)?
          this.applyCollisionRule(targetHouse, actors, state);
       } else {
          // Movimento Seguro
          this.commitMove(actors[0], targetHouse, state);
       }
    }
  }
}
```

(CONTINUA NA PARTE 3)
## 9. CÓDIGO REPRESENTATIVO: A SALA DO SERVIDOR COLYSEUS
Diferente da Spec 08 que foca no Pareamento/Matchmaker via APIs HTTP e Redis, a `ChessRoom` no Colyseus trata exclusivamente o tempo em que os 2 a 8 jogadores estão na tela gráfica focados no tabuleiro.

```typescript
// src-backend/game-server/rooms/ChessRoom.ts
import { Room, Client } from "@colyseus/core";
import { RoomStateSchema, NetworkEntity } from "../schemas/RoomStateSchema";
import { RulesEngine } from "../../../src/engine/rules/RulesEngine";
import { HexTopology } from "../../../src/engine/topology/HexTopology";

export class ChessRoom extends Room<RoomStateSchema> {
  // Inicialização determinística e validações server-side puras
  private rulesEngine: RulesEngine; 
  private reconnectionTimers: Map<string, NodeJS.Timeout> = new Map();

  onCreate(options: any) {
    this.setState(new RoomStateSchema());
    this.maxClients = options.maxClients || 4;
    
    // Injeta as regras exatas que o Cliente usa, isoladas na Node Environment
    this.rulesEngine = new RulesEngine(new HexTopology(), options.variant);

    this.onMessage("PLAYER_MOVE", (client, message) => {
       const { from, to, pieceId, seqId } = message;
       
       // Anti-Cheat: O jogador não pode mover peças dos outros
       const piece = this.state.boardEntities.get(pieceId);
       if (!piece || piece.ownerId !== client.sessionId) {
          client.send("REJECT_MOVE", { reason: "Not your piece" });
          return;
       }

       // Anti-Cheat: A peça consegue ir do A ao B?
       const isValid = this.rulesEngine.validateMoveLocally(from, to, piece.variantId, this.state);
       
       if (isValid) {
          // Mutação de Estado do Servidor
          this.state.boardEntities.delete(from);
          piece.position = to;
          this.state.boardEntities.set(to, piece);
          
          // Avança a Flag de Sync da Rede do Cliente
          this.state.lastProcessedSequenceId = seqId;
       } else {
          // Force Rollback Command
          client.send("FORCE_ROLLBACK", { seqId });
       }
    });

    // Game Loop Fixo para relógios
    this.setSimulationInterval((deltaTime) => this.update(deltaTime));
  }

  // Graceful Reconnection em Mobile e Sleep Tabs
  async onLeave(client: Client, consented: boolean) {
    if (consented) {
       this.broadcast("PLAYER_RESIGNED", { playerId: client.sessionId });
       // Desliga o relógio do player e remove da lógica
       return;
    }

    // Se a conexão caiu por erro de rede:
    try {
      this.broadcast("PLAYER_DISCONNECTED", { playerId: client.sessionId });
      
      // Permitimos que ele tente voltar em até 60 segundos
      // A promise aguarda até o .reconnect() do client ser chamado
      const reconnectedClient = await this.allowReconnection(client, 60);
      
      this.broadcast("PLAYER_RECONNECTED", { playerId: reconnectedClient.sessionId });
    } catch (e) {
      // Tempo limite estourou. Auto-Resign.
      this.broadcast("PLAYER_RESIGNED", { playerId: client.sessionId });
    }
  }

  update(deltaTime: number) {
     // Apenas avança o relógio de xadrez global do active player
     // Disparando MATE/LOSS se acabar o tempo.
  }
}
```

## 10. FAILURE MODES E TRATAMENTO DE EDGE CASES DE REDE

### 10.1 Failure Mode: "The Rubberband Effect"
O "Efeito Elástico" ocorre quando o `optimisticUpdate` aplica o movimento da torre instantaneamente, mas o pacote WS demora 300ms, o servidor rejeita por um evento que aconteceu no milissegundo antes, e o Client sofre o Rollback, fazendo a torre "teleportar" de volta.
- **Resolução Arquitetural (Late Binding Interpolation):** 
No código do `PieceVisual.tsx` (Ver Spec 01), o `lerp` roda a 15% por frame (`0.15`). Isso atua como um "Atraso Perceptual" natural. Se o Rollback vier em 100ms, a Mesh 3D terá percorrido menos de 40% do caminho visual até o alvo rejeitado, e simplesmente interpolará suavemente de volta para a origem, mascarando o "Teleporte Seco" em um "Movimento Cancelado" mais natural.

### 10.2 Failure Mode: Spectator State Burst
Quando 1.000 pessoas assistem ao Campeonato N-Player e entram na partida no Lance 500, o servidor Colyseus sofreria uma asfixia para compilar o Tabuleiro completo via Payload de Patch e enviar simultaneamente.
- **Resolução Arquitetural (Spectator Chunking):** 
Em Lobbies com mais de `N` espectadores, usamos Redis Pub/Sub Cache e Servidores *Relay*. O Servidor Mestre do Colyseus nunca envia WebSockets diretamente aos Spectators. Ele manda 1 broadcast para o Relay, que duplica e distribui para os espectadores (Ver Arquitetura de CDN WebSockets, Spec 08). O espectador nunca envia comandos de `PLAYER_MOVE`.

(CONTINUA NA PARTE 4)
## 11. PLANO DE IMPLEMENTAÇÃO DA SPEC 03
1. **Configuração do Servidor NodeJS:** Instalar e configurar o `Colyseus` na raiz `src-backend`.
2. **Definição de Schemas:** Traduzir perfeitamente as interfaces TypeScript da `Spec 01` (`ICoreState` e `IPiece`) para o `RoomStateSchema` usando as anotações `@type`.
3. **Bridge Zustand <-> Colyseus:** Implementar a `StateSyncBridge` no lado Cliente para interceptar eventos `onAdd`, `onRemove` e `onChange`, traduzindo Deltas de binário para Mutações de Zustand O(1) imutáveis.
4. **Implementação do TurnResolver:** Escrever a lógica de Resolução Simultânea (Collision Rules) para tabuleiros de N jogadores.
5. **Teste de Carga Simulado (Headless):** Usar 500 conexões de WebSocket simuladas (`@colyseus/testing`) disparando pacotes de `PLAYER_MOVE` a cada segundo, garantindo que o CPU Node processador da Room mantenha o Loop Fixado acima de 20 Ticks/Sec sem Memory Leaks no validador.

## 12. CRITÉRIOS DE ACEITE
1. **Zero-Latency Feel:** Ao arrastar e soltar a peça na visão de R3F, o estado React (`useGameStore`) deve ser atualizado imediatamente em $<5ms$, sem esperar o envio do Pacote, provando que a Prediction Otimista funciona.
2. **Anti-Teleport Hack:** Forçar um `ws.send` injetado pelo console do navegador tentando mover uma Peça Oponente deve ser imediatamente rejeitado no Servidor (Checagem de Assinatura SessionID), com o Client-side da Peça sofrendo Rollback em até 1 RTT (Round Trip Time).
3. **Ghost Observer Pattern:** Espectadores assistindo à partida não consumirão processamento de Validação de Regras do servidor, apenas consumirão banda de Sync do DeltaBinário do Colyseus (Modo Read-Only total).
4. **Resiliência de Reconexão:** Ao desligar a rede do celular, aguardar 30 segundos, e ligar o 4G novamente, o Cliente deve retomar o fluxo contínuo do GameState na tela exata em que o Servidor encontra-se, sem necessidade de recarregar a página da URL (Seamless Reconnect).

## 13. OPEN QUESTIONS (RESOLVIDAS)
1. *Pergunta:* Se no turno simultâneo, dois peões andam de frente e colidem "no ar" trocando de casa, isso é válido?
   *Decisão Arquitetural (Resolvida):* O Servidor não valida percursos (Swept Collision 3D). Ele valida "Destinos". Se Peão 1 visa Casa C e Peão 2 visa Casa B, mesmo cruzando trajetórias, o turno é executado e não há bloqueio físico.

2. *Pergunta:* O Zustand deve espelhar completamente o Backend?
   *Decisão Arquitetural (Resolvida):* Não. O Zustand Cliente guarda o histórico visual de Comandos Otimistas (`optimisticUpdate`). O Servidor não sabe o que é "Otimista"; ele guarda apenas o Presente Absoluto (`RoomStateSchema`). A Reconciliação na `StateSyncBridge` é o componente que faz a ponte sem misturar responsabilidades.

---
*Fim da Spec 03. A capacidade do servidor validar as jogadas depende estritamente das Regras de Xadrez, que são desacopladas da Lógica de WebSocket. A Spec 04 definirá este motor de Regras (Rules Engine) universal, capaz de funcionar em Frontend e Backend simultaneamente para variantes e Fairy Pieces.*


## 14. REPOSITÓRIOS GITHUB E REFERÊNCIAS EXTERNAS (NETCODE E MULTIPLAYER)

Abaixo documentamos as fontes de engenharia de software e repositórios open-source analisados para a construção do subsistema de rede autoritativo, compressão de pacotes e sincronização de tempo do `ChessInReact`.

### 14.1 Projetos Open Source Analisados
1. **GitHub: `colyseus/colyseus`**
   - **Link:** https://github.com/colyseus/colyseus
   - **Resumo Técnico:** Framework multithreaded para jogos multiplayer em Node.js com arquitetura baseada em Rooms, suporte a WebSockets nativos e sincronização automática de estado por deltas binários.
   - **Como Aproveitaremos no Projeto:** O núcleo do backend de partidas é estruturado sobre o `colyseus`. Cada partida instancia uma `ChessRoom` isolada que gerencia o ciclo de vida, timeout de turnos e autoridade de regras em memória RAM sem acoplamento a bancos de dados durante a execução ativa.

2. **GitHub: `colyseus/schema`**
   - **Link:** https://github.com/colyseus/schema
   - **Resumo Técnico:** Mecanismo de serialização binária com reflexão de tipos via decorators TypeScript (`@type`), gerando árvores de diff eficientes que transmitem apenas bytes alterados.
   - **Como Aproveitaremos:** Modelaremos os estados de peças e turnos como schemas Colyseus. Quando uma peça é movida em um tabuleiro de 500 casas, apenas o ID da entidade e os novos bytes de coordenadas são enviados pela rede, reduzindo o uso de banda em mais de 95% em comparação com JSON tradicional.

3. **GitHub: `websockets/ws`**
   - **Link:** https://github.com/websockets/ws
   - **Resumo Técnico:** Implementação cliente/servidor de WebSockets mais rápida e testada para o ecossistema Node.js, com suporte a buffer pools e RFC 6455 estrita.
   - **Como Aproveitaremos:** Utilizada como a camada de transporte de baixo nível pelo Colyseus. Configuraremos o heartbeat com ping/pong a cada 5 segundos para detecção imediata de quedas silenciosas de conexão móvel no 4G/5G.

4. **GitHub: `geckosio/geckos.io`**
   - **Link:** https://github.com/geckosio/geckos.io
   - **Resumo Técnico:** Biblioteca para comunicação cliente-servidor baseada em WebRTC DataChannels com suporte a pacotes UDP não-confiáveis e não-ordenados no navegador.
   - **Como Aproveitaremos:** Avaliada e integrada como protocolo opcional de transporte alternativo para os modos de jogo em tempo real (Speed Chess / Real-Time Chess sem turnos), eliminando o atraso de travamento por retransmissão de linha (Head-of-Line Blocking) inerente ao protocolo TCP.

5. **GitHub: `skywind3000/kcp`**
   - **Link:** https://github.com/skywind3000/kcp
   - **Resumo Técnico:** Protocolo ARQ (Automatic Repeat-reQuest) que opera sobre UDP entregando fluxo confiável com redução de latência de 30% a 40% em relação ao TCP padrão sob condições de perda de pacotes.
   - **Como Aproveitaremos:** O estudo do algoritmo de retransmissão rápida (Fast-Retransmit) do KCP inspirou nossa rotina de re-envio de comandos não-confirmados no cliente web durante picos de instabilidade de sinal.

6. **GitHub: `SocketCluster/socketcluster`**
   - **Link:** https://github.com/SocketCluster/socketcluster
   - **Resumo Técnico:** Sistema de mensageria Pub/Sub distribuído com balanceamento horizontal de conexões WebSockets através de workers Node.js.
   - **Como Aproveitaremos:** Adotaremos os padrões de separação entre canais de jogadores autoritativos (`match:matchId:control`) e canais de transmissão passiva (`match:matchId:spectate`), garantindo que milhares de espectadores simultâneos em torneios não degradem a performance da sala principal.

7. **GitHub: `supabase/realtime`**
   - **Link:** https://github.com/supabase/realtime
   - **Resumo Técnico:** Servidor Elixir que escuta o Replication Log do PostgreSQL e emite eventos WebSocket para clientes web conectados.
   - **Como Aproveitaremos:** Utilizaremos o Supabase Realtime para notificações assíncronas do saguão social (Lobby notifications, convites diretos de amigos e atualizações de ranking ELO no painel), desacoplando a rede social do servidor de simulação de jogo.

8. **GitHub: `simon-p-r/bidi-clock-sync` (Algoritmo de Cristian para NTP)**
   - **Link:** https://github.com/simon-p-r/bidi-clock-sync
   - **Resumo Técnico:** Implementação em JavaScript do algoritmo de Cristian para sincronização de relógios bidirecional com cálculo de Round-Trip Time (RTT) e estimativa de offset de relógio do servidor.
   - **Como Aproveitaremos:** Este algoritmo será executado durante o handshake de entrada do jogador na sala. Ao determinar com exatidão o offset de milissegundos entre o dispositivo do usuário e o servidor, os relógios de blitz e bullet decrementam sem saltos temporais e sem injustiça de ping.

9. **GitHub: `ValveSoftware/source-sdk-2013` (Documentação de Lag Compensation)**
   - **Link:** https://github.com/ValveSoftware/source-sdk-2013
   - **Resumo Técnico:** Código-fonte da Valve ilustrando interpolação temporal de entidades, reconciliação de predição do cliente e rollback histórico do servidor.
   - **Como Aproveitaremos:** A lógica de Client-Side Prediction com buffer de comandos otimistas não-confirmados descrita na Seção 6 desta especificação foi adaptada diretamente das diretrizes clássicas da Valve para jogos em tempo real com latência variável.

10. **GitHub: `upstash/ratelimit`**
    - **Link:** https://github.com/upstash/ratelimit
    - **Resumo Técnico:** Implementação de controle de taxa de requisições com algoritmos Sliding Window e Token Bucket sobre Redis Serverless.
    - **Como Aproveitaremos:** Aplicaremos rate limiting nas mensagens WebSocket de entrada: jogadores não podem disparar mais do que 10 comandos por segundo, frustrando tentativas de flood e negação de serviço (DoS) direcionadas ao servidor Node.js.

---

## 15. HISTÓRIAS DE USUÁRIO (USER STORIES) - NETCODE E MULTIPLAYER

### 15.1 Histórias de Usuário do Jogador (Player Perspective)
1. **US03-P01:** Como jogador em uma partida online, quero arrastar e soltar minha peça e ver a movimentação acontecer instantaneamente na minha tela, sem esperar o retorno da confirmação do servidor pela internet.
2. **US03-P02:** Como competidor em conexão móvel 4G, se o meu sinal de celular cair por 15 segundos enquanto passo por um túnel, quero que o jogo reconecte automaticamente sem fechar a partida nem me dar derrota por abandono.
3. **US03-P03:** Como jogador de partidas Blitz de 3 minutos, quero ter a certeza de que o relógio de xadrez na tela do meu adversário e na minha tela estão perfeitamente sincronizados no mesmo centésimo de segundo.
4. **US03-P04:** Como participante de um modo simultâneo de 4 jogadores, quero enviar meu lance em segredo e, quando o cronômetro zerar, ver todos os lances de todos os jogadores sendo executados e resolvidos de forma clara ao mesmo tempo.
5. **US03-P05:** Como espectador assistindo a uma final de campeonato, quero assistir à partida com latência ultrabaixa (menos de 200ms em relação à jogada real) sem interferir no desempenho da sala dos competidores.
6. **US03-P06:** Como competidor, quero que qualquer tentativa de trapaça do meu adversário (como tentar mover duas vezes ou mover uma peça para uma casa ilegal) seja sumariamente barrada pelo servidor e revertida imediatamente.
7. **US03-P07:** Como jogador, quero visualizar o ping atual da minha conexão em milissegundos e um indicador de qualidade de rede (Verde, Amarelo, Vermelho) no topo do tabuleiro para saber se minha internet está instável.
8. **US03-P08:** Como usuário que joga em abas múltiplas, se eu mudar de aba e retornar, quero que o estado das peças se sincronize suavemente sem desconfigurar as posições 3D.
9. **US03-P09:** Como jogador, quero receber um aviso visual na tela quando o adversário estiver enfrentando problemas de conexão temporários ("Aguardando reconexão do oponente... 45s restantes").
10. **US03-P10:** Como líder de um clã, quero criar uma sala privada protegida por senha para jogar uma variante de 8 jogadores com amigos selecionados sem que estranhos entrem na partida.
11. **US03-P11:** Como jogador no exterior jogando contra amigos no Brasil, quero que o sistema de compensação de lag me permita disputar partidas competitivas mesmo com latência de 150ms sem sentir o jogo engasgar.
12. **US03-P12:** Como competidor, quando o adversário esgotar todo o seu tempo de relógio, quero que a partida encerre imediatamente no servidor com vitória declarada a meu favor sem depender de cliques manuais.
13. **US03-P13:** Como espectador, quero poder pausar temporariamente a transmissão ao vivo para rever um lance anterior e depois clicar em "Voltar ao Vivo" para saltar para o momento atual sincronizado.
14. **US03-P14:** Como jogador, se ambos os jogadores clicarem na mesma casa em uma rodada simultânea gerando colisão mútua, quero ver uma animação de impacto e o resultado da regra especial explicado com destaque na interface.
15. **US03-P15:** Como usuário, se meu navegador travar e eu fechar a janela, quero poder reabrir o site dentro de 60 segundos e encontrar o botão "Retornar à Partida em Andamento" na tela inicial.

### 15.2 Histórias de Usuário do Desenvolvedor e Arquiteto (Developer/Architect Perspective)
1. **US03-D01:** Como arquiteto backend, quero que o servidor Colyseus valide todas as mutações de jogo de forma 100% autoritativa, rejeitando qualquer pacote que viole as regras da variante sem confiar no cliente.
2. **US03-D02:** Como desenvolvedor de rede, quero que a sincronização de estado utilize deltas binários compactos com `@colyseus/schema` para manter o consumo de tráfego por sala abaixo de 5 KB/s.
3. **US03-D03:** Como engenheiro de testes, quero executar suítes de testes de carga simulando 200 conexões WebSocket simultâneas em instâncias headless do Node.js para validar a estabilidade do tick rate do servidor sob estresse.
4. **US03-D04:** Como mantenedor do código, quero que a lógica de resolução de movimentos seja isomórfica (TypeScript compartilhado entre frontend e backend), evitando duplicidade de regras e divergências de comportamento.
5. **US03-D05:** Como operador de infraestrutura, quero que as instâncias do servidor Colyseus emitam métricas de CPU, uso de heap e contagem de salas ativas via endpoint `/metrics` para monitoramento contínuo no Render.com.
6. **US03-D06:** Como arquiteto de segurança, quero que todo handshake de WebSocket exija um token JWT válido gerado na autenticação, prevenindo conexões anônimas não autorizadas no servidor de partidas.
7. **US03-D07:** Como desenvolvedor do cliente, quero que a classe `StateSyncBridge` escute os deltas binários do Colyseus e despache mutações atômicas para o Zustand sem provocar re-renderizações globais da árvore React.
8. **US03-D08:** Como engenheiro de confiabilidade, quero que o servidor de salas descarte e limpe completamente os recursos de salas encerradas em até 10 segundos, prevenindo vazamentos de memória na instância gratuita do servidor.
9. **US03-D09:** Como desenvolvedor de backend, quero que a rotina de reconexão conceda um período de carência de exatamente 60 segundos para reconexões antes de declarar derrota por abandono (Forfeit).
10. **US03-D10:** Como desenvolvedor de relógio, quero que a sincronização temporal utilize o algoritmo de Cristian com 5 amostras de RTT no handshake inicial, calibrando o desvio de relógio para margem inferior a 10 milissegundos.

---

## 16. REQUISITOS FUNCIONAIS (RF) - NETCODE E MULTIPLAYER

Abaixo estão formalizados os 15 requisitos funcionais mandatórios do subsistema de rede e multiplayer.

1. **RF-01 (Servidor Autoritativo de Partidas):** O servidor Colyseus deve ser a fonte da verdade suprema de cada partida, processando e validando todas as jogadas antes de consolidar mutações no estado oficial do jogo.
2. **RF-02 (Predição Otimista no Cliente):** O cliente web deve executar imediatamente a movimentação da peça na interface gráfica (Client-Side Prediction) e enfileirar o comando em um buffer de predição antes de receber a confirmação da rede.
3. **RF-03 (Reconciliação e Rollback):** Caso o servidor rejeite um comando otimista (por exemplo, devido a um movimento ilegal ou conflito de turno), o cliente deve reverter o estado local suavemente para o snapshot autoritativo emitido pelo servidor.
4. **RF-04 (Sincronização de Deltas Binários):** O servidor deve transmitir atualizações de estado utilizando schemas binários `@colyseus/schema`, enviando exclusivamente os campos modificados em vez do estado completo do tabuleiro.
5. **RF-05 (Sincronização de Relógio de Alta Precisão):** O sistema deve executar rotina de sincronização baseada no algoritmo de Cristian no início da partida, mantendo a contagem regressiva de relógio calibrada com desvio menor que 10ms.
6. **RF-06 (Suporte a Turnos Simultâneos - Simultaneous Policy):** No modo de turnos simultâneos, o servidor deve coletar os comandos secretos de todos os jogadores durante a janela de tempo e resolver todas as ações simultaneamente em uma fase de resolução atômica.
7. **RF-07 (Resolução de Colisão em Turno Simultâneo):** O sistema deve aplicar regras formais de resolução de colisão (prioridade de peça, captura mútua ou anulação de avanço) quando duas ou mais peças tentarem ocupar a mesma casa no mesmo ciclo.
8. **RF-08 (Reconexão com Retenção de Sessão):** Se um jogador for desconectado, o servidor deve reter a sua vaga na sala por 60 segundos (`allowReconnection(client, 60)`), restaurando o estado exato da partida no momento da reconexão.
9. **RF-09 (Auto-Resign por Timeout de Reconexão):** Se o jogador desconectado não restabelecer a conexão dentro dos 60 segundos de tolerância, o servidor deve decretar abandono e atribuir a vitória aos jogadores remanescentes.
10. **RF-10 (Canal Dedicado de Espectadores):** O servidor deve permitir a entrada de espectadores em modo somente leitura (Read-Only), transmitindo os deltas de jogo sem permitir envio de comandos de movimentação.
11. **RF-11 (Rate Limiting de Comandos):** O servidor deve limitar a taxa de mensagens por cliente a no máximo 10 pacotes por segundo, descartando pacotes excedentes e desconectando clientes que cometam abusos intencionais.
12. **RF-12 (Autenticação por Token JWT):** Todo handshake de conexão WebSocket na `ChessRoom` deve validar o token JWT recebido no query parameter, vinculando a conexão ao ID de usuário autenticado.
13. **RF-13 (Telemetria de Conexão RTT):** O cliente deve enviar periodicamente pacotes de ping e exibir o valor de latência Round-Trip Time (RTT) em milissegundos e o jitter na barra de status da partida.
14. **RF-14 (Transmissão de Eventos Sonoros e Efeitos):** Além das mutações de estado, o servidor deve emitir eventos efêmeros pontuais (como `PIECE_CAPTURED_EVENT`, `CHECK_EVENT`, `EXPLOSION_EVENT`) para acionamento de efeitos audiovisuais nos clientes.
15. **RF-15 (Encerramento e Persistência de Partida):** Ao término da partida, o servidor deve congelar o estado final, persistir o histórico e o resultado no banco de dados via worker assíncrono e desinstanciar a sala em memória em até 10 segundos.

---

## 17. REQUISITOS NÃO-FUNCIONAIS (RNF) - NETCODE E PERFORMANCE

Abaixo estão formalizados os 15 requisitos não-funcionais que governam a arquitetura de rede e multiplayer.

1. **RNF-01 (Latência Máxima de Processamento do Tick):** O tempo de processamento de um tick de simulação no servidor Colyseus não deve ultrapassar **5 milissegundos** sob carga nominal de 10 salas por processo.
2. **RNF-02 (Tamanho Médio de Pacote Delta):** O payload de um delta binário de movimentação de peça não deve ultrapassar **150 bytes** na camada de rede.
3. **RNF-03 (Compatibilidade com Free Tier do Render):** O processo do servidor de jogos deve consumir menos de **250 Megabytes** de memória RAM sob carga de até 20 partidas ativas simultâneas, operando com folga dentro da cota gratuita de 512MB do Render.com.
4. **RNF-04 (Taxa de Quadros no Cliente sob Sync de Rede):** A recepção e decodificação de pacotes binários do WebSocket no cliente web não pode causar quedas de quadros abaixo de **60 FPS** no canvas 3D.
5. **RNF-05 (Precisão de Sincronização de Relógio):** A diferença de relógio entre o cliente e o servidor autoritativo deve ser mantida com precisão estrita de até **±10 milissegundos** após a calibração inicial.
6. **RNF-06 (Tempo de Resposta em Predição Otimista):** A interface do cliente deve refletir a intenção de movimento em menos de **2 milissegundos** após a interação do usuário na tela (Zero Perceived Latency).
7. **RNF-07 (Resiliência sob Perda de Pacotes):** A aplicação deve manter a jogabilidade funcional em conexões móveis com perda de pacotes de até **5%**, retransmitindo deltas essenciais sem travamentos permanentes da tela.
8. **RNF-08 (Descarte Rápido de Salas Encerradas):** Salas finalizadas devem ter seus timers cancelados e seus objetos limpos da memória heap em menos de **500 milissegundos** após a conclusão do jogo.
9. **RNF-09 (Segurança de WebSocket):** Todas as conexões WebSocket em ambiente de produção devem operar estritamente sob o protocolo criptografado `wss://` (TLS 1.3), impedindo ataques de espionagem ou adulteração de pacotes no trânsito.
10. **RNF-10 (Tempo de Restauração em Reconexão):** O processo de reconexão de um jogador e re-sincronização do estado completo da partida não deve exceder **1.000 milissegundos** após a restauração do sinal de internet.
11. **RNF-11 (Isolamento de Erros por Sala):** Um erro ou exceção inesperada em uma sala de jogo (Room crash) deve ser isolado e capturado pelo Colyseus sem afetar o funcionamento de outras salas em execução no mesmo servidor.
12. **RNF-12 (Consumo de Banda por Jogador):** Uma partida típica de 15 minutos em modo clássico não deve consumir mais do que **500 Kilobytes** de tráfego de dados no total, preservando franquias móveis dos usuários.
13. **RNF-13 (Cobertura de Testes de Netcode):** As rotinas de autoridade, sincronização de relógio e resolução de colisões simultâneas devem atingir cobertura de testes automatizados superior a **90%**.
14. **RNF-14 (Capacidade de Transmissão para Espectadores):** O sistema deve suportar até **100 espectadores simultâneos** em uma única sala sem aumentar a latência de envio de pacotes para os jogadores ativos.
15. **RNF-15 (Taxa de Atualização de Estado - Tick Rate):** O loop do servidor autoritativo deve rodar a uma taxa fixa de **20 Ticks por segundo** (intervalo de 50ms), suficiente para responsividade em jogos táticos de tabuleiro por turnos.

---

## 18. ARQUITETURA DE DEPLOYMENT GRATUITA (FREE TIER) PARA O GAME SERVER

Para manter a infraestrutura de backend multiplayer operando com custo $0:

1. **Deploy no Render.com Free Web Service:** O servidor Colyseus (Node.js) é hospedado na camada gratuita do Render.com, que fornece 512MB de memória RAM compartilhada e conexões WebSocket ilimitadas.
2. **Estratégia de Auto-Wakeup / Prevenção de Spin Down:** Servidores gratuitos no Render entram em modo de espera após 15 minutos de inatividade HTTP. Implementamos um endpoint de pré-aquecimento `/health` que é disparado pela função serverless do matchmaker na Vercel no instante em que dois jogadores encontram uma partida, garantindo que o servidor esteja 100% ativo antes do handshake do WebSocket.
3. **Escalonamento Eficiente de Memória:** O Colyseus não armazena histórico detalhado de lances em arrays infinitos na memória RAM do servidor. Assim que cada lance é resolvido, ele é emitido via webhook ou mensagem Redis para um worker serverless assíncrono que realiza o dump no Supabase, mantendo a pegada de memória do processo Node.js sempre abaixo de 180MB.

---

## 19. MODOS DE JOGO E SUAS PECULIARIDADES DE REDE

1. **Modo Clássico 1v1 (Turn-Based Estrito):**
   - Transmissão sequencial: apenas o jogador com a vez ativa tem permissão para enviar o comando `PLAYER_MOVE`.
   - O relógio do jogador ativo decrementa em tempo real no servidor a cada tick de 50ms.
   - Qualquer comando do jogador passivo é sumariamente descartado.

2. **Modo Hexagonal Simultâneo (4 a 8 Jogadores):**
   - Janela de decisão sincronizada: todos os participantes possuem 30 segundos para planejar e registrar sua jogada secreta.
   - Os comandos enviados permanecem criptografados/ocultos até o fechamento da janela.
   - O servidor entra na fase de `RESOLVING`, processa todas as intenções com detecção de colisões simultâneas e transmite um único delta unificado com as trajetórias e baixas ocorridas.

3. **Modo Speed Chess em Tempo Real (Sem Turnos):**
   - Peças individuais possuem temporizadores de recarga (Cooldown de 3 a 5 segundos após se moverem).
   - Pacotes de movimentação são processados imediatamente conforme chegam ao servidor com validação de cooldown.
   - Utiliza fallback WebRTC/UDP quando disponível para resposta quase instantânea.

4. **Modo Torneio com Transmissão para Espectadores:**
   - Criação de canais de difusão secundários com atraso deliberado de 15 segundos para espectadores, prevenindo trapaças com auxílio de terceiros (Anti-Ghosting).

---

## 20. SCHEMAS DE DADOS, TIPOS TYPESCRIPT E CONTRATOS COLYSEUS

Abaixo constam as definições do schema de sincronização e dos contratos de mensagens de rede:

```typescript
// src/network/schemas/RoomStateSchema.ts
import { Schema, type, MapSchema } from '@colyseus/schema';

export class PieceSchema extends Schema {
  @type('string') id: string = '';
  @type('string') ownerId: string = '';
  @type('string') variantId: string = '';
  @type('string') position: string = ''; // Coordenada "q,r,s" ou "x,y"
  @type('boolean') hasMoved: boolean = false;
  @type('boolean') isCaptured: boolean = false;
}

export class ChessRoomState extends Schema {
  @type('string') matchId: string = '';
  @type('string') activePlayerId: string = '';
  @type('string') phase: 'WAITING' | 'PLAYING' | 'RESOLVING' | 'GAME_OVER' = 'WAITING';
  @type('number') turnNumber: number = 0;
  @type('number') turnTimeRemainingMs: number = 0;
  @type({ map: PieceSchema }) pieces = new MapSchema<PieceSchema>();
}

// Contratos de Mensagens de Rede
export interface IClientMoveCommand {
  pieceId: string;
  from: string;
  to: string;
  clientTimestamp: number;
}

export interface IServerMoveResolution {
  success: boolean;
  errorCode?: string;
  pieceId: string;
  from: string;
  to: string;
  capturedPieceId?: string;
  serverTimestamp: number;
}
```

Contrato JSON para o handshake de entrada na sala:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "JoinRoomHandshakePayload",
  "type": "object",
  "required": ["authToken", "matchId", "clientVersion"],
  "properties": {
    "authToken": { "type": "string" },
    "matchId": { "type": "string" },
    "clientVersion": { "type": "string" },
    "spectatorMode": { "type": "boolean" },
    "clientLocalTimestamp": { "type": "integer" }
  }
}
```

---

## 21. CONCLUSÃO ARQUITETURAL DA SPEC 03

A Spec 03 consolida a infraestrutura de rede que transforma o `ChessInReact` em uma arena multiplayer de classe mundial. Com servidor autoritativo em Node.js/Colyseus, predição otimista no cliente, reconciliação graciosa com tolerância a perdas de pacotes e sincronização de tempo de alta precisão, o sistema proporciona a experiência perfeita de "Zero Latency" para os jogadores enquanto mantém a integridade competitiva rigorosamente protegida em infraestrutura 100% gratuita.
