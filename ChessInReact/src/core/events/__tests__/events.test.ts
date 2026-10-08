import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asCoordinateKey, asEntityId } from '../../coordinates';
import { EventBus } from '../EventBus';

describe('EventBus (Strongly-typed pub/sub with error isolation)', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('subscribes and receives emitted domain event payload', () => {
    const callback = vi.fn();
    const unsub = bus.subscribe('PIECE_MOVED', callback);

    const payload = {
      pieceId: asEntityId('pawn-e2'),
      from: asCoordinateKey('4,1'),
      to: asCoordinateKey('4,3'),
      actingPlayer: 'P1' as const,
    };

    bus.emit('PIECE_MOVED', payload);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(payload);

    unsub();
    bus.emit('PIECE_MOVED', payload);
    expect(callback).toHaveBeenCalledTimes(1); // not called again
  });

  it('delivers events to multiple subscribers', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    bus.subscribe('CHECK_TRIGGERED', cb1);
    bus.subscribe('CHECK_TRIGGERED', cb2);

    bus.emit('CHECK_TRIGGERED', {
      kingId: asEntityId('king-e1'),
      attackerIds: [asEntityId('bishop-c4')],
    });

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('isolates listener errors so subsequent listeners still execute', () => {
    const errorListener = vi.fn(() => {
      throw new Error('Explosion in audio listener');
    });
    const goodListener = vi.fn();

    const errorHandler = vi.fn();
    bus.setErrorHandler(errorHandler);

    bus.subscribe('PIECE_CAPTURED', errorListener);
    bus.subscribe('PIECE_CAPTURED', goodListener);

    bus.emit('PIECE_CAPTURED', {
      capturedId: asEntityId('pawn-d5'),
      captorId: asEntityId('knight-c3'),
      coordinate: asCoordinateKey('3,4'),
      variantId: 'PAWN',
    });

    expect(errorListener).toHaveBeenCalledTimes(1);
    expect(errorHandler).toHaveBeenCalledTimes(1);
    expect(goodListener).toHaveBeenCalledTimes(1); // Still executed successfully!
  });

  it('tracks listener counts and clears cleanly', () => {
    const cb1 = () => {};
    const cb2 = () => {};

    const unsub1 = bus.subscribe('TIME_WARNING', cb1);
    bus.subscribe('TIME_WARNING', cb2);

    expect(bus.listenerCount('TIME_WARNING')).toBe(2);
    expect(bus.listenerCount()).toBe(2);

    unsub1();
    expect(bus.listenerCount('TIME_WARNING')).toBe(1);

    bus.clear();
    expect(bus.listenerCount()).toBe(0);
  });
});
