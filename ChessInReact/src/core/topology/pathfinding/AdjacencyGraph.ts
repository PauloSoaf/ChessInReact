import { CoordinateKey } from '../../coordinates';
import { ITopology } from '../types';

export interface IAdjacencyGraph {
  readonly size: number;
  getNodeId(coord: CoordinateKey): number;
  getCoord(id: number): CoordinateKey;
  getNeighbors(id: number): Int32Array;
}

/**
 * Builds a dense flat array adjacency graph from topology (Spec 02 US02-D09).
 * Eliminates string parsing and object allocation in hot AI/heuristic search loops.
 */
export function buildAdjacencyGraph(
  topology: ITopology,
  coordinates: readonly CoordinateKey[]
): IAdjacencyGraph {
  const coordToId = new Map<CoordinateKey, number>();
  const idToCoord: CoordinateKey[] = new Array(coordinates.length);

  for (let i = 0; i < coordinates.length; i++) {
    const c = coordinates[i];
    coordToId.set(c, i);
    idToCoord[i] = c;
  }

  // Pre-calculate neighbor counts and offsets
  const neighborLists: number[][] = new Array(coordinates.length);
  for (let i = 0; i < coordinates.length; i++) {
    const coord = idToCoord[i];
    const neighbors = topology.getAllNeighbors(coord);
    const validIds: number[] = [];
    for (const n of neighbors) {
      const nid = coordToId.get(n);
      if (nid !== undefined) {
        validIds.push(nid);
      }
    }
    neighborLists[i] = validIds;
  }

  // Flatten into contiguous Int32Array buffers
  const flatNeighbors: Int32Array[] = new Array(coordinates.length);
  for (let i = 0; i < coordinates.length; i++) {
    flatNeighbors[i] = new Int32Array(neighborLists[i]);
  }

  return {
    size: coordinates.length,
    getNodeId(coord: CoordinateKey): number {
      const id = coordToId.get(coord);
      return id !== undefined ? id : -1;
    },
    getCoord(id: number): CoordinateKey {
      return idToCoord[id];
    },
    getNeighbors(id: number): Int32Array {
      if (id < 0 || id >= flatNeighbors.length) {
        return new Int32Array(0);
      }
      return flatNeighbors[id];
    },
  };
}
