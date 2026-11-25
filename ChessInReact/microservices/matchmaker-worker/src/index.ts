/**
 * Matchmaker Worker Service Entrypoint (Spec 08 § 5.2, § 7)
 */
import { EloMatcher } from './EloMatcher';
import { RoomAllocator } from './RoomAllocator';

const TICK_INTERVAL_MS = 1000;
const matcher = new EloMatcher();
const allocator = new RoomAllocator();

let isRunning = true;

export async function runMatchmakerCycle(): Promise<void> {
  const pairs = await matcher.matchTickets();
  for (const pair of pairs) {
    allocator.allocateRoom(pair);
  }
}

export async function startWorkerLoop(): Promise<void> {
  console.log('[MATCHMAKER-WORKER] Engine started.');
  while (isRunning) {
    try {
      await runMatchmakerCycle();
    } catch (err) {
      console.error('[MATCHMAKER-WORKER] Error in matching cycle:', err);
    }
    await new Promise((r) => setTimeout(r, TICK_INTERVAL_MS));
  }
}

export function stopWorkerLoop(): void {
  isRunning = false;
}

if (process.env.NODE_ENV !== 'test') {
  process.on('SIGINT', () => {
    stopWorkerLoop();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    stopWorkerLoop();
    process.exit(0);
  });
  void startWorkerLoop();
}

