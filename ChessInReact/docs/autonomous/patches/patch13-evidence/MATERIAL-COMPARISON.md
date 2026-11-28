# PATCH-13 — Comparação material com as 12 partidas do PATCH-12

Data: 27/11/2026. Foram reproduzidas 963 ações legais das 12 partidas arquivadas e recalculadas 481 decisões do N5 nos mesmos estados. Orçamento solicitado: 250 ms por decisão, abaixo dos 2.500 ms usados pelo controlador em produção.

**As novas decisões são contrafactuais, não partidas novas.** Os resultados terminais das partidas arquivadas foram conferidos; nenhum placar novo ou Elo é inferido.

| Métrica no modelo de trocas legais | PATCH-12 arquivado | PATCH-13 |
| --- | ---: | ---: |
| Decisões | 481 | 481 |
| Quedas de saldo material maiores que 200 cp | 112 | 21 |
| Captura do próprio rei disponível na linha | 1 | 1 |
| Jump seguido de queda grave de saldo | 17 | 0 |
| Dama capturada na continuação de troca escolhida | 16 | 0 |
| Dama capturada nessa linha sem compensação material | 16 | 0 |
| Dama sacrificada com compensação demonstrada nessa linha | 0 | 0 |
| Vitória imediata identificada | 4 | 4 |
| Profundidade global zero | 161 | 366 |
| Decisões novas sem inspeção material concluída | não registrado | 0 |
| Tempo médio medido (ms) | 247.82 | 306.55 |

Uma queda de saldo inclui capturas, trocas e promoções: não equivale automaticamente a um erro evitável. O modelo pesquisa a resposta capturante e recapturas locais, com limite de três capturas; não prova compensação em qualquer horizonte.

No arquivo histórico real, a dama foi perdida em 13 decisões dentro de uma resposta e em 16 dentro de duas respostas. Esses eventos observados são separados das previsões nas novas decisões.

## Primeira decisão de cada partida

Notação longa indica origem e destino; não é uma reconstrução de SAN completa.

| Partida | Ação antiga | Resposta realmente jogada | Resposta capturante calculada | Nova ação | Saldo antigo / novo (cp) | Profundidade nova |
| --- | --- | --- | --- | --- | ---: | ---: |
| 1 | Qd1-h5 | FREEZE(h5) + g7-g6 | JUMP(h7) + Rh8xh5 | Nb1-c3 | -400 / 0 | 0 |
| 2 | JUMP(d3) + Qd1xd7 | Bc8xd7 | Ke8xd7 | Nb1-c3 | -800 / 0 | 0 |
| 3 | JUMP(d7) + Qd8xd2 | FREEZE(d2) + Nb1xd2 | Ke1xd2 | Nb8-c6 | -800 / 0 | 0 |
| 4 | JUMP(d7) + Qd8xd3 | Qd1xd3 | c2xd3 | Nb8-c6 | -800 / 0 | 0 |
| 5 | Qd1-h5 | FREEZE(h5) + g7-g6 | JUMP(h7) + Rh8xh5 | Nb1-c3 | -400 / 0 | 0 |
| 6 | JUMP(d3) + Qd1xd7 | Bc8xd7 | Ke8xd7 | Nb1-c3 | -800 / 0 | 0 |
| 7 | JUMP(d7) + Qd8xd2 | FREEZE(d2) + Nb1xd2 | Ke1xd2 | Nb8-c6 | -800 / 0 | 0 |
| 8 | JUMP(d7) + Qd8xd3 | Qd1xd3 | c2xd3 | Nb8-c6 | -800 / 0 | 0 |
| 9 | Qd1-h5 | FREEZE(h5) + g7-g6 | JUMP(h7) + Rh8xh5 | Nb1-c3 | -400 / 0 | 0 |
| 10 | JUMP(d3) + Qd1xd7 | Nb8xd7 | Ke8xd7 | Nb1-c3 | -800 / 0 | 0 |
| 11 | JUMP(d7) + Qd8xd2 | FREEZE(d2) + Nb1xd2 | Ke1xd2 | Nb8-c6 | -800 / 0 | 0 |
| 12 | JUMP(d7) + Qd8xd3 | Qd1xd3 | c2xd3 | Nb8-c6 | -800 / 0 | 0 |

A resposta calculada pode diferir da histórica, inclusive por empate na avaliação material. As duas são apresentadas separadamente; os flags de captura ausentes no arquivo antigo foram derivados do replay, não presumidos como movimentos tranquilos.

## Auditoria das perdas restantes

Todos os candidatos legais foram enumerados nos 22 estados restantes com perda grave de saldo ou ameaça terminal. Alternativas que evitariam a perda grave: **0**. Defesas materiais melhores por mais de dois peões que a decisão escolhida: **0**.

Isso descreve esses estados históricos, alguns já perdidos: não prova que a perda original era inevitável vários lances antes. O caso sem qualquer ação segura para o rei fica separado. A análise das alternativas usa o mesmo módulo de troca e, portanto, valida a seleção dentro desse modelo; as regressões independentes validam capturas executadas e saldos esperados.

## Tempo e chave de transposição

Na microcomparação das partes caras da chave antiga, 481 estados × 10 repetições: antiga 195.45 ms; compacta 115.54 ms. Última chave: 40182 versus 36 caracteres. A chave antiga foi reconstruída pelo comparador; isso não mede aceleração integral da engine.

A inspeção obrigatória tem custo real e pode ultrapassar um orçamento muito curto para concluir o primeiro candidato. Profundidade global zero continua frequente; agora a ação escolhida passou pela inspeção material. A cobertura parcial é registrada, e essa distinção não homologa força geral de N5.

Dados: [decisão por decisão](material-benchmark.json), [auditoria das alternativas](material-loss-audit.json), [navegador real](browser.json) e [gates e hashes](validation.json).
