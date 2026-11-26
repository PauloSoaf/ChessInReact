# PATCH-12 — Evidência de generalização tática

Fixtures determinísticas de teste. Não constituem reconstrução dos feitiços da sessão histórica.

Linha rejeitada pelo N5: **Kxf7 → Jump(e6) + Bxf7 → rei preto capturado**.
Ganho material: 900 cp. Avaliação do candidato: -99998 cp.
Alternativa escolhida: **Kd8**. Captura imediata adversária após sua execução: nenhuma.
Linha principal calculada: Kd8 → Bxe6 → a4 → Qd7+ → Kxd7 → Bxd7.
Profundidade concluída: 4; nós: 1909; tempo: 516.84 ms.

Matriz: 7 geometrias × 8 estados de feitiços × 2 cores = **112 casos**.
Defesas obrigatórias com Freeze: **14**, incluindo 0 empate(s) legal(is) sem ações disponíveis. Total: **126 casos**.
42 capturas da dama permitem a captura imediata do rei; 70 não permitem essa resposta imediata.
Divergências: 0. Escolhas inseguras: 0. Fallbacks: 0.

| Geometria | Atacante | Bloqueador | Condição | Cores | Casos |
| --- | --- | --- | --- | ---: | ---: |
| bishop-c4-f7 | BISHOP | PAWN (adversário) | jump-ready | 2 | 2 |
| bishop-c4-f7 | BISHOP | PAWN (adversário) | no-jump-charges | 2 | 2 |
| bishop-c4-f7 | BISHOP | PAWN (adversário) | jump-in-cooldown | 2 | 2 |
| bishop-c4-f7 | BISHOP | PAWN (adversário) | attacker-still-frozen | 2 | 2 |
| bishop-c4-f7 | BISHOP | PAWN (adversário) | attacker-thaws-before-reply | 2 | 2 |
| bishop-c4-f7 | BISHOP | PAWN (adversário) | two-independent-blockers | 2 | 2 |
| bishop-c4-f7 | BISHOP | PAWN (adversário) | existing-jump-without-charges | 2 | 2 |
| bishop-c4-f7 | BISHOP | PAWN (adversário) | jump-expires-before-reply | 2 | 2 |
| bishop-b2-e5 | BISHOP | KNIGHT (adversário) | jump-ready | 2 | 2 |
| bishop-b2-e5 | BISHOP | KNIGHT (adversário) | no-jump-charges | 2 | 2 |
| bishop-b2-e5 | BISHOP | KNIGHT (adversário) | jump-in-cooldown | 2 | 2 |
| bishop-b2-e5 | BISHOP | KNIGHT (adversário) | attacker-still-frozen | 2 | 2 |
| bishop-b2-e5 | BISHOP | KNIGHT (adversário) | attacker-thaws-before-reply | 2 | 2 |
| bishop-b2-e5 | BISHOP | KNIGHT (adversário) | two-independent-blockers | 2 | 2 |
| bishop-b2-e5 | BISHOP | KNIGHT (adversário) | existing-jump-without-charges | 2 | 2 |
| bishop-b2-e5 | BISHOP | KNIGHT (adversário) | jump-expires-before-reply | 2 | 2 |
| rook-c2-c6 | ROOK | BISHOP (aliado) | jump-ready | 2 | 2 |
| rook-c2-c6 | ROOK | BISHOP (aliado) | no-jump-charges | 2 | 2 |
| rook-c2-c6 | ROOK | BISHOP (aliado) | jump-in-cooldown | 2 | 2 |
| rook-c2-c6 | ROOK | BISHOP (aliado) | attacker-still-frozen | 2 | 2 |
| rook-c2-c6 | ROOK | BISHOP (aliado) | attacker-thaws-before-reply | 2 | 2 |
| rook-c2-c6 | ROOK | BISHOP (aliado) | two-independent-blockers | 2 | 2 |
| rook-c2-c6 | ROOK | BISHOP (aliado) | existing-jump-without-charges | 2 | 2 |
| rook-c2-c6 | ROOK | BISHOP (aliado) | jump-expires-before-reply | 2 | 2 |
| rook-b4-f4 | ROOK | ROOK (adversário) | jump-ready | 2 | 2 |
| rook-b4-f4 | ROOK | ROOK (adversário) | no-jump-charges | 2 | 2 |
| rook-b4-f4 | ROOK | ROOK (adversário) | jump-in-cooldown | 2 | 2 |
| rook-b4-f4 | ROOK | ROOK (adversário) | attacker-still-frozen | 2 | 2 |
| rook-b4-f4 | ROOK | ROOK (adversário) | attacker-thaws-before-reply | 2 | 2 |
| rook-b4-f4 | ROOK | ROOK (adversário) | two-independent-blockers | 2 | 2 |
| rook-b4-f4 | ROOK | ROOK (adversário) | existing-jump-without-charges | 2 | 2 |
| rook-b4-f4 | ROOK | ROOK (adversário) | jump-expires-before-reply | 2 | 2 |
| queen-h2-d6 | QUEEN | BISHOP (adversário) | jump-ready | 2 | 2 |
| queen-h2-d6 | QUEEN | BISHOP (adversário) | no-jump-charges | 2 | 2 |
| queen-h2-d6 | QUEEN | BISHOP (adversário) | jump-in-cooldown | 2 | 2 |
| queen-h2-d6 | QUEEN | BISHOP (adversário) | attacker-still-frozen | 2 | 2 |
| queen-h2-d6 | QUEEN | BISHOP (adversário) | attacker-thaws-before-reply | 2 | 2 |
| queen-h2-d6 | QUEEN | BISHOP (adversário) | two-independent-blockers | 2 | 2 |
| queen-h2-d6 | QUEEN | BISHOP (adversário) | existing-jump-without-charges | 2 | 2 |
| queen-h2-d6 | QUEEN | BISHOP (adversário) | jump-expires-before-reply | 2 | 2 |
| queen-f2-f6 | QUEEN | KNIGHT (aliado) | jump-ready | 2 | 2 |
| queen-f2-f6 | QUEEN | KNIGHT (aliado) | no-jump-charges | 2 | 2 |
| queen-f2-f6 | QUEEN | KNIGHT (aliado) | jump-in-cooldown | 2 | 2 |
| queen-f2-f6 | QUEEN | KNIGHT (aliado) | attacker-still-frozen | 2 | 2 |
| queen-f2-f6 | QUEEN | KNIGHT (aliado) | attacker-thaws-before-reply | 2 | 2 |
| queen-f2-f6 | QUEEN | KNIGHT (aliado) | two-independent-blockers | 2 | 2 |
| queen-f2-f6 | QUEEN | KNIGHT (aliado) | existing-jump-without-charges | 2 | 2 |
| queen-f2-f6 | QUEEN | KNIGHT (aliado) | jump-expires-before-reply | 2 | 2 |
| queen-g6-c6 | QUEEN | QUEEN (adversário) | jump-ready | 2 | 2 |
| queen-g6-c6 | QUEEN | QUEEN (adversário) | no-jump-charges | 2 | 2 |
| queen-g6-c6 | QUEEN | QUEEN (adversário) | jump-in-cooldown | 2 | 2 |
| queen-g6-c6 | QUEEN | QUEEN (adversário) | attacker-still-frozen | 2 | 2 |
| queen-g6-c6 | QUEEN | QUEEN (adversário) | attacker-thaws-before-reply | 2 | 2 |
| queen-g6-c6 | QUEEN | QUEEN (adversário) | two-independent-blockers | 2 | 2 |
| queen-g6-c6 | QUEEN | QUEEN (adversário) | existing-jump-without-charges | 2 | 2 |
| queen-g6-c6 | QUEEN | QUEEN (adversário) | jump-expires-before-reply | 2 | 2 |

Os testes verificam a captura concreta com as regras compartilhadas e a estratégia N5 usada em produção. Não há regra especial para Kxf7 ou para as casas da partida relatada.

[Dados completos, diagnósticos e ações](tactical-equivalence.json).
