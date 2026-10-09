# ADR-001: Mutação Atômica de Entidades e Invariantes Bidirecionais de Índices

- **Status:** `ACCEPTED`
- **Date:** 2026-10-09
- **Deciders:** Principal Software Engineer, Staff TypeScript Architect

---

## Context
O `EntityManager` gerencia duas estruturas centrais: `entityById` (tabela de busca direta de entidades) e `occupancyByCoordinate` (índice espacial de ocupação). A implementação anterior fornecia o método genérico `updateEntity(id, updates: Partial<T>)`. Se um consumidor passasse `{ isCaptured: true }` ou alterasse `position` diretamente via `updateEntity`, a tabela `occupancyByCoordinate` não era sincronizada, resultando em peças capturadas continuando a ocupar coordenadas e desincronização silenciosa do motor de física/estado (AUDIT-01).

---

## Decision
1. Proibir explicitamente a alteração de propriedades estruturais (`id`, `type`, `isCaptured`) através de `updateEntity()`, lançando erro caso fornecidas.
2. Fornecer métodos explícitos, atômicos e especializados para mutações estruturais:
   - `moveEntity(id, targetCoord)`
   - `captureEntity(id)` (marca `isCaptured: true` e remove da ocupação espacial)
   - `restoreEntity(id, position)` (reverte captura garantindo que a coordenada esteja livre)
   - `replaceEntity(oldId, newEntity)` (para promoção atômica)
   - `updateEntityMetadata(id, properties)` (para mutação segura de metadados sem impacto espacial).
3. Adicionar o método de diagnóstico `validateInvariants()` para verificação formal em tempo de execução e testes.

---

## Alternatives Considered
- **Proxy/Object.freeze em todas as entidades:** Custo de overhead de alocação de memória e degradação de throughput em benchmarks com 10.000 entidades.
- **Auto-detecção em `updateEntity`:** Complexidade heurística que mascarava se a intenção era movimentar, capturar ou promover, com risco de bugs sutis.

---

## Consequences
- **Positivas:** 100% de garantia de consistência bidirecional entre ocupação espacial e estado da entidade. Impossibilidade de corromper índices por acidente.
- **Negativas:** Código consumidor deve utilizar as APIs semânticas especializadas em vez de um `updateEntity` genérico.
