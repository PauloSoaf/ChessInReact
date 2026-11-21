# Spec 17: Explorador Interativo de Aberturas, Classificação ECO e Treinador de Repertório com Repetição Espaçada

## A. OBRIGAÇÃO DE DENSIDADE E ABORDAGEM
No xadrez moderno, a fase de abertura define o caráter estratégico e a viabilidade tática de qualquer confronto. Plataformas de classe mundial como Chess.com e Lichess possuem no seu núcleo analítico dois recursos fundamentais:
1. **Explorador Mestre de Aberturas (Opening Explorer):** Navegação dinâmica em grafos de lances mestres com frequências estatísticas, taxas de vitória (Brancas / Empate / Pretas), código de classificação formal **ECO (Encyclopaedia of Chess Openings — A00 a E99)** e resolução instantânea de **transposições de lances**.
2. **Treinador de Repertório com Repetição Espaçada (Spaced-Repetition Repertoire Trainer):** Ferramenta pedagógica onde o enxadrista cadastra suas linhas para Brancas e Pretas e treina ativamente lances esperados contra respostas mestras, utilizando o algoritmo de repetição espaçada (Leitner/SM-2) para consolidar a memória muscular teórica.

Enquanto no Chess.com recursos avançados de treinamento de repertório e consultas ilimitadas a bancos mestres estão bloqueados atrás de assinaturas pagas (R$ 39,90 a R$ 69,90/mês), o `ChessInReact` implementa esta suíte **100% gratuita, descentralizada e executada localmente no navegador do usuário**, integrando-se nativamente com a `Spec 01` (Core State), `Spec 04` (Rules Engine), `Spec 06` (UI/UX Design System), `Spec 09` (PGN Persistence) e `Spec 12` (Game Review).

---

## 1. OBJETIVO DO SUBSISTEMA
1. **Motor de Classificação ECO Canônica (A00 a E99):** Classificar qualquer posição ou sequência de lances no padrão internacional da Enciclopédia de Aberturas de Xadrez com nome formal e variante em menos de 2.0 ms.
2. **Grafo de Aberturas com Resolução de Transposição:** Modelar as aberturas como um Grafo Acíclico Dirigido (DAG) indexado pela chave FEN simplificada / Zobrist, garantindo que ordens invertidas de lances (ex: 1. d4 Cf6 2. c4 e6 vs 1. c4 e6 2. d4 Cf6) apontem para o mesmo nó estatístico.
3. **Métricas Estatísticas de Partidas Mestras:** Para cada lance candidato a partir de uma posição, calcular:
   - Volume de partidas disputadas (`totalGames`).
   - Percentual de vitória das Brancas (`whiteWinPct`), Empates (`drawPct`) e Pretas (`blackWinPct`).
   - Rating médio e lance principal recomendado.
4. **Treinador Interativo de Repertório (Spaced Repetition):**
   - Modo de treino ativo para repertório de Brancas e Pretas.
   - Algoritmo de intervalos espaçados com caixas de proficiência (1 a 5) e fator de facilidade (Ease Factor).
   - Feedback visual e auditivo instantâneo para acerto, erro ou desvio da linha cadastrada.
5. **Importação e Exportação de Repertório PGN:** Leitura e gravação de árvores de repertório em arquivos PGN com anotações e comentários.

---

## 2. ESCOPO DO SUBSISTEMA

### Pertence a esta Spec:
- Classificador ECO (`ECOClassificationEngine.ts`) com base canônica de aberturas de A00 a E99.
- Árvore estatística de aberturas (`OpeningExplorerEngine.ts`) com grafo de transposição.
- Motor de treinamento de repertório com repetição espaçada (`RepertoireTrainerEngine.ts`).
- Painel e modal de interface do explorador (`OpeningExplorerModal.tsx` / `OpeningTreePanel.tsx`) integrado ao Game Review e Game Hub.
- Armazenamento local persistente de repertórios (`localStorage`) com fallback resiliente.

### Não Pertence a esta Spec:
- Validação física de lances do tabuleiro (pertence à Spec 04).
- Engine de avaliação profunda de centipawns com IA (pertence à Spec 05 e Spec 12).
- Servidor autoritativo WebSocket Colyseus (pertence à Spec 03 e Spec 14).
- Shaders WebGL 3D (pertence à Spec 07).

---

## 3. PESQUISA MATRIX: FONTES EXTERNAS E PROJETOS BENCHMARK

### Fonte 1: "Lichess Opening Explorer & Chess-Openings-Data"
- **URL:** https://github.com/lichess-org/chess-openings
- **Problema Resolvido:** Mapeamento eficiente e normalização de nomes de aberturas e códigos ECO a partir de sequências PGN e posições FEN.
- **Conclusão Técnica:** Aberturas são indexadas por FEN normalizado (apenas peças, turno, roque e en-passant) para resolver transposições instantaneamente sem percorrer a lista de lances.
- **Decisão no ChessInReact:** Utilizaremos `normalizeFenForOpening(fen)` como chave primária de índice no `OpeningExplorerEngine`.

### Fonte 2: "Chessable MoveTrainer & SuperMemo SM-2 Spaced Repetition"
- **URL:** https://www.chessable.com/
- **Problema Resolvido:** Como aplicar o algoritmo de repetição espaçada ao estudo de variantes de xadrez.
- **Conclusão Técnica:** Se o usuário joga o lance exato do repertório, o intervalo é expandido $I(n) = I(n-1) \times EF$. Se joga um lance fora do repertório, o nó retrocede para a caixa 1 (revisão imediata).
- **Decisão no ChessInReact:** O `RepertoireTrainerEngine` implementa o cálculo de intervalos determinísticos com pontuação de qualidade (0 a 5).

---

## 4. CONTRATOS ARQUITETURAIS FORMIS (TYPESCRIPT)

```typescript
export interface IOpeningNode {
  readonly eco: string;
  readonly name: string;
  readonly fen: string;
  readonly moveSan: string;
  readonly candidateMoves: readonly IOpeningCandidateMove[];
  readonly totalGames: number;
  readonly whiteWins: number;
  readonly draws: number;
  readonly blackWins: number;
}

export interface IOpeningCandidateMove {
  readonly san: string;
  readonly uci: string;
  readonly totalGames: number;
  readonly whiteWins: number;
  readonly draws: number;
  readonly blackWins: number;
  readonly whiteWinPct: number;
  readonly drawPct: number;
  readonly blackWinPct: number;
  readonly averageRating: number;
}

export interface IRepertoireCard {
  readonly id: string;
  readonly color: 'WHITE' | 'BLACK';
  readonly fen: string;
  readonly expectedMoveSan: string;
  readonly openingName: string;
  readonly eco: string;
  readonly boxLevel: number; // 1 a 5
  readonly intervalDays: number;
  readonly easeFactor: number; // Padrão 2.5
  readonly nextReviewDate: string; // ISO 8601
  readonly timesReviewed: number;
  readonly timesFailed: number;
}
```

---

## 5. REQUISITOS DO SISTEMA

### 5.1 Requisitos Funcionais (RF)
- **RF-17-01 (Classificação ECO Instantânea):** O sistema DEVE identificar o código ECO (A00-E99) e o nome oficial da abertura para qualquer FEN ou lista de lances em $< 2.0\text{ ms}$.
- **RF-17-02 (Grafo de Aberturas com Resolução de Transposição):** O sistema DEVE reconhecer transposições de lances através de FEN normalizado, mapeando ordens diferentes para o mesmo nó de dados.
- **RF-17-03 (Estatísticas Mestras Detalhadas):** O explorador DEVE exibir os lances candidatos com frequências absolutas e percentuais de vitória Brancas / Empates / Pretas em barras coloridas proporcionais.
- **RF-17-04 (Treinador de Repertório Espaçado):** O sistema DEVE fornecer motor de treino com avanço automático na linha esperada e penalização em lances incorretos conforme algoritmo SM-2.
- **RF-17-05 (Importação e Exportação de Repertório):** O sistema DEVE exportar e importar repertórios do usuário em formato JSON/PGN preservando notas e histórico de repetição.
- **RF-17-06 (Interface Acessível e Responsiva):** O componente visual DEVE suportar navegação por teclado, leitor de tela (ARIA) e adaptação de 360px a 1440px.

### 5.2 Requisitos Não-Funcionais (RNF)
- **RNF-17-01 (Orçamento de Memória):** A base canônica de aberturas e o índice em memória NÃO DEVEM exceder $5\text{ MB}$ de heap RAM.
- **RNF-17-02 (Latência de Consulta):** As consultas ao explorador e classificador ECO DEVEM executar em menos de $1.0\text{ ms}$ em 99% das chamadas ($p99 < 1.0\text{ ms}$).

---

## 6. CRITÉRIOS DE ACEITE E TESTES
1. **ECO Classification Accuracy:** Teste com as 25 aberturas clássicas mais jogadas (Ruy Lopez, Najdorf, Defesa Francesa, Caro-Kann, Gambito da Dama, Defesa Índia do Rei, etc.) comprovando 100% de classificação correta de código ECO e nomenclatura.
2. **Transposition Invariance:** Teste comprova que a mesma posição alcançada via 1. d4 Cf6 2. c4 e6 e 1. c4 e6 2. d4 Cf6 retorna o mesmo código ECO e nó estatístico.
3. **Spaced Repetition Progression:** Teste valida avanço de caixa (box 1 para 2) em resposta correta e reset (box 2 para 1) em lance incorreto com recálculo do fator de facilidade (Ease Factor).
4. **UI Accessibility & Mobile:** Teste no JSDOM/Vitest valida renderização acessível com barras de percentual (`role="progressbar"`) e botões de ação (`role="button"`).

