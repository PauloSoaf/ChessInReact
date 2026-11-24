import { describe, it, expect } from 'vitest';
import { DistributedQueueLock } from '../engine/DistributedQueueLock';

describe('Spec 08 - Distributed Queue Lock (Redlock Pattern) (Spec 08 § 9.2, RF-02, RNF-12)', () => {
  it('acquires lock and releases with valid token', () => {
    const lockManager = new DistributedQueueLock();
    const { acquired, token } = lockManager.acquire('lock:queue:standard', 100, 'worker_1', 1000);

    expect(acquired).toBe(true);
    expect(token).toBeDefined();
    expect(lockManager.isLocked('lock:queue:standard', 1050)).toBe(true);

    const released = lockManager.release('lock:queue:standard', token!);
    expect(released).toBe(true);
    expect(lockManager.isLocked('lock:queue:standard', 1050)).toBe(false);
  });

  it('rejects concurrent acquisition on the same resource', () => {
    const lockManager = new DistributedQueueLock();
    const now = 2000;

    const res1 = lockManager.acquire('lock:queue:hex4', 100, 'worker_A', now);
    expect(res1.acquired).toBe(true);

    // Worker B attempts to acquire during lock validity window
    const res2 = lockManager.acquire('lock:queue:hex4', 100, 'worker_B', now + 20);
    expect(res2.acquired).toBe(false);
    expect(res2.token).toBeUndefined();
  });

  it('prevents worker B from releasing a lock acquired by worker A (token guard)', () => {
    const lockManager = new DistributedQueueLock();
    const resA = lockManager.acquire('lock:queue:atomic', 100, 'worker_A', 3000);
    expect(resA.acquired).toBe(true);

    // Worker B tries to spoof release
    const spoofReleased = lockManager.release('lock:queue:atomic', 'invalid_token');
    expect(spoofReleased).toBe(false);

    // Lock remains held
    expect(lockManager.isLocked('lock:queue:atomic', 3050)).toBe(true);

    // Worker A legitimately releases
    const legitReleased = lockManager.release('lock:queue:atomic', resA.token!);
    expect(legitReleased).toBe(true);
  });

  it('auto-expires lock after TTL allowing subsequent worker acquisition', () => {
    const lockManager = new DistributedQueueLock();
    const now = 4000;

    lockManager.acquire('lock:queue:ttl', 100, 'worker_A', now);
    expect(lockManager.isLocked('lock:queue:ttl', now + 50)).toBe(true);

    // After 100ms TTL
    expect(lockManager.isLocked('lock:queue:ttl', now + 101)).toBe(false);

    const resB = lockManager.acquire('lock:queue:ttl', 100, 'worker_B', now + 105);
    expect(resB.acquired).toBe(true);
  });

  it('safely wraps actions using withLock and releases even on error', async () => {
    const lockManager = new DistributedQueueLock();

    const successRes = await lockManager.withLock('lock:safe', () => 'computed_value', 100);
    expect(successRes.success).toBe(true);
    expect(successRes.result).toBe('computed_value');
    expect(lockManager.isLocked('lock:safe')).toBe(false);

    // Error test
    await expect(
      lockManager.withLock('lock:safe_err', () => {
        throw new Error('Simulation fault');
      })
    ).rejects.toThrow('Simulation fault');

    // Must be released despite exception
    expect(lockManager.isLocked('lock:safe_err')).toBe(false);
  });

  it('prevents duplicate processing in high-concurrency 5-worker cluster simulation (RNF-12)', async () => {
    const lockManager = new DistributedQueueLock();
    const resource = 'lock:queue:concurrency_slice';

    let processedCount = 0;
    const workerAttempts = Array.from({ length: 5 }, (_, i) => async () => {
      const lockRes = await lockManager.withLock(
        resource,
        async () => {
          processedCount++;
          return `done_worker_${i}`;
        },
        50,
        `worker_${i}`
      );
      return lockRes;
    });

    // Run all 5 simultaneously
    const results = await Promise.all(workerAttempts.map((fn) => fn()));

    const successfulLocks = results.filter((r) => r.success);
    // Exactly 1 worker acquired the lock during the micro-window
    expect(successfulLocks).toHaveLength(1);
    expect(processedCount).toBe(1);
  });
});
