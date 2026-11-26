# PATCH-12 — Busca composta e segurança tática do rei no Spell Chess

Data: 26/11/2026. Base auditada: `474377d`. Implementação, documentação e evidências incluídas no commit do PATCH-12. Commit e push autorizados pelo usuário em 26/11/2026; sem deploy nesta etapa.

## O que foi confirmado

O caminho ativo do N5 em `SpellOptimizationStrategy` utilizava `decideWithSearch`, seguido de heurísticas. `SpellChessSearch` não comandava a decisão. Sua simulação continha deslocamento manual após rejeição de um comando, não avançava adequadamente os efeitos e excluía novos feitiços da quiescência. `AIWorkerPool` ocultava exceções e preferia uma captura como fallback.

Esses defeitos foram confirmados no código. **A causa específica da escolha histórica de `5...Kxf7` não foi determinada**: recebemos a sequência SAN, mas não os eventos e snapshots dessa sessão. Na fixture mínima sem o histórico mágico, a estratégia anterior também pode evitar `Kxf7`; isso impede atribuir o lance original a uma exceção ou a um feitiço específico sem evidência.

O histórico fornecido foi preservado:

```text
1. e3 Nc6 2. Bb5 g6 3. Qf3 e6 4. Qxf7+ a5 5. Bc4 Kxf7 6. Bxf7
```

Há dois testes distintos: um força `Kxf7` e comprova a resposta legal `Jump(e6) + Bxf7`; o outro deixa o N5 escolher e verifica uma defesa concreta. Ambos usam movimentos produzidos pelo motor. No navegador, a posição controlada resultou em `Kd8`, com o rei preservado e sem captura imediata disponível ao adversário.

## Alterações implementadas

| Área | Comportamento |
| --- | --- |
| Estratégia ativa | N5 oficial e captura obrigatória usam `SpellChessSearch` como motor principal. Expanded RPG mantém a estratégia anterior. |
| Simulação | `OfficialSpellRules` é compartilhado pelo controlador, busca, validação das decisões e replay. Executa comandos reais; rejeições geram erro, nunca deslocamento manual. |
| Efeitos | Freeze acompanha as peças atingidas na conjuração; entradas posteriores na região não congelam automaticamente. Jump, cargas, cooldowns e expiração avançam pelo mesmo código do jogo. |
| Turnos | Uma ação é feitiço opcional + movimento obrigatório. A resposta adversária também é composta. Só um feitiço é permitido por turno. Reiniciar a partida limpa essa marca. |
| Segurança | Cada candidato aceito é simulado e inspecionado quanto a uma captura imediata do rei, incluindo Jump disponível. Candidatos não inspecionados por falta de tempo não são escolhidos. |
| Busca | Aprofundamento iterativo, Negamax/Alpha-Beta, janela compartilhada na raiz, quiescência com capturas mágicas e defesas, linha principal e profundidade efetivamente concluída. Timeout preserva o resultado concluído. |
| Pontuação | Peão 100, dama 900, captura terminal 100000. Freeze sobre um rei não recebe pontuação de vitória. Recursos têm custo e efeitos temporários têm valor limitado. |
| Transposições | Limites usam a janela original. A chave considera variante, efeitos/duração, recursos dos dois lados, direitos de movimento, en passant e histórico relevante para empates. Há teste com TT habilitada e desabilitada. |
| Repetição | Tabuleiros iguais com cargas, cooldowns ou efeitos diferentes têm chaves diferentes. O histórico registra o estado após a expiração dos efeitos, correspondente ao próximo turno real. |
| Notação | SAN é calculada depois da expiração dos efeitos. Um ataque que surge ao descongelar uma peça recebe `+` no lance correto, sem antecipar vitória. |
| Worker | O N5 roda em Dedicated Web Worker no navegador. O controlador mantém a proteção contra resultados obsoletos após Undo, reinício ou troca de partida. |
| Fallback | Exceções preservam nome/mensagem e são registradas. A resposta marca `fallbackUsed` e `failureReason`, com profundidade zero. A escolha de emergência em Spell Chess usa ações reais e inspeciona a resposta adversária. |

A auditoria das partidas também encontrou e corrigiu dois defeitos independentes de regras:

- Movimentos comuns do rei para as colunas c/g acionavam indevidamente o roque e podiam deslocar uma torre adversária. Agora o deslocamento da torre depende de `validation.isCastling`. Torre congelada não pode participar do roque.
- A geração permitia saltos de peão sobre um bloqueador marcado fora da casa inicial, mas a validação os rejeitava. Os caminhos agora concordam; um Jump não autoriza simplesmente avançar duas casas vazias fora da posição inicial.

O orçamento é verificado entre nós e ações. Geração inicial e inspeção mínima de segurança não são operações preemptivas. A telemetria registra o tempo real, inclusive quando ultrapassa o orçamento solicitado.

## Histórico, persistência e PGN

Cada conjuração registra jogador, alvo, turno e snapshots anteriores/posteriores, com as cargas, cooldowns, ocupação e efeitos. A conjuração é associada ao movimento subsequente. As decisões dos bots incluem candidatos, ganho material, resposta adversária, ameaça de captura do rei, profundidade, nós e indicação de fallback.

O histórico visual apresenta, por exemplo, `Jump(e6) + Bxf7`. O botão **Copiar PGN** usa o exportador autoritativo, com comentários que preservam a conjuração executada:

```pgn
{[%spell JUMP e6]} Bxf7
```

Parser e replay consomem esses comentários. Um PGN sem os eventos mágicos não recebe feitiços inventados. Undo/Redo restaura os registros associados.

O último histórico é salvo em `localStorage['chessinreact:last-spell-audit']`. Todos os movimentos e conjurações são preservados; os diagnósticos de candidatos persistidos são limitados a 128 por decisão. O diagnóstico completo da sessão atual está disponível por `window.__CHESS_APP__.getSpellAudit()`, e o PGN por `window.__CHESS_APP__.exportSpellPGN()`.

## Evidências e validação

### Ampliação de generalização tática

A evidência adicional está em [TACTICAL-EQUIVALENCE.md](patch12-evidence/TACTICAL-EQUIVALENCE.md) e nos [diagnósticos completos](patch12-evidence/tactical-equivalence.json). A estratégia N5 usada em produção é invocada em **126 fixtures determinísticas**: 112 casos combinam sete geometrias de bispo/torre/dama, oito estados de feitiços e ambas as cores; outros 14 exigem defesa com Freeze. Os bloqueadores incluem peões, cavalos, bispos, torres e damas, aliados e adversários.

Os estados abrangem Jump pronto, sem cargas, em cooldown, atacante ainda congelado, atacante descongelando antes da resposta, dois bloqueadores, Jump já ativo sem cargas e Jump expirando antes da resposta. Os efeitos ativos são preparados por conjurações e transições reais: o estado com duração 2 preserva a marca de feitiço já conjurado; o estado com duração 1 resulta de um turno efetivamente executado, com o cooldown correspondente. A classificação é conferida por enumeração de todas as respostas compostas geradas, independentemente da varredura seletiva de raios de `findKingCapture`. As capturas vencedoras são efetivamente executadas pelo motor compartilhado.

Nos 14 casos defensivos, os próprios comandos preparam o congelamento do rei e do bloqueador. Todas as ações sem Freeze permitem captura imediata, e o N5 encontra uma defesa com Freeze. Um empate legal sem ações disponíveis pode ser o resultado dessa defesa; ele é registrado como empate, preservando o rei, sem atribuir vitória por captura.

Na posição crítica controlada, o diagnóstico mostra **`Kxf7 → Jump(e6) + Bxf7 → rei preto capturado`**, ganho de dama de 900 cp e pontuação de **−99998 cp**. A alternativa escolhida é **`Kd8`**, sem captura imediata disponível ao adversário após sua execução. A linha principal calculada, inclusive as continuações posteriores, está registrada no arquivo de evidência. A partida de entrada permanece em andamento durante a análise.

Essa ampliação adiciona fixtures, testes e um gerador de relatório. Não adiciona regras por coordenada nem altera heurísticas para favorecer os novos casos. Para repetir: `npm run evidence:spell` e `npx vitest run src/workers/ai/strategies/__tests__/SpellChessN5TacticalEquivalence.test.ts`.

Última execução completa antes dessa ampliação: **1329 testes em 169 arquivos, zero falhas e saída 0**, build com TypeScript, ESLint, onze fluxos de aceitação geral e regressão Spell Chess em 2D/3D. A ampliação acrescenta **126 casos aprovados**, executados junto de 16 regressões anteriores: **142 testes direcionados aprovados**, além de TypeScript e ESLint. Após o ajuste final de SAN, 24 testes de controlador, histórico e Undo/Redo foram repetidos com sucesso. As 963 ações registradas nas doze partidas do benchmark foram reproduzidas pelo motor atual, com legalidade e resultados terminais correspondentes.

- [Benchmark completo e ações executadas](patch12-evidence/benchmark.json).
- [Verificação independente do replay das partidas](patch12-evidence/benchmark-replay.json).
- [Resultados do navegador, candidatos e snapshots](patch12-evidence/browser.json).
- [Resumo dos gates locais](patch12-evidence/validation.json).
- Screenshots: [2D antes](patch12-evidence/2d-before.png), [2D após defesa](patch12-evidence/2d-after.png), [3D antes](patch12-evidence/3d-before.png), [3D após defesa](patch12-evidence/3d-after.png).
- Captura efetivamente executada: [2D](patch12-evidence/2d-executed-capture.png), [3D](patch12-evidence/3d-executed-capture.png).

`SpellChessN5KingSafetyRegression` cobre Jump pronto/ausente/em cooldown, bispo congelado, dois bloqueadores, efeitos já ativos, captura de dama segura e envenenada, Freeze defensivo, captura do atacante, fuga do rei, expiração, liberação de cooldown, ambas as cores, execução da ação e falha injetada na estratégia.

`SpellChessTurnParity` compara controlador e simulador em cada um dos onze meios-lances. Para tornar essa reprodução executável foi definida uma **cronologia sintética**, explicitamente distinta da sessão original: Freeze das pretas em f7 antes de `4...a5`, e Jump das brancas em e6 antes de `6.Bxf7`. Os registros exportados e o replay reproduzem essa cronologia escolhida. Ela não é apresentada como descoberta dos feitiços históricos do usuário.

`SpellChessSpecialMoveParity` cobre roque real, movimento comum do rei nas colunas c/g, torre congelada, salto de peão, en passant, subpromoção, transposições e repetição com efeitos mágicos.

Os sete erros do [CI da base auditada](https://github.com/PauloSoaf/ChessInReact/actions/runs/45866560583) foram investigados: seis expectativas de interface estavam desatualizadas e o teste do controlador presumiu conjuração na primeira jogada. Este último foi substituído por uma posição que exige Jump para capturar o rei, usando a rota real do N5. Os asserts de interface continuam verificando ações e estados, com os textos atuais.

O navegador verifica o Worker, a resposta da interface durante o cálculo, a defesa do rei e o fluxo de captura executada em 2D e 3D. A aceitação geral também exercita os onze fluxos existentes, incluindo raycasting e alternância 2D/3D.

## Como repetir

```powershell
npm run build
npm run lint
npx vitest run --pool=forks --maxWorkers=4 --minWorkers=1
npm run acceptance
npm run acceptance:spell
npm run bench:spell
```

O pool `forks` foi usado na validação completa no Windows. Uma execução anterior com threads relatou testes aprovados e apresentou saída nativa `0xC0000005` após o relatório; esse resultado isolado não foi tratado como gate aprovado.

O benchmark usa a estratégia de `474377d`, carregada por `git show`, sob as mesmas regras corrigidas da estratégia atual, com cores alternadas e aberturas e3/d3. O orçamento padrão é **250 ms por decisão**, inferior aos 2500 ms configurados para N5 no controlador. Limite padrão: 200 meios-lances. Propostas rejeitadas da estratégia anterior recebem a salvaguarda legal e são contabilizadas separadamente; não são executadas como movimentos ilegais. A profundidade nominal da estratégia antiga é identificada como `reportedDepth`, sem apresentá-la como profundidade comprovada.

Variáveis disponíveis: `SPELL_BASELINE_REF`, `SPELL_BENCH_BUDGET_MS`, `SPELL_BENCH_MAX_PLIES` e `SPELL_BENCH_RESUME=1` para continuar uma amostra salva. Partidas interrompidas pelo limite são classificadas como incompletas, nunca como empates.

## Limites da conclusão

Na rodada final de 24 posições, a estratégia nova registrou **zero ações ilegais e zero permissões de captura imediata do rei**, enquanto a anterior registrou duas de cada. As duas capturas imediatas disponíveis no corpus foram encontradas por ambas.

As doze partidas chegaram a resultados terminais, com cores alternadas e aberturas e3/d3, sob orçamento de 250 ms:

| Adversário | Vitórias do novo N5 | Derrotas | Empates |
| --- | ---: | ---: | ---: |
| Estratégia N5 anterior | 1 | 0 | 3 |
| N4 anterior com salvaguarda legal | 1 | 1 | 2 |
| N3 anterior com salvaguarda legal | 2 | 0 | 2 |

Foram 481 turnos do novo N5, 43 feitiços, zero fallbacks nessa rota e zero movimentos ilegais executados nas partidas. Houve cinco propostas rejeitadas dos adversários, resolvidas pela salvaguarda e registradas como tal. O novo N5 terminou uma vez permitindo captura imediata quando todas as ações inspecionadas eram perdedoras; nenhum candidato seguro foi descartado para escolher essa ação. O benchmark não classifica essa posição já perdida como uma defesa disponível desperdiçada.

A profundidade média concluída foi **0,79** no orçamento reduzido de 250 ms; zero indica seleção após a inspeção de segurança, sem uma iteração completa de toda a raiz. O tempo médio foi 247,82 ms e foram contados 224096 nós. Esses valores mostram o custo do branching factor, sem apresentar um N5 nominal como uma busca de cinco turnos. Na fixture menor de navegador, com o orçamento real do controlador, a busca concluiu profundidade 4 e a interface continuou respondendo durante o Worker.

A proteção contra a combinação imediata foi demonstrada com execução real, testes e navegador. A sessão histórica continua sem eventos mágicos suficientes para atribuir a escolha original de `Kxf7` a uma causa única.

Os resultados de partidas e a profundidade média estão no benchmark. A amostra é pequena e usa orçamento reduzido; não comprova aumento de Elo nem superioridade consistente sobre o N5 anterior. A força global do N5 não está homologada. Expanded RPG e seus feitiços adicionais não foram migrados para a nova busca neste patch.

Os gates locais não substituem um novo resultado remoto do GitHub Actions. Com a autorização posterior para commit e push, o resultado remoto do novo commit deve ser consultado no GitHub Actions; este relatório registra as validações locais anteriores à publicação.
