import { beforeEach, describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../../../core/coordinates';
import { IPieceEntity } from '../../../core/entities/types';
import { MovePieceCommand } from '../../../core/commands';
import { createGameStore, GameStoreInstance } from '../../../core/state/gameStore';
import { createDefaultDomainState } from '../../../core/state/initialState';
import { PieceAnimationSystem } from '../PieceAnimationSystem';

describe('PieceAnimationSystem (Transient R3F Updates)', () => {
  let store: GameStoreInstance;
  let system: PieceAnimationSystem;

  const piece: IPieceEntity = {
    id: asEntityId('anim-knight'),
    type: 'PIECE',
    ownerId: 'P1',
    variantId: 'KNIGHT',
    position: asCoordinateKey('1,0'),
    hasMoved: false,
    isCaptured: false,
  };

  const dummyResolver = (coord: string) => {
    const [x, y] = coord.split(',').map(Number);
    return { x: x * 10, y: 0, z: y * 10 };
  };

  beforeEach(() => {
    const domain = createDefaultDomainState();
    domain.boardEntities[piece.id] = { ...piece };
    domain.occupancy[piece.position] = piece.id;

    store = createGameStore(domain);
    system = new PieceAnimationSystem(store);
  });

  it('registers 3D object and sets initial position immediately', () => {
    const mock3D = { position: { x: 0, y: 0, z: 0 } };
    const unregister = system.register(piece.id, mock3D, dummyResolver);

    expect(system.getRegisteredCount()).toBe(1);
    expect(mock3D.position.x).toBe(10);
    expect(mock3D.position.z).toBe(0);

    unregister();
    expect(system.getRegisteredCount()).toBe(0);
  });

  it('smoothly interpolates object position towards new target when piece moves', () => {
    const mock3D = { position: { x: 0, y: 0, z: 0 } };
    system.register(piece.id, mock3D, dummyResolver);

    // Initial position is (10, 0, 0)
    expect(mock3D.position.x).toBe(10);

    // Move piece to (2, 2) -> target is (20, 0, 20)
    const moveCmd = new MovePieceCommand(
      piece.id,
      asCoordinateKey('1,0'),
      asCoordinateKey('2,2'),
      'P1'
    );
    store.getState().executeCommand(moveCmd);

    // Call update frame with lerp factor 0.5
    system.update(0.5);

    // x was 10, target 20 -> 10 + (20 - 10) * 0.5 = 15
    expect(mock3D.position.x).toBe(15);
    // z was 0, target 20 -> 0 + (20 - 0) * 0.5 = 10
    expect(mock3D.position.z).toBe(10);

    // Second frame brings it closer
    system.update(0.5);
    expect(mock3D.position.x).toBe(17.5);
    expect(mock3D.position.z).toBe(15);
  });

  it('cleans up resources upon disposal', () => {
    const mock3D = { position: { x: 0, y: 0, z: 0 } };
    system.register(piece.id, mock3D, dummyResolver);

    system.dispose();
    expect(system.getRegisteredCount()).toBe(0);
  });
});
