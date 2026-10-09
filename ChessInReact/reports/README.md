# ChessInReact — Engineering Reports & Architecture Repository

Este diretório (`reports/`) constitui a estrutura permanente e padronizada de documentação técnica, auditoria de qualidade, resultados de testes, benchmarks empíricos e decisões arquiteturais (ADRs) do projeto **ChessInReact**, atendendo às especificações técnicas de **Spec 01 a Spec 10**.

---

## 📁 Estrutura de Diretórios

```text
reports/
├── README.md                          # Este documento: governança e convenções
├── implementations/                   # Relatórios de entrega de cada Spec
│   └── SPEC_01_IMPLEMENTATION.md
├── audits/                            # Auditorias estáticas e comportamentais independentes
│   └── SPEC_01_AUDIT.md
├── testing/                           # Evidências e relatórios de execução de suítes de teste
│   └── SPEC_01_TEST_RESULTS.md
├── benchmarks/                        # Medições quantitativas de desempenho e latência
│   └── SPEC_01_PERFORMANCE.md
└── decisions/                         # Architecture Decision Records (ADRs)
    ├── ADR-001-entity-mutation-and-index-invariants.md
    ├── ADR-002-worker-serialization-identity-mapping.md
    ├── ADR-003-core-ui-integration-architecture.md
    └── ADR-004-handling-unadapted-nutriopus-assets.md
```

---

## 🎯 Finalidade de Cada Seção

### 1. `implementations/` (Implementation Reports)
- **Objetivo:** Registrar o relatório formal de implementação entregue pelo desenvolvedor/agente ao finalizar os requisitos de uma Spec.
- **Convenção de Nomenclatura:** `SPEC_XX_IMPLEMENTATION.md` (ex: `SPEC_01_IMPLEMENTATION.md`).
- **Política de Integridade:** Representa um snapshot histórico. Não deve ser alterado retroativamente para disfarçar falhas encontradas em auditorias subsequentes.

### 2. `audits/` (Audit Reports)
- **Objetivo:** Documentar auditorias independentes do código, identificando discrepâncias entre o que foi alegado no relatório de implementação e o comportamento real do software.
- **Convenção de Nomenclatura:** `SPEC_XX_AUDIT.md` (ex: `SPEC_01_AUDIT.md`).
- **Padrão de Achados:** Cada achado recebe identificador único `AUDIT-XX` com campos formais:
  - `Severity` (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO`)
  - `Status` (`OPEN`, `FIXED`, `ACCEPTED`, `DEFERRED`, `NOT REPRODUCIBLE`)
  - `Requirement` (RF, RNF ou User Story associado)
  - `Files affected`
  - `Problem` & `Evidence`
  - `Risk` & `Correction`
  - `Tests added` & `Verification`

### 3. `testing/` (Test Execution Reports)
- **Objetivo:** Armazenar os logs, coberturas de código, quality gates e taxas de sucesso de testes automatizados executados na branch.
- **Convenção de Nomenclatura:** `SPEC_XX_TEST_RESULTS.md`.
- **Conteúdo Obrigatório:** Versões de Node/TypeScript/Vitest, commit hash, quantidade de suítes e testes aprovados, matriz de cobertura de código e status dos gates de build e lint.

### 4. `benchmarks/` (Performance & Scalability Reports)
- **Objetivo:** Registrar medições quantitativas reproduzíveis (latência, alocação de memória, tempos de inicialização e serialização).
- **Convenção de Nomenclatura:** `SPEC_XX_PERFORMANCE.md`.
- **Metodologia Exigida:** Requer warm-up, múltiplas amostras por escala e reporte explícito de `sample count`, `median` e `p95`.

### 5. `decisions/` (Architecture Decision Records — ADRs)
- **Objetivo:** Registrar decisões arquiteturais fundamentadas que afetam o contrato do sistema ou resolvem trade-offs complexos.
- **Convenção de Nomenclatura:** `ADR-XXX-<slug-descritivo>.md` (ex: `ADR-001-entity-mutation-and-index-invariants.md`).
- **Formato Mandatório:**
  - `Context`
  - `Decision`
  - `Alternatives Considered`
  - `Consequences`
  - `Status` (`ACCEPTED`, `SUPERSEDED`, `REJECTED`)

---

## 📜 Política de Governança para Futuras Specs (01–10)

1. **Evidência Reprodutível:** Nenhuma Spec pode receber o status `VERIFIED` sem evidências executáveis (testes passando, build sem erros, zero lint warnings).
2. **Ciclo de Remediação:** Toda auditoria com achados `OPEN` bloqueia a declaração de conclusão até que o ciclo `REPRODUCE → TEST → FIX → VERIFY` seja concluído.
3. **Imutabilidade de NutriOpus:** O repositório externo NutriOpus nunca deve ser alterado por modificações realizadas no ChessInReact.
