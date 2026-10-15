import { CoordinateKey } from '../../coordinates';
import { ITopology } from '../types';

export interface IAStarOptions {
  readonly isWalkable?: (coord: CoordinateKey) => boolean;
  readonly getCost?: (from: CoordinateKey, to: CoordinateKey) => number;
  readonly maxNodes?: number;
  readonly minEdgeCost?: number; // Minimum edge weight for heuristic scaling (admissibility)
}

export interface IPathResult {
  readonly found: boolean;
  readonly path: CoordinateKey[];
  readonly cost: number;
  readonly nodesVisited: number;
}

interface PriorityNode {
  readonly coord: CoordinateKey;
  readonly f: number;
  readonly g: number;
  readonly order: number;
}

class MinPriorityQueue {
  private heap: PriorityNode[] = [];
  private counter = 0;

  public get size(): number {
    return this.heap.length;
  }

  public push(node: Omit<PriorityNode, 'order'>): void {
    this.heap.push({ ...node, order: this.counter++ });
    this.bubbleUp(this.heap.length - 1);
  }

  public pop(): PriorityNode | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.bubbleDown(0);
    }
    return top;
  }

  private isBetter(a: PriorityNode, b: PriorityNode): boolean {
    if (a.f !== b.f) return a.f < b.f;
    if (a.g !== b.g) return a.g > b.g; // Prefer nodes closer to goal on equal f
    return a.order < b.order; // Stable FIFO tie-breaking preserving natural neighbor expansion order
  }

  private bubbleUp(idx: number): void {
    const node = this.heap[idx];
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      const parent = this.heap[parentIdx];
      if (!this.isBetter(node, parent)) break;
      this.heap[idx] = parent;
      idx = parentIdx;
    }
    this.heap[idx] = node;
  }

  private bubbleDown(idx: number): void {
    const length = this.heap.length;
    const node = this.heap[idx];
    let bubbling = true;
    while (bubbling) {
      const leftIdx = (idx << 1) + 1;
      const rightIdx = leftIdx + 1;
      let smallest = idx;

      if (leftIdx < length && this.isBetter(this.heap[leftIdx], this.heap[smallest])) {
        smallest = leftIdx;
      }
      if (rightIdx < length && this.isBetter(this.heap[rightIdx], this.heap[smallest])) {
        smallest = rightIdx;
      }
      if (smallest === idx) {
        bubbling = false;
        break;
      }

      this.heap[idx] = this.heap[smallest];
      this.heap[smallest] = node;
      idx = smallest;
    }
  }
}

/**
 * Deterministic A* Pathfinding for arbitrary topologies (Spec 02 Section 9, PATCH-02).
 * Handles variable edge costs correctly using a multi-entry priority queue with
 * stale-entry rejection and admissible topology-aware heuristics.
 */
export function findPathAStar(
  topology: ITopology,
  start: CoordinateKey,
  goal: CoordinateKey,
  options?: IAStarOptions
): IPathResult {
  if (start === goal) {
    return { found: true, path: [start], cost: 0, nodesVisited: 1 };
  }

  const isWalkable = options?.isWalkable ?? (() => true);
  const getCost = options?.getCost ?? (() => 1);
  const maxNodes = options?.maxNodes ?? 10000;
  const minEdgeCost = options?.minEdgeCost ?? 1.0;

  if (minEdgeCost <= 0 || Number.isNaN(minEdgeCost)) {
    throw new Error(`Invalid minEdgeCost: ${minEdgeCost}. Minimum edge cost must be strictly positive.`);
  }

  if (!isWalkable(goal) || !isWalkable(start)) {
    return { found: false, path: [], cost: Infinity, nodesVisited: 0 };
  }

  const openQueue = new MinPriorityQueue();
  const closedSet = new Set<CoordinateKey>();

  const gScore = new Map<CoordinateKey, number>();
  const cameFrom = new Map<CoordinateKey, CoordinateKey>();

  gScore.set(start, 0);
  const startH = topology.getDistance(start, goal) * minEdgeCost;
  openQueue.push({ coord: start, f: startH, g: 0 });

  let nodesVisited = 0;

  while (openQueue.size > 0 && nodesVisited < maxNodes) {
    const current = openQueue.pop()!;

    // Stale queue entry rejection (PATCH-02):
    // If a shorter path to this node was already processed or queued, discard the obsolete entry.
    const bestG = gScore.get(current.coord);
    if (bestG !== undefined && current.g > bestG) {
      continue;
    }

    nodesVisited++;

    if (current.coord === goal) {
      // Reconstruct optimal path
      const path: CoordinateKey[] = [goal];
      let curr = goal;
      while (cameFrom.has(curr)) {
        curr = cameFrom.get(curr)!;
        path.push(curr);
      }
      path.reverse();
      return {
        found: true,
        path,
        cost: gScore.get(goal) ?? 0,
        nodesVisited,
      };
    }

    closedSet.add(current.coord);
    const neighbors = topology.getAllNeighbors(current.coord);

    for (const neighbor of neighbors) {
      if (closedSet.has(neighbor)) continue;
      if (!isWalkable(neighbor)) continue;

      const edgeCost = getCost(current.coord, neighbor);
      if (Number.isNaN(edgeCost)) {
        throw new Error(`Invalid edge cost: NaN between "${current.coord}" and "${neighbor}".`);
      }
      if (edgeCost < 0) {
        throw new Error(`Invalid edge cost: negative weight ${edgeCost} between "${current.coord}" and "${neighbor}".`);
      }
      if (!Number.isFinite(edgeCost)) {
        continue; // Impassable edge
      }

      const tentativeG = (gScore.get(current.coord) ?? Infinity) + edgeCost;
      const currentNeighborG = gScore.get(neighbor) ?? Infinity;

      if (tentativeG < currentNeighborG) {
        cameFrom.set(neighbor, current.coord);
        gScore.set(neighbor, tentativeG);

        const h = topology.getDistance(neighbor, goal) * minEdgeCost;
        const f = tentativeG + h;

        openQueue.push({ coord: neighbor, f, g: tentativeG });
      }
    }
  }

  return { found: false, path: [], cost: Infinity, nodesVisited };
}
