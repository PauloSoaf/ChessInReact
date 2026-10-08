# Spec 06: UI/UX, Theme Integration e R3F Interactivity (Parte 1/4)

## A. OBRIGAÇÃO DE DENSIDADE E ABORDAGEM
A fusão de interfaces DOM (HTML/Tailwind) com WebGL (Canvas/Three.js) é notoriamente complexa. O DOM está fora do fluxo do WebGL, o que cria problemas de Z-Index, Raycasting (quando o clique passa pelo HUD e seleciona uma peça atrás) e dessincronização de temas.
O `ChessInReact` herda o "Layout Clínico" do seu projeto-irmão NutriOpus. A abordagem correta não é copiar arquivos, mas arquitetar um **DOM Overlay Portal** que engloba o WebGL e gerencia a ponte (Context Bridge) entre a árvore de render do React no DOM e a árvore de render do R3F.

## 1. OBJETIVO DO SUBSISTEMA DE INTERATIVIDADE E UI
Gerenciar a ponte de comunicação entre o estado puro do Zustand (Spec 01), os eventos do DOM HTML (Navbar, Sidebar do NutriOpus), e a projeção visual no Canvas 3D (Seleção, Drag & Drop de Peças, Raycasting), garantindo máxima taxa de quadros e usabilidade livre de jank.

## 2. ESCOPO
**PERTENCE A ESTA SPEC:**
- Context Bridging (Zustand -> R3F).
- Reutilização da arquitetura NutriOpus (Navbar/Sidebar/ThemeToggle).
- DOM Overlays Absolutos sobre o Canvas.
- Algoritmos de 3D Raycasting Otimizados (BVH).
- Lógica de Drag & Drop (Pointer Events 3D).

**NÃO PERTENCE:**
- InstancedMesh Optimization para Renderização de 10.000 peças (Ver Spec 07).
- Regras de Movimento Legal de Xadrez (Ver Spec 04).

## 3. REQUISITOS E CONSTRAINTS
### 3.1 Constraints de Event Bubbling HTML vs Canvas
- **Constraint:** Quando o jogador abre o "Inventário de Peças" na Sidebar lateral e clica nele, a biblioteca R3F pode registrar o clique "atravessando" a interface HTML, disparando um Raycast e selecionando equivocadamente um hexágono oculto no fundo 3D.
- **Resolução Arquitetural:** O Padrão "Event Tunneling Stop". A raiz do DOM Overlay injeta um hook `stopPropagation()` e uma flag `pointerEvents="none"` na div contêiner do Canvas no instante em que o Sidebar expande, transferindo 100% da prioridade de Focus para o DOM.

### 3.2 Constraints de "Context Loss" do React
- **Constraint:** O React Three Fiber monta uma árvore paralela à do React DOM. `ContextProviders` (ThemeContext, Redux, Routers) criados na `App.tsx` não passam a fronteira para dentro das meshes 3D dentro de `<Canvas>`.
- **Resolução Arquitetural:** Não utilizaremos React Context (prop drilling) como Fonte da Verdade de Interações 3D. O `gameStore.ts` (Zustand Vanilla) é injetado diretamente nos dois mundos via Hooks. Para casos de Tema (Dark/Light do NutriOpus), o Canvas passará as variáveis como Props no momento da renderização ou consumirá o barramento de eventos (Ver Seção 7).

## 4. PESQUISA MATRIX: FONTES EXTERNAS CONSULTADAS E VALIDADAS

### Fonte 1: "React Three Fiber: Events & Interactions" (Pmndrs Docs)
- **URL:** https://docs.pmnd.rs/react-three-fiber/api/events
- **Problema Resolvido:** Interação com objetos WebGL.
- **Conclusão Técnica:** O R3F possui Raycaster embutido, mas ele recalcula Bounding Boxes de TODOS os objetos interativos no `onPointerMove`. Num tabuleiro com 2.000 hexágonos procedurais, isso fritaria a Thread CPU.
- **Decisão:** Apenas uma Malha Mestra (Ex: um Grid Matemático invisível) intercepta os ponteiros. Peças individuais 3D têm a propriedade genérica `raycast={null}` para impedir a varredura desnecessária. A posição clicada é traduzida matematicamente para a `CoordinateID`.

### Fonte 2: "three-mesh-bvh" (Bounding Volume Hierarchy)
- **URL:** https://github.com/gkjohnson/three-mesh-bvh
- **Problema Resolvido:** O gargalo absurdo do Raycasting contra modelos GLTF complexos (Ex: Um Rei fada com 5.000 triângulos modelado pela comunidade).
- **Decisão:** Todas as malhas de xadrez carregadas assincronamente serão indexadas via Bounding Volume Hierarchy na sub-thread de Load. O R3F interceptará a chamada nativa de Raycast e usará a busca BVH acelerada `mesh.raycast = acceleratedRaycast`.

### Fonte 3: "DOM Overlays in Three.js & R3F"
- **Problema Resolvido:** Posicionamento de barras de progresso ou balões de vida "flutuando" acima das peças.
- **Decisão:** Utilizaremos o componente `<Html>` exposto pela biblioteca `@react-three/drei`. Ele amarra silenciosamente o Vector3 do WebGL em tags `<div>` CSS2D. Mas com parcimônia (apenas para o Active Player e Mensagens críticas), pois abusar do `<Html>` causa lentidão extrema no React.

### Fonte 4: "Drag and drop with React Three Fiber" (Codesandbox / Examples)
- **Problema Resolvido:** Peças precisam seguir o cursor no plano X-Z sem afundar no chão.
- **Decisão:** Não usaremos a biblioteca `useDrag` do React UseGesture. Em WebGL, usaremos Interseção de um *Mathematical Plane* invisível. O Mouse dispara um raio, colide com esse Plano Infinito (altura Y), e o objeto 3D atualiza sua coordenada em `useFrame`.

### Fonte 5: "Tailwind Theme Switching in SPAs" (Relativo ao NutriOpus)
- **Problema Resolvido:** Como o botão "Theme" afeta Canvas.
- **Decisão:** O Botão de Tema injeta a classe `.dark` no documento base. Um `useEffect` no R3F observa se o Document Root contém a classe, e então dispara a alteração dos Environment Maps HDRI, mudando as luzes do jogo de "Diurno" para "Neon Synthwave Noturno".

### GitHub 1: pmndrs/drei
- **Estrutura Estudada:** Componente `<Html>`.
- **Decisão Influenciada:** Evitar a diretiva `transform` no `<Html>` caso haja muito movimento de câmera, para evitar cintilação da tela inteira do browser.

### GitHub 2: jsmadja/prometheus (UI para Xadrez 3D Antigo)
- **Problema Resolvido:** Onde colocar os botões.
- **Conclusão:** O HUD do xadrez não precisa invadir a tela do 3D.
- **Decisão:** Incorporação fiel do Layout `DashboardSidebar` do NutriOpus à esquerda, e do Navbar ao topo. O Tabuleiro é ancorado no quadrante restante.

## 5. ESTRUTURA REAL DE DIRETÓRIOS E MÓDULOS (UI/UX e R3F)

```text
src/
  ui/
    HUD/
      GameOverlay.tsx        // Container DOM que envelopa tudo
      NutriOpusSidebar.tsx   // O componente re-importado e preenchido
      PlayerStatus.tsx       // Nome, Avatar, Relógio
  rendering/
    interactions/
      DragController.ts      // A Lógica matemática de Pointer Intersection
      SelectionManager.ts    // Highlighting e validação de Clique O(1)
    components/
      ChessEnvironment.tsx   // Raiz do WebGL <Canvas>
      HtmlTooltip.tsx        // Componente DREI
```

(CONTINUA NA PARTE 2)
## 6. O ALGORITMO DE RAYCASTING E DRAG MATEMÁTICO
O Raycaster não detecta as peças detalhadas do tabuleiro. O motor WebGL gera Polígonos de Bounds matemáticos (`meshBounds`) incrivelmente mais leves.

### 6.1 Padrão: Plano Matemático de Dragging
Para que uma peça selecionada siga o cursor no Ar e em Tempo Real, precisamos criar um Plane abstrato do Three.js em que os raios do mouse vão bater infinitamente.

```typescript
// src/rendering/interactions/DragController.ts
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { useGameStore } from '../../core/store/gameStore';

const INTERSECTION_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // Y=0 Plane
const RAYCASTER = new THREE.Raycaster();
const _mouseVec = new THREE.Vector2();

export function useDragController() {
   const { camera, pointer } = useThree();

   // Esse código NUNCA atualiza o State React. Roda direto contra WebGL a 60 fps
   useFrame(() => {
       const { draggedPieceId, draggedVisualPos } = useGameStore.getState().uiState;
       if (!draggedPieceId) return;

       // Lança o raio da câmera atual cruzando o ponteiro
       RAYCASTER.setFromCamera(pointer, camera);
       
       // Detecta onde o raio intercepta o plano imaginário
       const intersectPoint = new THREE.Vector3();
       RAYCASTER.ray.intersectPlane(INTERSECTION_PLANE, intersectPoint);
       
       if (intersectPoint) {
           // Levanta a peça 1 unidade no eixo Y para dar efeito de levitação
           draggedVisualPos.copy(intersectPoint).add(new THREE.Vector3(0, 1, 0));
       }
   });
}
```

### 6.2 Validação de Drops via Topologia (Spec 02)
Quando o usuário solta o Mouse `onPointerUp`:
A Engine do UI precisa descobrir: "Qual hexágono está embaixo da peça voadora?"
- **Abordagem Incorreta:** Fazer Raycast físico para baixo procurando Malhas. (Lento e Flaky).
- **Abordagem Correta (Arquitetural):** O `DragController` pega as coordenadas vetoriais X e Z da peça. Ele invoca uma conversão Topológica reversa `pixelToHex(X, Z)` exposta na `HexTopology` e obtém O(1) a coordenada Hashed, ex: `"4,-1,-3"`.
Depois o UI chama `Zustand.dispatchMove(draggedPiece, '4,-1,-3')`. Se a Spec 04 (Regras) disser "Ilegal", o Drag controller cancela e a peça sofre Lerp de volta pro início.

## 7. O HUD HTML (NUTRIOPUS RE-IMAGINED)

Conforme as instruções rígidas do projeto: *Não modifique o projeto NutriOpus.*
Para respeitar isso, usaremos `TailwindCSS` em contêineres absolutos que apenas imitam/envelopam o estilo clínico-elegante. O Menu "Prontuários" vira "Histórico de Partida".

### 7.1 O CSS Z-Index Sandwich
```html
<div class="h-screen w-screen overflow-hidden relative">
   
   <!-- Camada do Fundo WebGL (Index 0) -->
   <div class="absolute inset-0 z-0 pointer-events-auto">
       <Canvas> <ChessEnvironment /> </Canvas>
   </div>

   <!-- Camada de Interface do NutriOpus - SIDEBAR (Index 10) -->
   <aside class="absolute left-0 top-0 h-full w-64 bg-white/90 backdrop-blur z-10 pointer-events-auto">
       <NutriOpusSidebar />
   </aside>

   <!-- Camada de Efeitos Temporários (Index 20) -->
   <div class="absolute inset-0 z-20 pointer-events-none flex items-center justify-center">
       <NotificationBanner /> <!-- CHECKMATE TITLE, etc -->
   </div>
</div>
```
Note que na camada de Notificação, `pointer-events-none` é OBRIGATÓRIO. Se não for usado, um balão de notificação gigante no meio da tela impedirá os cliques nos peões.

### 7.2 Theme Toggle Bridge (Light/Dark Mode)
O NutriOpus possui um Componente de "Dark Mode" que injeta a classe `dark` no HTML Root. O WebGL (Canvas) não herda CSS.

```typescript
// src/rendering/components/EnvironmentLighting.tsx
import { useEffect, useState } from 'react';
import { Environment } from '@react-three/drei';

export function ThemeSyncLighting() {
   const [isDark, setIsDark] = useState(false);

   useEffect(() => {
       // O MutationObserver detecta alterações feitas pelo NutriOpus Header
       const observer = new MutationObserver(() => {
           setIsDark(document.documentElement.classList.contains('dark'));
       });
       
       observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
       return () => observer.disconnect();
   }, []);

   return (
      <>
         <ambientLight intensity={isDark ? 0.2 : 0.8} />
         {isDark ? (
             <Environment preset="night" background blur={0.5} />
         ) : (
             <Environment preset="city" background blur={1} />
         )}
      </>
   );
}
```

(CONTINUA NA PARTE 3)
## 8. DESTAQUES DE MOVIMENTO (HIGHLIGHTING SYSTEM) E POINTER EVENTS

O feedback visual de onde a peça pode mover é o maior causador de queda de FPS (Frames por Segundo) em projetos mal arquitetados, pois cada hover aciona `setState`, recriando vértices 3D.

### 8.1 Abordagem O(1) de Instanced Highlighting
A `SelectionManager` (Gerenciador Lógico de Seleção) não cria dezenas de discos verdes luminosos. Ele instrui a placa de vídeo.
O Tabuleiro é uma **InstancedMesh** (Explicado a fundo na Spec 07). Nós reservamos os 3 últimos bytes de metadados da instância (Atributo de Cor) para representar o "Highlight".

Quando o jogador clica na Rainha:
1. Dispara `RulesEngine.getLegalMoves(Rainha)`. (Retorna 25 Hexágonos num Array, processado O(1)).
2. O Zustand State `uiState.highlightedCoords` recebe as 25 chaves.
3. No R3F `useFrame`, iteramos apensas esses 25 hexágonos (não os 2.000 do mapa) injetando a cor Azul (`Color(0, 0, 1)`) no buffer `instanceColor` diretamente na memória da placa de vídeo.

Nenhum elemento React é montado ou desmontado para o Hightlight.

### 8.2 Cursor e Pointer Bounds
A seleção da Malha Base (Tabuleiro) usa Otimizações de Geometria:

```tsx
// src/rendering/interactions/SelectionManager.tsx
import { useThree } from '@react-three/fiber';
import { meshBounds } from '@react-three/drei';

export function BoardMesh(props) {
   // meshBounds é crucial! Ele substitui o Raycasting Per-Triangle (lento) 
   // pelo Bounding Sphere (rápido). Um hexágono tem poucos triângulos, mas milhares
   // de hexágonos fritariam o Raycaster default do Three.js.
   
   return (
      <mesh raycast={meshBounds} onPointerDown={handleBoardClick}>
          {/* Geometria e Material definidos na Spec 07 */}
      </mesh>
   )
}
```

## 9. CÂMERA CONTROL E ROTAÇÃO BASEADA EM N-PLAYERS

Num xadrez clássico, a câmera olha do lado Branco ou Preto. Mas num tabuleiro 6-Player Hexagonal, como determinar o ângulo da câmera?

### 9.1 Angulação Dinâmica O(1)
Quando a partida inicia e o Colyseus Server atribui a string "P4" ao cliente, nós ajustamos o Azimute da Câmera Orbital para apontar para o centro vindo do Ponto de Spawn do P4.

```typescript
// src/rendering/components/CameraRig.tsx
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useGameStore } from '../../core/store/gameStore';

export function DynamicCameraRig({ totalPlayers }) {
   const { camera } = useThree();
   const myPlayerId = useGameStore(s => s.myPlayerId);

   useEffect(() => {
       if (myPlayerId === "NONE") return; // Espectadores usam Isometric padrão

       // Parse do ID para obter número do Jogador (Ex: "P4" -> 4)
       const pNum = parseInt(myPlayerId.replace("P", ""));
       
       // Dividimos o circulo (360 graus / 2 PI) pelo total de jogadores
       const anglePerPlayer = (Math.PI * 2) / totalPlayers;
       
       // Multiplicamos pelo número do player pra achar a Base dele no Hexágono
       const myAngle = anglePerPlayer * (pNum - 1);
       
       // Translação polar para as costas do jogador (Ex: Raio de 15 unidades afastado)
       const distance = 15;
       const x = Math.sin(myAngle) * distance;
       const z = Math.cos(myAngle) * distance;

       // Seta a câmera na angulação certa, olhando para o centro do Tabuleiro 0,0,0
       camera.position.set(x, 10, z); // Y=10 é a elevação pitch (Top-Down Angled)
       camera.lookAt(0, 0, 0);

   }, [myPlayerId, totalPlayers]);

   return null;
}
```

## 10. FAILURE MODES NA CAMADA UI E R3F

### 10.1 Failure Mode: O Click Através da UI
- **Cenário:** O usuário clica no botão "Desistir" no HUD HTML. O botão desiste do jogo, mas o Raio Raycaster atravessa a div transparente e clica numa peça atrás, selecionando-a na UI e tocando o Som de Seleção após a desistência.
- **Resolução Arquitetural:** Todo contêiner HTML clicável (Navbar, Botões de Turno) deve possuir, via React, o `onPointerDown={(e) => e.stopPropagation()}` de eventos nativos ou as diretivas adequadas de z-index limitando o Hitbox.

### 10.2 Failure Mode: Memory Leaks de Event Listeners
- **Cenário:** Se adicionarmos Listeners diretos (`window.addEventListener('mousemove')`) na engine de Drag, o Garbage Collector do React fará vazamento se o jogador entrar e sair de uma sala.
- **Resolução Arquitetural:** O `useFrame` do React Three Fiber já expõe a propriedade de `pointer` (Vector2 nativo gerenciado), o que elimina 100% da necessidade de criar e gerenciar eventos DOM de Mouse Globais para arrastar peças na arquitetura de WebGL.

(CONTINUA NA PARTE 4)
## 11. PLANO DE IMPLEMENTAÇÃO DA SPEC 06
1. Instalar `@react-three/fiber` e `@react-three/drei` e configurar o Provider DOM de Tailwind.
2. Extrair as marcações SVG (Icons) e classes `.tsx` do `Navbar` e `Sidebar` do **NutriOpus**, transportando para a camada HTML de Z-Index 10. Modificar os Hooks para consumirem `useGameStore(s => s.turnState)` em vez de Pacientes.
3. Criar a raiz WebGL (`<Canvas>`) garantindo a Prop `pointerEvents="auto"`.
4. Definir a malha base transparente (Intersection Plane) no `Y=0` para permitir a matemática de Raycasting livre.
5. Inserir a função algorítmica polar (Spec 06, Seção 9) para câmera girar instantaneamente e ancorar atrás do exército atribuído ao jogador assim que o Colyseus emitir `onJoin`.
6. Envelopar interações do DOM (Cliques fora do Tabuleiro) no RootDiv para resetar a state `uiState.selectedPieceId = null`, garantindo UX intuitivo de "Deselecionar" parecido com jogos de RTS.

## 12. CRITÉRIOS DE ACEITE
1. **Seamless DOM Integration:** Abertura da barra lateral HTML de Inventário deve causar zero stutter no Render 3D do tabuleiro ao lado, e passar o mouse pelas abas da Sidebar não deve causar gatilhos indesejados no Canvas WebGL atrás.
2. **Smooth Drag and Drop:** Arrastar uma peça deve atrelar perfeitamente o Cursor à base da malha de xadrez usando `IntersectionPlane` infinito, mesmo se o mouse mover mais rápido que 60hz, a peça não deve "Pular" bruscamente.
3. **Multiplayer Observer Camera:** Quando na posição de `Observer` (Sem PlayerId), a câmera permite pan/zoom/orbit livres via `OrbitControls`. Quando atribuído um PlayerId num jogo Multi-aliança, o `OrbitControls` terá seu limite azimutal bloqueado $\pm 45^{\circ}$ atrás da Facção do jogador, garantindo perspectiva coesa.
4. **Theme Toggling Visual Response:** Clicar no Dark Mode do NutriOpus deve acionar transição instantânea de Ambiente WebGL. O background e a neblina (`FogExp2`) devem mudar de branco puro e iluminação `city` para cores de Vazio espacial, sem recriar o Canvas nem causar re-load de shaders pesados.

---
*Fim da Spec 06. Ao separarmos o Contexto React (Estado Lento) do Contexto Three (Visual Rápido) resolvemos o pior pesadelo do React Three Fiber: Jankiness. Agora, com a interface responsiva montada, a Spec 07 vai aprofundar na brutal otimização WebGL de instanciamento geométrico para permitir desenhar milhares de peças sem colapsar a Placa de Vídeo.*


## 13. REPOSITÓRIOS GITHUB E REFERÊNCIAS EXTERNAS (UI/UX, R3F E DESIGN SYSTEM)

Abaixo documentamos as fontes de engenharia de interface, interação 3D e design systems reutilizáveis analisadas para a arquitetura de apresentação e integração do `ChessInReact`.

### 13.1 Projetos Open Source Analisados
1. **GitHub: `pmndrs/drei`**
   - **Link:** https://github.com/pmndrs/drei
   - **Resumo Técnico:** Suíte de componentes auxiliares de alto desempenho para React Three Fiber, incluindo abstrações de câmera (`PerspectiveCamera`), controles orbitais (`OrbitControls`) e portais DOM (`Html`).
   - **Como Aproveitaremos no Projeto:** O componente `<Html center transform>` do Drei será utilizado para renderizar balões de diálogo de chat e etiquetas de nomes de jogadores diretamente projetados sobre as coordenadas 3D de seus reis, com auto-ocultação além de certa distância de zoom para não poluir o campo de visão.

2. **GitHub: `pmndrs/react-three-fiber`**
   - **Link:** https://github.com/pmndrs/react-three-fiber
   - **Resumo Técnico:** Reconciliador React declarativo para Three.js, gerenciando o ciclo de vida de objetos WebGL através de reconciliação paralela e transient subscriptions.
   - **Como Aproveitaremos:** Toda a raiz gráfica é governada pelo R3F. A arquitetura de transient updates descrita na Spec 01 é aplicada aqui para garantir que o HUD do NutriOpus viva na árvore do React DOM tradicional enquanto o Canvas 3D opera em seu próprio render loop de 60 FPS sem trocas mútuas de re-renders desnecessários.

3. **GitHub: `gkjohnson/three-mesh-bvh`**
   - **Link:** https://github.com/gkjohnson/three-mesh-bvh
   - **Resumo Técnico:** Implementação de aceleração espacial Bounding Volume Hierarchy (BVH) para geometrias do Three.js, reduzindo o tempo de raycasting em malhas densas de O(N) para O(log N).
   - **Como Aproveitaremos:** Aplicamos a aceleração BVH em modelos 3D detalhados de peças fadas e terrenos acidentados, permitindo que a detecção de clique do mouse (picking) e de foco (hover) execute em menos de 0.1ms mesmo com dezenas de milhares de polígonos na cena.

4. **GitHub: `radix-ui/primitives`**
   - **Link:** https://github.com/radix-ui/primitives
   - **Resumo Técnico:** Conjunto de primitivos de interface acessíveis, não-estilizados (Headless) e em conformidade estrita com as diretrizes WAI-ARIA para React.
   - **Como Aproveitaremos:** Aproveitaremos a mesma base de componentes adotada no projeto-irmão NutriOpus para construir os menus modais de promoção de peão, gavetas de opções de jogo, tooltips de habilidades de peças fadas e janelas de confirmação de desistência, assegurando acessibilidade nativa por teclado e leitores de tela.

5. **GitHub: `tailwindlabs/tailwindcss`**
   - **Link:** https://github.com/tailwindlabs/tailwindcss
   - **Resumo Técnico:** Framework CSS baseado em classes utilitárias para estilização atômica e responsiva.
   - **Como Aproveitaremos:** Herdamos o design system e a paleta de cores clínicas do NutriOpus (tons de esmeralda, ardósia, cinza neutro e acentos de alto contraste), estilizando todo o HUD sobreposto ao canvas 3D e garantindo adaptação dinâmica entre os modos Claro e Escuro.

6. **GitHub: `framer/motion`**
   - **Link:** https://github.com/framer/motion
   - **Resumo Técnico:** Biblioteca para animações físicas baseadas em molas (Spring Physics) e transições declarativas de layout no React.
   - **Como Aproveitaremos:** Utilizaremos o Framer Motion para animar a entrada triunfante de banners ("XEQUE-MATE!", "SUA VEZ!"), expansões suaves da barra lateral do HUD e transições visuais de relógios em contagem regressiva crítica.

7. **GitHub: `lucide-icons/lucide`**
   - **Link:** https://github.com/lucide-icons/lucide
   - **Resumo Técnico:** Pacote de ícones vetoriais SVG minimalistas e de baixo peso para React.
   - **Como Aproveitaremos:** Reutilizamos os mesmos ícones visuais do NutriOpus para os botões de ação do jogo (Volume, Ajustes, Alternar Câmera, Oferecer Empate, Desistir, Histórico e Chat), mantendo identidade visual estritamente consistente.

8. **GitHub: `pmndrs/use-gesture`**
   - **Link:** https://github.com/pmndrs/use-gesture
   - **Resumo Técnico:** Biblioteca para captura de gestos complexos de mouse e toque (Drag, Pinch, Wheel, Move) com física inercial.
   - **Como Aproveitaremos:** Fundamental para a experiência mobile: mapeamos gestos de pinça de dois dedos para zoom da câmera e rotação orbital sem disparar o arrastar involuntário de peças do tabuleiro.

9. **GitHub: `pmndrs/leva`**
   - **Link:** https://github.com/pmndrs/leva
   - **Resumo Técnico:** Painel de controle de propriedades de debug em tempo real para cenas 3D.
   - **Como Aproveitaremos:** Integrado em ambiente de desenvolvimento local para calibrar posições de luzes, intensidade de sombras, cores de neblina de fundo e parâmetros de câmera sem precisar reiniciar o servidor Vite a cada ajuste.

10. **GitHub: `danilowoz/react-content-loader`**
    - **Link:** https://github.com/danilowoz/react-content-loader
    - **Resumo Técnico:** Gerador de animações de carregamento (Skeleton Screens) baseadas em SVG puro.
    - **Como Aproveitaremos:** Exibiremos esqueletos visuais elegantes nas gavetas da barra lateral e no saguão de salas enquanto dados de perfil, rankings ELO e modelos 3D estão sendo transferidos pela rede.

---

## 14. HISTÓRIAS DE USUÁRIO (USER STORIES) - UI/UX E INTEGRAÇÃO NUTRIOPUS

### 14.1 Histórias de Usuário do Jogador (Player Perspective)
1. **US06-P01:** Como jogador, quero uma transição suave e instantânea entre Tema Claro (Light Mode) e Tema Escuro (Dark Mode), onde não apenas a barra lateral mude de cor, mas a iluminação e o céu 3D do tabuleiro se transformem harmonicamente.
2. **US06-P02:** Como competidor, quero que a interface preserve a elegância limpa da Navbar e da Sidebar do NutriOpus, com botões bem espaçados e tipografia moderna que não cansem minha visão durante partidas longas.
3. **US06-P03:** Como usuário em tela touch de smartphone, quero poder arrastar uma peça mantendo o dedo sobre ela sem que minha mão tampe completamente a casa de destino, vendo uma projeção translúcida destacada acima do meu dedo.
4. **US06-P04:** Como jogador em uma partida de 6 pessoas, quero que ao começar o jogo a câmera gire suavemente e se posicione automaticamente atrás do meu exército, permitindo-me enxergar o tabuleiro com a melhor perspectiva possível.
5. **US06-P05:** Como competidor com pouco tempo de relógio, quero que a moldura do meu relógio pulse em vermelho vivo e emita um aviso sonoro sutil quando restarem menos de 10 segundos, alertando-me para jogar rápido.
6. **US06-P06:** Como participante no modo Crazyhouse, quero que as peças que capturei apareçam em uma gaveta retrátil na lateral da tela, permitindo-me arrastá-las com facilidade de volta para qualquer casa do tabuleiro.
7. **US06-P07:** Como jogador em um mapa infinito procedural, quero ter um minimapa translúcido no canto inferior da tela exibindo a posição do meu exército em relação ao centro e aos demais jogadores.
8. **US06-P08:** Como usuário jogando em tela dividida no tablet, quero que a interface do jogo seja 100% responsiva e recolha automaticamente a barra lateral em um menu colapsável (Drawer) sem quebrar o canvas 3D.
9. **US06-P09:** Como jogador, quando meu peão atingir a borda de promoção, quero que surja um menu modal flutuante centralizado e focado onde eu possa selecionar minha peça de promoção com um único clique rápido.
10. **US06-P10:** Como espectador, quero clicar no avatar de qualquer jogador na barra superior para que a câmera orbital faça uma transição suave e passe a observar a partida sob o ponto de vista daquele jogador.
11. **US06-P11:** Como jogador que gosta de tranquilidade, quero poder recolher todos os elementos do HUD (Modo Imersivo / Fullscreen) com a tecla F11 ou um botão dedicado, ficando apenas com o tabuleiro 3D puro na tela.
12. **US06-P12:** Como competidor com dificuldades visuais de distinção de cores (Daltonismo), quero poder escolher modos de alto contraste para as casas do tabuleiro e para o destaque de peças selecionadas nas opções de acessibilidade.
13. **US06-P13:** Como jogador, quero um botão de "Girar Tabuleiro em 180 Graus" para analisar o jogo sob a perspectiva do meu adversário sem alterar quem está com a vez no relógio.
14. **US06-P14:** Como competidor em partida tensa, quero poder enviar mensagens rápidas pré-configuradas de etiqueta esportiva (ex: "Boa partida!", "Bem jogado!", "Obrigado!") com um único toque no chat.
15. **US06-P15:** Como usuário que acabou de cometer um lance vitorioso, quero ver uma animação comemorativa suave e a exibição clara da tela de vitória com o cálculo de pontos ELO ganhos na partida.

### 14.2 Histórias de Usuário do Desenvolvedor e Arquiteto (Developer/Architect Perspective)
1. **US06-D01:** Como arquiteto front-end, quero garantir que a árvore de componentes do NutriOpus permaneça completamente intacta em seu diretório de origem, importando apenas seus componentes visuais puros através de adaptadores dedicados.
2. **US06-D02:** Como desenvolvedor de UI, quero que o evento de clique na barra lateral HTML execute `e.stopPropagation()`, impedindo categoricamente que cliques na UI atravessem a tela e selecionem casas no canvas WebGL por engano.
3. **US06-D03:** Como engenheiro de performance, quero que a lógica de seleção de peças por clique (Raycasting) use a aceleração BVH do `three-mesh-bvh`, mantendo o tempo de varredura abaixo de 0.2ms por evento.
4. **US06-D04:** Como desenvolvedor de acessibilidade, quero que todas as interações do HUD (relógios, turnos, promoções e botões) contenham atributos ARIA completos para suporte impecável a leitores de tela.
5. **US06-D05:** Como desenvolvedor front-end, quero que as mudanças de tema Dark/Light emitam eventos no `EventBus` que alterem as cores da iluminação (`AmbientLight`, `DirectionalLight`) e da neblina (`FogExp2`) sem recriar o contexto WebGL.
6. **US06-D06:** Como mantenedor do código, quero que os componentes de HUD sejam desacoplados do motor Three.js, consumindo dados exclusivamente através de seletores memoizados do Zustand (`useGameStore(selector)`).
7. **US06-D07:** Como desenvolvedor mobile, quero que o controle de gestos diferencie com precisão toques únicos de seleção de toques contínuos de arrasto e toques duplos de zoom inercial.
8. **US06-D08:** Como designer de interação, quero que a peça sendo arrastada siga um plano matemático virtual em altura constante $Y$, garantindo que a malha 3D nunca atravesse o piso do tabuleiro durante o movimento.
9. **US06-D09:** Como desenvolvedor de testes de UI, quero IDs únicos e semânticos (`data-testid`) em todos os elementos clicáveis do HUD para facilitar a automação de testes End-to-End com Playwright.
10. **US06-D10:** Como desenvolvedor de internacionalização, quero que todos os textos exibidos no HUD e nos diálogos estejam mapeados em arquivos de tradução i18n com suporte nativo a Português e Inglês.

---

## 15. REQUISITOS FUNCIONAIS (RF) - UI/UX E HUD DE INTERATIVIDADE

Abaixo estão formalizados os 15 requisitos funcionais mandatórios do subsistema de interface e interatividade.

1. **RF-01 (Integração com Navbar e Sidebar do NutriOpus):** O sistema deve incorporar a estrutura visual de cabeçalho (Navbar) e menu lateral (Sidebar) do projeto NutriOpus posicionada como um portal DOM sobreposto com `z-index: 10` sobre o canvas 3D.
2. **RF-02 (Alternância Sincronizada de Temas):** O botão de alternância de tema (Light/Dark Mode) da Navbar deve atualizar instantaneamente as classes CSS do HUD e disparar a reconfiguração de luz ambiente, céu e neblina do Three.js.
3. **RF-03 (Interseção e Raycasting 3D com BVH):** O sistema deve interceptar eventos de ponteiro no canvas WebGL e converter coordenadas de tela (X, Y) em seleção de casas e peças com aceleração BVH.
4. **RF-04 (Isolamento de Eventos DOM vs WebGL):** O contêiner de interface HTML deve barrar a propagação de eventos de ponteiro para o canvas subjacente sempre que o cursor estiver sobre botões, menus ou barras laterais.
5. **RF-05 (Sistema de Drag & Drop em Plano Matemático):** O usuário deve poder clicar e arrastar qualquer peça própria sobre um plano virtual no eixo $Y$, com interpolação suave da malha acompanhando o cursor do mouse ou o toque na tela.
6. **RF-06 (Destaque Visual de Casas Válidas e de Captura):** Ao selecionar uma peça, o sistema deve colorir dinamicamente as casas de destino legais em azul translúcido e casas de captura em vermelho vivo sobre o piso do tabuleiro.
7. **RF-07 (Orientação Automática de Câmera Polar para N Jogadores):** Ao iniciar uma partida multijogador em arena hexagonal (4 a 8 jogadores), a câmera deve realizar uma transição suave e se posicionar no ângulo azimutal traseiro do exército do jogador.
8. **RF-08 (Modal Acessível de Promoção de Peças):** Ao atingir a casa de promoção, o sistema deve abrir um modal flutuante com as opções de peças permitidas, pausando o relógio do turno até a confirmação do jogador.
9. **RF-09 (Painel de Relógios e Alerta de Tempo Crítico):** O HUD deve exibir os relógios de tempo restante de todos os jogadores, acionando animação de pulsação e aviso sonoro quando o tempo do jogador ativo atingir menos de 10 segundos.
10. **RF-10 (Gaveta de Peças de Reserva - Crazyhouse HUD):** Em partidas de Crazyhouse, uma gaveta retrátil deve listar as peças capturadas disponíveis para o jogador, permitindo arrastá-las diretamente para casas desocupadas no tabuleiro.
11. **RF-11 (Minimapa Interativo para Tabuleiros Infinitos):** Em modos com tabuleiros procedurais gigantes, o HUD deve exibir um minimapa com visor da câmera, permitindo clicar no minimapa para transladar a visão rapidamente.
12. **RF-12 (Banner de Eventos de Jogo e Animações):** O sistema deve exibir notificações visuais elegantes e não-bloqueantes para eventos como "Xeque", "Xeque-Mate", "Empate Oferecido", "Vitória por Abandono" e "Tempo Esgotado".
13. **RF-13 (Suporte a Gestos Mobile Multi-Touch):** A interface deve interpretar gestos de pinça (Pinch) para zoom in/out, arrasto com dois dedos para pan da câmera e toque simples para seleção em telas de smartphones.
14. **RF-14 (Menu de Ações Rápidas de Partida):** O HUD deve disponibilizar acesso imediato às ações de "Desistir", "Oferecer Empate", "Solicitar Desfazer Lance (Takeback contra Bot)" e "Configurações de Áudio".
15. **RF-15 (Barra de Avaliação Posicional em Tempo Real):** No modo de treino ou análise pós-jogo, a lateral do tabuleiro deve exibir uma barra vertical graduada demonstrando visualmente o equilíbrio de forças calculado pela IA.

---

## 16. REQUISITOS NÃO-FUNCIONAIS (RNF) - INTERFACE, DESEMPENHO E USABILIDADE

Abaixo estão formalizados os 15 requisitos não-funcionais que governam o subsistema de UI/UX.

1. **RNF-01 (Taxa de Quadros Imune a Abertura de Menus):** A expansão ou recolhimento da barra lateral HTML não deve provocar quedas de taxa de quadros abaixo de **60 FPS** na animação do Three.js.
2. **RNF-02 (Latência de Resposta de Clique e Seleção):** O tempo decorrido entre o clique do mouse e o destaque das casas válidas no tabuleiro 3D deve ser inferior a **16 milissegundos** (1 frame).
3. **RNF-03 (Peso do Bundle de Estilos CSS):** O arquivo de estilos consolidado gerado pelo Tailwind CSS não deve ultrapassar **30 Kilobytes** gzippado.
4. **RNF-04 (Conformidade de Acessibilidade Visual - WCAG AA):** Todas as combinações de cores de texto, fundos de botões e contrastes de casas de tabuleiro devem atingir índice de contraste mínimo de **4.5:1** (Padrão WCAG 2.1 AA).
5. **RNF-05 (Responsividade Extrema de Layout):** A interface deve se adaptar fluidamente a resoluções desde telas de smartphones compactos (**360px de largura**) até monitores ultrawide e televisores (**3840px / 4K**).
6. **RNF-06 (Integridade Absoluta do Código do NutriOpus):** O código original contido na pasta `NutriOpus/` **não deve sofrer nenhuma alteração ou gravação de arquivo**, preservando 100% da integridade do projeto de origem.
7. **RNF-07 (Tempo de Resposta em Gestos de Toque):** A taxa de amostragem de gestos de toque no mobile deve responder com taxa de atualização de até **120Hz** em dispositivos compatíveis com telas de alta frequência.
8. **RNF-08 (Orçamento de Renderizações React):** A movimentação contínua de uma peça durante o Drag & Drop nunca deve provocar re-renderizações na árvore raiz do React DOM, operando via transient updates na ref da malha.
9. **RNF-09 (Prevenção de Cliques Fantasma em Mobile):** O sistema deve prevenir o atraso clássico de 300ms de duplo toque em navegadores móveis (`touch-action: none` configurado no canvas).
10. **RNF-10 (Tempo de Transição de Câmera):** A animação inercial de transição de câmera (reposicionamento polar para a perspectiva do jogador) não deve durar mais do que **800 milissegundos**, evitando desorientação do usuário.
11. **RNF-11 (Compatibilidade com Navegadores Modernos):** A interface deve funcionar perfeitamente em 100% dos navegadores modernos (Google Chrome, Mozilla Firefox, Apple Safari e Microsoft Edge) em suas versões estáveis recentes.
12. **RNF-12 (Tolerância a Redimensionamento de Janela):** Ao redimensionar a janela do navegador, o canvas 3D e a projeção de perspectiva da câmera devem se recalibrar em menos de **16ms** sem distorcer o aspecto visual do tabuleiro.
13. **RNF-13 (Cobertura de Testes de Componentes UI):** Os componentes de HUD, modais de promoção e relógios devem possuir cobertura de testes de renderização com React Testing Library superior a **85%**.
14. **RNF-14 (Economia de Consumo Energético):** Quando a aba do jogo estiver minimizada ou em segundo plano, a taxa de atualização do Three.js e do HUD deve ser reduzida para 1 FPS para economizar bateria do usuário.
15. **RNF-15 (Feedback Háptico em Dispositivos Móveis):** Em navegadores que suportam a API de vibração (`navigator.vibrate`), a captura de uma peça ou o estado de xeque deve emitir um pulso háptico tátil sutil de 20ms no celular.

---

## 17. ARQUITETURA DE DEPLOYMENT GRATUITA (FREE TIER) PARA ASSETS DE UI

A interface de usuário do `ChessInReact` foi estruturada para operar com custo de infraestrutura rigorosamente nulo:

1. **Deploy Estático no Vercel Edge Network:** Todo o bundle React compilado (HTML, Tailwind CSS, Javascript, ícones SVG do Lucide e fontes do Google Fonts) é servido estaticamente a partir da CDN global da Vercel no plano gratuito (Hobby Tier). Isso garante tempo de primeiro carregamento (Time to First Byte - TTFB) abaixo de 50ms globalmente sem custo de servidor.
2. **Compressão Brutal de Assets Gráficos:** Ícones e imagens do HUD são servidos em formato vetorial SVG puro ou WebP ultra-comprimido, mantendo o tráfego total da página inicial abaixo de 600KB e consumindo menos de 1% da quota mensal gratuita de 100GB da Vercel.
3. **Distribuição Livre de Egress de Modelos 3D:** Modelos GLB e texturas consumidos pelo Three.js são hospedados no Cloudflare R2 com taxa de saída gratuita (Zero Egress Fees), evitando surpresas orçamentárias com downloads em massa por milhares de usuários simultâneos.

---

## 18. MODOS DE JOGO E SUAS PECULIARIDADES DE INTERFACE

1. **Modo Clássico 1v1:**
   - Exibição de dois relógios digitais limpos posicionados nas extremidades superior e inferior direita do HUD.
   - Histórico de lances em notação algébrica clássica rolável na barra lateral.
2. **Modo Hexagonal FFA (4 a 8 Jogadores):**
   - HUD circular com anéis de jogadores dispostos ao redor da borda da tela. Cada avatar possui borda na cor da facção (Vermelho, Azul, Dourado, Verde, etc.) e seu respectivo temporizador regressivo.
   - O indicador de turno ativo ilumina a moldura do jogador com um brilho neon pulsar.
3. **Modo Simultâneo (Diplomacia / Blind Turns):**
   - Um botão de destaque "Confirmar Lance Secreto" surge no centro inferior da tela. O jogador pode alterar seu lance livremente até que o cronômetro global de 30 segundos se esgote ou até clicar em confirmar.
4. **Modo Infinite Procedural:**
   - Minimapa interativo em tempo real com indicador de coordenadas $(Q, R, S)$ e botão de atalho "Centralizar Câmera no Meu Rei".
5. **Modo Crazyhouse:**
   - Uma barra de inventário horizontal ou vertical exibe miniaturas das peças capturadas disponíveis, com badge numérico indicando a quantidade de cada peça em reserva (ex: 2 Bispos, 1 Cavalo).

---

## 19. SCHEMAS DE DADOS, TIPOS TYPESCRIPT E CONTRATOS DO HUD

Abaixo constam as interfaces tipadas de gerenciamento de interface e temas:

```typescript
// src/ui/interfaces/IUIContracts.ts

export type AppTheme = 'LIGHT' | 'DARK' | 'SYSTEM';

export interface IUIState {
  theme: AppTheme;
  isSidebarOpen: boolean;
  activeSidebarTab: 'GAME' | 'CHAT' | 'INVENTORY' | 'SETTINGS';
  selectedPieceId: string | null;
  hoveredCoord: string | null;
  highlightedCoords: { coord: string; type: 'MOVE' | 'CAPTURE' | 'CHECK' }[];
  isPromotionModalOpen: boolean;
  promotionCoord: string | null;
  cameraPerspectivePlayerId: string | null;
  isMuted: boolean;
  volume: number; // 0.0 a 1.0
}

export interface IPlayerHUDInfo {
  playerId: string;
  displayName: string;
  avatarUrl: string;
  eloRating: number;
  factionColor: string; // Hex color code
  timeLeftMs: number;
  isOnline: boolean;
  isTurnActive: boolean;
  capturedPieces: string[]; // IDs de peças capturadas para Crazyhouse
}

export interface IPromotionChoicePayload {
  pieceId: string;
  targetCoord: string;
  promotedToVariantId: string; // Ex: 'QUEEN', 'KNIGHT', 'CHANCELLOR'
}
```

Contrato JSON para persistência de preferências de interface do usuário:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "UserUIPreferencesPayload",
  "type": "object",
  "required": ["theme", "volume", "cameraAngle", "highContrastMode"],
  "properties": {
    "theme": { "enum": ["LIGHT", "DARK", "SYSTEM"] },
    "volume": { "type": "number", "minimum": 0, "maximum": 1 },
    "cameraAngle": { "enum": ["PERSPECTIVE_FREE", "TOP_DOWN_2D", "LOCKED_ISOMETRIC"] },
    "highContrastMode": { "type": "boolean" },
    "showLegalMoveHighlights": { "type": "boolean" },
    "enableHapticFeedback": { "type": "boolean" }
  }
}
```

---

## 20. CONCLUSÃO ARQUITETURAL DA SPEC 06

A Spec 06 une com excelência o melhor dos dois mundos do desenvolvimento web moderno: a riqueza visual de alto desempenho do WebGL/Three.js com a ergonomia, acessibilidade e flexibilidade do React DOM e do design system clínico do NutriOpus. Ao assegurar o isolamento estrito de eventos, renderizações desassociadas por transient updates, aceleração espacial BVH para cliques e suporte pleno a gestos mobile em todas as topologias, o `ChessInReact` entrega uma interface com acabamento premium de estúdio de jogos, moderna e intuitiva para qualquer dispositivo e resolução.
