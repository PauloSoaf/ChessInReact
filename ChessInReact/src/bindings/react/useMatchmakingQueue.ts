import { useState, useEffect, useRef, useCallback } from 'react';
import { AntiDodgePenaltyManager } from '../../matchmaking/engine/AntiDodgePenaltyManager';
import {
  IMatchTicket,
  IMatchFoundPayload,
  IJoinQueueRequest,
  IMatchmakingQueueClient,
  DEFAULT_MATCHMAKING_CONFIG,
} from '../../matchmaking/interfaces/IMatchmakingContracts';

export type MatchmakingState = 'idle' | 'searching' | 'match_found' | 'in_match' | 'cooldown';

export interface IUseMatchmakingQueueOptions {
  readonly queueClient?: IMatchmakingQueueClient;
  readonly penaltyManager?: AntiDodgePenaltyManager;
  readonly heartbeatIntervalMs?: number;
  readonly acceptTimeoutSeconds?: number;
  readonly onMatchAccepted?: (payload: IMatchFoundPayload) => void;
  readonly onMatchDeclined?: (reason: 'manual' | 'timeout') => void;
}

export interface IUseMatchmakingQueueReturn {
  readonly state: MatchmakingState;
  readonly ticket: IMatchTicket | null;
  readonly elapsedSeconds: number;
  readonly toleranceWindow: number;
  readonly foundMatch: IMatchFoundPayload | null;
  readonly acceptCountdown: number;
  readonly penaltyRemainingSeconds: number;
  readonly isHeartbeatActive: boolean;
  readonly joinQueue: (request: IJoinQueueRequest) => boolean;
  readonly cancelQueue: () => void;
  readonly acceptMatch: () => void;
  readonly declineMatch: (reason?: 'manual' | 'timeout') => void;
  readonly notifyMatchFound: (payload: IMatchFoundPayload) => void;
}

class InMemoryMatchmakingClient implements IMatchmakingQueueClient {
  private readonly tickets = new Map<string, IMatchTicket>();

  public joinQueue(request: IJoinQueueRequest, now: number = Date.now()): IMatchTicket {
    const ticketId = `tkt_client_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const ticket: IMatchTicket = {
      ticketId,
      userId: request.userId,
      displayName: request.displayName,
      eloRating: request.eloRating,
      ratingDeviation: 50,
      variantId: request.variantId,
      topology: request.topology ?? 'SQUARE',
      playerCount: request.playerCount ?? 2,
      createdAtTimestamp: now,
      lastHeartbeatTimestamp: now,
      ttlSeconds: 30,
    };
    this.tickets.set(ticketId, ticket);
    return ticket;
  }

  public leaveQueue(ticketId: string): boolean {
    return this.tickets.delete(ticketId);
  }

  public heartbeat(ticketId: string, now: number = Date.now()): boolean {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return false;
    this.tickets.set(ticketId, { ...ticket, lastHeartbeatTimestamp: now });
    return true;
  }

  public calculateTolerance(waitMs: number): number {
    const intervals = Math.floor(waitMs / DEFAULT_MATCHMAKING_CONFIG.expansionIntervalMs);
    const tolerance =
      DEFAULT_MATCHMAKING_CONFIG.initialTolerance + intervals * DEFAULT_MATCHMAKING_CONFIG.expansionStep;
    return Math.min(DEFAULT_MATCHMAKING_CONFIG.maxTolerance, tolerance);
  }
}

const defaultClient = new InMemoryMatchmakingClient();
const defaultPenalty = new AntiDodgePenaltyManager();

export function useMatchmakingQueue(
  options: IUseMatchmakingQueueOptions = {}
): IUseMatchmakingQueueReturn {
  const client = options.queueClient ?? defaultClient;
  const penalty = options.penaltyManager ?? defaultPenalty;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5000;
  const acceptTimeoutSeconds = options.acceptTimeoutSeconds ?? 10;

  const [state, setState] = useState<MatchmakingState>('idle');
  const [ticket, setTicket] = useState<IMatchTicket | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [toleranceWindow, setToleranceWindow] = useState<number>(
    DEFAULT_MATCHMAKING_CONFIG.initialTolerance
  );
  const [foundMatch, setFoundMatch] = useState<IMatchFoundPayload | null>(null);
  const [acceptCountdown, setAcceptCountdown] = useState<number>(acceptTimeoutSeconds);
  const [penaltyRemainingSeconds, setPenaltyRemainingSeconds] = useState<number>(0);
  const [isHeartbeatActive, setIsHeartbeatActive] = useState<boolean>(false);

  const startTimeRef = useRef<number>(0);
  const currentTicketIdRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

  const handleDecline = useCallback(
    (reason: 'manual' | 'timeout' = 'manual') => {
      // Apply Anti-Dodge penalty (RF-10, US08-P12)
      if (currentUserIdRef.current) {
        const record = penalty.registerDodge(currentUserIdRef.current);
        const lockDuration = Math.ceil((record.lockedUntilMs - Date.now()) / 1000);
        setPenaltyRemainingSeconds(lockDuration);
      } else {
        setPenaltyRemainingSeconds(60);
      }

      setFoundMatch(null);
      setTicket(null);
      currentTicketIdRef.current = null;
      setState('cooldown');
      options.onMatchDeclined?.(reason);
    },
    [penalty, options]
  );

  // 1. Queue timer and tolerance expansion loop
  useEffect(() => {
    if (state !== 'searching' || !ticket) {
      return;
    }

    const timer = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - startTimeRef.current;
      const elapsedSec = Math.floor(elapsedMs / 1000);
      setElapsedSeconds(elapsedSec);

      const tolerance = client.calculateTolerance(elapsedMs);
      setToleranceWindow(tolerance);
    }, 1000);

    return () => clearInterval(timer);
  }, [state, ticket, client]);

  // 2. Heartbeat ping loop (RF-05, US08-D03)
  useEffect(() => {
    if (state !== 'searching' || !currentTicketIdRef.current) {
      setIsHeartbeatActive(false);
      return;
    }

    setIsHeartbeatActive(true);
    const hb = setInterval(() => {
      if (currentTicketIdRef.current) {
        client.heartbeat(currentTicketIdRef.current);
      }
    }, heartbeatIntervalMs);

    return () => {
      clearInterval(hb);
      setIsHeartbeatActive(false);
    };
  }, [state, heartbeatIntervalMs, client]);

  // 3. Match found countdown loop (US08-P09)
  useEffect(() => {
    if (state !== 'match_found') {
      return;
    }

    setAcceptCountdown(acceptTimeoutSeconds);
    const countdown = setInterval(() => {
      setAcceptCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdown);
          handleDecline('timeout');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdown);
  }, [state, acceptTimeoutSeconds, handleDecline]);

  // 4. Cooldown timer loop
  useEffect(() => {
    if (state !== 'cooldown' || penaltyRemainingSeconds <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setPenaltyRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setState('idle');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [state, penaltyRemainingSeconds]);

  const joinQueue = useCallback(
    (request: IJoinQueueRequest): boolean => {
      // Check anti-dodge lock (RF-10)
      const lockCheck = penalty.canJoinQueue(request.userId);
      if (!lockCheck.allowed) {
        setState('cooldown');
        setPenaltyRemainingSeconds(lockCheck.remainingLockSeconds ?? 60);
        return false;
      }

      const now = Date.now();
      startTimeRef.current = now;
      currentUserIdRef.current = request.userId;

      const newTicket = client.joinQueue(request, now);
      currentTicketIdRef.current = newTicket.ticketId;

      setTicket(newTicket);
      setElapsedSeconds(0);
      setToleranceWindow(DEFAULT_MATCHMAKING_CONFIG.initialTolerance);
      setFoundMatch(null);
      setState('searching');
      return true;
    },
    [client, penalty]
  );

  const cancelQueue = useCallback(() => {
    if (currentTicketIdRef.current) {
      client.leaveQueue(currentTicketIdRef.current);
      currentTicketIdRef.current = null;
    }
    setTicket(null);
    setState('idle');
    setElapsedSeconds(0);
  }, [client]);

  const notifyMatchFound = useCallback((payload: IMatchFoundPayload) => {
    setFoundMatch(payload);
    setState('match_found');
  }, []);

  const acceptMatch = useCallback(() => {
    if (state !== 'match_found' || !foundMatch) {
      return;
    }
    setState('in_match');
    options.onMatchAccepted?.(foundMatch);
  }, [state, foundMatch, options]);

  const declineMatch = useCallback(
    (reason: 'manual' | 'timeout' = 'manual') => {
      handleDecline(reason);
    },
    [handleDecline]
  );

  return {
    state,
    ticket,
    elapsedSeconds,
    toleranceWindow,
    foundMatch,
    acceptCountdown,
    penaltyRemainingSeconds,
    isHeartbeatActive,
    joinQueue,
    cancelQueue,
    acceptMatch,
    declineMatch,
    notifyMatchFound,
  };
}
