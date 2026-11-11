# ChessInReact | Technical Debt & Risk Registry

> **Registro Contínuo de Débitos Técnicos, Otimizações e Riscos**  
> **Data:** 11/11/2026 08:45 (UTC-4)

---

## 1. Débitos Técnicos Resolvidos

1. **Interpolação de Movimento e Transição de Câmera 3D (Spec 07):**
   - **Status:** RESOLVIDO no patch `SPEC07-CAMERA-LERP-AND-ANIMATION-01` (`804dc5b`). Câmera orbital e arco parabólico de peças interpolados com lerp suave em demand loop.

2. **Agrupamento de Malhas de Peças com `InstancedMesh` (Spec 07):**
   - **Status:** RESOLVIDO no patch `SPEC07-INSTANCED-PIECE-BATCHING-03` (`HEAD`). `InstancedPieceBatcher` agrupa 32 peças em 6 InstancedMeshes (6 draw calls vs limite de 20).

---

## 2. Débitos Técnicos Ativos

1. **Deploy de Servidor Autoritativo em Nuvem Gratuita (Spec 03 & Spec 10):**
   - **Gravidade:** P3.
   - **Descrição:** Servidor Colyseus validado localmente em testes de integração e simulação a 20 Hz, mas pendente de deploy em runner/cluster público gratuito (Railway/Fly.io/Render).
   - **Status:** DEFERRED para a fase de infraestrutura.

