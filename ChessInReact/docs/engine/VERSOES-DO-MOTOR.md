# Versões preservadas do motor

## engine-n5-v1.0.0

- **O que é:** motor compacto do nível 5, para xadrez normal e Spell Chess (PATCH-14).
- **Tag Git anotada:** `engine-n5-v1.0.0`, enviada ao GitHub.
- **Commit:** `be8d0c843dc2fd6de87d28b88fda3137424fea38` (CI aprovado).
- **Força em Elo:** não medida. Evidências no [relatório do PATCH-14](../autonomous/patches/PATCH-14-N5-MOTOR-COMPACTO.md).
- **Identificação nos dados:** cada evento de partida salvo registra `engineVersion` ([engineVersion.ts](../../src/core/engineVersion.ts)).

Impressões digitais do núcleo (`git hash-object`):

| Arquivo em `src/workers/ai/fast/` | Hash |
|---|---|
| `FastPosition.ts` | `8eddce4ddb13cffb8cdd77f62f5cf627d3d8e230` |
| `FastSearch.ts` | `962875de14e85f043e252f8b8b187da72d3df663` |
| `FastEvaluation.ts` | `3977e88c85ce5d44e3b9586db168d74c0df17777` |
| `spellEngine.ts` | `3a5fff7c6658bc62871d889e5d980ece4a9dd2dc` |
| `spellTurns.ts` | `0cc90dbe6463396260f5bb58d36b6cf50320df72` |

## Conferir e recuperar

Os comandos rodam na pasta do projeto (`ChessInReact/ChessInReact`).

```powershell
# O motor atual difere da versão preservada? (sem saída = idêntico)
git diff engine-n5-v1.0.0 -- src/workers/ai/fast/*.ts

# Ver o projeto inteiro como estava nessa versão, sem alterar a sua branch
git worktree add ../motor-v1 engine-n5-v1.0.0

# Restaurar somente o motor (sobrescreve os arquivos locais dessa pasta)
git checkout engine-n5-v1.0.0 -- src/workers/ai/fast/
```

## Regra para novas versões

Nunca mover nem apagar uma tag publicada. Uma mudança no núcleo recebe nova tag (`engine-n5-v1.1.0`) e atualiza `ENGINE_VERSION`, depois de comparação com a versão anterior.
