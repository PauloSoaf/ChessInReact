# PATCH-13 — Segurança material do N5 no Spell Chess

Data: 27/11/2026. Base auditada: `95b88c1`. Implementação e evidências locais; sem commit, push ou deploy nesta etapa.

## Diagnóstico confirmado

A proteção obrigatória do PATCH-12 inspecionava a captura imediata do rei, mas pontuava os outros candidatos antes de pesquisar sistematicamente as capturas materiais do adversário. O resultado podia favorecer uma captura de peão com a dama via Jump, especialmente quando nenhuma iteração profunda terminava. CI verde e ausência de captura imediata do rei não homologam a força do bot.

Os registros anteriores são preservados em `patch12-evidence/`. Não se inventou uma cronologia de feitiços para a partida do usuário: os testes novos usam estados determinísticos e as partidas do benchmark possuem ações compostas registradas.

## Implementação

`SpellChessMaterialSafety` inspeciona capturas legais do adversário, incluindo Freeze e Jump, e trocas locais com até três capturas sucessivas. Cada captura é executada pela mesma transição usada no jogo real. As recapturas no destino da troca são opcionais, a expiração dos efeitos acontece antes da resposta seguinte, e a captura executável do rei prevalece sobre o material. Isso permite distinguir dama por peão, troca de damas com recaptura e sacrifício com continuação terminal demonstrada. Não é um mapa geométrico de ataques nem uma prova de compensação estratégica ilimitada.

Na raiz, somente candidatos com inspeção material concluída podem ser escolhidos. Um candidato interrompido fica identificado e excluído. A inspeção mínima precisa terminar mesmo sob orçamento muito curto. O prazo só interrompe a fase obrigatória quando já há uma alternativa inspecionada sem perda material grave; se nenhuma existir, a raiz é esgotada. Isso pode exceder o orçamento solicitado, com tempo real e timeout registrados. Havendo alternativa sem perda grave inspecionada, a fase inicial reserva tempo para a busca mais profunda. Na falta dela, a busca continua procurando uma defesa, sem converter uma alternativa conhecida como perdedora em escolha segura apenas porque o tempo acabou. A prioridade terminal do rei permanece preservada.

A geração é progressiva: capturas e dois candidatos normais aparecem primeiro; defesas da peça ameaçada e Freezes contra seus atacantes recebem prioridade, seguidos das capturas com Jump. Movimentos normais restantes e preparações mágicas continuam disponíveis nas camadas seguintes. A atividade de peças e o desenvolvimento de peças menores ordenam lances tranquilos, sem proibir a dama. Uma vitória imediata é procurada antes dessa ordenação; uma posição sem defesa real inspecionada não é tratada como segura. Todas as camadas continuam disponíveis, inclusive Freezes com centros deslocados. A ordenação considera todos os atacantes diretos e com Jump, para priorizar um Freeze que neutralize várias ameaças simultaneamente. Capturas são ordenadas considerando também o valor do atacante. O custo das cargas de Jump e Freeze continua na avaliação, sem frequência mínima de uso nem regra especial para casas de abertura.

A quiescência inclui capturas com Freeze/Jump, recapturas e movimentos defensivos não capturantes quando uma torre ou dama está ameaçada. A sondagem de ameaça considera o próximo vencimento dos efeitos, sem executar nem adjudicar um lance nulo. No limite da extensão, uma troca material forçante pode corrigir a avaliação estática; o limite permanece explícito.

Os diagnósticos acrescentam `materialSafetyChecked`, `materialBalanceAfterRepliesCp`, `materialLossCp`, `tacticalReplyCount` e `tacticalVariation`. `materialInspectionCompleted` indica a inspeção do candidato escolhido; `exchangePlyLimit` é o limite máximo da troca local, não uma profundidade global completada. `rootFullyEnumerated` distingue cobertura parcial e completa da raiz. Profundidade global zero continua sendo reportada quando nenhuma iteração global termina, mesmo com a inspeção tática concluída.

A tabela de transposições usa chave compacta determinística com dois acumuladores de 32 bits. Posição e contexto de adjudicação são separados: identidades das peças e direitos de movimento, lado, variante, en passant, recursos, flags e durações de magia permanecem na posição; contador de cinquenta lances e contagens do histórico de repetição permanecem no contexto. A ordem de ocorrências equivalentes do histórico não diferencia posições desnecessariamente. Hashes de históricos são armazenados em caches limitados/WeakMap. Como qualquer hash finito, a chave admite colisão teórica; não foi apresentada como Zobrist nem como identidade sem colisões. O Worker por decisão ainda impede reaproveitamento entre turnos; a reutilização é dentro da busca.

O controlador passa um AbortSignal ao roteador. Undo, Redo, pausa, nova configuração e dispose cancelam o Worker; o sinal não é serializado. Cancelamento não produz fallback. Falhas reais continuam identificadas e o fallback utiliza a mesma inspeção material, com profundidade global zero explícita.

## Testes e evidências

**Gates finais:** 1.499 testes em 172 arquivos, zero falhas; build e ESLint aprovados; onze fluxos gerais de aceitação e navegador Spell Chess 2D/3D aprovados. São 39 casos materiais novos, quatro casos de cancelamento do controlador e um caso adicional de contexto da tabela. A comparação N5/N4 foi repetida após reforçar a exigência de saldo de troca pelo menos igual ao do N4.

**Comparativo contrafactual:** 963 ações históricas reproduzidas e 481 decisões recalculadas. Capturas de dama sem compensação na linha analisada: **16 → 0**; Jump seguido de perda grave: **17 → 0**. Quedas de saldo acima de 200 cp: **112 → 21**. Nos 21 estados materiais restantes e no estado de perda terminal, todas as alternativas legais foram auditadas: nenhuma evitava a perda grave no modelo utilizado. Não são partidas novas.

**Limitação medida:** profundidade global zero em **366/481** novas decisões, todas com inspeção material concluída. Tempo médio **306,55 ms** para orçamento solicitado de 250 ms, versus 247,82 ms no arquivo antigo. A microcomparação da chave mediu 195,45 ms versus 115,54 ms em 4.810 gerações, sem atribuir esse ganho ao tempo total da engine.

- Regressões materiais nas duas cores: capturadores bispo, cavalo, peão e dama; recaptura favorável; captura segura; compensação material; sacrifício com perda do rei adversário; Jump ofensivo ruim e escape por Jump; defesa e ataque com Freeze; expiração do gelo; cooldown; duas barreiras; orçamento de 1 ms; comparação N5/N4; exceção e cancelamento de Worker.
- Testes do controlador verificam cancelamento por Undo, Redo, reinício e descarte sem aplicar movimento ou conjuração.
- Testes da tabela verificam diferenças de recursos/durações, en passant, contador e contagens de repetição, equivalência de históricos reordenados e comparação com tabela desativada.
- Navegador real 2D/3D: rota `SPELL_COMPOSITE`, sem fallback, dois cenários de abertura, Jump vencedor e Freeze defensivo executados, igualdade entre ação calculada e tabuleiro real, timers da UI ativos e captura real do rei como condição terminal.

O comparador de estados do navegador normaliza apenas a ausência versus `false` dos flags visuais `isShielded` e `isInvisible`. A comparação preserva posições, tipos, identidades, capturas, ocupação e todo o estado oficial dos feitiços. As fixtures são carregadas após a configuração dos participantes para evitar que a preparação de UI substitua seu estado.

Os resultados finais, comandos, contagens e hashes estão em [validation.json](patch13-evidence/validation.json). O [comparativo material](patch13-evidence/MATERIAL-COMPARISON.md) apresenta as decisões e métricas; [material-benchmark.json](patch13-evidence/material-benchmark.json) contém os registros completos e [material-loss-audit.json](patch13-evidence/material-loss-audit.json) a auditoria das alternativas.

## Repetição dos experimentos

```powershell
npm run build
npm run lint
npx vitest run --pool=forks --maxWorkers=4 --minWorkers=1
npm run bench:spell:material
npm run audit:spell:material
$env:SPELL_EVIDENCE_DIR='docs/autonomous/patches/patch13-evidence'
$env:SPELL_MATERIAL_SCENARIOS='1'
npm run acceptance:spell
```

O benchmark reproduz todas as ações das 12 partidas antigas e pede uma nova decisão ao N5 nos mesmos estados em que o PATCH-12 jogou. As novas decisões são contrafactuais: não são partidas novas nem seus resultados podem ser usados como taxa de vitórias. As perdas históricas reais em uma e duas respostas são separadas da avaliação limitada das novas linhas. Promoções também alteram o saldo material e aparecem nas métricas de declínio; não são automaticamente classificadas como entrega de dama.

## Limites de homologação

A auditoria adversarial do próprio patch identificou uma versão intermediária que cortava a inspeção ao atingir o prazo mesmo sem uma alternativa materialmente segura. Ela ainda perdia uma dama previamente congelada, ameaçada simultaneamente por peão e torre com Jump. Essa versão foi rejeitada: retirou-se esse corte e acrescentaram-se prioridade para múltiplos atacantes e regressões nas duas cores.

A correção deve ser avaliada pela classe de perdas materiais evitáveis e pelas respostas legais calculadas, não apenas por vitórias agregadas. A profundidade global e a cobertura continuam limitadas pelo custo das combinações mágicas. Os experimentos não estabelecem Elo, superioridade geral sobre N4, ausência de erros além do horizonte ou força máxima homologada. Nenhuma regra da variante foi alterada para facilitar a busca.
