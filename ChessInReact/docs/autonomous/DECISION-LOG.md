# ChessInReact | Autonomous Engine Decision Log

> **Registro de Decisões Técnicas e Arquiteturais do Ciclo Autônomo**  
> **Data:** 11/11/2026 08:46 (UTC-4)

---

## 1. Registro de Decisões

- **DEC-001 (09/11/2026): Isolamento de Mocks Three.js no JSDOM**  
  *Contexto:* Tags intrínsecas de Three.js emitiam 432 avisos de casing no JSDOM durante execução do Vitest.  
  *Decisão:* Criar mocks semânticos para `InstancedBoard` e `InstancedPieces` e filtrar nós não-componentes no mock de `<Canvas>`.  
  *Resultado:* Eliminação de 100% dos avisos de console sem suprimir `console.error`.

- **DEC-002 (09/11/2026): Fallback de IA Garantidamente Não-Bloqueante**  
  *Contexto:* `BotMatchController` chamava `processWorkerRequest` síncrono na thread principal sob falha de Worker.  
  *Decisão:* Reestruturar o fallback para re-inicializar o Worker e recalcular off-thread; se indisponível, executar seleção linear instantânea via `RulesEngine` ($< 1$ ms).  
  *Resultado:* 0 ms de bloqueio de UI, medido com `performance.now()`.

- **DEC-003 (11/11/2026): Projeção Analítica de Câmera para Raycasting em Chromium**  
  *Contexto:* O teste Chromium precisava comprovar a interatividade real 3D por raycasting sem depender de coordenadas de tela fixas.  
  *Decisão:* Implementar instrumentação `projectCoordToScreen` interna ao R3F que projeta posições lógicas do tabuleiro via matriz de câmera Three.js para coordenadas de tela, disparando eventos nativos de ponteiro no canvas.  
  *Resultado:* Raycasting real validado em Chromium headless para lances e resolução de xeque.

- **DEC-004 (11/11/2026): Seleção do Próximo Patch Autônomo**  
  *Contexto:* Com o WebGL real validado e responsivo, a principal pendência visual da Spec 07 é a ausência de transições suaves de câmera e animação de peças.  
  *Decisão:* Priorizar o patch `SPEC07-CAMERA-LERP-AND-ANIMATION-01`.

