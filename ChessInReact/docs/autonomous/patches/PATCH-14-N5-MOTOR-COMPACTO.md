# PATCH-14 — Nível 5 com motor compacto (xadrez normal e Spell Chess)

**Data:** 27/11/2026 · **Estado:** commit e push autorizados pelo usuário em 27/11/2026; sem merge ou deploy · **Força em Elo:** não medida

O mesmo commit inclui o trabalho do [PATCH-13](PATCH-13-SPELL-CHESS-MATERIAL-SAFETY.md) e a parte do PATCH-14 iniciada antes, que ainda não tinham commit. As notas "sem commit" desses registros são históricas.

## Causa raiz

O nível 5 perdia para jogadores de cerca de 1000 de rating porque quase não calculava.

**Xadrez normal (motor antigo, medido):**

- Cerca de 1 a 5 mil posições por segundo. No meio-jogo completava profundidade 2.
- A busca não simulava promoção.
- A avaliação não tinha segurança do rei (rei valia 0 em qualquer casa).
- Dama e torre ganhavam bônus por ficar perto de a1.
- Mate na folha da busca não era detectado.
- A busca rodava na thread principal.

**Spell Chess:** na posição da captura de tela (2,5 s), o diagnóstico gravado mostrava profundidade 0, com 1 candidato pesquisado. Em partida, a profundidade média do motor antigo foi 0,4.

Nos dois casos, cada lance simulado clonava objetos do estado do jogo.

## O que mudou

Novo núcleo em `src/workers/ai/fast/`:

| Arquivo | Conteúdo |
|---|---|
| `FastPosition.ts` | Tabuleiro em arrays tipados, fazer/desfazer lance, hash incremental, regras de Freeze e Jump |
| `FastSearch.ts` | Aprofundamento iterativo, PVS, tabela de transposição, lance nulo (só xadrez normal), reduções, SEE, quiescência |
| `FastEvaluation.ts` | Material e posição (tabelas PeSTO), mobilidade, segurança do rei, estrutura de peões, ameaças, reserva de feitiços |
| `spellTurns.ts` | Seleção dos turnos com feitiço a pesquisar |
| `domainBridge.ts` | Conversão entre o estado do jogo e o núcleo |
| `classicEngine.ts`, `spellEngine.ts` | Ligação com os contratos existentes e a auditoria estratégica |

Integração:

- O N5 do xadrez normal usa o motor novo por `AIEngine` e roda em `ClassicDecisionWorker`.
- O N5 do Spell Chess oficial e personalizado, e o fallback de emergência, usam `spellEngine`.
- O fallback do xadrez normal N5 agora pesquisa, em vez de pegar a primeira captura.

### Economia de feitiços

Não há proibição por número do lance.

- Cada carga e a disponibilidade do feitiço têm valor na avaliação. A última carga vale mais.
- A busca calcula primeiro o melhor resultado **sem** feitiço. Um turno com feitiço precisa superá-lo por uma margem (35 centipawns), além da reserva gasta.
- A avaliação estática ignora efeitos temporários. Uma peça congelada não dá vantagem duradoura.
- Depois do próprio feitiço, a busca joga a resposta do adversário antes de avaliar.
- A primeira resposta do adversário tem a mesma amplitude de feitiços que as jogadas do bot.
- Antes de concluir uma derrota forçada, a busca tenta os feitiços defensivos restantes.
- A profundidade mínima garantida é 3, mesmo em máquina lenta. É a primeira em que a resposta do adversário tem a amplitude completa. Com 2, um feitiço refutável ainda podia ser escolhido.

## A posição da captura de tela

A análise usa a reconstrução hipotética do patch (`1.e3 Cc6 2.Bb5`, pretas jogam, todos os feitiços disponíveis). O histórico real da partida não foi registrado.

A premissa de que `bxc6` neutraliza o bispo **não vale no Spell Chess**:

1. `Freeze(c7)` congela b7 e d7. Depois de `Bxc6`, as pretas não têm recaptura nesse turno. Confirmado pelo motor de regras do jogo.
2. Se o cavalo sai de c6, `Jump(d7)+Bxe8` captura o rei. Confirmado pelo motor de regras do jogo.
3. **`Freeze(a4)+Cf6` perde à força.** Depois de `Dh5`, em todas as respostas legais das pretas, incluindo todos os feitiços, as brancas capturam o rei em até 2 lances. A verificação percorreu todas as respostas pretas (2.988 nós de defesa na execução final), usando o núcleo conferido contra as regras. O verificador está em `patch14-evidence/engine-forced-loss-prover.ts.txt`.

Linha principal, reproduzida com o motor de regras do jogo: `1... Freeze(a4)+Cf6 2.Dh5 Jump(h7)+Txh5 3.Freeze(c7)+Bxc6 Txh2 4.Jump(d7)+Bxe8`.

O gasto precoce do Freeze deixa as pretas sem contra-Freeze quando o golpe em c6 chega. O N5 novo não escolhe esse lance. Entre as alternativas quietas (por exemplo `e5` e `e6`), a preferência **não é conclusiva**: as notas ainda variam com a profundidade.

## Bugs de regra corrigidos

1. **Peão preto atacava para trás no 8×8** (`CheckValidator`). Bloqueava lances legais das brancas. A casa extra agora vale só em tabuleiros maiores.
2. **Peão capturava a si mesmo** (`RulesEngine`, `MovePieceCommand`). Um salto reto com Jump até a casa de en passant marcava o próprio peão como capturado.

## Evidências

| Verificação | Resultado |
|---|---|
| Perft em 5 posições de referência | Contagens idênticas |
| Comparação diferencial com as regras do jogo (partidas aleatórias, normal e Spell Chess nos 2 modos) | Lances legais, estado e hash idênticos nas posições testadas |
| Suíte completa | 1.585 de 1.586 na execução conjunta. A falha foi um limite de latência sob carga; o arquivo `Perft.test.ts` passou isolado (8/8) |
| ESLint do projeto e build de produção | Aprovados |
| Chrome real, xadrez normal | Profundidade 10–11, sem fallback, sem erros no console; maior pausa de tela 420 ms (primeiro lance) |
| Chrome real, regressão Spell Chess 2D e 3D | Aprovada, profundidade 8 |
| Partidas no xadrez normal: novo (0,5 s) contra antigo (2,5 s) | **6 vitórias, 0 empates, 0 derrotas.** Profundidade média 8,2 contra 2,5 |
| Partidas Spell Chess, versão intermediária (2,5 s cada) | **6–0–0.** Profundidade média 7,3 contra 0,4 |
| Partidas Spell Chess, código final | **2–0 em partidas concluídas.** A série de 8 caiu na terceira por falta de memória |

A série intermediária é anterior às três últimas correções da busca do Spell Chess (verificação de derrota forçada, contra-Freeze de retenção e primeira resposta ampla). Essas correções não alteram o caminho do xadrez normal.

Ajuste em teste existente: uma asserção exigia `profile.simulationCalls`, medição do pipeline antigo. Agora exige profundidade mínima 2 e busca real além da raiz.

### Falta de memória na série final

A partida foi repetida com registro por lance e interrompida a pedido do usuário.

- Motor antigo: até **1.540 MB** de aumento em um lance e até **208 s** por lance, com limite de 2,5 s.
- Motor novo: no máximo 13 MB de aumento por lance e 2,5 s.
- Motor novo sozinho: 200 buscas, pico de heap de 47 MB, sem tendência de crescimento.

Isso aponta o motor antigo como origem. A queda original não foi capturada com o registro, então a atribuição vem da repetição. O motor antigo não decide mais lances em produção. Uma causa provável, não confirmada no código em execução, é a inspeção material sem interrupção quando nenhum candidato seguro foi encontrado.

## Limites

- **Elo não medido.** Vencer o motor antigo não define a força contra pessoas.
- A busca do Spell Chess é **seletiva** depois da primeira resposta. Pode deixar de ver combinações profundas.
- Os níveis 1–4 continuam no motor antigo. A análise pós-partida (`analyzeGame`) também.
- Não há livro de aberturas. O bot pode repetir linhas.
- O N5 usa 2,5 s por lance sem olhar o relógio. Em partidas muito curtas (bullet) pode perder no tempo.
- As tabelas PeSTO foram escritas de memória e não conferidas com a fonte. Os pesos da avaliação não foram calibrados.
- Do PATCH-14 original, não foram feitos: consulta às referências externas, comparação com o N4, benchmark com amostra estatística e auditoria independente por outro revisor.
- Na auditoria, `threatsCreated` fica `null`, e o `profile` de tempos por etapa não é mais produzido.

## Pendência de limpeza

A busca antiga do Spell Chess (`SpellChessSearch` e avaliador, tabela, segurança material e auditoria associados) não decide mais lances. Continuam em uso `SpellChessSearch.resources()` e `SpellChessMoveGenerator` (desbloqueio no controller).

Parte dos testes aprovados cobre **somente o código antigo**, por exemplo `SpellChessN5StrategicAdversarial.test.ts`. Eles não comprovam nada sobre o motor novo. Os testes do motor novo estão em `src/workers/ai/fast/__tests__/` e nos testes que passam por `SpellOptimizationStrategy`.

Os módulos não foram apagados porque contêm trabalho anterior ainda sem commit.

## Verificações antes do push

A suíte com cobertura, como no CI, encontrou dois testes do motor novo com limites de profundidade dependentes da máquina. Os limites foram ajustados e o mínimo do Spell Chess subiu de 2 para 3. As partidas, os navegadores e a prova acima são **anteriores** a esse ajuste do mínimo.

| Verificação (Windows, local) | Resultado |
|---|---|
| ESLint e build, após o ajuste | Aprovados |
| `vitest run --coverage`, após o ajuste | 1.584 de 1.586 na execução conjunta. As duas falhas foram um limite de latência (`Perft.test.ts`) e um timeout de 5 s no bot de nível 3 (`BotMatchStrictModeIntegration`). O processo terminou com falha nativa do Windows (0xC0000005) depois do resumo |
| Os dois arquivos acima, isolados e com cobertura | 16 de 16, saída 0 |
| Worker no Chromium e 11 fluxos de aceitação (antes do ajuste) | Aprovados. A aceitação rodou numa cópia temporária que não grava em `reports/` nem fora do projeto |

O CI do commit anterior (`95b88c1`) passou. O resultado do CI deste commit só existe depois do push.

`scripts/runAcceptanceVerification.mjs` sobrescreve capturas versionadas e grava num caminho fixo fora do projeto. Isso não foi alterado neste patch.

Nas evidências anteriores, caminhos temporários com o nome da conta local foram trocados por `<TEMP>`.

## Reproduzir

```powershell
npx vitest run src/workers/ai/fast
npm run lint
npm run build
```

No Windows, execute a partir de um caminho com a letra do drive maiúscula (`C:\...`). Com `c:`, o Vitest informa "No test suite found".
