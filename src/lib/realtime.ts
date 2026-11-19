import { useEffect } from 'react';
import { getToken } from './api';

export interface RealtimeMessage {
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

type Listener = (msg: RealtimeMessage) => void;

let socket: WebSocket | null = null;
let connectedToken: string | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempt = 0;
const listeners = new Set<Listener>();

function clearReconnect() {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (listeners.size === 0) return;
  const token = getToken();
  if (!token) return;
  clearReconnect();
  const delay = Math.min(15000, 1000 * Math.pow(1.6, reconnectAttempt));
  reconnectAttempt += 1;
  reconnectTimer = window.setTimeout(() => {
    connectSocket();
  }, delay);
}

function connectSocket() {
  const token = getToken();
  if (!token) {
    disconnectRealtime();
    return;
  }
  if (
    socket &&
    connectedToken === token &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  if (socket) {
    try {
      socket.close();
    } catch {
      // ignore
    }
    socket = null;
  }

  connectedToken = token;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(url);
  socket = ws;

  ws.onopen = () => {
    reconnectAttempt = 0;
  };

  ws.onmessage = (evt) => {
    try {
      const parsed = JSON.parse(String(evt.data || '')) as RealtimeMessage;
      if (parsed && parsed.type) {
        listeners.forEach((fn) => fn(parsed));
      }
    } catch {
      // ignore malformed messages
    }
  };

  ws.onclose = () => {
    if (socket === ws) {
      socket = null;
      connectedToken = null;
    }
    scheduleReconnect();
  };

  ws.onerror = () => {
    // close handler triggers reconnect
  };
}

export function disconnectRealtime() {
  clearReconnect();
  reconnectAttempt = 0;
  connectedToken = null;
  if (socket) {
    try {
      socket.close();
    } catch {
      // ignore
    }
    socket = null;
  }
}

export function useRealtimeSubscription(onEvent: Listener, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    listeners.add(onEvent);
    connectSocket();
    return () => {
      listeners.delete(onEvent);
      if (listeners.size === 0) {
        disconnectRealtime();
      }
    };
  }, [onEvent, enabled]);
}
