# PATCH-15, 16, 16A e 17 — jogar de pretas, replay e salvamento

**Data:** 27/11/2026 · **Base:** `be8d0c8` · **Estado:** commit e push autorizados pelo usuário em 28/11/2026; sem merge ou deploy
**Motor N5:** inalterado. Os cinco arquivos do núcleo têm o mesmo hash da tag [`engine-n5-v1.0.0`](../../engine/VERSOES-DO-MOTOR.md).

## PATCH-15: jogar de pretas

**Causas:** o tabuleiro recebia `botPlayer="P2"` fixo e bloqueava o turno de P2; o 2D lia a orientação da preferência global; painéis, feitiços, desistência, dificuldade, desfazer, refazer, rótulos e revisão presumiam humano em P1.

**Correção:** os papéis saem de `config.slots` ([participants.ts](../../../src/matchmaking/config/participants.ts)).

- Só interage um humano local, na própria vez. Vale também para arenas de 3 a 12 jogadores.
- O único humano de pretas começa com as pretas embaixo. Inverter muda apenas a visão, e a escolha vale só para a partida atual.
- Painéis, relógios, capturas e baralho de feitiços acompanham o jogador.
- Escolha **Brancas, Pretas ou Aleatória** no Hub e na sala pré-jogo. O sorteio ocorre no início.
- O controller recusa feitiço humano no turno do bot.
- Contra o bot, desfazer e refazer param na vez do humano.

## PATCH-16 e 16A: histórico e replay

- Cada lance branco ou preto é um botão, identificado pelo meio-lance.
- Linha do tempo única: cada ação confirmada grava a **diferença de estado** ([timeline](../../../src/core/timeline/)). O replay não reinterpreta a notação nem executa o motor.
- O tabuleiro desenha um estado separado. O store, a partida e o histórico não mudam.
- Animação do lance e da captura no 2D; deslizamento no 3D. O feitiço aparece antes do lance. Respeita movimento reduzido.
- Barra de navegação, velocidade e teclado (setas, Home, End, espaço, Esc).
- **Partida encerrada fica travada** no controller. Agendador, decisões atrasadas, feitiços, desfazer e refazer são recusados.

### Decisões a conferir

1. **Mudança de comportamento:** depois do fim, não há mais desfazer, nem em duelo local. Um teste antigo que desfazia a captura do rei passou a verificar o mesmo pelo replay.
2. **Replay com a partida em andamento:** o prompt se contradiz. Foi adotado: a IA fica retida; se a vez for dela, o relógio dela para; se a vez for sua, seu relógio continua.

## PATCH-17: salvamento e recuperação

**Funciona, somente neste dispositivo:**

- Identidade de convidado automática e estável. Ela não autentica nada perante um servidor.
- Gravação em IndexedDB a cada ação confirmada, inclusive entre o feitiço e o lance obrigatório. Relógios a cada 3 s.
- Eventos em ordem e sem duplicação. Falhas são repetidas com espera crescente.
- Histórico divergente ou aberto em outra aba **não é sobrescrito**.
- Na abertura, a partida é recuperada **antes** de qualquer tabuleiro novo. A integridade é conferida; dados danificados são informados e preservados.
- "Minhas partidas": continuar, replay, revisão, PGN, backup, importar e excluir com confirmação.

**Bloqueado por falta de servidor** (não há variáveis de ambiente nem banco configurado):

- Backup em nuvem, Supabase Auth, fila de sincronização, conversão de convidado em conta e testes reais de autorização.
- Nada é exibido como salvo na nuvem. Nenhuma dependência de Supabase ou Prisma foi instalada.

**Preparado, mas nunca executado em banco real:**

- Evolução do [schema.prisma](../../../prisma/schema.prisma) e [migração SQL](../../../prisma/migrations/20261127000000_match_persistence/migration.sql).
- A política que liberava a leitura de **todas** as partidas (`USING (true)`) agora é privada por padrão. Compartilhamento por link ainda exige uma função de servidor.

## Verificações

| Verificação (Windows, local) | Resultado |
|---|---|
| Suíte completa, código final | **1.606 de 1.606** |
| Com cobertura (como no CI) | 1.602 de 1.606 sob carga: latência do `Perft`, timeout do bot N3 e duas buscas limitadas por tempo. Um orçamento de teste foi ajustado; esses arquivos e os novos passaram isolados com cobertura (**53 de 53**) |
| ESLint, tipos e build | Aprovados |
| Worker no Chromium, 11 fluxos de aceitação, Spell Chess 2D e 3D | Aprovados. A aceitação rodou numa cópia que não grava em `reports/` nem fora do projeto |
| Jornada nova em Chrome real (`npm run acceptance:journey`) | **15 de 15**, sem erros no console |

A jornada cobre: N5 de brancas e humano de pretas, inversão, desfazer e refazer, recarga, reinício do navegador, lance por raycast no 3D, replay ao vivo e encerrado sem novas buscas, Revisão de Partida, Freeze das pretas com recarga no meio do turno, IA contra IA e "Minhas partidas".

O resultado do CI deste commit só existe depois do push. Há testes dependentes de tempo que podem oscilar em máquinas mais lentas.

Antes do commit, os 284 imports relativos dos 39 arquivos de código alterados foram conferidos com diferença de maiúsculas, como no Linux do CI. Todos conferem.

### Observação sobre o 3D

No Chrome **headless reaberto com o mesmo perfil**, ligar o 3D trava a página em código nativo de GPU, mesmo em partida nova e sem restauração. Por isso a jornada faz o 3D antes do reinício. Numa partida restaurada por recarga, o 3D funcionou. Não foi verificado num Chrome com janela.

## Limites

- **Depois de recarregar, desfazer não alcança lances anteriores à recarga.** O replay alcança todos.
- A recarga volta ao jogo ao vivo; o lance que estava selecionado no replay não é salvo.
- Sem teste específico: Jump das pretas no navegador, captura por clique no 3D, animação própria de promoção, replay e recuperação de Duck, Crazyhouse, variantes geométricas e arenas, queda de rede e conflito entre duas abas reais (há teste com bloqueio simulado).
- A sequência dos lances 70 a 76 citada no prompt não foi reproduzida: o registro daquela partida não está disponível.
- O PGN exportado não representa todas as variantes. Use o backup JSON para fidelidade completa.
- Partidas anteriores não são migradas. O diagnóstico antigo em `localStorage` continua sendo gravado e não foi apagado.
- Não houve auditoria por um revisor independente.
