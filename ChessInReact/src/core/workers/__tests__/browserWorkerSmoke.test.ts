import { describe, expect, it } from 'vitest';
import { runChromiumWorkerSmokeTest } from '../../../../scripts/runChromiumSmoke.js';

describe('Real Chromium Web Worker Smoke Test (Spec 01 Verification & Spec 02 Pre-requisite)', () => {
  it('executes native Web Worker in headless Chromium with full PING/PONG and state transfer', async () => {
    const result = await runChromiumWorkerSmokeTest();
    expect(result.success).toBe(true);
    expect(result.result).toContain('SUCCESS:');
    if (!result.skipped) {
      expect(result.result).toContain('"schemaVersion":1');
      expect(result.result).toContain('"id":"p1"');
    }
  }, 15000);
});
