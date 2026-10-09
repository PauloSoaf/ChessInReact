# ADR-002: Mapeamento de Identidade Lossless para Serialização de Worker

- **Status:** `ACCEPTED`
- **Date:** 2026-10-09
- **Deciders:** Principal Software Engineer, Staff TypeScript Architect

---

## Context
O `FlatArraySerializer` compacta o estado de jogo em um `Int32Array` contíguo para transferência zero-copy para WebWorkers de cálculo/IA. A implementação inicial convertia a string `entity.id` em um hash de 32 bits (`hashStringToInt32`). Na desserialização, o identificador original era perdido e substituído por `entity_hash_${idHash}`. Além da perda de identidade original, hashes de 32 bits possuem risco de colisão (paradoxo do aniversário), o que quebrava o contrato lossless de round-trip (AUDIT-03).

---

## Decision
1. Definir explicitamente três contratos de snapshot:
   - `DomainSnapshot`: Representação estruturada em memória do estado de domínio completo (`IDomainState`).
   - `PersistenceSnapshot`: String JSON completa para persistência e replay lossless (`SnapshotSerializer`).
   - `WorkerSnapshot`: Par `{ buffer: Int32Array, stringTable: readonly string[] }` para transferência rápida e determinística a threads secundárias.
2. Substituir o hash numérico por um **Dictionary Sidecar / String Table**:
   - Cada entidade `i` (`0..N-1`) possui seu identificador original registrado em `stringTable[i] = entity.id`.
   - O campo `ID_STRING_INDEX` no `Int32Array` armazena o índice inteiro `i`.
   - Na transferência para o Worker, o `Int32Array` é transferido via zero-copy (`[buffer.buffer]`) e o `stringTable` é clonado via structured clone (custo desprezível para dezenas/centenas de strings).
   - Na desserialização, `deserializeWorkerState(buffer, stringTable)` resolve `stringTable[idIndex]`, restaurando 100% da identidade sem qualquer risco de colisão de hash.
   - Quando `stringTable` for omitido (ex: workers de matemática pura sem necessidade de strings), a desserialização recorre com segurança a identificadores ordinais `entity_${idIndex}`.

---

## Alternatives Considered
- **Hash de 64 bits (BigInt64Array):** Aumentaria o stride do buffer e ainda assim não resolveria a perda de identidade da string original na desserialização.
- **Strings codificadas em UTF-8 direto no buffer:** Complexidade alta de stride variável e overhead de decodificação no Worker.

---

## Consequences
- **Positivas:** Identidade 100% preservada no round-trip entre threads, zero colisão de hash, compatibilidade contínua com zero-copy Transferable ArrayBuffers.
- **Negativas:** Requer passar o sidecar `stringTable` junto com o buffer nas mensagens do Worker.
