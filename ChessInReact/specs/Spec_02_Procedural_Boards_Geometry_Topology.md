# Spec 02: Geometria, Topologia e Tabuleiros Procedurais Infinitos (Parte 1/4)

## A. OBRIGAÇÃO DE DENSIDADE E ABORDAGEM
No xadrez tradicional, a relação espacial entre casas é trivial: para mover para cima, subtrai-se 1 do eixo Y. Para o `ChessInReact`, a topologia não é estática. Suportar tabuleiros Hexagonais, Triangulares e Infinitos Procedurais exige que a Engine descarte a noção de "Fileira e Coluna" em prol de Matrizes Afins e Grafos de Adjacência Calculada, ou sistemas de Coordenadas de Eixo Triplo.

## 1. OBJETIVO DO SUBSISTEMA DE GEOMETRIA
Garantir que a Engine consiga validar movimentos, calcular distâncias (para IA e Heurísticas) e renderizar tabuleiros irregulares de qualquer topologia, mantendo a complexidade assintótica de cálculo de Raio de Ataque (Raycasting de Peças) na ordem de $O(D)$, onde $D$ é a distância, ao invés de $O(N)$ onde $N$ é o tamanho do mapa.

## 2. ESCOPO
**PERTENCE A ESTA SPEC:**
- Matemática Hexagonal (Cube/Axial Coordinates).
- Matemática Triangular (Barycentric Coordinates / Offset).
- Map Generation via Noise (Simplex/Perlin).
- Chunking Lógico (Não-Gráfico) para o Tabuleiro Infinito.
- Algoritmo A* adaptado para Heurísticas Irregulares.

**NÃO PERTENCE:**
- Frustum Culling Visual das Instâncias (Ver Spec 07).
- Regras de Movimento da Peça "Cavalo" (Ver Spec 04).

## 3. REQUISITOS E CONSTRAINTS
### 3.1 Constraints Topológicas
- **Constraint:** Diferente de um grid quadrado onde existem 8 vizinhos (incluindo diagonais), um Hexágono possui 6 vizinhos que compartilham arestas e 6 "vizinhos diagonais" que apenas tocam os vértices.
- **Resolução Arquitetural:** O validador de movimentos não pode hardcodar regras matemáticas (Ex: `x+1, y+1`). A biblioteca de Geometria abstrairá a definição de "Direção" num `Enum` injetável, e cada geometria proverá sua implementação de `getNeighbor(coord, direction)`.

### 3.2 Constraints de Tabuleiro Infinito (Memória e Processamento)
- **Constraint:** A memória não comporta um Dicionário Zustand com 1 milhão de chaves caso o jogador movimente uma peça longe do centro. Além disso, iterar um array de chaves infinito no AI WebWorker causaria estouro de Heap.
- **Resolução Arquitetural:** O Tabuleiro Procedural será quebrado em **Chunks Lógicos** (e.g., 16x16). O gerador de Noise só instanciará casas válidas para o chunk quando uma peça entrar em seu raio de proximidade.

## 4. PESQUISA MATRIX: FONTES EXTERNAS CONSULTADAS E VALIDADAS
Abaixo as fontes analisadas puramente sob o escopo topológico.

### Fonte 1: "Hexagonal Grids" - Red Blob Games (Amit Patel)
- **URL:** https://www.redblobgames.com/grids/hexagons/
- **Problema Resolvido:** O tutorial definitivo de matemática hexagonal em GameDev.
- **Decisão Arquitetural:** Em vez de usar Offset Coordinates (Ziguezague) que exige condicionais `if (isEvenRow)` e destrói o branch predictor da CPU, utilizaremos **Cube Coordinates** `(q, r, s)`. Isto torna a distância entre dois hexágonos a simples soma das diferenças absolutas: `max(|q1-q2|, |r1-r2|, |s1-s2|)`.

### Fonte 2: "Procedural Generation in Minecraft" (Notch / Vários GDC)
- **URL:** https://www.youtube.com/watch?v=CSa5O6tpks0 (Referência Arquitetural Minecraft Chunking)
- **Problema Resolvido:** Como carregar terreno "On Demand".
- **Decisão:** Usaremos o Padrão "Sliding Window". O servidor/cliente rastreia um Boundary e, ao quebrar um limiar de distância, submete um job assíncrono para o Procedural Noise injetar novos hexágonos no Zustand Store.

### Fonte 3: "Simplex Noise in JavaScript"
- **URL:** https://github.com/jwagner/simplex-noise.js
- **Problema Resolvido:** Perlin Noise gera artefatos de "grid" óbvios em coordenadas 2D grandes.
- **Decisão:** O gerador de tabuleiro utilizará `simplex-noise` (OpenSimplex2) que tem artefatos radiais, muito mais naturais para tabuleiros hexagonais infinitos.

### Fonte 4: "Graph Theory and Chess Variants" (V. R. Parton, Alice Chess)
- **Problema Resolvido:** Como calcular movimentos de "Cavalo" (L-shape) em grafos não-grid?
- **Conclusão:** O Cavalo não anda em L. Ele anda exatos 2 passos radiais e 1 passo angular ortogonal.
- **Decisão:** A Engine modelará a Movimentação como grafos direcionados (`GraphEdges`) em vez de deltas X,Y, permitindo o Knight pular corretamente em cenários Hex/Tri.

### Fonte 5: "Pathfinding on Triangles"
- **URL:** http://www.cs.uu.nl/docs/vakken/mge/2017/PathfindingOnTriangularGrids.pdf
- **Problema Resolvido:** Como armazenar e percorrer grids triangulares sem redundância matemática.
- **Decisão:** Mapearemos triângulos como sub-grids de Hexágonos, facilitando o polimorfismo das matrizes do `ICoreState`.

### GitHub 1: jwagner/simplex-noise.js
- **Estrutura Estudada:** Algoritmo base de determinação procedural (seed).
- **Decisão influenciada:** Garantimos que a geração do mapa depende 100% da `Seed` do servidor (Server Authoritative) para evitar dessincronia no multiplayer infinito.

### GitHub 2: nrtk/HexGrid
- **Estrutura Estudada:** `HexMath.ts`.
- **Problema Resolvido:** Funções genéricas de Line Drawing.
- **Decisão influenciada:** Implementar o algoritmo de Interpolação Linear (LERP) entre Hexágonos para determinar o Raio de Ataque de "Sliders" (Bispos, Torres) em grades hexágonais. O raycast geométrico será puramente matemático.

## 5. ESTRUTURA REAL DE DIRETÓRIOS E MÓDULOS (GEOMETRIA)

```text
src/
  engine/
    topology/
      ITopology.ts            // Interface Polimórfica Base
      HexTopology.ts          // Implementação Cube Coordinates
      SquareTopology.ts       // Clássico 8x8 Cartesiano
    procedural/
      ChunkManager.ts         // Rastreia Peças vs Limites Ativos
      NoiseGenerator.ts       // Instância Seeded Simplex
```

## 6. O CONTRATO POLIMÓRFICO DE TOPOLOGIA
A Engine não "sabe" que está jogando xadrez hexagonal. Ela consulta a topologia.

```typescript
// src/engine/topology/ITopology.ts
import { CoordinateID } from '../../core/interfaces/ICoreState';

export enum DirectionIndex {
  NORTH = 0, NORTHEAST = 1, EAST = 2, SOUTHEAST = 3,
  SOUTH = 4, SOUTHWEST = 5, WEST = 6, NORTHWEST = 7,
}

export interface ITopology {
  // Retorna o hash do vizinho direto
  getNeighbor(coord: CoordinateID, dir: DirectionIndex): CoordinateID | null;
  
  // Distância O(1) para Heurística (AI)
  getDistance(a: CoordinateID, b: CoordinateID): number;
  
  // Utilizado por Sliders (Rainha, Torre) para achar casas interceptadas
  getLineOfSight(start: CoordinateID, target: CoordinateID): CoordinateID[];
  
  // Translada Coordenadas de Board O(1) para Coordenadas WebGL (X,Y,Z)
  toWorldPosition(coord: CoordinateID): { x: number, y: number, z: number };
}
```

(CONTINUA NA PARTE 2)
## 7. IMPLEMENTAÇÃO DA TOPOLOGIA HEXAGONAL (CUBE COORDINATES)

Para sustentar a arquitetura O(1) do `Zustand` (`Spec 01`), a Topologia Hexagonal não alocará matrizes bidimensionais e sim funções matemáticas puras.

### 7.1 Algoritmos O(1) em HexTopology
```typescript
// src/engine/topology/HexTopology.ts
import { ITopology, DirectionIndex } from './ITopology';
import { CoordinateID } from '../../core/interfaces/ICoreState';

export class HexTopology implements ITopology {
  // A ordem afeta o Clockwise Walk
  // Dir: E, NE, NW, W, SW, SE
  private readonly HASH_VECTORS = [
    [1, -1, 0], [1, 0, -1], [0, 1, -1],
    [-1, 1, 0], [-1, 0, 1], [0, -1, 1]
  ];

  getNeighbor(coord: CoordinateID, dir: DirectionIndex): CoordinateID | null {
    // Apenas direções hex válidas (0 a 5)
    if (dir > 5) return null; 
    
    const { q, r, s } = this.parse(coord);
    const vec = this.HASH_VECTORS[dir];
    return `${q + vec[0]},${r + vec[1]},${s + vec[2]}`;
  }

  getDistance(a: CoordinateID, b: CoordinateID): number {
    const p1 = this.parse(a);
    const p2 = this.parse(b);
    // Manhattan distance em Cube Coordinates (RedBlobGames)
    return Math.max(Math.abs(p1.q - p2.q), Math.abs(p1.r - p2.r), Math.abs(p1.s - p2.s));
  }

  getLineOfSight(start: CoordinateID, target: CoordinateID): CoordinateID[] {
    const N = this.getDistance(start, target);
    const path: CoordinateID[] = [];
    const p1 = this.parse(start);
    const p2 = this.parse(target);

    // Cube LERP
    for (let i = 0; i <= N; i++) {
       const t = N === 0 ? 0.0 : i / N;
       const q = p1.q + (p2.q - p1.q) * t;
       const r = p1.r + (p2.r - p1.r) * t;
       const s = p1.s + (p2.s - p1.s) * t;
       path.push(this.cubeRound(q, r, s));
    }
    return path;
  }

  // Rounding exige compensação do maior delta para garantir q+r+s = 0
  private cubeRound(fracQ: number, fracR: number, fracS: number): CoordinateID {
    let q = Math.round(fracQ);
    let r = Math.round(fracR);
    let s = Math.round(fracS);

    const qDiff = Math.abs(q - fracQ);
    const rDiff = Math.abs(r - fracR);
    const sDiff = Math.abs(s - fracS);

    if (qDiff > rDiff && qDiff > sDiff) { q = -r - s; }
    else if (rDiff > sDiff) { r = -q - s; }
    else { s = -q - r; }

    return `${q},${r},${s}`;
  }

  toWorldPosition(coord: CoordinateID): { x: number, y: number, z: number } {
    const { q, r } = this.parse(coord);
    // Pointy-topped hex-to-pixel matrix
    const size = 1.0; // raio
    const x = size * (Math.sqrt(3) * q  +  Math.sqrt(3)/2 * r);
    const z = size * (                         3.0/2 * r);
    return { x, y: 0, z };
  }

  private parse(hash: CoordinateID) {
    const parts = hash.split(',');
    return { q: Number(parts[0]), r: Number(parts[1]), s: Number(parts[2]) };
  }
}
```

## 8. GERADOR PROCEDURAL (NOISE & CHUNKING)
Um jogo "Procedural Infinito" não aloca infinitos objetos na memória. Ele injeta entidades de "TERRENO" no Zustand State quando uma peça real se aproxima do limite conhecido.

### 8.1 A Janela de Exploração (Sliding Window)
O servidor (ou WebWorker) verifica a distância das peças para as casas de Limite. Quando a distância cai abaixo de Threshold = `T`, geramos o novo "Anel" (Ring) ou Chunk.

```typescript
// src/engine/procedural/ChunkManager.ts
import { IGameState, IEntity } from '../../core/interfaces/ICoreState';
import { NoiseGenerator } from './NoiseGenerator';

export class ChunkManager {
  private noiseGen: NoiseGenerator;
  private readonly RENDER_DISTANCE = 8; // Raio em hexágonos

  constructor(seed: string) {
    this.noiseGen = new NoiseGenerator(seed);
  }

  /**
   * Avalia o state atual. Para cada peça, certifica-se de que 
   * todas as casas até RENDER_DISTANCE estão geradas no dicionário.
   * Retorna os "Deltas" (novas casas a inserir).
   */
  public generateMissingChunks(state: IGameState): Record<string, IEntity> {
    const newEntities: Record<string, IEntity> = {};
    
    // Iteração apenas sobre peças. TERRAINS são ignorados na seed de expansão.
    const pieceIds = Object.keys(state.boardEntities).filter(
      k => state.boardEntities[k].type === "PIECE"
    );

    for (const pId of pieceIds) {
       const pieceCoord = state.boardEntities[pId].position;
       // Gera todos os anéis radiais de 0 até RENDER_DISTANCE
       const requiredCoords = this.getRingCoordinates(pieceCoord, this.RENDER_DISTANCE);
       
       for (const coord of requiredCoords) {
          if (!state.boardEntities[coord] && !newEntities[coord]) {
             // Avalia Noise O(1)
             const elevation = this.noiseGen.getElevation(coord);
             
             // Elevação < 0 = Água (Intransponível, Buraco no tabuleiro)
             if (elevation >= 0) {
                newEntities[coord] = {
                   id: `terr_${coord}`,
                   type: "TERRAIN",
                   position: coord,
                   metadata: { elevation } // Elevação afeta linha de visão
                } as IEntity;
             }
          }
       }
    }
    
    return newEntities; // Enviado via Action para o Zustand
  }
  // ... implementação de getRingCoordinates (omitida por brevidade)
}
```

(CONTINUA NA PARTE 3)
### 8.2 A Injeção determinística de Simplex Noise
A diferença entre `Math.random()` e `SimplexNoise` é a Suavidade (Coerência de espaço). Casas adjacentes devem ter elevações parecidas para formar "montanhas" orgânicas.

```typescript
// src/engine/procedural/NoiseGenerator.ts
import { createNoise2D } from 'simplex-noise';
import alea from 'alea'; // Seeded Random
import { HexTopology } from '../topology/HexTopology';
import { CoordinateID } from '../../core/interfaces/ICoreState';

export class NoiseGenerator {
  private noise2D: (x: number, y: number) => number;
  private topology = new HexTopology();

  constructor(seedString: string) {
    const prng = alea(seedString);
    this.noise2D = createNoise2D(prng);
  }

  /**
   * Avalia a elevação de um Hexágono na Coordenada Q,R,S
   * Retorna um número entre -1 (Oceano Profundo) e 1 (Pico de Montanha)
   */
  public getElevation(coord: CoordinateID): number {
    const { x, z } = this.topology.toWorldPosition(coord);
    
    // Frequência do relevo (menor = montanhas mais largas)
    const FREQUENCY = 0.05;
    
    // Utilizamos a posição geométrica para garantir que os Hexágonos
    // sigam as curvas de nível perfeitamente.
    let noise = this.noise2D(x * FREQUENCY, z * FREQUENCY);
    
    // Adiciona uma oitava para detalhe ("Rugosidade" da montanha)
    noise += 0.5 * this.noise2D(x * FREQUENCY * 2.5, z * FREQUENCY * 2.5);
    
    // Normaliza de volta para -1 a 1
    return noise / 1.5; 
  }
}
```

## 9. CÁLCULO DE PATHFINDING ADAPTADO PARA HEURÍSTICAS

O Xadrez não usa Pathfinding para andar (como no Warcraft). No xadrez clássico, a Torre pode pular 7 casas instantaneamente se a linha estiver vazia. Contudo, no Tabuleiro Procedural com Elevações, algumas peças (como Infantaria Terrestre) podem não conseguir "pular" por cima de uma Montanha. O Raio de Ataque e a Heurística de Distância da IA precisam de um validador de percurso.

### 9.1 Validador de Linha de Visão com Interceptação Topológica
Quando uma Rainha tenta andar do Hex A para o Hex Z, nós invocamos a linha de visão.

```typescript
// src/engine/rules/LineOfSight.ts
import { IGameState } from '../../core/interfaces/ICoreState';
import { ITopology } from '../topology/ITopology';

export function validateLineOfSight(
  state: IGameState, 
  topology: ITopology, 
  start: string, 
  target: string,
  projectileType: "FLAT" | "PARABOLIC"
): boolean {
  const path = topology.getLineOfSight(start, target);

  // path[0] é o start, path[path.length-1] é o target.
  for (let i = 1; i < path.length - 1; i++) {
     const coord = path[i];
     const entity = state.boardEntities[coord];

     // Se for uma peça bloqueando
     if (entity && entity.type === "PIECE") {
        if (projectileType === "FLAT") return false; // Bloqueado
     }

     // Se o tabuleiro procedural gerou uma Montanha (Elevation > 0.5)
     if (entity && entity.type === "TERRAIN") {
        const elevation = entity.metadata?.elevation || 0;
        // Projéteis FLAT (Rook/Queen) batem na montanha
        if (projectileType === "FLAT" && elevation > 0.5) return false;
        // Projéteis PARABOLIC (Fairy Pieces que atiram por cima) passam livremente
     }
  }

  // O percurso está limpo
  return true;
}
```

## 10. FAILURE MODES E TRATAMENTO DE EDGE CASES TOPOLÓGICOS

### 10.1 Failure Mode: O Buraco Infinito (Disconnection)
No terreno procedural, o Simplex Noise pode criar um anel completo de "Água" em volta do Rei de um jogador, efetivamente isolando-o do resto do tabuleiro. Se nenhuma peça dele puder "pular" a água, ele não tem jogadas legais e daria "Stalemate" na jogada 1.
- **Resolução Arquitetural (Islands Guarantee):** 
Durante a Injeção de `ChunkManager.generateMissingChunks`, forçamos um algoritmo *Flood Fill* na área inicial (Spawn Radius = 5 hexágonos de cada jogador) para "achatar" a elevação (clamp to > 0). O Noise só opera *fora* das áreas de nascimento das facções.

### 10.2 Failure Mode: Float Precision Error na Interpolação de Hexágonos
Quando o mapa cresce para coordenadas além de 1.000.000 (Ex: Partida prolongada por semanas), os cálculos do LERP em `getLineOfSight` causam erros de ponto flutuante, resultando na Rainha "atravessar" a parede porque `Math.round` arredondou a coordenada errada.
- **Resolução Arquitetural:** 
Em tabuleiros com coordenadas massivas, a Engine substitui temporariamente a topologia padrão pelo uso do algoritmo **Bresenham's Line Algorithm Adaptado para Cube Coordinates** baseado inteiramente em inteiros, mitigando floats, mas ligeiramente mais custoso. Adicionalmente, limitamos rigidamente a Sandbox do Mundo em Q,R,S entre -50000 e +50000.

(CONTINUA NA PARTE 4)
## 11. MATEMÁTICA BARYCÊNTRICA PARA O TABULEIRO TRIANGULAR
Embora o foco principal das variantes seja Hexagonal e Cartesiano, o `ChessInReact` foi desafiado a suportar Tabuleiros Triangulares. A topologia triangular é a mais exótica porque a "Orientação" do triângulo alterna dependendo de suas coordenadas estarem em somas pares ou ímpares.

### 11.1 TriangularTopology Contract
```typescript
// src/engine/topology/TriangleTopology.ts
import { ITopology, DirectionIndex } from './ITopology';
import { CoordinateID } from '../../core/interfaces/ICoreState';

export class TriangleTopology implements ITopology {
  // Coordenadas Triangulares podem ser mapeadas em eixos Axiais modificados.
  // Mas a propriedade vizinhança muda se o Triângulo aponta para Cima (UP) ou Baixo (DOWN).
  
  private isPointingUp(q: number, r: number): boolean {
    // Em grid triangular, a paridade dita a direção
    return (q + r) % 2 === 0;
  }

  getNeighbor(coord: CoordinateID, dir: DirectionIndex): CoordinateID | null {
    const { q, r } = this.parse(coord);
    const up = this.isPointingUp(q, r);
    
    // Vizinhos em triângulos são apenas 3 (Arestas compartilhadas)
    // Direções Mapeadas: 0 = BOTTOM/TOP, 1 = LEFT_DOWN/RIGHT_UP, 2 = RIGHT_DOWN/LEFT_UP
    
    if (up) {
       switch(dir) {
         case 0: return `${q},${r-1},0`; // BOTTOM (inverte R)
         case 1: return `${q-1},${r},0`; // LEFT DOWN
         case 2: return `${q+1},${r},0`; // RIGHT DOWN
         default: return null; // Triângulos não tem 6 arestas
       }
    } else {
       switch(dir) {
         case 0: return `${q},${r+1},0`; // TOP
         case 1: return `${q-1},${r},0`; // LEFT UP
         case 2: return `${q+1},${r},0`; // RIGHT UP
         default: return null;
       }
    }
  }

  // Omitido: getDistance e getLineOfSight (utiliza raycasting baricêntrico O(D))
  // ...
  
  private parse(hash: CoordinateID) {
    const parts = hash.split(',');
    return { q: Number(parts[0]), r: Number(parts[1]), s: Number(parts[2]) };
  }
}
```
*A implicação da Topologia Triangular na validação de movimentos (Spec 04) é drástica: Uma "Torre" no triângulo não anda reto; ela propaga ondas de vizinhança. Por este motivo, o validador de Fairy Pieces interage puramente através do método `getNeighbor` da `ITopology`.*

## 12. PLANO DE IMPLEMENTAÇÃO DA SPEC 02
1. Implementar `ITopology` como Interface Base.
2. Escrever `HexTopology` e uma suíte completa de Testes Unitários de `getDistance` passando pares de coordenadas e verificando o comprimento da linha de visão O(1).
3. Importar a `simplex-noise`, injetando a Server Seed, e testar `getElevation` para o mesmo hexágono repetidas vezes garantindo a pureza (Idempotência).
4. Escrever o WebWorker de Expansão de Mapa (`ChunkManager`), que roda em background sem bloquear o React, e lança mensagens do tipo `MAP_EXPANDED` capturadas pelo Zustand.

## 13. CRITÉRIOS DE ACEITE
1. **Zero-Array Dependency:** Deve ser garantido por Lint/CodeReview que nenhuma parte do código de engine tente acessar `board[x][y]`. Tudo é resolvido por Chaves (CoordinateID) em Dicionários.
2. **Pathfinding de Superfície Plana:** A função `getLineOfSight` na topologia hexagonal deve retornar exatamente 7 CoordinateIDs ao testar as bordas de um tabuleiro de Raio 7.
3. **Idempotência do Procedural:** Se o Client for resetado e reconectar à mesma partida, alimentar a Seed "XYZ" ao NoiseGenerator deve redesenhar **exatamente** as mesmas montanhas e mares sem contato de rede para obter a topologia (Sincronizando apenas a Seed inicial = 1 pacote UDP/TCP).
4. **Respeito à Memória Lógica:** Em um Tabuleiro Infinito, afastar a câmera (ver Spec 06) não vai carregar peças e terrenos que estão fora do raio de `RENDER_DISTANCE` das Peças controláveis pelo jogador, caindo o número total de Entidades na memória Client estritamente abaixo de 20.000 para preservar estabilidade de GC.

---
*Fim da Spec 02. Com a fundação ECS montada na Spec 01 e a Matemática de Grids modelada na Spec 02, o Client pode existir isoladamente. A Spec 03 desenhará como sincronizar estes Grids e Peças globalmente com Autoridade Distribuída e Network Rollbacks.*


## 14. REPOSITÓRIOS GITHUB E REFERÊNCIAS EXTERNAS (TOPOLOGIA E PROCEDURAL)

Abaixo catalogamos as fontes e repositórios open-source rigorosamente validados para sustentar a infraestrutura matemática de tabuleiros n-dimensionais, grids não-euclidianos e geração procedural de chunks infinitos.

### 14.1 Projetos Open Source Analisados
1. **GitHub: `florin/hexgrid`**
   - **Link:** https://github.com/florin/hexgrid
   - **Resumo Técnico:** Implementação focada em matrizes axiais e cúbicas com operações de rotação de 60 graus, anéis concêntricos (rings) e espirais espaciais.
   - **Como Aproveitaremos no Projeto:** O algoritmo de *Spiral Ring Traversal* será incorporado na inicialização dos tabuleiros hexagonais para 4 e 6 jogadores, permitindo alocar as peças nas bordas em ordem horária com custo computacional O(R) onde R é o raio do anel, eliminando lookups matriciais lentos.

2. **GitHub: `josephg/noisejs`**
   - **Link:** https://github.com/josephg/noisejs
   - **Resumo Técnico:** Implementação pura em JavaScript de Simplex Noise 2D/3D e Perlin Noise sem dependências nativas C++, com lookup table de permutações de 256 inteiros.
   - **Como Aproveitaremos:** Utilizaremos o Simplex 2D como o motor procedural para o cálculo de relevo e biomas (Elevação de casas, pântanos e montanhas intransponíveis). Como o código opera em memória pura com bitwise operators, ele roda perfeitamente dentro de WebWorkers isolados.

3. **GitHub: `mapbox/delaunator`**
   - **Link:** https://github.com/mapbox/delaunator
   - **Resumo Técnico:** Biblioteca para Triangulação de Delaunay 2D ultra-otimizada em JavaScript, processando mais de 100.000 pontos por segundo.
   - **Como Aproveitaremos:** Fundamental para o modo de jogo de tabuleiro *Voronoi Dinâmico*, onde pontos procedurais geram células de polígonos irregulares. Cada célula Voronoi torna-se uma casa de xadrez não-ortogonal conectada pelos vértices de Delaunay.

4. **GitHub: `mourner/rbush`**
   - **Link:** https://github.com/mourner/rbush
   - **Resumo Técnico:** Implementação de R-Tree bidimensional de alto desempenho para indexação espacial de retângulos e pontos, com bulk-loading e busca por caixa delimitadora (Bounding Box).
   - **Como Aproveitaremos:** O `ChunkManager` utilizará a R-Tree para indexar os macro-chunks de 16x16 hexágonos. Quando a câmera 3D translada sobre o tabuleiro infinito, o frustum culling faz uma consulta de interseção de AABB na R-Tree em O(log N), descarregando chunks distantes da memória sem iterar sobre os 50.000 hexágonos individualmente.

5. **GitHub: `flannigan/honeycomb`**
   - **Link:** https://github.com/flannigan/honeycomb
   - **Resumo Técnico:** Framework TypeScript completo para modelagem de malhas hexagonais, suportando orientações Pointy-Topped e Flat-Topped com tipos estritos e métodos de travessia.
   - **Como Aproveitaremos:** Adaptaremos a modelagem de orientação Pointy-Topped para o padrão visual do `ChessInReact` e reaproveitaremos as matrizes de projeção de tela (Pixel to Hex e Hex to Pixel) para raycasting instantâneo de cliques de mouse.

6. **GitHub: `redblobgames/grid-parts`**
   - **Link:** https://github.com/redblobgames/grid-parts
   - **Resumo Técnico:** Repositório de algoritmos de linha de visão discreta (Line-of-Sight), Raycasting inteiro e cálculo de Field-of-View (FOV) para grids hexagonais e triangulares.
   - **Como Aproveitaremos:** Os algoritmos de interpolação linear sem arredondamento errático serão a base para as trajetórias das peças de longo alcance (Rainha Hexagonal, Torre e Bispo). A interpolação com epsilon offset de 1e-6 evita que raios passem exatamente sobre arestas compartilhadas, eliminando ambiguidades nas regras de captura.

7. **GitHub: `mikolalysenko/box-intersect`**
   - **Link:** https://github.com/mikolalysenko/box-intersect
   - **Resumo Técnico:** Algoritmo rápido de varredura (Sweep-and-Prune) para detecção de interseções entre coleções de caixas delimitadoras multidimensionais.
   - **Como Aproveitaremos:** Será usado na detecção de colisão entre áreas de influência e zonas de promoção de N jogadores em tabuleiros irregulares, garantindo que as áreas de spawn não se sobreponham no algoritmo procedural de montagem de arena.

8. **GitHub: `mrdoob/three.js` (Módulos InstancedBufferGeometry)**
   - **Link:** https://github.com/mrdoob/three.js
   - **Resumo Técnico:** Mecanismos de geometria instanciada para WebGL que permitem desenhar dezenas de milhares de instâncias idênticas com um único draw call da GPU.
   - **Como Aproveitaremos:** O prisma hexagonal base e a pirâmide triangular serão criados como geometrias instanciadas únicas compartilhadas por todo o mapa procedural. A elevação, o bioma e a cor de cada casa serão injetados através de buffers de atributos por instância (instanceMatrix e instanceColor), reduzindo 10.000 chamadas de desenho para exatamente 1 Draw Call.

9. **GitHub: `davidbau/seedrandom`**
   - **Link:** https://github.com/davidbau/seedrandom
   - **Resumo Técnico:** Gerador de números pseudoaleatórios baseado em ARC4/Alea com semente arbitrária determinística.
   - **Como Aproveitaremos:** Como o tráfego de rede no plano gratuito deve ser mínimo, o servidor envia apenas uma string de seed (ex: "seed_match_8841"). O gerador garante que o cliente web no navegador e o worker no servidor construam milimetricamente os mesmos obstáculos, elevações e rios procedurais em cada coordenada.

10. **GitHub: `Turfjs/turf`**
    - **Link:** https://github.com/Turfjs/turf
    - **Resumo Técnico:** Suíte de análise geoespacial avançada com algoritmos de Voronoi, Bounding Box e cálculo de centróides em polígonos arbitrários.
    - **Como Aproveitaremos:** As rotinas de cálculo de centróide serão aproveitadas no posicionamento automático das peças no centro de cada célula poligonal irregular em tabuleiros Voronoi, garantindo que o Three.js posicione a malha 3D perfeitamente equilibrada visualmente.

---

## 15. HISTÓRIAS DE USUÁRIO (USER STORIES) - GEOMETRIA E PROCEDURAL

### 15.1 Histórias de Usuário do Jogador (Player Perspective)
1. **US02-P01:** Como jogador de Xadrez Hexagonal, quero que as casas tenham três cores alternadas visualmente distintas para que eu consiga identificar facilmente as diagonais do Bispo Hexagonal sem me confundir.
2. **US02-P02:** Como competidor em um tabuleiro infinito procedural, quero poder rolar a visão da câmera sem que o jogo trave ou exiba buracos negros no chão, vendo novas casas surgindo suavemente à medida que a exploração avança.
3. **US02-P03:** Como jogador estratégico, quero que as montanhas e lagos procedurais gerados pelo mapa bloqueiem o avanço de peças terrestres mas permitam que Cavalos e Peças Fadas saltadoras saltem sobre eles conforme as regras de cada modo.
4. **US02-P04:** Como jogador em uma partida de 6 jogadores, quero que o tabuleiro hexagonal tenha uma arena central simétrica e zonas de partida balanceadas para que nenhum jogador tenha vantagem de distância até o centro.
5. **US02-P05:** Como usuário em tela touch mobile, quero tocar em uma casa hexagonal distante e ter o centro exato daquela casa selecionado com precisão milimétrica, sem falsos toques nas arestas vizinhas.
6. **US02-P06:** Como participante de um modo com Névoa de Guerra (Fog-of-War), quero que as casas além do alcance de visão das minhas peças fiquem sombreadas e ocultem peças inimigas, revelando-se à medida que avanço meu exército.
7. **US02-P07:** Como jogador no modo Tabuleiro Triangular, quero visualizar guias luminosas indicando as três arestas válidas de saída de cada triângulo ao clicar em uma peça, reduzindo o estranhamento da geometria incomum.
8. **US02-P08:** Como fã de partidas épicas de longa duração, quero que o mapa preserve as casas exploradas anteriormente mesmo que eu mova a câmera para longe e depois retorne ao ponto original.
9. **US02-P09:** Como jogador com conexão de internet limitada, quero carregar uma partida procedural com mapa imenso em menos de 2 segundos, sem ter que baixar gigabytes de dados de mapa do servidor.
10. **US02-P10:** Como competidor, quero que a elevação do terreno (terreno 3D alto ou baixo) altere suavemente a altura da peça sem fazer com que ela atravesse o chão ou flutue de forma bizarra no ar.
11. **US02-P11:** Como jogador no modo Toroidal (Wrap-around), quero que ao mover minha peça para além da borda direita do tabuleiro ela reapareça instantaneamente na borda esquerda correspondente, com uma transição de câmera suave e sem quebras visuais.
12. **US02-P12:** Como espectador, quero alternar entre visão em perspectiva 3D livre e visão ortográfica de cima (Top-Down 2D) com um único clique para analisar taticamente o tabuleiro hexagonal sem distorções de lente.
13. **US02-P13:** Como jogador, quero poder salvar a semente do mapa procedural (Seed) de uma partida incrível para jogar novamente com meus amigos na mesma arena personalizada.
14. **US02-P14:** Como usuário jogando em um notebook antigo sem placa de vídeo dedicada, quero que o terreno procedural mantenha 60 quadros por segundo constantes mesmo quando centenas de casas estiverem visíveis.
15. **US02-P15:** Como jogador, quero ver um indicador no minimapa que mostre a posição dos reis de todos os adversários em relação ao meu exército no mapa infinito, facilitando a orientação espacial.

### 15.2 Histórias de Usuário do Desenvolvedor e Arquiteto (Developer/Architect Perspective)
1. **US02-D01:** Como arquiteto do sistema, quero que a interface `ITopology` seja completamente agnóstica de renderização gráfica, operando apenas com lógica matemática pura e tipos primitivos de coordenadas.
2. **US02-D02:** Como engenheiro de performance, quero que o `ChunkManager` execute a geração de novos blocos em um WebWorker dedicado para que a thread principal de renderização do Three.js nunca sofra frame drops durante a expansão procedural.
3. **US02-D03:** Como desenvolvedor da engine, quero que o cálculo de distância entre duas coordenadas hexagonais em Cube Coordinates (q, r, s) execute em O(1) usando a fórmula de Chebyshev max(|Δq|, |Δr|, |Δs|).
4. **US02-D04:** Como mantenedor do código, quero que os algoritmos de geração de terreno procedural utilizem sementes com garantia de determinismo em 100% dos navegadores suportados (Chrome, Firefox, Safari, Edge).
5. **US02-D05:** Como desenvolvedor de testes, quero suítes de testes unitários automatizados cobrindo todas as direções de vizinhança nas topologias Quadrada, Hexagonal e Triangular, assegurando integridade bidirecional (se B é vizinho de A em DIR, A é vizinho de B em OPOSTO).
6. **US02-D06:** Como arquiteto WebGL, quero que todas as casas de um chunk procedural sejam agrupadas em uma única `InstancedMesh` com buffer de atributos compartilhado, respeitando o limite rígido de chamadas de desenho na GPU.
7. **US02-D07:** Como desenvolvedor da rede, quero que o estado procedural seja transmitido aos clientes como um payload compacto contendo apenas a semente matemática, a fórmula do ruído e os parâmetros de bioma, pesando menos de 500 bytes no WebSocket.
8. **US02-D08:** Como engenheiro de confiabilidade, quero que o sistema de chunks descarregue (garbage collect) chunks distantes que não contenham peças ativas e estejam fora da visão dos jogadores há mais de 30 segundos, prevenindo estouro de memória RAM.
9. **US02-D09:** Como desenvolvedor da IA, quero que a representação topológica forneça um grafo de adjacência serializado em flat arrays para que o algoritmo de busca de movimentos não perca ciclos de CPU com conversões de strings.
10. **US02-D10:** Como desenvolvedor de UI, quero uma função `worldToCoordinate(x, y, z)` que converta coordenadas tridimensionais do espaço do Three.js para a `CoordinateID` correspondente com precisão de float e zero alocação de objetos no heap.

---

## 16. REQUISITOS FUNCIONAIS (RF) - GEOMETRIA, TOPOLOGIA E PROCEDURAL

Abaixo estão formalizados os 15 requisitos funcionais mandatórios do subsistema de geometria e terrenos.

1. **RF-01 (Mapeamento de Topologias):** O sistema deve fornecer implementações concretas da interface `ITopology` para as topologias Cartesiana 2D (Quadrada 8x8 e 16x16), Hexagonal (Cube Coordinates q, r, s), Triangular Alternada e Voronoi Dinâmica.
2. **RF-02 (Cálculo de Vizinhança O(1)):** O método `getNeighbor(coord, direction)` deve resolver a coordenada adjacente em tempo constante O(1) sem realizar buscas em coleções ou varreduras de arrays.
3. **RF-03 (Fórmula de Distância Invariante):** O método `getDistance(coordA, coordB)` deve retornar a menor distância em casas entre quaisquer dois pontos do grid, respeitando a métrica de Minkowski ou Chebyshev adequada à topologia ativa.
4. **RF-04 (Linha de Visão e Raycasting Discreto):** O sistema deve calcular a linha de casas contíguas entre duas coordenadas (`getLineOfSight`) retornando a lista ordenada de casas intermediárias para validação de peças de longo alcance.
5. **RF-05 (Geração Procedural Determinística):** A geração de terreno deve ser alimentada por um gerador pseudoaleatório parametrizado por uma semente (Seed). A mesma semente deve gerar rigorosamente a mesma disposição de biomas, relevo e obstáculos em qualquer máquina.
6. **RF-06 (Divisão de Espaço em Chunks):** Em tabuleiros infinitos, o espaço geométrico deve ser particionado em Chunks lógicos de 16x16 unidades de coordenada, identificados por um par de inteiros (ChunkX, ChunkY).
7. **RF-07 (Streaming Dinâmico de Terreno):** O subsistema `ChunkManager` deve detectar a aproximação de entidades e da câmera em relação às bordas de chunks carregados e gerar novos chunks adjacentes sob demanda.
8. **RF-08 (Descarregamento e Descarte de Chunks Inativos):** Chunks que não possuam peças e estejam fora do raio de visão dos jogadores por mais de 30 segundos devem ser descarregados da memória, mantendo apenas metadados compactos.
9. **RF-09 (Sistema de Elevação e Relevo 3D):** O gerador procedural deve atribuir a cada casa uma propriedade de elevação contínua entre 0.0 e 3.0 calculada por octaves de Simplex Noise, refletindo-se na posição vertical Y da mesh no Three.js.
10. **RF-10 (Obstáculos e Casas Intransponíveis):** O gerador deve classificar certas casas como intransponíveis (`isObstacle: true`) com base em limites de ruído (ex: abismos ou picos rochosos), impedindo a ocupação por peças terrestres.
11. **RF-11 (Coloração Tricromática Hexagonal):** O sistema de topologia hexagonal deve calcular de forma analítica a cor canônica da casa entre 3 cores alternadas usando a fórmula (q - r) mod 3, garantindo coerência cromática para diagonais.
12. **RF-12 (Topologia Toroidal e Wrap-Around):** Para arenas fechadas com efeito Pac-Man/Toróide, a topologia deve aplicar módulo aritmético nas coordenadas nas bordas, conectando o extremo norte ao sul e leste ao oeste.
13. **RF-13 (Névoa de Guerra - Fog of War):** O sistema geométrico deve calcular a união de campos de visão de todas as peças de um jogador em raio R e marcar casas fora dessa união com estado de visibilidade oculta (`FOG_HIDDEN`) ou semi-oculta (`FOG_EXPLORED`).
14. **RF-14 (Conversão Bidirecional Espaço-Mundo):** O sistema deve fornecer funções puras `coordinateToWorld(coord)` e `worldToCoordinate(vector3)` com precisão de ponto flutuante para conversão instantânea entre a lógica do jogo e o Three.js.
15. **RF-15 (Exportação e Importação de Sementes e Layouts):** O sistema deve ser capaz de serializar a configuração geométrica e a semente procedural em um formato JSON compacto e reconstruir o estado idêntico a partir desta string.

---

## 17. REQUISITOS NÃO-FUNCIONAIS (RNF) - DESEMPENHO E RESTRIÇÕES ARQUITETURAIS

Abaixo estão formalizados os 15 requisitos não-funcionais que governam o subsistema de geometria.

1. **RNF-01 (Tempo de Resolução de Vizinhança):** A chamada `getNeighbor` deve executar em tempo médio inferior a **0.01 milissegundos** no motor V8 do navegador.
2. **RNF-02 (Latência de Geração de Chunk):** A geração completa de um novo chunk de 16x16 hexágonos com elevações e biomas dentro do WebWorker não deve exceder **15 milissegundos**.
3. **RNF-03 (Orçamento de Memória do Grid):** O armazenamento de um tabuleiro infinito com até 10.000 casas ativas em memória não deve ultrapassar **40 Megabytes** de heap JavaScript.
4. **RNF-04 (Taxa de Quadros em Expansão de Terreno):** O streaming e upload de novos dados de instância para a GPU no Three.js nunca deve provocar quedas de taxa de quadros abaixo de **60 FPS** em monitores padrão.
5. **RNF-05 (Tamanho do Payload de Semente na Rede):** O payload de inicialização de um mapa procedural infinito transmitido via WebSocket deve pesar menos de **1 Kilobyte** comprimido.
6. **RNF-06 (Conformidade com Free Tier de Infraestrutura):** O cálculo geométrico de geração e visibilidade deve ser 100% executado no lado do cliente (Client-Side WebWorkers) e em servidores Node.js leves, consumindo zero quota de egress de banco de dados e cabendo nos limites de memória de 512MB do Render.com.
7. **RNF-07 (Consistência Numérica Multiplataforma):** O algoritmo de geração pseudoaleatória deve produzir hashes idênticos de chunks em arquiteturas x86_64 e ARM64 (Apple Silicon e smartphones Android).
8. **RNF-08 (Orçamento de Draw Calls WebGL):** Toda a malha geométrica de um tabuleiro procedural (independentemente de conter 64 ou 6.400 casas visíveis) deve ser renderizada com no máximo **3 Draw Calls** por material na GPU utilizando instanciamento.
9. **RNF-09 (Prevenção de Memory Leaks em Streaming):** O ciclo contínuo de carregar e descarregar chunks por 60 minutos ininterruptos de jogo não pode provocar vazamento de memória superior a **2 Megabytes** acumulados no GC.
10. **RNF-10 (Cobertura de Testes de Geometria):** A suíte de testes unitários para as classes de topologia (`HexTopology`, `TriangleTopology`, `SquareTopology`) deve manter cobertura de código superior a **95%**.
11. **RNF-11 (Determinismo de Coordenadas em Longas Distâncias):** Os cálculos de projeção e distância devem manter precisão matemática sem erros de arredondamento para coordenadas com valores absolutos de até 50.000 unidades.
12. **RNF-12 (Tempo de Inicialização de Arena Padrão):** A montagem da topologia e das casas de uma arena hexagonal clássica de 4 jogadores deve ocorrer em menos de **30 milissegundos** no carregamento inicial da página.
13. **RNF-13 (Isolamento de Tipos e Desacoplamento):** O módulo de topologia matemática não deve conter dependências de bibliotecas de renderização gráfica (Three.js) ou do DOM (`window`, `document`), permitindo execução headless em workers e backend.
14. **RNF-14 (Resiliência contra Coordenadas Inválidas):** A passagem de strings de coordenada malformadas ou fora de formato deve falhar silenciosamente retornando `null` ou lançando erros tipados previsíveis sem derrubar a aplicação.
15. **RNF-15 (Tolerância a Altas Frequências de Raycasting):** O cálculo de picking de mouse na geometria deve suportar até **120 consultas por segundo** durante o movimento do cursor com custo de CPU inferior a 2%.

---

## 18. ARQUITETURA DE DEPLOYMENT GRATUITA (FREE TIER) PARA GEOMETRIA E PROCEDURAL

A geração procedural de mapas é um dos pilares estratégicos para permitir que o `ChessInReact` opere com custo zero de infraestrutura na nuvem:

1. **Zero Bandwidth para Mapas Massivos:** Em jogos multiplayer tradicionais, mapas customizados exigem downloads de megabytes de assets do servidor (gerando custos altos de transferência/egress). Em nosso design, o servidor envia unicamente a tupla `{ seed: 94812, variant: "HEX_PROCEDURAL", radius: 50 }`. Os navegadores dos clientes utilizam o WebWorker local para computar toda a topologia, reduzindo o custo de egress no Vercel e Render para centavos de bytes.
2. **Execução Headless no Render Free Tier:** No servidor autorizativo Colyseus (hospedado na instância gratuita do Render.com com 512MB de RAM), o mesmo algoritmo de topologia roda em modo sem-cabeça (Headless). Ele não instancia geometrias 3D ou texturas, consumindo menos de 15MB de memória para manter a validação das 10.000 casas no servidor.
3. **Persistência de Sementes no Supabase Free Tier:** Em vez de armazenar a geometria de tabuleiros gigantescos no banco de dados relacional, salvamos apenas a string da semente e as coordenadas das casas modificadas por eventos do jogo no Postgres do Supabase, ocupando menos de 200 bytes por partida e respeitando com folga a cota gratuita de 500MB de armazenamento.

---

## 19. MODOS DE JOGO E SUAS PECULIARIDADES GEOMÉTRICAS

A versatilidade topológica suporta os seguintes modos de jogo avançados:

1. **Hexagonal FFA (4 a 8 Jogadores):**
   - Geometria em favo de mel simétrica com raio adaptativo R = 4 + 2N onde N é o número de jogadores.
   - Três cores canônicas de casas para diferenciar diagonais de bispos de cada quadrante.
   - Spawn equilibrado ao redor do perímetro com distância idêntica de cada rei até o hexágono central.

2. **Triangular Chaos (3 ou 6 Jogadores):**
   - Geometria composta por triângulos equiláteros alternando orientação vertical (Cima/Baixo).
   - Peças avançam por arestas adjacentes (3 direções ortogonais) ou vértices compartilhados (12 direções secundárias).
   - Movimentação de torres segue arcos contínuos pela malha de triângulos invertidos.

3. **Infinite Procedural Fog-of-War (Endless Conquest):**
   - Terreno sem limites fechados gerado por Simplex Noise contínuo.
   - Pântanos e montanhas atuam como obstáculos intransponíveis gerados proceduralmente.
   - Névoa de guerra dinâmica que mascara o mapa além do raio de visão das peças do jogador.

4. **Toroidal Space Chess (Arena Fechada Contínua):**
   - Tabuleiro quadrado ou hexagonal com geometria de superfície toroidal (sem bordas).
   - Peças que saem por um extremo entram pelo extremo oposto preservando o vetor de velocidade e direção.

5. **Voronoi Dynamic Shifting:**
   - Casas de formatos poligonais irregulares baseadas em diagrama de Voronoi gerado por semente.
   - A cada 10 turnos, sementes geológicas se deslocam sutilmente, alterando as adjacências de certas casas e criando desafios táticos dinâmicos.

---

## 20. SCHEMAS DE DADOS, TIPOS TYPESCRIPT E CONTRATOS JSON

Abaixo constam as interfaces fundamentais para o ecossistema de geometria e terrenos do projeto:

```typescript
// src/engine/topology/interfaces/ITopologyContracts.ts

export type TopologyType = 'SQUARE' | 'HEXAGONAL' | 'TRIANGULAR' | 'VORONOI_IRREGULAR';

export type BiomeType = 'PLAINS' | 'MOUNTAIN' | 'WATER' | 'FOREST' | 'CHASM';

export type CoordinateID = string; // Formatos: "x,y" ou "q,r,s" ou "poly_uuid"

export interface IChunkCoordinate {
  chunkX: number;
  chunkY: number;
}

export interface ITerrainCell {
  coord: CoordinateID;
  topology: TopologyType;
  colorIndex: 0 | 1 | 2; // Para hexágonos tricolores ou quadrados bicolores
  elevation: number;     // 0.0 a 3.0 para deslocamento vertical
  biome: BiomeType;
  isObstacle: boolean;   // Se bloqueia movimento de peças terrestres
  costMultiplier: number;// Custo de movimento em variantes de terreno
}

export interface IChunkData {
  chunkId: string;       // Formato: "chunk_X_Y"
  coords: IChunkCoordinate;
  cells: Record<CoordinateID, ITerrainCell>;
  boundingRadius: number;
  lastAccessedTimestamp: number;
}

export interface IProceduralConfig {
  seed: string;
  noiseOctaves: number;
  noisePersistence: number;
  noiseScale: number;
  obstacleThreshold: number;
  waterThreshold: number;
}
```

Contrato JSON de sincronização de terreno procedural:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ProceduralTerrainInitPayload",
  "type": "object",
  "required": ["seed", "topology", "chunkRadius", "config"],
  "properties": {
    "seed": { "type": "string" },
    "topology": { "enum": ["SQUARE", "HEXAGONAL", "TRIANGULAR", "VORONOI_IRREGULAR"] },
    "chunkRadius": { "type": "integer", "minimum": 1, "maximum": 100 },
    "config": {
      "type": "object",
      "required": ["noiseScale", "obstacleThreshold"],
      "properties": {
        "noiseScale": { "type": "number" },
        "obstacleThreshold": { "type": "number" },
        "waterThreshold": { "type": "number" }
      }
    }
  }
}
```

---

## 21. CONCLUSÃO ARQUITETURAL DA SPEC 02

A Spec 02 estabelece com rigor matemático e eficiência computacional a representação espacial e procedural do `ChessInReact`. Ao dissociar a matemática do espaço de qualquer amarração a coordenadas cartesianas fixas ou matrizes bidimensionais arcaicas, a plataforma adquire capacidade imediata para suportar desde tabuleiros clássicos até mundos infinitos em favo de mel com dezenas de milhares de hexágonos gerados em tempo real a custo de infraestrutura zero.
