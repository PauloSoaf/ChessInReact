/**
 * ChessInReact - Simultaneous Turn Resolution Engine (Spec 14 § 6, RF-14-05, RNF-14-02)
 *
 * Implements Diplomacy Chess concurrent action arbitration:
 * 1. Independent moves proceed simultaneously.
 * 2. Head-on collision (two pieces moving to the same destination): both bounce back to origin.
 * 3. Swap collision (piece A -> B's square and piece B -> A's square): both bounce back.
 * 4. Deterministic and fast (< 10ms for 12 orders).
 */

import {
  ISimultaneousMoveOrder,
  IArbitrationResult,
} from './interfaces/IArenaContracts';

export class SimultaneousResolutionEngine {
  public static arbitrateTurn(
    orders: readonly ISimultaneousMoveOrder[],
    initialOccupancy: Readonly<Record<string, string>> // coordKey -> pieceId
  ): IArbitrationResult {
    const executedMoves: ISimultaneousMoveOrder[] = [];
    const bouncedMoves: {
      order: ISimultaneousMoveOrder;
      bounceReason: 'HEAD_ON_COLLISION' | 'SWAP_COLLISION' | 'BLOCKED_BY_OBSTACLE';
    }[] = [];

    // Group by destination to detect Head-On collisions
    const destMap = new Map<string, ISimultaneousMoveOrder[]>();
    for (const order of orders) {
      const list = destMap.get(order.toCoord) ?? [];
      list.push(order);
      destMap.set(order.toCoord, list);
    }

    // Map of origin -> order to detect Swap collisions
    const originMap = new Map<string, ISimultaneousMoveOrder>();
    for (const order of orders) {
      originMap.set(order.fromCoord, order);
    }

    const bouncedOrderSet = new Set<ISimultaneousMoveOrder>();

    // 1. Check Head-on collisions (2 or more trying to land on same coord)
    for (const [, group] of destMap.entries()) {
      if (group.length > 1) {
        for (const order of group) {
          bouncedOrderSet.add(order);
          bouncedMoves.push({
            order,
            bounceReason: 'HEAD_ON_COLLISION',
          });
        }
      }
    }

    // 2. Check Swap collisions (A -> B.from && B -> A.from)
    for (const orderA of orders) {
      if (bouncedOrderSet.has(orderA)) continue;

      const orderB = originMap.get(orderA.toCoord);
      if (orderB && orderB.toCoord === orderA.fromCoord) {
        bouncedOrderSet.add(orderA);
        bouncedOrderSet.add(orderB);
        bouncedMoves.push({ order: orderA, bounceReason: 'SWAP_COLLISION' });
        bouncedMoves.push({ order: orderB, bounceReason: 'SWAP_COLLISION' });
      }
    }

    // 3. Any order that did not bounce executes
    for (const order of orders) {
      if (!bouncedOrderSet.has(order)) {
        executedMoves.push(order);
      }
    }

    // 4. Build resulting occupancy
    const nextOccupancy: Record<string, string> = { ...initialOccupancy };
    for (const move of executedMoves) {
      delete nextOccupancy[move.fromCoord];
      nextOccupancy[move.toCoord] = move.pieceId;
    }

    return {
      executedMoves,
      bouncedMoves,
      resolvedOccupancy: nextOccupancy,
    };
  }
}
