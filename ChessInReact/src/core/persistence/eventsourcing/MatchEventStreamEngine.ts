/**
 * ChessInReact - Match Event Stream Engine (Spec 09 § 4, § 6, RF-02, RF-03)
 *
 * Implements deterministic Event Sourcing move tape:
 * 1. Linear chronological event recording.
 * 2. LZ-style dictionary delta compression for move sequences > 50 plies.
 * 3. 100% deterministic roundtrip reconstruction without data loss.
 */

export interface IMatchEvent {
  readonly ply: number;
  readonly notation: string;
  readonly fromCoord: string;
  readonly toCoord: string;
  readonly pieceId: string;
  readonly capturedPiece?: string;
  readonly timestampMs: number;
}

export interface IMatchEventStream {
  readonly matchId: string;
  readonly initialSeed: string;
  readonly engineVersion: string;
  readonly events: readonly IMatchEvent[];
}

export interface ICompressedEventPayload {
  readonly matchId: string;
  readonly initialSeed: string;
  readonly engineVersion: string;
  readonly uncompressedPlyCount: number;
  readonly isCompressed: boolean;
  readonly dictionary: readonly string[];
  readonly compressedIndices: readonly number[];
  readonly timestampsMs?: readonly number[];
  readonly rawJsonFallback?: string;
}

export class MatchEventStreamEngine {
  public static readonly CURRENT_ENGINE_VERSION = '1.0.0';

  /**
   * Initializes a new Event Stream for a match.
   */
  public static createStream(
    matchId: string,
    initialSeed: string = 'seed_default_0'
  ): IMatchEventStream {
    return {
      matchId,
      initialSeed,
      engineVersion: this.CURRENT_ENGINE_VERSION,
      events: [],
    };
  }

  /**
   * Appends a new move event to the linear stream.
   */
  public static appendEvent(
    stream: IMatchEventStream,
    eventData: Omit<IMatchEvent, 'ply'>
  ): IMatchEventStream {
    const nextPly = stream.events.length + 1;
    const newEvent: IMatchEvent = {
      ...eventData,
      ply: nextPly,
    };

    return {
      ...stream,
      events: [...stream.events, newEvent],
    };
  }

  /**
   * Serializes the stream into a compact linear string tape (e.g. "e2>e4@1200").
   */
  public static exportAsLinearTape(stream: IMatchEventStream): readonly string[] {
    return stream.events.map((evt) => {
      const cap = evt.capturedPiece ? `x${evt.capturedPiece}` : '';
      return `${evt.fromCoord}>${evt.toCoord}${cap}@${evt.timestampMs}`;
    });
  }

  /**
   * Compresses the event stream using Dictionary + Index encoding (Spec 09 RF-03).
   * Automatically activates dictionary compression for streams exceeding 50 plies.
   */
  public static compressStream(stream: IMatchEventStream): ICompressedEventPayload {
    const plies = stream.events.length;

    // For short games (< 50 plies), payload is kept lightweight
    if (plies <= 50) {
      return {
        matchId: stream.matchId,
        initialSeed: stream.initialSeed,
        engineVersion: stream.engineVersion,
        uncompressedPlyCount: plies,
        isCompressed: false,
        dictionary: [],
        compressedIndices: [],
        rawJsonFallback: JSON.stringify(stream.events),
      };
    }

    // Build dictionary of unique serialized move tokens
    const dictionary: string[] = [];
    const dictMap = new Map<string, number>();
    const compressedIndices: number[] = [];
    const timestampsMs: number[] = [];

    for (const event of stream.events) {
      const token = JSON.stringify({
        n: event.notation,
        f: event.fromCoord,
        t: event.toCoord,
        p: event.pieceId,
        c: event.capturedPiece ?? null,
      });

      let index = dictMap.get(token);
      if (index === undefined) {
        index = dictionary.length;
        dictionary.push(token);
        dictMap.set(token, index);
      }
      compressedIndices.push(index);
      timestampsMs.push(event.timestampMs);
    }

    return {
      matchId: stream.matchId,
      initialSeed: stream.initialSeed,
      engineVersion: stream.engineVersion,
      uncompressedPlyCount: plies,
      isCompressed: true,
      dictionary,
      compressedIndices,
      timestampsMs,
    };
  }

  /**
   * Reconstructs an IMatchEventStream with 100% determinism from a compressed payload.
   */
  public static decompressStream(payload: ICompressedEventPayload): IMatchEventStream {
    if (!payload.isCompressed) {
      const parsedEvents: IMatchEvent[] = payload.rawJsonFallback
        ? JSON.parse(payload.rawJsonFallback)
        : [];

      return {
        matchId: payload.matchId,
        initialSeed: payload.initialSeed,
        engineVersion: payload.engineVersion,
        events: parsedEvents,
      };
    }

    // Decompress via dictionary substitution
    const events: IMatchEvent[] = payload.compressedIndices.map((dictIndex, plyIndex) => {
      const tokenJson = payload.dictionary[dictIndex];
      if (!tokenJson) {
        throw new Error(`Índice corrompido no dicionário de eventos: ${dictIndex}`);
      }

      const raw = JSON.parse(tokenJson);
      const timeMs = payload.timestampsMs ? payload.timestampsMs[plyIndex] ?? 0 : raw.ms ?? 0;

      return {
        ply: plyIndex + 1,
        notation: raw.n,
        fromCoord: raw.f,
        toCoord: raw.t,
        pieceId: raw.p,
        capturedPiece: raw.c ?? undefined,
        timestampMs: timeMs,
      };
    });

    return {
      matchId: payload.matchId,
      initialSeed: payload.initialSeed,
      engineVersion: payload.engineVersion,
      events,
    };
  }
}
