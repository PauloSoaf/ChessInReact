# ChessInReact | Architecture Audit & Domain Integrity

> **Auditoria Arquitetural Contínua**  
> **Data:** 11/11/2026 08:44 (UTC-4)

---

## 1. Separação de Responsabilidades e Limites de Domínio

1. **Core State Architecture (Spec 01):**
   - O estado do jogo (`gameStore.ts`) é a autoridade máxima única da verdade (*Single Source of Truth*).
   - Comandos (`MovePieceCommand`, etc.) mutam o estado através de imutabilidade estrita e são totalmente reversíveis.
   - Nenhuma lógica de UI ou WebGL tem autoridade para mutar o estado diretamente sem emitir um comando.

2. **Rules Engine (Spec 04):**
   - Regras de xadrez são puras e desacopladas de componentes React e Three.js.
   - `RulesEngine.getLegalMovesForPiece` e `CheckValidator.isRoyalInCheck` são funções estáticas determinísticas.

3. **Inteligência Artificial (Spec 05):**
   - Motores de IA operam off-thread através de Dedicated Web Workers (`engineWorker.ts`).
   - O controlador `BotMatchController` possui cancelamento por token de turno, descartando respostas obsoletas caso o jogador reverta lances ou reinicie a partida durante o cálculo.
   - Em caso de falha de Worker, aciona fallback assíncrono não-bloqueante linear ($O(N)$ com $N \le 16$, $< 1$ ms de cálculo).

4. **Renderização 2D e 3D (Spec 06 & Spec 07):**
   - Modos 2D (SVG) e 3D (Three.js/R3F) são puramente visuais e consumidores do estado do `gameStore`.
   - A alternância entre 2D e 3D é completamente *lossless*: todas as peças, histórico de turnos, peças capturadas e restrições são preservadas.
   - Detecção de hardware via `webglCapabilities.ts` protege contra telas pretas em dispositivos sem aceleração 3D.

