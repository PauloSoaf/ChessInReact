export type MultiplayerConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'ERROR';

export interface IClientMovePayload {
  pieceId: string;
  from: string;
  to: string;
  seqId: number;
  clientTimestamp: number;
}

export interface IServerMoveAckPayload {
  seqId: number;
  pieceId: string;
  from: string;
  to: string;
}

export interface IServerRejectMovePayload {
  seqId: number;
  reason: string;
}

export interface IPingPayload {
  clientSendTime: number;
}

export interface IPongPayload {
  clientSendTime: number;
  serverReceiveTime: number;
}

export interface IClockSyncInfo {
  rttMs: number;
  clockOffsetMs: number;
  lastSyncTimestamp: number;
}

export interface IGameOverPayload {
  reason: string;
  winnerId: string;
  timedOutPlayerId?: string;
  forfeitedPlayerId?: string;
  details?: string;
}

export interface IPieceCapturedPayload {
  capturedPieceId: string;
  atCoord: string;
  capturedBy: string;
}
