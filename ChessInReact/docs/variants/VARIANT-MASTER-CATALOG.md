# CHESSINREACT | VARIANT MASTER CATALOG

> **Catálogo Geral e Enciclopédia de Variantes, Arenas e Modos de Jogo**  
> **Versão:** 1.0.0 — Documento de Governança de Produto  
> **Fontes & Referências:** FIDE, Lichess, Chess.com, PyChess, Fairy-Stockfish, 4PlayerChess+, ChessVariants.org  
> **Status de Engenharia:** Conectado à Arquitetura ECS (Spec 01), Topologia Procedural (Spec 02), Pipeline de Regras (Spec 04), IA Universal (Spec 15) e Configurador Universal de Participantes (Spec 16).

---

## 1. PRINCÍPIO FUNDAMENTAL: QUALQUER VAGA, QUALQUER PARTICIPANTE

No `ChessInReact`, nenhuma modalidade é restrita a "Humano contra Humano Local" ou forçada a ter bots apenas nas peças pretas.
Qualquer assento ($0 \dots N-1$, para 2 a 12 participantes) admite:
1. `HUMAN_LOCAL`: Controle interativo pelo jogador no dispositivo atual.
2. `HUMAN_REMOTE`: Conexão em tempo real via salas Colyseus autoritativas.
3. `AI_BOT`: Inteligência Artificial autônoma calibrada por nível (1 a 5), arquétipo tático e motor de busca específico da variante.
4. `BOT_STANDIN`: Assunção imediata por bot em caso de queda de rede ou abandono.

> [!IMPORTANT]
> **Modo Espectador & Partidas 100% entre Bots:**  
> Partidas em que todos os assentos são configurados como `AI_BOT` (0 humanos) são permitidas em todas as modalidades, fornecendo controles de reprodução (Pausar, Retomar e Velocidade de Simulação 1x, 2x, 5x).

---

## 2. TAXONOMIA DAS 6 GRANDES FAMÍLIAS DE MODOS

### Família A: Xadrez Clássico & Modificadores de Regras
| ID da Variante | Nome | Jogadores | Topologia | Condição de Vitória | Suporte de IA |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `CHESS_STANDARD` | Xadrez FIDE Tradicional | 2 | Quadrada 8×8 | Xeque-mate ou Abandono | Minimax Alpha-Beta + Zobrist |
| `CHESS960` | Fischer Random Chess | 2 | Quadrada 8×8 | Xeque-mate | Minimax adaptado para roque 960 |
| `THREE_CHECK` | Three-Check Chess | 2 | Quadrada 8×8 | 3 xeques aplicados ou mate | Heurística de pressão ao rei |
| `FIVE_CHECK` | Five-Check Chess | 2 | Quadrada 8×8 | 5 xeques aplicados ou mate | Heurística de pressão tática |
| `KING_OF_THE_HILL` | King of the Hill (KOTH) | 2 | Quadrada 8×8 | Rei no centro (d4, e4, d5, e5) ou mate | Heurística de atração central |
| `RACING_KINGS` | Racing Kings | 2 | Quadrada 8×8 | Rei alcança 8ª fileira (sem xeques) | Planejador de rota sem xeque |
| `HORDE_CHESS` | Horde Chess | 2 | Quadrada 8×8 | Mate (brancas) / Extinção (pretas) | Avaliação assimétrica de peões |
| `ANTICHESS` | Antichess (Giveaway) | 2 | Quadrada 8×8 | Perder todas as peças / Afogamento | Captura forçada obrigatória |
| `ATOMIC_CHESS` | Atomic Chess | 2 | Quadrada 8×8 | Explodir o rei adversário | Risco de detonação radial 3×3 |
| `CRAZYHOUSE` | Crazyhouse | 2 | Quadrada 8×8 | Xeque-mate com drops de reservas | Avaliador de utilidade de mão |
| `NO_CASTLING` | No Castling Chess | 2 | Quadrada 8×8 | Xeque-mate sem roques | Ataque central agressivo |
| `FOG_OF_WAR` | Fog of War (Dark Chess) | 2 | Quadrada 8×8 | Captura física do rei | ISMCTS sobre conjunto de crenças |
| `BLINDFOLD_CHESS` | Blindfold Chess | 2 | Quadrada 8×8 | Xeque-mate (peças invisíveis na UI) | Minimax convencional |
| `CAPTURE_ANYTHING` | Capture Anything | 2 | Quadrada 8×8 | Xeque-mate (fogo amigo permitido) | Táticas de sacrifício próprio |
| `TORPEDO_CHESS` | Torpedo Chess | 2 | Quadrada 8×8 | Xeque-mate (peões com passo duplo livre) | Avaliador de estrutura rápida |
| `SIDEWAYS_PAWNS` | Sideways Pawns | 2 | Quadrada 8×8 | Xeque-mate (peões movem de lado) | Mobilidade de peões laterais |
| `EXTINCTION_CHESS`| Extinction Chess | 2 | Quadrada 8×8 | Eliminar qualquer classe inteira | Defesa de classes em risco |

---

### Família B: Modos Mágicos, Especiais & Híbridos
| ID da Variante | Nome | Jogadores | Mecânica Central | Estratégia de IA |
| :--- | :--- | :---: | :--- | :--- |
| `SPELL_CHESS_OFFICIAL` | Spell Chess (Chess.com Oficial) | 2 | 2 feitiços (Freeze 3×3 e Jump), 2 cargas cada, cooldown 3 turnos, sem mana | Avaliador de momentos críticos de congelamento |
| `SPELL_CHESS_EXPANDED` | Spell Chess (Expanded RPG) | 2 | 7 feitiços táticos, economia dinâmica de 2 a 6 de mana, deck e cartas | Otimizador de curva de mana e combos de feitiços |
| `DUCK_CHESS` | Duck Chess (Xadrez do Pato) | 2 | Turnos em 2 fases: lance legal + posicionamento do pato neutro | `JointMoveDuckPlanner` (bloqueio de contra-ataques) |
| `BUGHOUSE` | Bughouse Twin-Arena (2v2) | 4 (2×2) | Dois tabuleiros paralelos; capturas transferem-se para o parceiro | `BughousePartnerAgent` com mensageria cruzada |
| `ALICE_CHESS` | Alice Chess (Dual-Board) | 2 | Teleporte entre Tabuleiro A e B a cada lance concluído | Avaliação de segurança em ambos os tabuleiros |
| `KNIGHTMATE` | Knightmate | 2 | Cavalo é o Rei Real (`royal: true`); Reis são comuns | Proteção ao Cavalo Real |
| `MAHARAJAH_AND_SEPOYS` | Maharajah & the Sepoys | 2 | 1 Amazona branca (Q+N) contra exército negro padrão | Caça à peça super-poderosa / Mate |

---

### Família C: Arenas Multijogador Massivas (3 a 12 Jogadores)
| ID da Arena | Participantes | Geometria / Topologia | Modos de Disputa | Políticas de Eliminação |
| :--- | :---: | :--- | :--- | :--- |
| `THREE_PLAYER_CHESS` | 3 | Hexagonal de 96 casas com 3 alas | FFA, Solo | Evaporation, Grey, Conquest |
| `TRIANGULAR_CHAOS_3P` | 3 | Grade triangular de 3 exércitos | FFA | Evaporation, Grey |
| `FOUR_PLAYER_FFA` | 4 | Cruz de 160 casas (núcleo 8×8 + 4 alas) | FFA (Pontos: Peça + 20pts Mate) | Evaporation, Grey, Conquest, Bot |
| `FOUR_PLAYER_TEAMS` | 4 | Cruz de 160 casas | Duplas 2v2 (P1+P3 vs P2+P4) | Evaporation, Grey |
| `FOUR_PLAYER_SOLO` | 4 | Cruz de 160 casas | Último Rei Sobrevivente | Evaporation, Conquest |
| `CHATURAJI` | 4 | Tabuleiro 8×8 de 4 cantos histórico | Histórico FFA | Evaporation, Grey |
| `FORTRESS_5P` | 5 | Arena pentagonal com castelo central | 1 vs 4 ou FFA | Evaporation, Grey |
| `STRONGHOLD_5P` | 5 | Estrela radial de 5 pontas | FFA | Evaporation, Conquest |
| `CITADEL_5P` | 5 | Anel circular de 5 facções | FFA | Evaporation, Grey |
| `HEXAGON_SIX_PLAYER` | 6 | Hexágono regular de 6 exércitos | FFA, Equipes 3v3 ou 2v2v2 | Evaporation, Grey, Conquest, Bot |
| `SIX_PLAYER_TEAMS` | 6 | Hexágono regular 3v3 | Equipes (Aliança vs Horda) | Evaporation |
| `MINI_HEXAGON_6P` | 6 | Hexágono compacto para blitz | Blitz FFA | Evaporation |
| `SEVEN_PLAYER_FFA` | 7 | Heptágono perimetral | FFA | Evaporation, Grey |
| `OCTAGON_FFA` | 8 | Octógono radial de 8 participantes | FFA | Evaporation, Grey, Conquest |
| `OCTAGON_TEAMS` | 8 | Octógono configurado em 4v4 | Equipes Massivas | Evaporation |
| `NEXUS_10P` | 10 | Anel duplo para 10 participantes | FFA, 5v5 | Evaporation, Grey, Bot |
| `MINI_DODECAGON_12P` | 12 | Dodecágono perimetral (Capacidade Máxima) | FFA, 6v6, 4v4v4 | Evaporation, Grey, Conquest, Bot |
| `DIPLOMACY_CHESS` | 3 a 8 | Tabuleiro com turnos simultâneos secretos | Turnos Secretos & Alianças | Arbitragem Determinística de Colisão |

---

### Família D: Tabuleiros Geométricos & Peças Fadas
| ID da Variante | Nome | Dimensões | Casas | Peças Fadas Inclusas |
| :--- | :--- | :---: | :---: | :--- |
| `GLINSKI_HEXAGONAL` | Gliński Hexagonal Chess | 11×11 hex | 91 | 3 Bispos por cor, raios hexagonais |
| `CAPABLANCA_CHESS` | Capablanca Chess | 10×8 | 80 | **Chanceler** (Torre+Cavalo), **Arcebispo** (Bispo+Cavalo) |
| `SEIRAWAN_CHESS` | Seirawan Chess (S-Chess) | 8×8 | 64 | **Falcão** (B+N) e **Elefante** (R+N) em reserva (Gating) |
| `AMAZON_CHESS` | Amazon Chess | 8×8 | 64 | **Amazona** (Dama+Cavalo) |

---

### Família E: Variantes Históricas & Regionais
| ID da Variante | Região / Era | Dimensões | Características de Regras |
| :--- | :--- | :---: | :--- |
| `CHATURANGA` | Índia Antiga (séc. VI) | 8×8 | Ashtāpada sem cores alternadas, Raja, Mantri, Gaja, Ashva, Ratha |
| `SHATRANJ` | Pérsia Pós-Islâmica (séc. VII) | 8×8 | Shah, Fers, Alfil (salto 2 diagonais), Vitória por Bare King |
| `SHOGI` | Japão (séc. XVI) | 9×9 | Reutilização integral (Drops), Promoção nas 3 últimas fileiras (Dragão, Cavalo) |
| `XIANGQI` | China Clássica | 9×10 | Interseções, Rio Celeste, Palácio Imperial, Canhão saltador (Pao) |
| `MAKRUK` | Tailândia (Siam) | 8×8 | Peões na 3ª fileira, promoção na 6ª fileira a Met, Khon e Ma |

---

### Família F: Treinamento, Desafios & Puzzles
| ID da Atividade | Tipo | Interface / Mecânica |
| :--- | :--- | :--- |
| `PUZZLE_RUSH_SURVIVAL` | Desafio Solo | Sequência progressiva de puzzles até esgotar 3 vidas |
| `PUZZLE_RUSH_3MIN` | Contra o Relógio | Máximo de puzzles resolvidos em 180 segundos |
| `PUZZLE_RUSH_5MIN` | Contra o Relógio | Máximo de puzzles resolvidos em 300 segundos |
| `PUZZLE_BATTLE_VS_BOT` | Disputa 1v1 | Competição em tempo real contra bot com taxa de acerto calibrada por ELO |
| `ACADEMY_TACTICAL_STUDY`| Estudo Pedagógico | Exercícios de Mate, Garfo, Cravada com gabarito explicativo |

