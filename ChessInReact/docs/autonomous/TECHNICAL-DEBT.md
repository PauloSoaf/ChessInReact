# ChessInReact | Technical Debt & Risk Registry

> **Registro Contínuo de Débitos Técnicos, Otimizações e Riscos**  
> **Data:** 11/11/2026 08:45 (UTC-4)

---

## 1. Débitos Técnicos Ativos

1. **Interpolação de Movimento e Transição de Câmera 3D (Spec 07):**
   - **Gravidade:** P1.
   - **Descrição:** As peças e a câmera atualmente saltam instantaneamente entre coordenadas lógicas sem transição visual suave (`lerp`).
   - **Resolução Planejada:** Patch `SPEC07-CAMERA-LERP-AND-ANIMATION-01`.

2. **Agrupamento de Malhas de Peças com `InstancedMesh` (Spec 07):**
   - **Gravidade:** P2.
   - **Descrição:** Peças usam modelos procedurais (`Piece3DModel`) que somam até 32 draw calls. Embora abaixo do limite crítico de 100 draw calls, a Spec 07 RF-01 prescreve batching com `InstancedMesh` para $< 20$ draw calls.
   - **Resolução Planejada:** Patch `SPEC07-INSTANCED-PIECE-BATCHING-03`.

3. **Deploy de Servidor Autoritativo em Nuvem Gratuita (Spec 03 & Spec 10):**
   - **Gravidade:** P3.
   - **Descrição:** Servidor Colyseus validado localmente em testes de integração e simulação a 20 Hz, mas pendente de deploy em runner/cluster público gratuito (Railway/Fly.io/Render).
   - **Status:** DEFERRED para a fase de infraestrutura.

