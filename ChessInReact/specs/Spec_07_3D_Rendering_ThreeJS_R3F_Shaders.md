# Spec 07: Performance WebGL, Rendering Optimization e Memory Budgets (Parte 1/4)

## A. OBRIGAÇÃO DE DENSIDADE E ABORDAGEM
Em jogos 2D normais, você pode ter centenas de divs sem afetar drasticamente o browser. No Three.js/WebGL, se você criar um componente `<mesh>` para cada uma das 500 peças num xadrez 8-Player, a placa de vídeo receberá 500 *Draw Calls* por frame. A 60 FPS, isso são 30.000 chamadas ao driver de vídeo por segundo, o que gargalará a CPU e travará o navegador. O `ChessInReact` abandona as meshes individuais por uma arquitetura de Renderização Orientada a Dados via **InstancedMesh** e texturas ultra-comprimidas.

## 1. OBJETIVO DO SUBSISTEMA DE PERFORMANCE
Permitir que o xadrez Hexagonal de 8 Jogadores, num Tabuleiro Procedural de Raio 20 (Totalizando mais de 1.200 Entidades Visuais), seja renderizado em um celular comum sem aquecer excessivamente o aparelho ou dropar frames, atingindo $<16.6ms$ de tempo total de frame.

## 2. ESCOPO
**PERTENCE A ESTA SPEC:**
- Implementação massiva de `THREE.InstancedMesh`.
- Otimização de Geometry/Material sharing.
- Compressão de Assets (KTX2, Basis, Draco).
- Frustum Culling e LOD (Level of Detail).
- OffscreenCanvas pre-rendering.

**NÃO PERTENCE:**
- Otimização do Worker de Inteligência Artificial (Ver Spec 05).
- Reconciliação Transient do Zustand (Ver Spec 01).

## 3. REQUISITOS E CONSTRAINTS
### 3.1 Constraints de Draw Call
- **Constraint:** Em mobile WebGL, ultrapassar 100 Draw Calls simultâneas degrada a performance rapidamente. Ter 1 tabuleiro + 128 peças separadas já excede esse limite se cada material e geometria for desenhado individualmente.
- **Resolução Arquitetural:** O jogo terá uma base absoluta de $< 5$ Draw Calls para Peças. Faremos isso através de `InstancedMesh`. Todos os "Peões Brancos" são desenhados pela placa de vídeo num único comando matemático (Batching). O R3F apenas injeta a Matrix4 (Posição, Rotação e Escala) de cada instância.

### 3.2 Constraints de Memória de Textura (VRAM)
- **Constraint:** Carregar texturas de PBR (Physically Based Rendering) em PNG/JPG a 4K consome mais de 250MB de VRAM descomprimida. Celulares têm limite agressivo, e o navegador craschará a aba dizendo "Aw Snap" se esgotar.
- **Resolução Arquitetural:** Uso exclusivo do pipeline KTX2/Basis Universal. A textura fica comprimida *dentro da VRAM da Placa de Vídeo*, ocupando apenas 25MB em vez de 250MB, e o carregamento do disco via Fetch é quase instantâneo.

## 4. PESQUISA MATRIX: FONTES EXTERNAS E GITHUBS VALIDADOS

### Fonte 1: "InstancedMesh in Three.js" (MrDoob / WebGL Fundamentals)
- **URL:** https://threejs.org/docs/#api/en/objects/InstancedMesh
- **Problema Resolvido:** Como remover milhares de `mesh` nodes pesados da Scene.
- **Decisão:** A arquitetura abandona mapeamento 1-para-1 entre o Estado e a Malha. O componente de Render pede ao Zustand: "Quantos Peões Brancos existem?", e aloca um buffer de instâncias `THREE.InstancedMesh(geometry, material, Count)`.

### Fonte 2: "Basis Universal GPU Texture Compression" (Google Open Source)
- **URL:** https://github.com/BinomialLLC/basis_universal
- **Problema Resolvido:** Compressão PNG degrada visual ou incha a GPU quando decodificada.
- **Decisão:** O pipeline de build do frontend Vite usará um hook para converter qualquer textura de mapa (Roughness, Normal, Color) em arquivos `.ktx2` importados em tempo de execução via `KTX2Loader`.

### Fonte 3: "React Three Fiber: Performance Pitfalls" (Pmndrs Docs)
- **URL:** https://docs.pmnd.rs/react-three-fiber/advanced/pitfalls
- **Problema Resolvido:** Garbage Collection (GC) pressure criado no loop de renderização.
- **Decisão:** O `ChessInReact` é proibido de alocar memoria no `useFrame`. `new THREE.Vector3()` dentro de loops renderizam milhares de lixos de heap/sec. Usaremos globais reutilizáveis `const _tempVector = new THREE.Vector3()`.

### Fonte 4: "Level of Detail (LOD) and Impostors"
- **Problema Resolvido:** Renderizar modelos de Fadas 3D com 20k polígonos cada numa câmera afastada no Tabuleiro Infinito gasta processamento para triângulos menores que um pixel.
- **Decisão:** `LOD`. Peças longe da câmera terão suas malhas rebaixadas para cilindros primitivos texturizados.

### Fonte 5: "GPU Picking via Framebuffer"
- **URL:** https://webglfundamentals.org/webgl/lessons/webgl-picking.html
- **Problema Resolvido:** Se temos 1 InstancedMesh para 1.000 hexágonos, como o Raycaster sabe em QUAL hexágono exatamente o mouse clicou, visto que o Raycaster nativo só reporta a Malha?
- **Decisão Arquitetural:** Three.js implementa Intersection Data no `InstancedMesh`. O retorno de `intersectObject` fornece o `instanceId`. Mapearemos esse ID diretamente para a `CoordinateID` do Zustand num array linear $O(1)$.

### GitHub 1: pmndrs/gltfjsx
- **Repositório:** https://github.com/pmndrs/gltfjsx
- **Decisão influenciada:** Usar esta CLI tool para transformar arquivos `.gltf` estáticos em Componentes React puros instanciados, permitindo compartilhamento de vértices (Draco compression automatizado).

### GitHub 2: mrdoob/three.js/examples
- **Estrutura Estudada:** `webgl_instancing_dynamic.html`.
- **Decisão influenciada:** A atualização da Matrix no InstancedMesh exige avisar a placa de vídeo com `instanceMatrix.needsUpdate = true`. Só faremos essa flag ficar *true* na exata peça que se moveu no turno, evitando upload de buffer pesado do array inteiro todo frame.

## 5. ESTRUTURA REAL DE DIRETÓRIOS (PERFORMANCE E RENDERING)

```text
src/
  rendering/
    assets/
      AssetLoader.ts          // KTX2 / Draco Loader unificado
    mesh/
      InstancedBoard.tsx      // A Malha que desenha infinitos hexágonos
      InstancedPieces.tsx     // Malhas para cada tipo de variante de peça
    optimization/
      MathCaches.ts           // Singletons Vector3, Euler e Matrix4 para evitar GC
      LODManager.ts           // Lógica da distância da câmera
```

(CONTINUA NA PARTE 2)
## 6. O CONTRATO DO MATH CACHE (PREVENÇÃO DE GC)

Para evitar vazamentos de memória (Memory Leaks) e a chamada do Garbage Collector, criamos um singleton matemático. No React normal as variáveis nascem e morrem no render, no WebGL elas são persistentes.

```typescript
// src/rendering/optimization/MathCaches.ts
import * as THREE from 'three';

/**
 * Reservatório único de vetores e matrizes matemáticas.
 * QUALQUER operação em useFrame DEVE utilizar estes objetos mutáveis e não `new Vector3()`.
 */
export const Caches = {
   vec3A: new THREE.Vector3(),
   vec3B: new THREE.Vector3(),
   mat4A: new THREE.Matrix4(),
   mat4B: new THREE.Matrix4(),
   quaternionA: new THREE.Quaternion(),
   colorA: new THREE.Color()
};
```

## 7. ARQUITETURA DO INSTANCED MESH PARA O TABULEIRO

Em vez de renderizar as casas do mapa proceduralmente com componentes React, mapeamos o dicionário O(1) do Zustand (Spec 01) para um Buffer nativo de instâncias WebGL. O `InstancedMesh` precisa de um Count estático no construtor.

### 7.1 Dynamic Buffer Resizing
O mapa infinito cresce sob demanda (Spec 02). Se definirmos `count={64}`, não teremos espaço quando for para 65.
Solução: Alocação com Overhead Otimista. Alocamos um Buffer 2x maior que o necessário, mas instruímos a GPU a desenhar apenas a quantia atual.

```tsx
// src/rendering/mesh/InstancedBoard.tsx
import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../../core/store/gameStore';
import { HexTopology } from '../../engine/topology/HexTopology';
import { Caches } from '../optimization/MathCaches';

const topology = new HexTopology();

export function InstancedBoard() {
   const meshRef = useRef<THREE.InstancedMesh>(null);
   
   // Subscribe O(1) ignorando peças. O R3F só re-renderiza SE o tamanho do mapa mudar.
   const terrainKeys = useGameStore(s => 
      Object.keys(s.boardEntities).filter(k => s.boardEntities[k].type === "TERRAIN")
   );

   const MAX_COUNT = useMemo(() => Math.max(terrainKeys.length * 1.5, 512), [terrainKeys.length]);

   useEffect(() => {
       if (!meshRef.current) return;
       const mesh = meshRef.current;

       // 1. Dita à placa de vídeo o limite exato do Draw Call deste frame.
       mesh.count = terrainKeys.length;

       // 2. Popula a memória da placa com posições fixas (O(N) executado RARO, só quando expande)
       for (let i = 0; i < terrainKeys.length; i++) {
           const coord = terrainKeys[i];
           const worldPos = topology.toWorldPosition(coord);
           
           // Evita Garbage Collection
           Caches.vec3A.set(worldPos.x, worldPos.y, worldPos.z);
           Caches.mat4A.makeTranslation(Caches.vec3A);
           
           mesh.setMatrixAt(i, Caches.mat4A);
       }
       
       // Sobe o buffer da RAM pra VRAM
       mesh.instanceMatrix.needsUpdate = true;
       
   }, [terrainKeys]); // React Dependency Array focado

   return (
       // Uma única chamada de Render da placa de vídeo para TODO O MAPA.
       <instancedMesh ref={meshRef} args={[null as any, null as any, MAX_COUNT]}>
           <cylinderGeometry args={[1, 1, 0.2, 6]} /> {/* Forma de Hexágono leve */}
           <meshStandardMaterial color="#88aa55" />
       </instancedMesh>
   );
}
```

### 7.2 Instanced Selection (O(1) Mapping)
Para que a Peça se destaque quando clicada sem re-renderizar, a InstancedMesh recebe cores no buffer.
Porém, quando o usuário clica com o Raycaster, a GPU devolve um `instanceId` numérico (Ex: 432). O Zustand não sabe quem é 432, ele conhece `"q,r,s"`.
A solução é um Dicionário de Correlação Isolado injetado em background.

```typescript
// Paralelamente à injeção das posições no loop acima:
const indexToCoord = new Array(MAX_COUNT);
const coordToIndex = new Map<string, number>();

// ... no loop ...
indexToCoord[i] = coord;
coordToIndex.set(coord, i);

// No evento R3F:
const handlePointerDown = (event) => {
   const clickedCoord = indexToCoord[event.instanceId];
   useGameStore.getState().uiState.setSelectedHouse(clickedCoord);
}
```

(CONTINUA NA PARTE 3)
## 8. COMPRESSÃO DE ATIVOS E KTX2 LOADER
Num jogo modular onde o jogador pode inserir "Skins" personalizadas de peças (Aquele modelo OBJ que baixou da internet), o uso de texturas 4K padrão é proibitivo em React.

A biblioteca `@react-three/drei` provê o `useGLTF`. Por padrão, se a textura for PNG, ela sobe para a RAM, é decodificada na CPU, e sobe pra VRAM expandida.
Usaremos Basis Universal (KTX2) que sofre `GPU Upload` em milissegundos mantendo formato fechado.

### 8.1 AssetLoader Singleton
```typescript
// src/rendering/assets/AssetLoader.ts
import { KTX2Loader } from 'three-stdlib';
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';

// Singleton forçado fora do escopo React
let ktx2Loader: KTX2Loader | null = null;

export function useCompressedGLTF(url: string) {
    const { gl } = useThree();
    
    if (!ktx2Loader) {
        // Inicializa o Transcoder do WebAssembly Basis
        ktx2Loader = new KTX2Loader()
            .setTranscoderPath('/basis/') // Diretório public/ com arquivos WASM
            .detectSupport(gl);           // Suporte detecta ASTC, ETC, DXT dependendo do hardware
    }
    
    // Injeta o loader na biblioteca do DREI
    useGLTF.preload(url);
    const gltf = useGLTF(url, undefined, undefined, (loader) => {
        loader.setKTX2Loader(ktx2Loader);
    });
    
    return gltf;
}
```

## 9. CULLING AVANÇADO (LOD E VIEW FRUSTUM)

Num tabuleiro infinito, a câmera não vê o hexágono `-1542, 54, 1488`. O `InstancedMesh` é desenhado como uma entidade única. Se **um** peão dentre 500 estiver na visão da câmera, a GPU calculará todos os outros 499 (embora eles sumam no clipping automático da rasterização).

### 9.1 Frustum Omission na Lógica O(1)
Graças à variável `visibilityWindow` definida na arquitetura de Estados (Spec 01), o R3F pode simplesmente omitir a Matrix da instância:

```typescript
// src/rendering/optimization/LODManager.ts
export function shouldRenderInstance(coord: string, visibilityWindow: any): boolean {
    const { q, r } = parseCoord(coord);
    // Early escape: Fora da Janela da Câmera calculada na Main Thread
    if (q < visibilityWindow.qMin || q > visibilityWindow.qMax) return false;
    if (r < visibilityWindow.rMin || r > visibilityWindow.rMax) return false;
    return true;
}

// ... No loop do InstancedMesh.tsx da Seção 7 ...
if (shouldRenderInstance(coord, uiState.visibilityWindow)) {
    mesh.setMatrixAt(visibleCount, Caches.mat4A);
    visibleCount++;
}
mesh.count = visibleCount; // Dinamicamente corta a placa de vídeo das coisas invisíveis!
```
*Note que re-alinhamos o índice para cortar os "buracos" não-renderizáveis, reduzindo a carga real do vertex shader na GPU em >80%.*

## 10. FAILURE MODES NA ENGINE GRÁFICA

### 10.1 Failure Mode: O Gargalo de Transferência CPU -> GPU (Bandwidth)
- **Cenário:** A animação de `useFrame` está fazendo o Peão "voar" lentamente durante um turno (Lerp de transição - Spec 01). Para animar esse 1 Peão, o desenvolvedor chama `mesh.instanceMatrix.needsUpdate = true`. O Three.js recopia todo o Float32Array de $1.000$ peças pela ponte PCIe até a GPU 60 vezes por segundo, derrubando o jogo para 15 FPS.
- **Resolução Arquitetural (Partial Buffer SubData):** 
O WebGL 2.0 (Padrão no `gl` do R3F moderno) permite Partial Updates de buffers. Não atualizaremos o array inteiro. Se o Dragging Piece moveu, interceptamos o WebGLRenderer via hook nativo e injetamos um `gl.bufferSubData(...)` passando SOMENTE os $16$ floats da matriz exata que mudou. Essa é a técnica mais poderosa do projeto e distingue um React Dev comum de um Graphics Engineer.

### 10.2 Failure Mode: Crash Silencioso em Celulares Low-End
- **Cenário:** O KTX2 Transcoder WebAssembly não suporta a GPU velha Mali-400 do celular do usuário.
- **Resolução Arquitetural:** O `AssetLoader` encapsula um bloco `try/catch` na inicialização do Hardware Detection. Se o `.detectSupport(gl)` falhar ou retornar zero, ele descarta a rota otimizada e avisa ao Zustand para invocar o Fallback Loader (PNG primitivos, com as fadas bloqueadas por "Placeholder Cylinder Meshes" genéricos de baixa fidelidade geométrica) para assegurar que a UX não trave na barra de Load.

(CONTINUA NA PARTE 4)
## 11. PLANO DE IMPLEMENTAÇÃO DA SPEC 07
1. Construir o Singleton `MathCaches.ts` definindo as variáveis alocadas para todo o escopo matemático de interseções. O Linter do projeto rejeitará pull requests contendo `new Vector3()` dentro da pasta `/rendering/`.
2. Refatorar o `<ChessEnvironment />` da Spec 01 e remover as iterações clássicas de componentes por casa. Envelopar `InstancedBoard` num provider estático O(1).
3. Configurar a VITE Config Pipeline para interceptar o servidor de desenvolvimento, instalando binários da Google (`basis_universal`) para assistir e compilar on-the-fly os SVGs/PNGs dos tabuleiros no formato KTX2.
4. Programar a lógica de GPU Culling. Definir a Janela Topológica ligada ao `useFrame` que dita quais Instâncias perdem a matriz de translação e "somem".
5. Teste Profiler: Acionar 20 InstancedMeshes independentes (Variantes de Fadas), injetar 5.000 peças ativas. O Frame Time deve se fixar em `10ms` até em devices midrange.

## 12. CRITÉRIOS DE ACEITE
1. **Contagem Rígida de Draw Calls:** Abrir o "Spector.js" ou DevTools Graphics Panel. Confirmar que na renderização final o WebGL emite `< 20 draw calls` e NÃO centenas. (Isso prova a arquitetura Instanced).
2. **Zero Garbage GC Spikes:** Abrir o Chrome DevTools Profiler, marcar 60 segundos rodando simulações Otimistas (Arrastar várias peças seguidas cancelando). A linha de Memória Heap da V8 deve ser PLANA, sem o infame padrão "Sawtooth" (Dentes de serra) que denuncia criação em loop e expurgos caros.
3. **Texture RAM Constraint:** Inspecionar os buffers de GPU memory (via Firefox DevTools ou R3F Perf). Independentemente de haver 5 texturas 4K aplicadas para materiais exóticos, a VRAM não pode exceder 50MB, garantindo o funcionamento limpo da biblioteca Basis Universal (KTX2).

---
*Fim da Spec 07. Com o motor ECS da Spec 01 escalando e a UI desenhando O(1) de modo a poupar bateria mobile, o código do jogo em si ("O Tabuleiro") está maduro. O foco agora deve virar para o Meta-Jogo fora da aba ativa. A Spec 08 detalhará a Infraestrutura do Matchmaker HTTP (Next.js/Express), Pareamento de Jogadores (Redis) e Lobbies.*


## 13. REPOSITÓRIOS GITHUB E REFERÊNCIAS EXTERNAS (RENDERIZAÇÃO WEBGL, R3F E SHADERS)

Abaixo documentamos as fontes de computação gráfica para navegadores, motores de renderização e ferramentas de compressão de assets analisadas para a engenharia visual de alto desempenho do `ChessInReact`.

### 13.1 Projetos Open Source Analisados
1. **GitHub: `mrdoob/three.js`**
   - **Link:** https://github.com/mrdoob/three.js
   - **Resumo Técnico:** A biblioteca de computação gráfica 3D padrão para navegadores, fornecendo classes para `InstancedMesh`, `BufferGeometry`, compilação de shaders GLSL e pipeline WebGL 2.0.
   - **Como Aproveitaremos no Projeto:** Toda a cena visual é alimentada pelo Three.js. Aplicamos o hook `onBeforeCompile` nos materiais de peças para injetar código GLSL customizado diretamente no shader nativo de PBR (MeshStandardMaterial), permitindo adicionar reflexos, ondulações de cor e efeitos de iluminação holográfica por instância sem duplicar materiais na memória da GPU.

2. **GitHub: `pmndrs/r3f-perf`**
   - **Link:** https://github.com/pmndrs/r3f-perf
   - **Resumo Técnico:** Ferramenta de auditoria de performance para React Three Fiber com medição em tempo real de FPS, contagem de draw calls da GPU, geometrias alocadas, texturas em VRAM e tempo de frame em milissegundos.
   - **Como Aproveitaremos:** Integrado no ambiente de desenvolvimento com atalho de teclado (Ctrl + Shift + P) para validação imediata do orçamento de renderização: garantindo que em nenhuma variante a contagem de draw calls exceda 20 e que o tempo de frame permaneça abaixo de 16.6ms.

3. **GitHub: `BinomialLLC/basis_universal`**
   - **Link:** https://github.com/BinomialLLC/basis_universal
   - **Resumo Técnico:** Padrão aberto da Google/Binomial para compressão de texturas de GPU no formato universal Basis/KTX2 com transcodificação sob demanda para formatos de hardware (ASTC, BC7, ETC1).
   - **Como Aproveitaremos:** Todas as texturas PBR de mármore, madeira nobre, metal polido e relevo de terrenos procedurais são convertidas para arquivos `.ktx2`. As texturas permanecem comprimidas na memória VRAM da GPU, ocupando apenas 10% a 15% da memória exigida por imagens PNG descomprimidas tradicionais.

4. **GitHub: `google/draco`**
   - **Link:** https://github.com/google/draco
   - **Resumo Técnico:** Biblioteca de compressão de geometria 3D (vértices, normais, coordenadas UV e índices) para transmissão ultrarrápida de malhas pela internet.
   - **Como Aproveitaremos:** Modelos 3D de peças clássicas e peças fadas customizadas são comprimidos com Draco em nível de quantização 14 bits. Um modelo de Dama com 8.000 polígonos que originalmente pesaria 4MB é reduzido para menos de 180KB, baixando instantaneamente até em conexões 3G instáveis.

5. **GitHub: `donmccurdy/glTF-Transform`**
   - **Link:** https://github.com/donmccurdy/glTF-Transform
   - **Resumo Técnico:** Suíte de ferramentas CLI e SDK em TypeScript para otimização de arquivos glTF/GLB, incluindo unificação de materiais, desduplicação de vértices (Weld) e quantização geométrica.
   - **Como Aproveitaremos:** Criamos scripts automatizados no build do projeto que processam todos os modelos 3D antes do deploy, eliminando polígonos degenerados e gerando malhas normalizadas e otimizadas para carregamento web.

6. **GitHub: `pmndrs/postprocessing`**
   - **Link:** https://github.com/pmndrs/postprocessing
   - **Resumo Técnico:** Mecanismo avançado de pós-processamento para Three.js com fusão de passes (EffectPass), executando múltiplos filtros de imagem em uma única passada de fragment shader na GPU.
   - **Como Aproveitaremos:** Implementamos efeitos pós-gráficos de classe cinematográfica: Bloom suave nas peças sob xeque, Vignette delicada nas bordas da tela e Tone Mapping ACESFilmic para fidelidade cromática fotorrealista com custo de apenas 1 Draw Call adicional no render pipeline.

7. **GitHub: `dmnsgn/glsl-noise`**
   - **Link:** https://github.com/dmnsgn/glsl-noise
   - **Resumo Técnico:** Coleção de shaders GLSL puros de ruído procedural (Simplex 2D/3D, Perlin Noise, Worley/Cellular).
   - **Como Aproveitaremos:** Os terrenos procedurais utilizam esses shaders no Vertex Shader do WebGL para gerar deformações sutis de relevo, brilho de água em lagos e oscilações de grama em tempo real sem sobrecarregar a CPU com cálculos de malha.

8. **GitHub: `spite/Spector.js`**
   - **Link:** https://github.com/BabylonJS/Spector.js
   - **Resumo Técnico:** Extensão e ferramenta de depuração WebGL para captura e análise detalhada de comandos gráficos enviados à placa de vídeo quadro a quadro.
   - **Como Aproveitaremos:** Utilizada nos testes de homologação de desempenho para inspecionar o pipeline gráfico e comprovar a inexistência de vazamentos de buffers e trocas desnecessárias de materiais no Three.js.

9. **GitHub: `CesiumGS/gltf-pipeline`**
   - **Link:** https://github.com/CesiumGS/gltf-pipeline
   - **Resumo Técnico:** Utilitário para conversão, empacotamento e compressão de assets glTF em arquivos `.glb` binários autocontidos.
   - **Como Aproveitaremos:** Garante que todos os assets visuais do jogo sejam consolidados em arquivos `.glb` atômicos com texturas embutidas, facilitando o cache em CDN e a entrega rápida.

10. **GitHub: `pmndrs/racing-game` (Exemplo arquitetural de R3F de alto desempenho)**
    - **Link:** https://github.com/pmndrs/racing-game
    - **Resumo Técnico:** Jogo 3D completo em produção construído sobre React Three Fiber demonstrando técnicas avançadas de reutilização de vetores, instanciamento e áudio espacial.
    - **Como Aproveitaremos:** O padrão de isolamento matemático com singletons estáticos (`MathCaches`) para suprimir alocações transitórias de memória foi inspirado nas melhores práticas consolidadas deste projeto.

---

## 14. HISTÓRIAS DE USUÁRIO (USER STORIES) - PERFORMANCE WEBGL E SHADERS

### 14.1 Histórias de Usuário do Jogador (Player Perspective)
1. **US07-P01:** Como jogador em um smartphone intermediário, quero que o tabuleiro e as peças 3D rodem fluidamente a 60 quadros por segundo sem travamentos, mesmo quando 8 exércitos estiverem ativos na mesma arena.
2. **US07-P02:** Como competidor visual, quero admirar peças de xadrez com materiais realistas (como mármore polido, metal dourado e madeira entalhada) com reflexos e sombras suaves que transmitam uma experiência de jogo de alto luxo.
3. **US07-P03:** Como usuário em tela Retina de alta densidade (MacBook ou iPad Pro), quero que as linhas e as arestas das peças sejam perfeitamente nítidas e sem serrilhados através de anti-aliasing inteligente (FXAA/SMAA).
4. **US07-P04:** Como jogador, quero que ao capturar uma peça adversária ela sofra uma dissolução visual com partículas brilhantes e partículas de luz em vez de simplesmente sumir do nada.
5. **US07-P05:** Como competidor jogando com pouca bateria no celular, quero que o jogo ofereça uma opção no menu de gráficos para "Modo Economia de Bateria", reduzindo efeitos pós-processados e diminuindo a taxa de atualização para 30 FPS para poupar carga.
6. **US07-P06:** Como participante em um tabuleiro procedural infinito, quero que ao afastar a câmera (Zoom Out macro) o jogo continue rodando leve sem engasgar, simplificando os detalhes das casas mais distantes de forma imperceptível.
7. **US07-P07:** Como jogador em conexão móvel 3G, quero que a página inicial e os modelos 3D do jogo baixem e apareçam na minha tela em menos de 2 segundos graças à compressão avançada de modelos e texturas.
8. **US07-P08:** Como entusiasta de efeitos visuais, quando meu rei for colocado em xeque, quero ver a peça do rei emitir uma aura de aviso vermelha pulsante gerada por shader luminoso.
9. **US07-P09:** Como usuário noturno, quero que a alternância para o modo escuro apague as luzes do ambiente e ative holofotes táticos suaves focados no tabuleiro, criando uma atmosfera imersiva e relaxante.
10. **US07-P10:** Como jogador, quero que as peças se desloquem suavemente de uma casa para outra com interpolação fluida (curva ease-in-out), transmitindo peso físico e elegância tática.
11. **US07-P11:** Como jogador de variantes com terrenos aquáticos e montanhosos, quero ver a água dos lagos procedurais refletindo a luz ambiente com pequenas ondas dinâmicas desenhadas na superfície.
12. **US07-P12:** Como competidor que joga por várias horas seguidas, quero que o meu navegador não apresente vazamento de memória ou lentidão progressiva após 50 partidas ininterruptas.
13. **US07-P13:** Como usuário com monitor gamer de 120Hz ou 144Hz, quero que o render loop aproveite a taxa de atualização máxima do meu monitor para uma sensação de controle responsivo ultra-suave.
14. **US07-P14:** Como jogador, quero que os indicadores luminosos de casas válidas no chão possuam uma animação de respiração sutil que me guie intuitivamente sem cansar meus olhos.
15. **US07-P15:** Como usuário jogando em notebook sem placa de vídeo dedicada (GPU integrada Intel), quero que o jogo detecte automaticamente o hardware modesto e calibre as configurações visuais para manter 60 FPS garantidos.

### 14.2 Histórias de Usuário do Desenvolvedor e Arquiteto (Developer/Architect Perspective)
1. **US07-D01:** Como arquiteto WebGL, quero que todas as peças de uma mesma variante compartilhem instâncias da mesma `InstancedMesh`, garantindo que toda a cena seja desenhada com menos de 20 Draw Calls na GPU.
2. **US07-D02:** Como engenheiro gráfico, quero que a atualização de posições de peças durante animações utilize `gl.bufferSubData` para modificar apenas os 16 floats da matriz da peça alterada, eliminando re-uploads massivos de buffers pela CPU.
3. **US07-D03:** Como desenvolvedor de assets, quero que todo o pipeline de build converta automaticamente texturas para o formato `.ktx2` (Basis Universal), limitando o consumo de VRAM da cena inteira a menos de 50 Megabytes.
4. **US07-D04:** Como mantenedor do código, quero proibir rigidamente qualquer alocação de objetos no heap (`new THREE.Vector3()`, `new THREE.Matrix4()`) dentro do loop `useFrame`, prevenindo picos de Garbage Collection (GC stutter).
5. **US07-D05:** Como engenheiro de performance, quero que o Frustum Culling omita fatias inteiras de instâncias fora da visão da câmera através do `mesh.count` dinâmico, poupando processamento de vertex shaders na GPU.
6. **US07-D06:** Como desenvolvedor de shaders, quero customizar os materiais padrão via `onBeforeCompile`, injetando parâmetros de cor por instância (`instanceColor`) e IDs de facção sem quebrar os cálculos de luz PBR do Three.js.
7. **US07-D07:** Como operador de infraestrutura gratuita, quero que todos os arquivos `.glb` e texturas `.ktx2` sejam hospedados no Cloudflare R2 com taxa de saída gratuita (Zero Egress), garantindo distribuição mundial sem custos ocultos de bandwidth.
8. **US07-D08:** Como engenheiro de confiabilidade, quero que o carregador de texturas execute detecção graciosa de suporte a WebGL e KTX2, fornecendo fallbacks leves para dispositivos legados sem crashar o navegador.
9. **US07-D09:** Como desenvolvedor de CI, quero integrar o painel `r3f-perf` em testes automatizados que falhem o pipeline caso um commit introduza regressão de Draw Calls acima de 25 chamadas.
10. **US07-D10:** Como engenheiro de áudio e efeitos, quero que eventos visuais de captura acionem shaders de dissolução baseados em ruído Worley programados para durar exatamente 400 milissegundos antes da remoção lógica da entidade.

---

## 15. REQUISITOS FUNCIONAIS (RF) - PERFORMANCE WEBGL E RENDERIZAÇÃO 3D

Abaixo estão formalizados os 15 requisitos funcionais mandatórios do subsistema gráfico e de performance.

1. **RF-01 (Batching Massivo com InstancedMesh):** Todas as peças idênticas de um mesmo tipo (ex: todos os Peões de um exército) e todas as casas de um mesmo bioma devem ser renderizadas através de instâncias de `THREE.InstancedMesh`.
2. **RF-02 (Pipeline de Texturas KTX2/Basis):** Todas as texturas PBR (Albedo, Normal, Roughness) devem ser empacotadas no formato comprimido KTX2 e decodificadas diretamente na memória de vídeo (VRAM) pelo KTX2Loader.
3. **RF-03 (Compressão Geométrica com Draco):** Todos os modelos tridimensionais de peças (.glb) devem ser comprimidos utilizando o algoritmo Draco com quantização otimizada para web.
4. **RF-04 (Atualização Parcial de Buffers - bufferSubData):** A animação de movimento e interpolação de peças deve atualizar exclusivamente o trecho de memória do buffer correspondente à peça afetada via `gl.bufferSubData`.
5. **RF-05 (Frustum Culling Analítico de Instâncias):** O sistema deve calcular analiticamente quais casas e peças residem dentro do campo de visão da câmera e ajustar o `mesh.count` do InstancedMesh para renderizar unicamente instâncias visíveis.
6. **RF-06 (Sistema de LOD - Level of Detail):** Quando a câmera se afastar além de determinada distância no tabuleiro infinito, modelos 3D complexos de peças devem ser substituídos por geometrias primitivas simplificadas de baixo custo.
7. **RF-07 (Iluminação PBR com Sombras Otimizadas):** A cena deve contar com uma luz direcional com mapa de sombras em cascata (Cascaded Shadow Maps - CSM) calibrada para cobrir a área ativa sem estouro de textura de sombras.
8. **RF-08 (Shader Customizado de Seleção e Highlights):** O destaque de casas válidas e peças ativas deve ser processado via fragment shader GLSL customizado com brilho pulsante e bordas suaves anti-aliased.
9. **RF-09 (Shader de Dissolução de Captura):** A remoção de peças capturadas deve executar um shader de dissolução com padrão de ruído fractal e borda incandescente com duração de 400ms.
10. **RF-10 (Pós-Processamento Otimizado com EffectPass):** O pipeline de renderização deve agrupar efeitos de Bloom, Tone Mapping ACESFilmic e Vinheta em um único passe de pós-processamento na GPU.
11. **RF-11 (Singletons Estáticos de Memória - MathCaches):** Todas as operações matemáticas de matrizes e vetores no loop gráfico devem reutilizar instâncias prealocadas em `MathCaches.ts`, proibindo alocação de objetos novos no `useFrame`.
12. **RF-12 (Detecção Automática de Capacidade de Hardware):** No carregamento inicial, o sistema deve sondar a GPU do usuário (extensões WebGL disponíveis, suporte a floating point textures e limite de instâncias) e calibrar os perfis gráficos (Baixo, Médio, Ultra).
13. **RF-13 (Céu e Neblina Dinâmicos de Ambiente):** O fundo 3D deve conter gradiente suave ou skybox procedural com neblina volumétrica (`THREE.FogExp2`) cujas cores se ajustam automaticamente na alternância de tema Claro/Escuro.
14. **RF-14 (Redução de Taxa de Quadros em Segundo Plano):** Quando a janela ou aba do navegador perder o foco do usuário, a taxa de renderização do WebGL deve ser automaticamente limitada para 1 FPS para economizar bateria e processamento.
15. **RF-15 (Anti-Aliasing Adaptativo):** O renderizador deve habilitar anti-aliasing nativo MSAA em telas padrão ou alternar para pós-processamento FXAA/SMAA em dispositivos móveis conforme o perfil de performance do aparelho.

---

## 16. REQUISITOS NÃO-FUNCIONAIS (RNF) - DESEMPENHO E LIMITES DA GPU

Abaixo estão formalizados os 15 requisitos não-funcionais que governam o subsistema de renderização 3D.

1. **RNF-01 (Orçamento Rígido de Draw Calls):** A cena 3D completa de qualquer partida (mesmo com 8 jogadores e mais de 1.000 entidades ativas) não deve exceder **20 Draw Calls por quadro** na GPU.
2. **RNF-02 (Tempo Máximo de Frame - 60 FPS Estáveis):** O tempo de processamento total por quadro (CPU + GPU) deve permanecer consistentemente abaixo de **16.6 milissegundos** em hardware padrão.
3. **RNF-03 (Teto Máximo de VRAM da GPU):** O consumo total de memória de vídeo (VRAM) da aplicação não deve ultrapassar **50 Megabytes**, prevenindo falhas de falta de memória (OOM Crashes) no Safari iOS e Chrome Mobile.
4. **RNF-04 (Zero Alocação no Heap em Render Loop):** A taxa de alocação de memória no heap do JavaScript durante o loop `useFrame` deve ser estritamente de **0 Bytes/segundo**, eliminando picos de Garbage Collection.
5. **RNF-05 (Tamanho Total do Pacote de Assets 3D):** Todo o conjunto de modelos 3D de peças clássicas comprimidos com Draco não deve exceder **1.8 Megabytes** no download inicial.
6. **RNF-06 (Tempo de Carregamento de Cena 3D):** A inicialização completa do contexto WebGL, compilação de shaders e renderização do primeiro quadro com peças posicionadas deve ocorrer em menos de **1.2 segundos** em conexões de banda larga padrão.
7. **RNF-07 (Conformidade com Free Tier de Infraestrutura):** A distribuição de modelos 3D e texturas deve operar 100% sobre o Cloudflare R2 sem cobrança de taxa de egress, mantendo custo zero de transferência de mídia pesada.
8. **RNF-08 (Compatibilidade com WebGL 2.0 e WebGL 1.0):** O sistema deve priorizar o contexto WebGL 2.0 e fornecer camada de compatibilidade graciosa para navegadores com WebGL 1.0 sem travar a interface.
9. **RNF-09 (Resiliência contra Perda de Contexto WebGL):** Em eventos de perda forçada de contexto gráfico (`webglcontextlost`), o sistema deve interceptar o evento, evitar exceções não tratadas e restaurar o contexto e as malhas automaticamente quando o navegador reativá-lo.
10. **RNF-10 (Economia Térmica de Bateria):** Em uma sessão de 30 minutos de jogo contínuo em smartphone intermediário, a temperatura da carcaça do aparelho não deve ultrapassar **38°C**.
11. **RNF-11 (Precisão de Texturas em Filtro Anisotrópico):** As texturas do piso do tabuleiro devem aplicar filtro anisotrópico de pelo menos 4x para manter a legibilidade das casas quando visualizadas em ângulos rasos de perspectiva.
12. **RNF-12 (Tolerância a Telas de Alta Frequência - 120Hz/144Hz):** O render loop deve ser sincronizado com a taxa de atualização do monitor do usuário através de `requestAnimationFrame`, suportando até 144 FPS suaves sem quebra de física de interpolação.
13. **RNF-13 (Qualidade de Compressão Visual de Texturas):** As texturas transcodificadas com Basis Universal devem manter índice de similaridade estrutural (SSIM) superior a **0.95** em relação às texturas PNG originais não comprimidas.
14. **RNF-14 (Cobertura de Testes de Shaders e Materiais):** Os utilitários matemáticos de projeção e compilação de shaders devem possuir cobertura de testes automatizados superior a **85%**.
15. **RNF-15 (Tamanho do Shader Compilado na GPU):** Os fragment shaders customizados injetados no pipeline não devem conter loops dinâmicos não-desenrolados (Unrolled Loops), garantindo compilação instantânea na GPU em menos de **50ms**.

---

## 17. ARQUITETURA DE DEPLOYMENT GRATUITA (FREE TIER) PARA ASSETS 3D E SHADERS

A hospedagem e distribuição de mídias gráficas de alta densidade é comumente o principal vilão de custos em projetos com WebGL. O `ChessInReact` adota a seguinte arquitetura de custo zero:

1. **Armazenamento de Modelos no Cloudflare R2 (Plano Gratuito):** O Cloudflare R2 oferece 10GB de armazenamento gratuito e, crucialmente, **cobrança zero de taxa de saída de dados (Zero Egress Fees)**. Todos os modelos `.glb` comprimidos e texturas `.ktx2` são servidos diretamente pelo R2 sob uma CDN global, permitindo milhões de downloads de malhas 3D sem gerar nenhuma fatura.
2. **Build Otimizado no Vercel Hobby Tier:** A esteira de integração contínua compila os shaders GLSL e o código TypeScript do Three.js em bundles estáticos minificados, que são hospedados na CDN global da Vercel respeitando com ampla folga a cota de 100GB mensais de tráfego web.
3. **Cache Agressivo de Assets no Navegador:** Todos os assets tridimensionais são versionados com hash de conteúdo no nome do arquivo (ex: `pawn_classic.v84f1a.glb`) e servidos com cabeçalhos HTTP `Cache-Control: public, max-age=31536000, immutable`, garantindo que o usuário só baixe cada modelo uma única vez na vida.

---

## 18. MODOS DE JOGO E SUAS PECULIARIDADES GRÁFICAS

1. **Modo Clássico 1v1 (High-Fidelity Board):**
   - 32 peças instanciadas desenhadas em exatamente 6 Draw Calls (uma chamada para cada tipo de peça de cada cor).
   - Sombras de alta resolução no centro do tabuleiro e reflexos de mármore em tempo real.
2. **Modo Hexagonal FFA (8 Jogadores - 128 a 256 Peças):**
   - As peças de cada jogador utilizam materiais compartilhados diferenciados unicamente pelo atributo `instanceColor`, evitando criar 8 materiais diferentes na GPU.
   - Total de Draw Calls mantido rigidamente abaixo de 12 para todas as peças em campo.
3. **Modo Endless Procedural (Mundo Aberto Infinito):**
   - Ativação do culling agressivo por Bounding Box R-Tree. Apenas os chunks no campo de visão imediato da câmera têm suas matrizes passadas para a GPU.
   - Aplicação de névoa volumétrica suave no horizonte para ocultar o descarregamento de terreno distante de forma estética.
4. **Modo Atomic Chess (Efeitos Dinâmicos de Explosão):**
   - A captura aciona um sistema de partículas instanciadas (100 partículas de poeira e luz) que se dispersam por física em 400ms em 1 Draw Call compartilhado, sem alocar memória no heap.

---

## 19. SCHEMAS DE DADOS, TIPOS TYPESCRIPT E CONTRATOS GRÁFICOS

Abaixo constam as interfaces tipadas de gerenciamento de assets e materiais do Three.js:

```typescript
// src/rendering/interfaces/IRenderingContracts.ts
import * as THREE from 'three';

export interface IGraphicQualityProfile {
  name: 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';
  shadowMapResolution: 512 | 1024 | 2048;
  enablePostProcessing: boolean;
  enableBloom: boolean;
  enableAntialiasing: boolean;
  maxDrawDistance: number;
  anisotropicFilteringLevel: 1 | 4 | 8 | 16;
  targetFPS: 30 | 60 | 120;
}

export interface IInstancedPieceMeshPool {
  variantId: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  meshInstance: THREE.InstancedMesh;
  maxCapacity: number;
  activeCount: number;
}

export interface IAssetLoadManifest {
  modelUrl: string;       // Caminho para o .glb comprimido com Draco
  textureAlbedoUrl: string; // Caminho para textura .ktx2
  textureNormalUrl?: string;
  textureRoughnessUrl?: string;
  polyCount: number;
  dracoCompressed: boolean;
}
```

Contrato JSON de manifesto de carregamento de assets de peças:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "PieceGraphicAssetManifestPayload",
  "type": "object",
  "required": ["variantSetId", "models", "texturesBaseUrl"],
  "properties": {
    "variantSetId": { "type": "string" },
    "texturesBaseUrl": { "type": "string", "format": "uri" },
    "models": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["pieceType", "modelFileName", "dracoCompressed"],
        "properties": {
          "pieceType": { "type": "string" },
          "modelFileName": { "type": "string" },
          "dracoCompressed": { "type": "boolean" },
          "approximateFileSizeKb": { "type": "integer" }
        }
      }
    }
  }
}
```

---

## 20. CONCLUSÃO ARQUITETURAL DA SPEC 07

A Spec 07 estabelece os fundamentos de computação gráfica de ponta que viabilizam o `ChessInReact` em qualquer dispositivo web. Ao substituir o modelo tradicional ingênuo de dezenas de meshes isoladas por um sistema rigoroso de batching com `InstancedMesh`, compressão de texturas na GPU com Basis/KTX2, geometria Draco, shaders GLSL customizados e atualizações parciais de buffers na GPU com `bufferSubData`, a plataforma atinge visual de alta fidelidade a 60 FPS inquebráveis com menos de 20 Draw Calls e consumo nulo de infraestrutura de rede paga.
