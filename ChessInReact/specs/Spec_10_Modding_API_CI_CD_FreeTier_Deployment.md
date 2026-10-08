# Spec 10: Comunidade, Modding API, Eventos e Telemetria (Parte 1/4)

## A. OBRIGAÇÃO DE DENSIDADE E ABORDAGEM
Até a Spec 09 construímos um jogo robusto e altamente expansível. A Spec 10 não é sobre regras ou renderização, mas sobre o ecossistema que transforma um "experimento WebGL" num *GaaS (Game as a Service)* voltado para a comunidade. Se a RulesEngine foi feita para ler Betza Strings, a comunidade deve poder escrevê-las.
Criar um mercado de Modding exige separar o Banco de Dados Central de um sistema de validação (Sandbox) e garantir que a telemetria monitore o impacto do conteúdo gerado pelo usuário (UGC) no balanceamento global.

## 1. OBJETIVO DO SUBSISTEMA DE LIVEOPS & MODDING
Fornecer um Workflow "No-Code" e "Low-Code" para os usuários criarem suas próprias Fairy Pieces e Mapas, publicá-los, e permitir que o Backend rastreie Estatísticas de Uso e Telemetria (Quais peças são OP, quais mapas cracham), além de prover Arquitetura para Torneios N-Player sazonais.

## 2. ESCOPO
**PERTENCE A ESTA SPEC:**
- API de Workshop / Criação de Modding.
- Sistema de Torneios / Bracket Culling.
- Telemetria de Balanceamento (Win Rates de Variantes).
- LiveOps (MotD, Atualizações Dinâmicas).
- Server-Driven UI Integrada.

**NÃO PERTENCE:**
- Regras internas da Betza Engine (Já definido na Spec 04).
- Pipeline de Compressão Gráfica 3D (Já definido na Spec 07).

## 3. REQUISITOS E CONSTRAINTS
### 3.1 Constraints de Segurança no Modding (UGC)
- **Constraint:** Usuários injetando strings na Variant API podem mandar strings maliciosas infinitas (Ex: Betza `R(100000)B` repetido 50 mil vezes) projetadas para fritar a Thread NodeJS do Worker de Validação (ReDoS Attack) e derrubar o Matchmaker inteiro.
- **Resolução Arquitetural:** O Backend terá uma Validation Sandbox. Quando o usuário cria uma peça Modificada e tenta publicar, o sistema submete a string para um Linter Betza e limita estritamente o tamanho máximo da regra a $256$ caracteres e $10$ Modificadores Comuns, rejeitando padrões recursivos anômalos.

### 3.2 Constraints de Database Polling na Telemetria
- **Constraint:** Guardar "O Cavalo foi movido 40 milhões de vezes hoje" usando UPDATE num Row SQL de estatísticas faria a tabela morrer sob concorrência de Lock (Database Thrashing).
- **Resolução Arquitetural:** Telemetria utilizará a arquitetura **UDP Fire-and-Forget** ou Ingestion Pipeline (Kafka / Redis HyperLogLog). Eventos estatísticos menores não esperam resposta HTTP $200$.

## 4. PESQUISA MATRIX: FONTES EXTERNAS E GITHUBS VALIDADOS

### Fonte 1: "User Generated Content in Games: Workshop Architectures" (Steamworks SDK)
- **Problema Resolvido:** Como o Steam Workshop propaga Mods.
- **Decisão:** Criaremos o modelo de "Subscrição". Quando um jogador P1 clica "Inscrever no Mod Dragão Vermelho", a UI dele carrega localmente o GLTF da Spec 07 da AWS S3 e injeta a Betza Rule no R3F. Contudo, nas Partidas Oficiais (ELO Queue), Mods são restritos a skins puramente estéticas. O P1 vê um dragão, o P2 vê um bispo normal. Peças com regras mutáveis (Betza customizada) só são aceitas em Salas Customizadas (Custom Lobbies).

### Fonte 2: "Redis HyperLogLog for Count-Distinct Problem"
- **URL:** https://redis.io/docs/data-types/probabilistic/hyperloglogs/
- **Problema Resolvido:** Como contar "Quantos usuários ÚNICOS testaram essa Variante hoje" gastando $0$ processamento.
- **Decisão:** A API usa `PFADD telemetry:variant_id <user_id>`. O Redis conta até milhões usando apenas $12$ KB de memória total e $O(1)$.

### Fonte 3: "Bracket Tournaments API"
- **Problema Resolvido:** Torneios Xadrez 4-Player de 256 Pessoas = 64 Partidas simultâneas. Como avançar?
- **Decisão:** Implementaremos a "Round Robin" Phase e o "Single Elimination Bracket". O Matchmaker (Spec 08) é estendido. Quando o Prisma relata "Game Over" numa sala T-Room, o Worker move o Vencedor pro Hash `Tournament:Bracket:1:winners`. A próxima partida só aloca sala Colyseus quando as 4 sub-chaves possuírem um vencedor consolidado.

### Fonte 4: "Server-Driven UI Pattern" (Airbnb / Lyft)
- **Problema Resolvido:** Criar um evento de fim de semana (Ex: "Festa Hexagonal, ganhe o dobro de pontos") sem subir versão na Apple Store, PWA ou forçar F5 no cliente.
- **Decisão:** O Menu Principal do React (Componentes HTML da Spec 06) consome um endpoint estático de LiveOps na inicialização `/api/liveops/motd` (Message of the Day), que retorna Componentes JSX dinâmicos/Banners.

### Fonte 5: "Isolating Metrics with ClickHouse or TimescaleDB"
- **Problema Resolvido:** Postgres Padrão sofre em consultas de Séries Temporais (Ex: "Qual foi a taxa de vitória do Bispo nos últimos 30 dias agrupado por dia?").
- **Decisão:** A infraestrutura segregará dados de Log de Telemetria das Tabelas Primárias. Todo MoveStream final de partida emitirá eventos pro Kafka, ou salvará assincronamente num banco OLAP separado projetado pra Analytics.

### GitHub 1: lichess-org/lila
- **Estrutura Estudada:** `modules/tournament` (Swiss Tournaments).
- **Decisão influenciada:** Em torneios N-Player grandes, usaremos o Algoritmo Suíço em vez de eliminação. Ninguém quer entrar num Torneio, jogar por 10 minutos contra um Grande Mestre num FFA caótico, perder e ficar assistindo. No Sistema Suíço, os jogadores jogam todas as rodadas pareados contra outros de pontuação similar, garantindo Engajamento Global no Evento.

### GitHub 2: posthog/posthog
- **Problema Resolvido:** Analisar a jornada do player UI.
- **Decisão:** Em vez de construir Telemetria Frontend do zero, injetaremos o SDK do PostHog no Zustand da Main Thread, logando eventos `Piece_Selected`, `Mode_Changed`, `Lobby_Aborted` para gerar Funnels no painel Administrativo.

## 5. ESTRUTURA REAL DE DIRETÓRIOS E MÓDULOS (MODDING E LIVEOPS)

```text
src-backend/
  api-gateway/
    src/
      routes/
        workshop.ts         // CRUD de Custom Fairy Pieces e Maps
        tournaments.ts      // Swiss System Management
        liveops.ts          // MOTD, Banners, Feature Flags
  telemetry-worker/         // Serviço Isoloado para ler Streams Redis
    src/
      Ingestion.ts          // Batches PFADD e salva OLAP
```

(CONTINUA NA PARTE 2)
## 6. A WORKSHOP API: CRIANDO FADAS DE FORMA SEGURA

O usuário usa uma ferramenta Web (dentro do React) para arrastar caixinhas ("Move Pra Frente", "Pula 2") e a UI compila isso numa Betza String (`fW2N`). Quando o `POST` bate na API:

```typescript
// src-backend/api-gateway/src/routes/workshop.ts
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { BetzaParser } from '../../../../src/engine/rules/behaviors/BetzaParser';

const router = express.Router();
const prisma = new PrismaClient();

router.post('/create-piece', async (req, res) => {
   const { name, betzaString, visualMeshUrl } = req.body;
   
   // 1. LIMITES DE SEGURANÇA (Sandbox Constrain)
   if (betzaString.length > 50) return res.status(400).send("Betza string too complex.");
   
   // 2. TENTAÇÃO DE PARSE (Se quebrar a Engine, é rejeitado antes de salvar)
   try {
       // Instancia um Tabuleiro Dummy em memória estrita
       const dummyState = createDummyState();
       const behaviors = BetzaParser.parse(betzaString);
       
       // Mede performance de Geração O(1)
       const start = performance.now();
       behaviors[0].generatePseudoLegalMoves("0,0,0", topology, dummyState);
       const time = performance.now() - start;
       
       // Timeout Attack Validation
       if (time > 2.0) throw new Error("Move resolution is too expensive CPU-wise.");

   } catch(e) {
       return res.status(400).send("Invalid or Malicious Betza String: " + e.message);
   }

   // 3. Salva no DB da Spec 09
   const newPiece = await prisma.customVariant.create({
       data: { authorId: req.user.id, name, betzaRules: betzaString, visualMeshUrl, isPublic: true }
   });

   res.json(newPiece);
});
```

### 6.1 Assinatura de Assets Estéticos (Skin Moderation)
Para evitar que usuários enviem modelos 3D (`visualMeshUrl`) ofensivos para a AWS S3 (GLTF malicioso com scripts embutidos ou meshes NSFW), todos os arquivos enviados passam por um Cloudflare Worker Interceptor. Este interceptor valida a Header do Binário (MIME), recusa texturas $>1024x1024$, e descarta extensões `.gltf` em texto plano em favor do `.glb` binário estrito antes de propagar a S3 Object URL para o Banco.

## 7. SISTEMA DE TORNEIOS (SWISS ALGORITHM INTEGRATION)

O Servidor Stateless de Matchmaking da Spec 08 é ótimo para "Quick Play". Mas Eventos (LiveOps) demandam estrutura.

### 7.1 Lifecycle do Torneio
1. **Lobby Phase:** O DB tem o evento `Hexagonal Masters` agendado. Jogadores clicam "Join". Redis adiciona num `SET` global.
2. **Pairing Phase:** O CronJob roda o script Swiss System. Ele tenta não repetir confrontos entre N jogadores que já jogaram.
3. **Execution Phase:** O Colyseus recebe a Carga de 100 partidas simulâneas (400 jogadores). (Escala via AWS ECS/Fargate de Node.js instanciando dinamicamente containers Colyseus).
4. **Reporting Phase:** `ChessRoom.onDispose()` joga os resultados no Prisma (Spec 09). O Worker de Telemetria avisa a Rota do Torneio. O jogador vê o HTML atualizar a pontuação dele e espera o próximo rodada (Round Robin Timer).

### 7.2 A Escala do Colyseus
Em torneios massivos, o Node limitará em ~30 Salas pesadas por CPU Thread. A arquitetura implementada usará **Redis Presence** em Múltiplos Pods.
Se o Matchmaker parear P1, P2, P3 e P4, ele manda todos acessarem o Endpoint `wss://game-edge-a1.chess.com`. O NGINX Route53 mapeia a requisição exatamente pro Pod do Cluster que possui RAM Livre (Health Checked).

(CONTINUA NA PARTE 3)
## 8. PIPELINE DE TELEMETRIA E BALANCEAMENTO ASSÍNCRONO

Num jogo expansivo, os Desenvolvedores precisam de dados se uma variante Hexagonal de 8 jogadores favorece desproporcionalmente o Jogador "Amarelo" (Spawn Posicional Injusto).
Não usaremos o PostgreSQL pra isso (Spec 09).

### 8.1 Ingestão Baseada em Redis Fire-and-Forget
Quando uma partida finaliza na sala `ChessRoom` (NodeJs), nós disparamos os resultados do jogo e o log resumido pro Redis PubSub e pro HyperLogLog.

```typescript
// microservices/game-stateful/src/telemetry/TelemetryEmitter.ts
import { Redis } from 'ioredis';

const redis = new Redis();

export class Telemetry {
    public static logMatchConclusion(variantId: string, mapSeed: string, results: any[]) {
       // O(1) Counter Increment
       redis.hincrby(`telemetry:variant_plays:${variantId}`, 'total_plays', 1);
       
       // Registra quem ganhou em qual ordem pra medir a métrica de "First Player Advantage"
       const winnerId = results.find(r => r.score === 1)?.playerId;
       if (winnerId) {
          redis.hincrby(`telemetry:variant_plays:${variantId}`, `wins_p${results.indexOf(winnerId) + 1}`, 1);
       }
       
       // Fire and forget, sem await. Não deve travar o garbage collection da sala.
    }
}
```

### 8.2 Worker de Análise OLAP
Um processo Cron NodeJs ou Python roda de madrugada. Ele acessa os `hkeys` do Redis:
Se a chave `telemetry:variant_plays:hex_6_player` tem 100.000 plays, mas a métrica `wins_p1` está em $40\%$ (O justo seria 16% em 6 jogadores), o Worker sinaliza um "Balance Alert" para a UI do Admin do jogo via Slack/Discord Webhook. 
Isso permite que as métricas N-Player sejam ajustadas dinamicamente ajustando a geometria do mapa (Mudando o algoritmo de Noise procedural da Spec 02).

## 9. SERVER-DRIVEN UI PARA LIVEOPS E EVENTOS (UX DO NUTRIOPUS)

Para manter a UI da Spec 06 limpa sem precisar soltar atualizações do cliente (Vite Build) pra cada evento sazonal. O painel lateral (NutriOpus Sidebar) possui um Contêiner "News & Events".

### 9.1 Endpoint de MOTD (Message of the Day)
```typescript
// GET /api/liveops/motd
{
   "activeEvent": {
       "title": "Winter Hexagons",
       "description": "Jogue no mapa nevado e ganhe ELO Glicko duplo!",
       "themeOverride": "DARK_ICE", // Força o Spec 06 ThemeSync a mudar
       "actionButton": {
           "label": "Jogar Evento",
           "variantTarget": "hex_winter_event_2026"
       }
   }
}
```
O Cliente React consome isso no `useEffect` de Start e muda as cores das bordas do CSS Tailwind da Sidebar dinamicamente. O "Jogar Evento" roteia diretamente para o Matchmaker (Spec 08) injetando o código da variante invisível para o usuário.

## 10. FAILURE MODES EM ECOSSISTEMAS DE MODDING

### 10.1 Failure Mode: "O Ataque do Mod Viral Crash"
- **Cenário:** O Jogador A cria uma Peça Modificada chamada "Nuke" com malha GLTF pesando $80$ MB. Ele publica. Fica popular. 10.000 pessoas se inscrevem e entram no matchmaking. Quando o jogo carrega a peça, o Browser das 10.000 pessoas crascha por esgotamento de VRAM (WebGLLoss). O jogo parece "Estar fora do Ar".
- **Resolução Arquitetural (Quarantine Bot & Culling limits):** 
O `AssetLoader` da Spec 07 possui limites Hardcoded de Blob Size ($< 2MB$ por malha de peça). Se a S3 retornar um content-length maior, o Fetcher falha intencionalmente e o R3F renderiza um Cone Rosa Genérico no lugar da peça Nuke. Em paralelo, a telemetria do Frontend emite um log `GLTF_REJECTED` para o servidor. O Worker banirá o Mod "Nuke" da Workshop preventivamente após 50 flags de reject automáticos, mascarando-o da listagem de Mods Públicos.

### 10.2 Failure Mode: Inflação de ELO em Modding (Farming)
- **Cenário:** Jogadores combinam no Discord de criarem um lobby customizado usando a Mod-Variant "Peões Mágicos que dão Mate sozinhos" para subir ELO infinitamente.
- **Resolução Arquitetural (Unranked Taint):**
A API do Matchmaker e de Criação de Salas (`createRoom`) injeta uma flag de contexto `isRanked`.
Só são ranqueadas as partidas criadas pelo Server Tick Loop oficial da fila da Spec 08.
Salas customizadas ou protegidas por senha que possuem a flag `allowCustomVariants=true` SEMPRE têm sua flag `isRanked` forçada a `false` no NodeJS (Authoritative). Quando a sala acabar e jogar os dados pro banco (Spec 09), a `RatingSystem.ts` ignora `isRanked=false`. Nenhum ponto de Glicko-2 transita na base de dados de Lobbies Customizados de Modding.

(CONTINUA NA PARTE 4)
## 11. PLANO DE IMPLEMENTAÇÃO DA SPEC 10
1. Construir e isolar o `Worker de Telemetria` (Node.JS). Adicionar Listeners Pub/Sub aos eventos de `GAME_OVER` e alimentar contadores (HINCRBY) em Batch no Redis.
2. Criar a interface "Mod Workshop" no React. Implementar formulário interativo de montagem de Betza String ("Peça Salta + Peça Desliza").
3. Escrever a API JWT e a Sandbox do `Validation Service` (API Gateway) que ingere os POSTs do Mod Workshop com Timeout forçado de 2s para evitar CPU Locking (ReDoS).
4. Implementar o endpoint `/api/liveops/motd` gerido via Redis Keys por Administradores, alterando as cores principais e o "Highlight Game Mode" do Menu UI em tempo real sem rebuildar o Frontend.
5. Injetar o Client do PostHog no Provider Raiz do App.tsx e mapear clicks em botões de UI para rastrear Onboarding de novos usuários no complexo painel N-Player.

## 12. CRITÉRIOS DE ACEITE FINAIS
1. **Segurança do Ecossistema (Isolamento):** Criar uma Variante com Betza propositalmente falha (ex: string não terminada ou ciclíca infinita) deverá ser validada e explicitamente barrada pela Node.js Gateway API em menos de 300ms, lançando Status $400$ sem nunca afetar o banco principal.
2. **Eventos Instantâneos (Zero-Downtime):** Um Administrador de servidor alterar o valor de `current_liveops_banner` no banco de dados deve refletir no lobby dos clientes online em tempo real (através da notificação WebSocket da Presence), ou, no máximo, ao recarregar a tela do Frontend, comprovando que a Server-Driven UI é a Single Source of Truth do tema do dia.
3. **Imunidade A ELO Farming:** Finalizar 1.000 partidas em salas onde `customRules = true` ou em convites privados fechados não deverá registrar a menor alteração ou Update Query na coluna `ratingsMap` da tabela Prisma de usuários, limitando a distribuição do prestígio Glicko-2 rigidamente às filas anônimas e equilibradas do Matchmaker.

---

# EPÍLOGO DAS 10 ESPECIFICAÇÕES
O **ChessInReact** arquitetado ao longo destas 10 Especificações não é um mero passatempo de xadrez em Javascript. 
Ao integrar:
1. **ECS e Transient Zustand (Spec 01)**
2. **Matemática Hexagonal e Procedural Simplex O(1) (Spec 02)**
3. **Netcode Rollbacks Autoritativos no Colyseus (Spec 03)**
4. **Isomorfismo de Validação Betza e Modding (Spec 04)**
5. **Monte Carlo e Paranoid Alpha-Beta N-Player (Spec 05)**
6. **DOM-To-WebGL Interactivity e UI Portals (Spec 06)**
7. **Instanciamento Extremo na GPU em WebGL2 (Spec 07)**
8. **Matchmaker Massivo e Spectators Distribuídos (Spec 08)**
9. **Event Sourcing e Replays PGN Compactos via Prisma (Spec 09)**
10. **Sandbox de UGC, Modding Limpo e Telemetria (Spec 10)**

O projeto configura-se como um Engine Generalista de Jogos de Tabuleiro Procedurais Escalonáveis de Grau Empresarial, capaz de absorver qualquer variação do xadrez que a humanidade crie, desde 2 até N jogadores, enquanto provê uma camada de eSports, LiveOps e monetização por estética segura. Todos os gargalos comuns (Event Bubbling, Memory Leaks WebGL, Thrashing de Banco e Time-desync) foram mapeados e solucionados via Padrões de Projeto de Software Estritos.


## 13. REPOSITÓRIOS GITHUB E REFERÊNCIAS EXTERNAS (MODDING, LIVEOPS, CI/CD E TELEMETRIA)

Abaixo documentamos as fontes de governança de conteúdo gerado por usuários (UGC), automação de entrega contínua (CI/CD) e telemetria de alta escala analisadas para o `ChessInReact`.

### 13.1 Projetos Open Source Analisados
1. **GitHub: `PostHog/posthog`**
   - **Link:** https://github.com/PostHog/posthog
   - **Resumo Técnico:** Plataforma aberta de telemetria de produto, gravação de sessões, feature flags e funis de conversão com ingestão de eventos em tempo real.
   - **Como Aproveitaremos no Projeto:** O cliente e o backend utilizam o SDK `@posthog/js` e `posthog-node` no plano gratuito da nuvem (1 milhão de eventos gratuitos por mês). Rastreamos taxas de vitória (Win Rate) de cada variante de xadrez para detecção de desbalanceamentos e registramos falhas gráficas de WebGL para priorização de correções de compatibilidade.

2. **GitHub: `cloudflare/workers-sdk` (Wrangler & R2)**
   - **Link:** https://github.com/cloudflare/workers-sdk
   - **Resumo Técnico:** SDK oficial para desenvolvimento de Edge Functions e gerenciamento de armazenamento de objetos Cloudflare R2 compatível com S3.
   - **Como Aproveitaremos:** Criamos uma Edge Function que atua como Gatekeeper para uploads de modelos 3D criados pela comunidade no Workshop. A função valida o cabeçalho binário do arquivo GLB, inspeciona o número de polígonos, rejeita arquivos acima de 2MB e armazena o asset no Cloudflare R2 com taxa de saída gratuita permanente (Zero Egress Fees).

3. **GitHub: `actions/checkout` e GitHub Actions Ecosystem**
   - **Link:** https://github.com/actions
   - **Resumo Técnico:** Plataforma de integração contínua (CI) e entrega contínua (CD) integrada nativamente ao GitHub com runners virtuais Linux/Windows/macOS.
   - **Como Aproveitaremos:** Toda a esteira de validação do monorepo é automatizada em workflows do GitHub Actions no plano gratuito (2.000 minutos mensais): linting de TypeScript, testes unitários de regras com Jest/Vitest, benchmarks de Perft, auditoria de Draw Calls e deploy automatizado para a Vercel e Render.com a cada push na branch `main`.

4. **GitHub: `ajv-validator/ajv`**
   - **Link:** https://github.com/ajv-validator/ajv
   - **Resumo Técnico:** O validador de JSON Schemas mais rápido do ecossistema JavaScript, compilando schemas para funções analíticas nativas otimizadas pelo compilador JIT da V8.
   - **Como Aproveitaremos:** Utilizado na Sandbox de Validação do Workshop para sanitizar o payload de novas peças fadas e variantes submetidas por usuários. Qualquer JSON que contenha propriedades não-declaradas ou valores fora dos limites aceitáveis é rejeitado em menos de 0.05ms antes de tocar no banco de dados.

5. **GitHub: `getsentry/sentry-javascript`**
   - **Link:** https://github.com/getsentry/sentry-javascript
   - **Resumo Técnico:** Sistema líder em monitoramento de erros, performance e rastreamento distribuído (Distributed Tracing) para aplicações web e serviços Node.js.
   - **Como Aproveitaremos:** Integrado com amostragem inteligente (10% de rastreamento de transações) no plano gratuito do Sentry (5.000 erros/mês), alertando instantaneamente a equipe sobre desyncs de estado em partidas ativas ou falhas de shaders WebGL em modelos específicos de smartphones.

6. **GitHub: `cure53/DOMPurify`**
   - **Link:** https://github.com/cure53/DOMPurify
   - **Resumo Técnico:** Sanitizador XSS de alta performance para HTML, MathML e SVG contra ataques de injeção em interfaces web.
   - **Como Aproveitaremos:** Todos os textos fornecidos pela comunidade no Workshop (título da variante, biografia do criador e descrição de habilidades de peças) passam pelo DOMPurify antes da renderização no DOM do React, neutralizando qualquer tentativa de injeção de scripts maliciosos.

7. **GitHub: `vercel/turborepo`**
   - **Link:** https://github.com/vercel/turborepo
   - **Resumo Técnico:** Sistema de build incremental para monorepositórios JavaScript/TypeScript com cache remoto de compilação.
   - **Como Aproveitaremos:** O projeto `ChessInReact` é organizado como um monorepo gerenciado por Turborepo: pacotes compartilhados (`@chess/core`, `@chess/rules`, `@chess/topology`) são compilados com cache compartilhado, reduzindo o tempo de execução do CI no GitHub Actions de 8 minutos para menos de 90 segundos.

8. **GitHub: `semantic-release/semantic-release`**
   - **Link:** https://github.com/semantic-release/semantic-release
   - **Resumo Técnico:** Automação de versionamento de software baseada nas convenções de commits (Conventional Commits), gerando changelogs e tags Git automaticamente.
   - **Como Aproveitaremos:** Cada merge aprovado na branch principal dispara a análise semântica de commits, incrementa a versão da plataforma (Patch, Minor ou Major) e publica release notes automáticas no repositório.

9. **GitHub: `honojs/hono` (LiveOps Edge Endpoints)**
   - **Link:** https://github.com/honojs/hono
   - **Resumo Técnico:** Framework web leve otimizado para runtimes serverless.
   - **Como Aproveitaremos:** Utilizado para fornecer os endpoints de Server-Driven UI (`/api/liveops/motd`) com respostas cacheadas na CDN da Vercel com cabeçalho `stale-while-revalidate`, entregando a configuração do evento do dia para milhares de jogadores simultâneos com tempo de resposta inferior a 15ms.

10. **GitHub: `open-telemetry/opentelemetry-js`**
    - **Link:** https://github.com/open-telemetry/opentelemetry-js
    - **Resumo Técnico:** Padrão aberto de instrumentação de telemetria, traces distribuídos e métricas de infraestrutura.
    - **Como Aproveitaremos:** O fluxo de comandos entre o cliente, a API do Matchmaker e a sala Colyseus propaga cabeçalhos de trace contextual (`traceparent`), permitindo rastrear o ciclo de vida completo de um lance desde o clique no Three.js até a persistência no PostgreSQL.

---

## 14. HISTÓRIAS DE USUÁRIO (USER STORIES) - LIVEOPS, MODDING E CI/CD

### 14.1 Histórias de Usuário do Jogador e Criador (Player/Creator Perspective)
1. **US10-P01:** Como criador comunitário, quero acessar a interface visual "Fairy Piece Workshop" e criar uma nova peça personalizada combinando movimentos de salto e deslizamento através de caixas de seleção, sem precisar escrever nenhuma linha de código.
2. **US10-P02:** Como inventor de peças, quero testar minha criação em um tabuleiro de testes sandbox interativo individual antes de publicá-la, verificando visualmente como ela se comporta no tabuleiro.
3. **US10-P03:** Como criador de mods 3D, quero poder fazer upload de um modelo 3D no formato `.glb` para a minha peça customizada e ver a textura e o relevo renderizados com iluminação realista em tempo real.
4. **US10-P04:** Como membro da comunidade, quero navegar pelo Workshop público, filtrar as variantes mais populares e testadas da semana e clicar em "Favoritar" nas minhas criações preferidas.
5. **US10-P05:** Como competidor, quero me inscrever em um Torneio Hexagonal de Fim de Semana com chaves de eliminação simples organizadas pela comunidade e visualizar a chave de confrontos atualizada em tempo real.
6. **US10-P06:** Como jogador casual, quero abrir a página inicial e ver uma mensagem do dia (Message of the Day - MotD) informando sobre o evento especial ativo ("Festival de Primavera: Ganhe o dobro de pontos de maestria no Xadrez Triangular!").
7. **US10-P07:** Como jogador em uma sala casual com mods ativados, quero receber um aviso claro na tela de que a partida utiliza regras comunitárias e que o resultado **não alterará minha pontuação de ELO ranqueado**.
8. **US10-P08:** Como usuário, quero avaliar com 1 a 5 estrelas uma variante comunitária recém-jogada e deixar um comentário construtivo sobre o balanceamento da criação.
9. **US10-P09:** Como participante de um torneio, quero receber uma notificação sonora e visual quando a minha partida da próxima rodada for sorteada, com um botão direto para ingressar na arena.
10. **US10-P10:** Como jogador, se eu me deparar com uma peça ou variante com conteúdo ofensivo ou inadequado no Workshop, quero poder clicar no botão "Denunciar Mod", enviando o item para quarentena de moderação.
11. **US10-P11:** Como criador premiado, quero ver um selo de "Criador Verificado" no meu perfil quando uma variante minha ultrapassar a marca de 10.000 partidas jogadas pela comunidade.
12. **US10-P12:** Como competidor em campeonato, quero poder acompanhar a transmissão ao vivo da mesa final com placar integrado na interface sem precisar abrir janelas externas.
13. **US10-P13:** Como usuário em conexão fraca, se o download do modelo 3D customizado de um adversário falhar, quero que o jogo substitua automaticamente o modelo por uma peça clássica de cor correspondente sem travar a partida.
14. **US10-P14:** Como participante de eventos, quero colecionar bordas cosméticas de avatar e temas de tabuleiro comemorativos desbloqueados ao completar missões semanais de LiveOps.
15. **US10-P15:** Como usuário que gosta de transparência, quero consultar a página pública de "Estatísticas de Balanceamento" e ver quais peças e variantes apresentam taxas de vitória mais equilibradas (em torno de 50%).

### 14.2 Histórias de Usuário do Desenvolvedor e Engenheiro DevOps (Developer/DevOps Perspective)
1. **US10-D01:** Como engenheiro de DevOps, quero que todo pull request aberto na branch `main` execute automaticamente o pipeline de CI no GitHub Actions validando linter, testes de Perft e compilação em menos de 3 minutos.
2. **US10-D02:** Como mantenedor do código, quero que os testes de Perft garantam que nenhuma alteração na Rules Engine altere a contagem formal de nós de xadrez clássico e variantes, prevenindo regressões silenciosas de regras.
3. **US10-D03:** Como arquiteto de segurança, quero que o endpoint de publicação de variantes no Workshop aplique uma sandbox com timeout rígido de 2 segundos para testar a string Betza contra ataques ReDoS antes de aceitar a gravação no banco.
4. **US10-D04:** Como engenheiro gráfico, quero que a esteira de upload de malhas 3D inspecione o arquivo GLB rejeitando modelos com mais de 10.000 triângulos ou peso superior a 2MB, protegendo a GPU de usuários móveis contra crashes de VRAM.
5. **US10-D05:** Como desenvolvedor de LiveOps, quero poder alterar o conteúdo do Message of the Day (MotD), cores de evento e modo de destaque do menu alterando uma chave no Redis ou Supabase sem precisar reconstruir o pacote estático do frontend.
6. **US10-D06:** Como operador de produto, quero que os eventos de telemetria in-game sejam agregados no PostHog de forma assíncrona com amostragem configurável para não estourar a cota gratuita de 1 milhão de eventos mensais.
7. **US10-D07:** Como arquiteto de integridade competitiva, quero que todas as salas que utilizem variantes customizadas ou regras não-oficiais recebam a tag `isRanked: false` de forma autoritativa no backend Node.js, bloqueando qualquer inflação artificial de pontuação Glicko-2.
8. **US10-D08:** Como engenheiro de confiabilidade, quero que o sistema coloque automaticamente em quarentena mods comunitários que apresentem taxa de crash de clientes superior a 5%, ocultando-os das buscas públicas até revisão.
9. **US10-D09:** Como desenvolvedor de torneios, quero que a árvore de chaveamento (Bracket Engine) avance automaticamente os vencedores de cada rodada via transações atômicas no Redis no instante em que o Colyseus emitir o evento de encerramento de sala.
10. **US10-D10:** Como operador financeiro, quero que todos os serviços da plataforma operem estritamente dentro dos planos gratuitos (Free Tiers) da Vercel, Supabase, Render, Upstash, Cloudflare R2 e PostHog, emitindo alertas caso o consumo de qualquer quota atinja 80%.

---

## 15. REQUISITOS FUNCIONAIS (RF) - MODDING, LIVEOPS, CI/CD E TELEMETRIA

Abaixo estão formalizados os 15 requisitos funcionais mandatórios do subsistema comunitário e operacional.

1. **RF-01 (Editor Visual de Peças Fadas - Workshop):** O sistema deve fornecer uma interface web gráfica interativa onde os usuários selecionem capacidades de movimento (Wazir, Ferz, Dabbaba, Alfil, Knight, Slider, Hopper) e gerem strings Betza válidas sem codificação manual.
2. **RF-02 (Sandbox de Validação e Sanitização de Betza):** O endpoint da API do Workshop deve testar a string Betza em uma sandbox isolada com timeout de 2 segundos e validação léxica, rejeitando strings que contenham recursão infinita ou ultrapassem 256 caracteres.
3. **RF-03 (Upload e Validação de Modelos 3D UGC):** O sistema deve aceitar upload de arquivos `.glb` de peças personalizadas, inspecionando o cabeçalho binário, limitando o peso a no máximo 2 Megabytes e gravando o asset no Cloudflare R2 com hash SHA-256 único.
4. **RF-04 (Galeria Comunitária e Sistema de Subscrição):** A plataforma deve exibir a galeria de variantes criadas pela comunidade com busca textual sanitizada (DOMPurify), filtros por avaliação, contagem de partidas jogadas e botão de subscrição no inventário pessoal.
5. **RF-05 (Isolamento Autoritativo de Partidas Customizadas):** Salas criadas com variantes customizadas de modding devem ter sua flag `isRanked` forçada a `false` no servidor autoritativo, bloqueando qualquer mutação de rating Glicko-2 no encerramento do jogo.
6. **RF-06 (Motor de Torneios com Chaveamento Automático):** O sistema deve orquestrar torneios com chaves de eliminação simples e Round Robin para até 256 participantes, avançando automaticamente os vencedores de cada rodada e alocando salas no Colyseus.
7. **RF-07 (Server-Driven UI e LiveOps - MotD Dinâmico):** O endpoint `/api/liveops/motd` deve fornecer banners de eventos temáticos sazonais, textos de novidades e links de modos em destaque, consumidos pelo frontend React sem necessidade de novo deploy de código.
8. **RF-08 (Telemetria Assíncrona de Balanceamento com PostHog):** O sistema deve emitir eventos assíncronos ao final de cada partida registrando a variante utilizada, peças capturadas, número de turnos e o vencedor, gerando relatórios de taxa de vitória (Win Rate) no PostHog.
9. **RF-09 (Métricas de Usuários Únicos com Redis HyperLogLog):** O backend deve registrar acessos diários de usuários e adesão a variantes em estruturas HyperLogLog no Upstash Redis, permitindo contagem de cardinalidade em tempo constante com menos de 12KB de memória.
10. **RF-10 (Quarentena Automática de Mods com Erros):** Se uma variante ou modelo 3D provocar erros de cliente (`GLTF_LOAD_ERROR` ou exceções WebGL) em mais de 5% das partidas, o sistema deve suspender automaticamente o item da listagem pública para investigação.
11. **RF-11 (Esteira Automatizada de CI/CD com GitHub Actions):** O repositório deve possuir workflow automatizado que executa linter TypeScript, suíte de testes Vitest/Jest, testes Perft e deploy contínuo na Vercel (frontend) e Render (backend) a cada merge na branch principal.
12. **RF-12 (Monitoramento de Exceções em Produção com Sentry):** O cliente React e o servidor Colyseus devem capturar exceções não tratadas e desyncs de rede e transmiti-los com stack traces saneados para o Sentry no plano gratuito.
13. **RF-13 (Sistema de Avaliações e Denúncias Comunitárias):** Usuários autenticados devem poder avaliar variantes com notas de 1 a 5 estrelas e acionar o fluxo de denúncia de conteúdo inapropriado para remoção por moderadores.
14. **RF-14 (Fallback Gracioso para Falhas de Modelos UGC):** Caso o modelo 3D customizado de uma peça do adversário falhe ao ser baixado pelo navegador, o Three.js deve instanciar uma malha geométrica clássica padronizada correspondente sem interromper a partida.
15. **RF-15 (Versionamento Semântico Automatizado de Releases):** A esteira de CI/CD deve analisar as mensagens de commit convencionais (`feat:`, `fix:`, `chore:`) e gerar automaticamente tags de versão semântica e changelogs em GitHub Releases.

---

## 16. REQUISITOS NÃO-FUNCIONAIS (RNF) - OPERAÇÃO, SEGURANÇA E LIMITES DE LIVEOPS

Abaixo estão formalizados os 15 requisitos não-funcionais que governam o subsistema operacional e comunitário.

1. **RNF-01 (Tempo de Execução do Pipeline de CI/CD):** A esteira completa de build, lint, testes unitários e testes Perft no GitHub Actions deve executar em menos de **4 minutos**, respeitando com folga o limite de 2.000 minutos mensais do plano gratuito.
2. **RNF-02 (Tempo Máximo de Validação de Sandbox de Mod):** A validação léxica e de segurança de uma nova variante no backend não deve exceder **300 milissegundos**.
3. **RNF-03 (Teto Rígido de Tamanho de Arquivo GLB UGC):** O tamanho máximo de upload para qualquer modelo tridimensional comunitário deve ser estritamente limitado a **2.0 Megabytes**, rejeitando modelos pesados na borda.
4. **RNF-04 (Conformidade com Free Tier do Cloudflare R2):** Todo o armazenamento de malhas 3D comunitárias deve operar dentro dos limites gratuitos de **10 Gigabytes de storage e zero taxa de egress** do Cloudflare R2.
5. **RNF-05 (Conformidade com Free Tier do PostHog):** O volume de eventos de telemetria emitidos não deve ultrapassar **1.000.000 de eventos por mês**, utilizando técnicas de amostragem em partidas casuais para assegurar custo zero permanente.
6. **RNF-06 (Conformidade com Free Tier do Sentry):** O volume de relatórios de erros capturados deve respeitar a cota gratuita de **5.000 erros mensais**, aplicando agrupamento de exceções semelhantes na origem.
7. **RNF-07 (Proteção contra ReDoS no Parser Betza):** O analisador de notação Betza deve utilizar expressões regulares determinísticas com timeout forçado de **2.000 milissegundos**, prevenindo travamentos de CPU por Denial of Service de expressões regulares.
8. **RNF-08 (Zero Impacto de Telemetria no Loop do Jogo):** A emissão de eventos de telemetria no frontend deve utilizar requisições assíncronas `navigator.sendBeacon` ou WebWorkers, com custo de CPU na thread principal estritamente inferior a **1 milissegundo**.
9. **RNF-09 (Latência de Resposta do LiveOps MotD):** O endpoint `/api/liveops/motd` servido na borda CDN deve responder com latência média inferior a **20 milissegundos**.
10. **RNF-10 (Sanitização Completa de Textos Comunitários):** Exatos **100% dos campos de texto gerados por usuários** exibidos no DOM devem ser sanitizados com DOMPurify, eliminando qualquer vulnerabilidade de Cross-Site Scripting (XSS).
11. **RNF-11 (Disponibilidade e Resiliência da Esteira de Deploy):** Em caso de falha em qualquer etapa de testes automatizados no GitHub Actions, o deploy em produção deve ser cancelado automaticamente, mantendo a versão anterior estável no ar sem downtime.
12. **RNF-12 (Teto de Polígonos de Modelos Comunitários):** A ferramenta de validação deve rejeitar modelos 3D que contenham mais de **10.000 triângulos ou mais de 2 materiais distintos**, garantindo compatibilidade com GPUs móveis.
13. **RNF-13 (Cobertura de Testes de Endpoints do Workshop):** Os controladores de API de criação e listagem de variantes devem possuir cobertura de testes automatizados superior a **90%**.
14. **RNF-14 (Armazenamento de Metadados de Telemetria em Redis):** Contadores de telemetria agregada por dia não devem consumir mais do que **50 Megabytes** de RAM no cluster Redis.
15. **RNF-15 (Auditoria de Atualização de Versões):** Toda alteração de regras ou variantes oficiais deve ser documentada com identificador de versão semântica imutável, permitindo rastrear o histórico de balanceamento da plataforma.

---

## 17. ARQUITETURA DE DEPLOYMENT GRATUITA (FREE TIER) INTEGRADA (VISÃO CONSOLIDADA)

Com a formalização da Spec 10, o ecossistema completo do `ChessInReact` consolida sua arquitetura de deployment moderna, robusta e **100% gratuita** através da sinergia entre os principais provedores da nuvem:

| Subsistema do Projeto | Provedor Selecionado | Camada / Plano Gratuito | Capacidade Gratuita Disponibilizada | Custo Mensal |
|---|---|---|---|---|
| **Frontend WebGL / SPA (Specs 01, 06, 07)** | **Vercel** | Hobby Tier | 100 GB Bandwidth / 1M Requisições globais em Edge CDN | **$0.00** |
| **Matchmaker & API Gateway (Spec 08)** | **Vercel Serverless** | Serverless Functions | 100.000 Execuções mensais com Cold Start de 10ms | **$0.00** |
| **Game Server Stateful Colyseus (Spec 03)** | **Render.com** | Free Web Service | 512 MB RAM / CPU Compartilhada / WebSockets ilimitados | **$0.00** |
| **Banco de Dados Relacional SQL (Spec 09)** | **Supabase** | Free Tier | 500 MB Storage SSD / 2 Cores virtuais / PostgreSQL 15 | **$0.00** |
| **Filas e Sorted Sets de ELO (Spec 08)** | **Upstash Redis** | Serverless Free | 10.000 Comandos diários / $0 taxa básica | **$0.00** |
| **Modelos 3D e Assets UGC (Specs 07, 10)** | **Cloudflare R2** | Free Tier | 10 GB Storage / Zero Egress Fees (Sem custo de download) | **$0.00** |
| **Automação de CI/CD e Build (Spec 10)** | **GitHub Actions** | Free Plan | 2.000 Minutos de execução mensal em runners Linux | **$0.00** |
| **Telemetria de Produto & Win Rates (Spec 10)** | **PostHog Cloud** | Free Tier | 1.000.000 de eventos mensais / Dashboards analíticos | **$0.00** |
| **Monitoramento de Erros e Crashes (Spec 10)** | **Sentry** | Developer Plan | 5.000 Erros mensais / Alertas de exceptions | **$0.00** |
| **TOTAL CONSOLIDADO DA PLATAFORMA** | — | — | **Operação completa de produção de escala global** | **$0.00 / mês** |

---

## 18. MODOS DE JOGO E SUAS PECULIARIDADES DE LIVEOPS

1. **Torneios Oficiais Ranqueados (Sazonais):**
   - Chaveamentos automatizados de 16, 64 ou 256 participantes com horário de início sincronizado pelo LiveOps MotD.
   - Distribuição de pontos de maestria e troféus cosméticos para o perfil dos campeões.
2. **Festival de Variantes Comunitárias (Workshop Spotlight):**
   - O sistema de LiveOps seleciona semanalmente a variante criada pela comunidade com melhor avaliação e a promove na tela inicial.
   - Partidas disputadas na variante em destaque concedem emblemas comemorativos para os participantes.
3. **Arenas Sandbox de Teste de Modding:**
   - Modo de jogo solo com controle total de ambos os lados do tabuleiro para testes imediatos de novos movimentos de peças fadas recém-criadas.
4. **Desafios Diários de Puzzles Táticos:**
   - Posições táticas geradas a partir de partidas reais do banco de dados onde os usuários precisam encontrar o melhor lance (alimentado pelo Stockfish WASM no navegador).

---

## 19. SCHEMAS DE DADOS, TIPOS TYPESCRIPT E CONTRATOS DO WORKSHOP

Abaixo constam as interfaces tipadas de modding, telemetria e Server-Driven UI:

```typescript
// src/modding/interfaces/IModdingContracts.ts

export interface IFairyPieceDraft {
  name: string;
  pieceCode: string; // Ex: 'PEGASUS'
  betzaString: string; // Ex: 'N+bW' (Cavalo + Wazir para trás)
  valuePoints: number;
  modelGlbFile?: File;
  colorHexDefault: string;
  authorId: string;
}

export interface ICommunityVariantManifest {
  variantId: string;
  title: string;
  description: string;
  topology: 'SQUARE' | 'HEXAGONAL' | 'TRIANGULAR' | 'VORONOI';
  playerCount: number;
  boardRadius: number;
  customPieces: {
    pieceCode: string;
    betzaString: string;
    modelGlbUrl: string;
  }[];
  modifiers: {
    atomic: boolean;
    crazyhouse: boolean;
    antichess: boolean;
    fogOfWar: boolean;
  };
  totalPlays: number;
  ratingStarsAverage: number;
  authorDisplayName: string;
  publishedAtTimestamp: number;
}

export interface ILiveOpsMotdPayload {
  eventId: string;
  headlineTitle: string;
  bannerImageUrl: string;
  accentColorHex: string;
  callToActionLabel: string;
  targetRoute: string; // Ex: '/queue/hex_winter_cup'
  activeUntilTimestamp: number;
}
```

Contrato JSON para publicação de nova variante no Workshop:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "PublishVariantRequestPayload",
  "type": "object",
  "required": ["title", "description", "topology", "playerCount", "customPieces"],
  "properties": {
    "title": { "type": "string", "minLength": 3, "maxLength": 50 },
    "description": { "type": "string", "maxLength": 500 },
    "topology": { "enum": ["SQUARE", "HEXAGONAL", "TRIANGULAR", "VORONOI"] },
    "playerCount": { "type": "integer", "enum": [2, 3, 4, 6, 8] },
    "customPieces": {
      "type": "array",
      "maxItems": 10,
      "items": {
        "type": "object",
        "required": ["pieceCode", "betzaString", "modelGlbUrl"],
        "properties": {
          "pieceCode": { "type": "string", "pattern": "^[A-Z0-9_]{2,10}$" },
          "betzaString": { "type": "string", "maxLength": 256 },
          "modelGlbUrl": { "type": "string", "format": "uri" }
        }
      }
    }
  }
}
```

---

## 20. CONCLUSÃO ARQUITETURAL DA SPEC 10 E CONSOLIDAÇÃO DO SISTEMA

A Spec 10 coroa a jornada de engenharia de software do projeto `ChessInReact`. Ao instituir um ecossistema seguro e sandboxeado de modding comunitário (Workshop No-Code), telemetria inteligente de balanceamento com PostHog e Redis, automação contínua de CI/CD com GitHub Actions e infraestrutura Server-Driven UI, a plataforma transcende o status de mero jogo e se estabelece como um ecossistema de entretenimento tático dinâmico, moderno e infinitamente expansível, operando com excelência operacional de estúdio internacional e custo de infraestrutura rigorosamente zero.
