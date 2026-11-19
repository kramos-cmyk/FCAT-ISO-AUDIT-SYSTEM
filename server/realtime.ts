import type { IncomingMessage, Server } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { verifySessionToken } from './security.js';

interface AuthedSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

export interface RealtimeEvent {
  type:
    | 'connected'
    | 'notification:new'
    | 'dm:new'
    | 'dm:read'
    | 'helpdesk:ticket_created'
    | 'helpdesk:ticket_updated'
    | 'helpdesk:message';
  payload: unknown;
}

const clientsByUser = new Map<string, Set<AuthedSocket>>();

function addClient(userId: string, ws: AuthedSocket) {
  let set = clientsByUser.get(userId);
  if (!set) {
    set = new Set();
    clientsByUser.set(userId, set);
  }
  set.add(ws);
}

function removeClient(ws: AuthedSocket) {
  if (!ws.userId) return;
  const set = clientsByUser.get(ws.userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) {
    clientsByUser.delete(ws.userId);
  }
}

export function emitToUsers(userIds: string[], event: RealtimeEvent): void {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  const data = JSON.stringify(event);
  for (const uid of uniqueIds) {
    const sockets = clientsByUser.get(uid);
    if (!sockets) continue;
    for (const sock of sockets) {
      if (sock.readyState === WebSocket.OPEN) {
        sock.send(data);
      }
    }
  }
}

export function initWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    try {
      const host = request.headers.host || 'localhost';
      const url = new URL(request.url || '/', `http://${host}`);
      if (url.pathname !== '/ws') {
        return;
      }

      const token = url.searchParams.get('token') || '';
      const decoded = token ? verifySessionToken(token) : null;
      if (!decoded?.userId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        const authed = ws as AuthedSocket;
        authed.userId = decoded.userId;
        authed.isAlive = true;
        wss.emit('connection', authed, request);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: AuthedSocket) => {
    if (!ws.userId) {
      ws.close();
      return;
    }
    addClient(ws.userId, ws);

    ws.send(JSON.stringify({ type: 'connected', payload: { userId: ws.userId } }));

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('close', () => {
      removeClient(ws);
    });

    ws.on('error', () => {
      removeClient(ws);
    });
  });

  const interval = setInterval(() => {
    for (const ws of wss.clients) {
      const authed = ws as AuthedSocket;
      if (authed.isAlive === false) {
        removeClient(authed);
        authed.terminate();
        continue;
      }
      authed.isAlive = false;
      authed.ping();
    }
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  return wss;
}
