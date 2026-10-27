import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDeterminismData } from './generateDeterminismManifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function verify() {
  console.log('======================================================');
  console.log('   CROSS-PLATFORM NUMERIC DETERMINISM CHECK (RNF-07)  ');
  console.log('======================================================');
  console.log('Architecture:     ', process.arch);
  console.log('Platform:         ', process.platform);
  console.log('Node.js Version:  ', process.version);
  console.log('V8 Version:       ', process.versions.v8);
  console.log('Timestamp:        ', new Date().toISOString());

  const manifestPath = resolve(__dirname, '../src/core/procedural/determinismManifest.json');
  const goldenContent = readFileSync(manifestPath, 'utf8');
  const golden = JSON.parse(goldenContent);

  const viteServer = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const current = await generateDeterminismData(viteServer);

    console.log('Golden Composite Hash:  ', golden.compositeHash);
    console.log('Current Composite Hash: ', current.compositeHash);

    if (current.compositeHash !== golden.compositeHash) {
      console.error('[FAIL] Hash divergence detected between runtime architecture and golden manifest!');
      process.exit(1);
    }

    console.log('All PRNG hashes:        MATCH (100%)');
    console.log('Simplex noise hash:     MATCH (100%)');
    console.log('Noise generator hashes: MATCH (100%)');
    console.log('Chunk generator hashes: MATCH (100%)');
    console.log('Verdict:                PASS (Exact bit-for-bit equivalence)');
    console.log('======================================================');
  } finally {
    try {
      await viteServer.close();
    } catch {
      // ignore close interruptions
    }
    process.exitCode = 0;
  }
}

verify().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
