# PATCH-10 — Vitória por captura executada no Spell Chess

Data: 26/11/2026. Base da alteração: `df109d6`.

## Comportamento disponível

No catálogo de minigames, selecionar **Spell Chess (Captura obrigatória)** e configurar os participantes. A variante usa o identificador `SPELL_CHESS_KING_CAPTURE_ONLY` e `winCondition: 'KING_CAPTURE_ONLY'`. Ela utiliza as cargas e os cooldowns do sistema de Freeze e Jump existente.

Nesse modo, xeque é uma ameaça e não obriga o jogador a salvar seu rei. Uma posição vencedora, um mate convencional ou uma captura forçada encontrada pela busca não encerram a partida. O jogador precisa selecionar e executar os feitiços e movimentos da combinação; pode escolher outro lance e desperdiçar a oportunidade.

A vitória por captura exige um rei efetivamente marcado como capturado. O detector retorna `KING_CAPTURE`, separado de `CHECKMATE`. Um rei ausente de uma configuração incompleta não comprova captura. O comando de movimento registra o resultado após a captura, e Undo/Redo restaura ou reaplica o rei e o vencedor.

Sem movimentos disponíveis, o detector verifica se um Jump disponível permite executar um movimento. Se nenhuma ação for possível, o resultado é empate. Material insuficiente para mate convencional não gera empate automático nesse modo, pois os reis podem ser capturados. Tempo, desistência e as demais políticas de empate continuam independentes.

`SPELL_CHESS_OFFICIAL` mantém a configuração `CHECKMATE_OR_KING_CAPTURE`. O modo personalizado tem nome, cartão e banner próprios na interface.

## Alterações técnicas

- `VariantRegistry` e os contratos de regras distinguem as condições de vitória. `RulesEngine` aplica a condição tanto na validação quanto na geração dos movimentos.
- `GameOverDetector` avalia o estado executado. O controlador consulta essa autoridade para resolver a ausência de movimentos em partidas de dois jogadores.
- `SANNotationGenerator` consulta o resultado do motor para acrescentar `#`. No modo personalizado, xeque real pode receber `+`, sem indicar vitória por mate.
- `CheckValidator` mantém peças congeladas como bloqueadores físicos das linhas de ataque. Somente `canBeJumpedOver` permite atravessar o bloqueador.
- O gerador de ações de Freeze usa movimentos calculados no estado simulado, removendo o filtro que rejeitava destinos apenas por estarem na região visual congelada.
- A chave da tabela de transposições inclui o identificador da variante, separando os modos de vitória.

## Regressão da partida informada

```text
1. e3 Nc6 2. Bb5 g6 3. Qf3 e6 4. Qe4 Qe7 5. Bxc6
```

O teste de integração usa controlador, comandos e store reais, com e sem Freeze centrado em d7 antes de `Bxc6`. Confirma ambos os reis vivos, turno das pretas, partida em andamento e SAN `Bxc6`, sem `+`. O peão de b7 fica fora dessa área de Freeze e pode executar `bxc6`: a ameaça de Jump + `Bxe8` não demonstra vitória inevitável nessa reprodução.

Outra posição pequena comprova que a busca encontra Jump em d7 + `Bxe8`, sem modificar o estado vivo. Aplicar somente Jump mantém a partida em andamento. Executar a captura atribui a vitória; Undo/Redo restaura e reaplica o resultado. Há também regressões para oportunidade desperdiçada, mate convencional, bloqueadores congelados, configuração incompleta e empate sem ações.

## Validação e limites

- `npm run build`: aprovado, com aviso de tamanho de bundle do Vite.
- `npx tsc --noEmit`: aprovado.
- ESLint dos arquivos de implementação alterados e das novas regressões: aprovado.
- Cinco suítes direcionadas de regras, controlador, Undo/Redo e defesa contra Jump: 32 testes aprovados.
- Suítes de catálogo e regras visuais: 14 testes aprovados após adicionar a seleção do modo personalizado.
- Suíte completa: 1287 aprovados e 8 falhas naquela execução. Sete falhas foram reproduzidas em uma cópia do HEAD original `df109d6`: uma expectativa de consumo de feitiço pelo bot e seis expectativas de interface. A oitava falha foi o limite de latência de Perft; os testes selecionados de profundidade 1 passaram isoladamente.

Não houve homologação manual da partida em 2D/3D. A auditoria completa do modo oficial, melhorias gerais de busca, migração para WebAssembly e benchmarks de força do N5 descritos nos anexos permanecem fora do escopo desta alteração. Os testes não demonstram aumento de Elo nem homologam todo o PATCH-10/PATCH-11 dos anexos.
