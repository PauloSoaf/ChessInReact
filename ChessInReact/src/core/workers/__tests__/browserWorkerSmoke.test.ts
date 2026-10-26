import { describe, expect, it } from 'vitest';
import { runChromiumWorkerSmokeTest } from '../../../../scripts/runChromiumSmoke.js';

describe('Real Chromium Web Worker Smoke Test (Spec 01 Verification & Spec 02 Pre-requisite)', () => {
  it('executes native Web Worker in headless Chromium with full PING/PONG, 256-cell chunk gen and pathfinding', async () => {
    const result = await runChromiumWorkerSmokeTest();

    if (process.env.CI) {
      // In CI, skipped test is an immediate failure
      expect(result.skipped).toBe(false);
    }

    expect(result.success).toBe(true);
    expect(result.result).toContain('SUCCESS:');

    if (!result.skipped) {
      expect(result.result).toContain('"handshake":"PONG"');
      expect(result.result).toContain('"entityCount":1');
      expect(result.result).toContain('"cellCount":256');
      expect(result.result).toContain('"pathFound":true');
    }
  }, 35000);
});
