// Scanner Connection Status Hook
import { useState, useEffect } from 'react';

export function useScannerConnection(wsUrl: string | null) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!wsUrl) return;

    let ws: WebSocket | null = null;
    let heartbeat: any = null;
    let reconnectTimer: any = null;

    const connect = () => {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setConnected(true);
        heartbeat = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onclose = () => {
        setConnected(false);
        clearInterval(heartbeat);
        reconnectTimer = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      clearInterval(heartbeat);
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [wsUrl]);

  return { connected };
}
