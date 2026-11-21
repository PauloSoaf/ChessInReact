# Spec 18: Ecossistema de Torneios Competitivos — Sistema Suíço FIDE, Arena Berserk e Desempates Oficiais

## A. OBRIGAÇÃO DE DENSIDADE E ABORDAGEM
Em plataformas globais de xadrez (como Lichess, Chess.com e servidores FIDE Arena), a competição em larga escala não se restringe a partidas casuais 1v1 ou chaves simples de eliminação direta (*Single Elimination*). O coração do xadrez competitivo mundial fundamenta-se em dois grandes formatos de torneio:
1. **Sistema Suíço Oficial (FIDE Dutch Pairing System):** O padrão internacional adotado em olimpíadas e campeonatos mundiais. Garante que todos os participantes joguem todas as rodadas, pareando jogadores com pontuações idênticas ou próximas, proibindo expressamente confrontos repetidos (*no rematches*), equalizando o balanço de cores (Brancas/Pretas) e aplicando os critérios oficiais de desempate da FIDE (**Buchholz Cut 1**, **Sonneborn-Berger**, **Confronto Direto** e **Número de Vitórias**).
2. **Torneios de Arena em Ritmo Contínuo (Arena Tournaments & Berserk Mode):** O formato dinâmico consagrado pelo Lichess. Jogadores entram em uma arena com duração fixa (ex: 30 a 60 minutos); assim que concluem uma partida, são imediatamente repareados com o adversário livre mais próximo no ranking. Introduz multiplicadores de sequência vitoriosa (*Win Streaks* com pontuação dobrada a partir da 3ª vitória consecutiva) e o lendário **Modo Berserk** (onde o jogador corta seu tempo de relógio pela metade antes do lance 1 em troca de +1 ponto de bônus na vitória).

Esta **Spec 18** formaliza a arquitetura matemática, os contratos tipados e os motores determinísticos para suportar **100% dos formatos de torneios competitivos** no `ChessInReact`, operando no cliente e integrando-se com a `Spec 01` (Core State), `Spec 03` (Multiplayer), `Spec 08` (Matchmaking/Redis), `Spec 10` (Tournament Brackets) e `Spec 16` (Universal Configurator).

---

## 1. OBJETIVO DO SUBSISTEMA DE TORNEIOS
1. **Motor do Sistema Suíço FIDE (Dutch Algorithm):**
   - Pareamento determinístico por grupos de pontuação (*score brackets*).
   - Invariante de confronto único: dois jogadores nunca se enfrentam mais de uma vez no mesmo torneio.
   - Alternância estrita de cores: nenhum jogador joga 3 vezes consecutivas com a mesma cor; balanço White/Black mantido em $\pm 1$.
   - Gestão de *Bye* automático (1 ponto de folga) para número ímpar de competidores, atribuído ao participante de menor pontuação elegível.
2. **Cálculo de Desempates Canônicos da FIDE:**
   - **Buchholz Cut 1:** Soma das pontuações de todos os adversários enfrentados, descartando o pior resultado.
   - **Sonneborn-Berger:** Soma dos pontos dos adversários derrotados mais metade dos pontos dos adversários empatados.
   - **Confronto Direto (*Direct Encounter*):** Resultado do confronto individual caso todos os empatados tenham se enfrentado.
   - **Maior Número de Vitórias.**
3. **Motor de Torneios de Arena Dinâmica:**
   - Duração global cronometrada com contagem regressiva em tempo real.
   - Fila de repareamento instantâneo (*Fast Pairing*) sem bloqueio de rodadas.
   - Multiplicador de sequência (*Win Streak*): vitórias consecutivas 1 e 2 = 2 pts; vitória 3+ = 4 pts. Derrota encerra a sequência.
   - Ativação de Berserk: redução de 50% no tempo inicial e perda de incremento. Vitória em Berserk confere +1 ponto bônus (3 pts normal, 5 pts em streak).
4. **Interface e Scoreboard Interativo:**
   - Tabela de classificação em tempo real com pódio (🥇, 🥈, 🥉), indicadores visuais de streak 🔥 e insígnia de berserk ⚔️.
   - Gestor de rodadas e visualizador de confrontos ativos.

---

## 2. ESCOPO DO SUBSISTEMA

### Pertence a esta Spec:
- Esquema formal TypeScript dos contratos de torneio (`ITournamentContracts.ts`).
- Motor determinístico do Sistema Suíço FIDE (`SwissTournamentEngine.ts`).
- Motor de cálculo de desempates FIDE (`FIDETiebreakCalculator.ts`).
- Motor de Arena Contínua com Berserk e Win Streaks (`ArenaTournamentEngine.ts`).
- Interface do Scoreboard e Modal de Torneios (`TournamentArenaModal.tsx`).
- Persistência local e serialização de estado de torneios (`localStorage`).

### Não Pertence a esta Spec:
- Validação física de lances do tabuleiro (pertence à Spec 04).
- IA de bots participantes (pertence à Spec 05, Spec 11 e Spec 15).
- Cluster Redis de matchmaking de salas Colyseus (pertence à Spec 08 e Spec 03).
- Shaders de renderização 3D (pertence à Spec 07).

---

## 3. CONTRATOS ARQUITETURAIS FORMIS (TYPESCRIPT)

```typescript
export type TournamentFormat = 'SWISS' | 'ARENA' | 'SINGLE_ELIMINATION';

export type GameOutcome = 'WHITE_WIN' | 'BLACK_WIN' | 'DRAW' | 'IN_PROGRESS' | 'BYE';

export interface ITournamentPlayer {
  readonly id: string;
  readonly name: string;
  readonly rating: number;
  readonly points: number;
  readonly tiebreakBuchholzCut1: number;
  readonly tiebreakSonnebornBerger: number;
  readonly winsCount: number;
  readonly gamesPlayed: number;
  readonly colorHistory: readonly ('WHITE' | 'BLACK')[];
  readonly opponentIds: readonly string[];
  readonly currentStreak: number;
  readonly isBerserkActive?: boolean;
}

export interface ITournamentMatch {
  readonly matchId: string;
  readonly roundNumber: number;
  readonly whitePlayerId: string;
  readonly blackPlayerId: string;
  readonly outcome: GameOutcome;
  readonly isWhiteBerserk?: boolean;
  readonly isBlackBerserk?: boolean;
  readonly completedAt?: string;
}

export interface ISwissTournamentState {
  readonly tournamentId: string;
  readonly title: string;
  readonly format: 'SWISS';
  readonly totalRounds: number;
  readonly currentRound: number;
  readonly isCompleted: boolean;
  readonly players: readonly ITournamentPlayer[];
  readonly matches: readonly ITournamentMatch[];
}

export interface IArenaTournamentState {
  readonly tournamentId: string;
  readonly title: string;
  readonly format: 'ARENA';
  readonly durationMinutes: number;
  readonly timeRemainingSeconds: number;
  readonly isCompleted: boolean;
  readonly players: readonly ITournamentPlayer[];
  readonly matches: readonly ITournamentMatch[];
}
```

---

## 4. REQUISITOS DO SISTEMA

### 4.1 Requisitos Funcionais (RF)
- **RF-18-01 (Pareamento Suíço Holandês Estrito):** O motor DEVE parear jogadores dentro do mesmo estrato de pontuação sem rematches e respeitando o teto de 2 cores consecutivas iguais.
- **RF-18-02 (Cálculo de Desempate FIDE Buchholz Cut 1):** O sistema DEVE calcular a soma dos pontos dos adversários descartando o menor valor com precisão matemática.
- **RF-18-03 (Cálculo de Desempate FIDE Sonneborn-Berger):** O sistema DEVE somar 100% dos pontos de adversários derrotados e 50% de adversários com quem houve empate.
- **RF-18-04 (Mecânica de Arena com Win Streaks):** O sistema DEVE dobrar a pontuação de vitórias (4 pontos) a partir da 3ª vitória consecutiva em torneios de Arena.
- **RF-18-05 (Mecânica Berserk de Arena):** O sistema DEVE conceder +1 ponto de bônus em vitórias sob condição de Berserk (tempo reduzido em 50%).
- **RF-18-06 (Interface e Scoreboard Interativo):** O componente visual DEVE apresentar tabela classificatória ordenada por pontos e critérios de desempate, com pódio, medalhas e badges ARIA acessíveis.

### 4.2 Requisitos Não-Funcionais (RNF)
- **RNF-18-01 (Performance de Pareamento):** O pareamento de uma rodada de torneio com até 128 jogadores DEVE executar em menos de $15.0\text{ ms}$.
- **RNF-18-02 (Acessibilidade WCAG 2.2 AA):** O scoreboard e botões de gerenciamento DEVEM ser operáveis por teclado com contraste mínimo 4.5:1.

---

## 5. CRITÉRIOS DE ACEITE E TESTES
1. **Swiss Rematch Prevention:** Teste com 8 jogadores em 3 rodadas comprova que nenhum par de jogadores se enfrenta duas vezes.
2. **Color Alternation Guarantee:** Teste comprova que nenhum competidor recebe 3 vezes a mesma cor consecutiva.
3. **Tiebreak Ranking Determinism:** Teste com empate triplo de pontuação comprova desempate estrito por Buchholz Cut 1 seguido de Sonneborn-Berger.
4. **Arena Streak and Berserk Scoring:** Teste simula 4 vitórias seguidas em Arena com Berserk ativo e valida pontuações: 3 pts (jogo 1 com Berserk), 3 pts (jogo 2 com Berserk), 5 pts (jogo 3 com streak + Berserk), 5 pts (jogo 4 com streak + Berserk).

