# ADR-004: Tratamento de Ativos Legados Não Adaptados e Fronteira de Escopo

- **Status:** `ACCEPTED`
- **Date:** 2026-10-09
- **Deciders:** Principal Software Engineer, Staff Architect

---

## Context
Durante a auditoria da Spec 01, investigou-se a presença de arquivos nos diretórios `src/components/layout/` e `src/components/theme/` que foram excluídos da checagem do TypeScript (`tsconfig.json`) e do ESLint (`.eslintrc.cjs`). A análise do histórico do Git revelou que esses arquivos foram copiados no commit `758523e` a partir do projeto NutriOpus e contêm dependências não instaladas específicas do Next.js (`next/link`, `next/navigation`, `next-themes`, `lucide-react`).

Nenhum desses arquivos é importado por qualquer componente ou módulo do ChessInReact atualmente.

---

## Decision
1. **Não alterar nem tocar no repositório externo original NutriOpus** (regra mandatória do projeto: `NUTRIOPUS ORIGINAL: UNCHANGED`).
2. **Não reescrever prematuramente os componentes de layout/tema no escopo da Spec 01**, uma vez que a UI completa, HUD e sistema de temas pertencem formalmente à **Spec 06 (UI, HUD & Theme System)**. Tentar portar o ecossistema Next.js para Vite no escopo da Spec 01 violaria a diretriz de não implementar Specs futuras.
3. Manter a exclusão pontual desses arquivos em `tsconfig.json` e `.eslintrc.cjs` devidamente justificada e documentada, até que a Spec 06 seja iniciada para adaptá-los ou substituí-los pelo design system final do jogo.

---

## Alternatives Considered
- **Deletar os arquivos imediatamente:** Poderia descartar componentes de HUD que o usuário planeja reaproveitar na Spec 06.
- **Portar todos os componentes para Vite/React agora:** Esforço fora de escopo que adicionaria dependências não relacionadas ao Core da Spec 01.

---

## Consequences
- **Positivas:** Foco absoluto na integridade e corretude da Spec 01 (Core State Architecture); integridade do repositório externo preservada; zero advertências de lint ou erros de build na branch.
- **Negativas:** Os arquivos permanecem dormindo até a implementação da Spec 06.
