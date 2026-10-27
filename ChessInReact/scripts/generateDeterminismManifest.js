import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'number') {
      // Normalize zero and NaN / Infinity
      if (Object.is(obj, -0)) return '0';
      return Number(obj.toFixed(10)).toString();
    }
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

export function computeSha256(data) {
  const str = typeof data === 'string' ? data : stableStringify(data);
  return createHash('sha256').update(str, 'utf8').digest('hex');
}

export async function generateDeterminismData(viteServer) {
  const { AleaPRNG } = await viteServer.ssrLoadModule('./src/core/procedural/prng/AleaPRNG.ts');
  const { SimplexNoise2D } = await viteServer.ssrLoadModule('./src/core/procedural/noise/SimplexNoise2D.ts');
  const { NoiseGenerator } = await viteServer.ssrLoadModule('./src/core/procedural/NoiseGenerator.ts');
  const { ChunkManager } = await viteServer.ssrLoadModule('./src/core/procedural/ChunkManager.ts');
  const { SquareTopology } = await viteServer.ssrLoadModule('./src/core/topology/SquareTopology.ts');
  const { HexTopology } = await viteServer.ssrLoadModule('./src/core/topology/HexTopology.ts');
  const { TriangleTopology } = await viteServer.ssrLoadModule('./src/core/topology/TriangleTopology.ts');
  const { VoronoiTopology } = await viteServer.ssrLoadModule('./src/core/topology/VoronoiTopology.ts');

  // 1. AleaPRNG deterministic sequence hashes across distinct seed classes
  const prngSeeds = [
    'numeric-seed-12345',
    'alpha-seed-chess-42',
    'special-seed-!@#$%^&*()_+~çáéíóú',
    'large-magnitude-2147483647',
    'empty-seed-',
  ];

  const prngHashes = {};
  for (const seed of prngSeeds) {
    const rng = new AleaPRNG(seed);
    const floats = [];
    const ints = [];
    for (let i = 0; i < 500; i++) {
      floats.push(Number(rng.next().toFixed(12)));
      ints.push(rng.nextInt(-1000, 1000));
    }
    prngHashes[seed] = {
      floatHash: computeSha256(floats),
      intHash: computeSha256(ints),
    };
  }

  // 2. SimplexNoise2D deterministic evaluation across coordinate ranges
  const simplex = new SimplexNoise2D('simplex-determinism-seed');
  const noiseCoords = [
    [0.0, 0.0],
    [10.5, -20.25],
    [-50000.75, 49999.125],
    [1234.56, -7890.12],
    [0.0001, -0.0001],
  ];
  const noiseValues = noiseCoords.map(([x, y]) => ({
    coord: [x, y],
    raw2D: Number(simplex.noise2D(x, y).toFixed(12)),
    fbm4: Number(simplex.fbm(x, y, 4, 0.5, 0.05).toFixed(12)),
  }));
  const simplexHash = computeSha256(noiseValues);

  // 3. NoiseGenerator evaluation across all 4 topologies
  const topologies = {
    square: new SquareTopology({ width: null, height: null }),
    hex: new HexTopology(),
    triangle: new TriangleTopology(),
    voronoi: new VoronoiTopology({ seed: '4242', boundingRadius: 200, cellSize: 10 }),
  };

  const noiseGenHashes = {};
  for (const [topoName, topo] of Object.entries(topologies)) {
    const gen = new NoiseGenerator({ seed: `noise-gen-${topoName}` });
    const samples = [];
    const testKeys = topoName === 'hex'
      ? ['0,0,0', '5,-2,-3', '-10,5,5', '30,-15,-15']
      : topoName === 'square'
      ? ['0,0', '15,15', '-20,-20', '100,-100']
      : topoName === 'triangle'
      ? ['0,0,0', '4,-2,-2', '-8,4,4']
      : ['v_0_0', 'v_10_10', 'v_-5_5'];

    for (const key of testKeys) {
      try {
        const cell = gen.generateCell(key, topo);
        samples.push({
          coord: key,
          elevation: Number(cell.elevation.toFixed(10)),
          biome: cell.biome,
          isObstacle: cell.isObstacle,
          costMultiplier: Number(cell.costMultiplier.toFixed(10)),
        });
      } catch {
        // Skip invalid synthetic coordinates for topologies that validate pattern
      }
    }
    noiseGenHashes[topoName] = computeSha256(samples);
  }

  // 4. ChunkManager deterministic chunk generation and serialization
  const hexManager = new ChunkManager(topologies.hex, {
    seed: 'chunk-multiplatform-seed',
    chunkSize: 16,
    maxChunksInMemory: 50,
  });

  const chunk00 = hexManager.getOrGenerateChunk({ chunkX: 0, chunkY: 0 });
  const chunk1neg1 = hexManager.getOrGenerateChunk({ chunkX: 1, chunkY: -1 });

  const chunk00Summary = {
    chunkId: chunk00.chunkId,
    cellCount: Object.keys(chunk00.cells).length,
    sampleCells: Object.entries(chunk00.cells).slice(0, 5).map(([k, v]) => ({
      k,
      elevation: Number(v.elevation.toFixed(10)),
      biome: v.biome,
      isObstacle: v.isObstacle,
    })),
  };

  const chunk1neg1Summary = {
    chunkId: chunk1neg1.chunkId,
    cellCount: Object.keys(chunk1neg1.cells).length,
    sampleCells: Object.entries(chunk1neg1.cells).slice(0, 5).map(([k, v]) => ({
      k,
      elevation: Number(v.elevation.toFixed(10)),
      biome: v.biome,
      isObstacle: v.isObstacle,
    })),
  };

  const chunk00Hash = computeSha256(chunk00Summary);
  const chunk1neg1Hash = computeSha256(chunk1neg1Summary);

  const manifest = {
    schemaVersion: 1,
    prngHashes,
    simplexHash,
    noiseGenHashes,
    chunkHashes: {
      chunk_0_0: chunk00Hash,
      chunk_1_neg1: chunk1neg1Hash,
    },
    compositeHash: '',
  };

  manifest.compositeHash = computeSha256({
    prngHashes: manifest.prngHashes,
    simplexHash: manifest.simplexHash,
    noiseGenHashes: manifest.noiseGenHashes,
    chunkHashes: manifest.chunkHashes,
  });

  return manifest;
}

async function main() {
  const viteServer = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const manifest = await generateDeterminismData(viteServer);
    const targetDir = resolve(__dirname, '../src/core/procedural');
    mkdirSync(targetDir, { recursive: true });
    const targetFile = resolve(targetDir, 'determinismManifest.json');
    writeFileSync(targetFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    console.log('[DETERMINISM] Generated manifest successfully:');
    console.log('  Composite Hash:', manifest.compositeHash);
    console.log('  Target File:   ', targetFile);
  } finally {
    await viteServer.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[DETERMINISM ERROR]', err);
    process.exit(1);
  });
}
