/**
 * ChessInReact - Matchmaker API Gateway Route Definitions (Spec 08 § 2, § 5)
 */

import { MatchmakerController, IHttpRequest, IHttpResponse } from '../controllers/MatchmakerController';

export interface IMatchmakerRouter {
  dispatch(method: string, path: string, req: IHttpRequest): IHttpResponse;
}

export function createMatchmakerRouter(controller = new MatchmakerController()): IMatchmakerRouter {
  return {
    dispatch(method: string, path: string, req: IHttpRequest): IHttpResponse {
      const m = method.toUpperCase();

      if (m === 'POST' && path === '/api/matchmaking/join') {
        return controller.handleJoinQueue(req);
      }
      if (m === 'POST' && path === '/api/matchmaking/leave') {
        return controller.handleLeaveQueue(req);
      }
      if (m === 'POST' && path === '/api/matchmaking/ping') {
        return controller.handleHeartbeat(req);
      }
      if (m === 'GET' && path === '/api/lobbies') {
        return controller.handleGetLobbies();
      }
      if (m === 'POST' && path === '/api/lobbies/create') {
        return controller.handleCreateLobby(req);
      }
      if (m === 'POST' && path === '/api/lobbies/join') {
        return controller.handleJoinLobby(req);
      }

      return {
        status: 404,
        body: { error: `Route not found: ${m} ${path}` },
      };
    },
  };
}

