// WebSocket Service for Mobile Scanner
import { invoke } from '@tauri-apps/api/core';

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
let maxReconnect = 10;
let heartbeatInterval: any = null;

export function connectScannerWebSocket(
  wsUrl: string,
  onMessage: (data: any) => void,
  onStatusChange: (connected: boolean) => void
): void {
  if (ws) {
    ws.close();
    ws = null;
  }

  reconnectAttempts = 0;

  const connect = () => {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      reconnectAttempts = 0;
      onStatusChange(true);
      startHeartbeat();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    ws.onclose = () => {
      onStatusChange(false);
      stopHeartbeat();
      if (reconnectAttempts < maxReconnect) {
        reconnectAttempts++;
        setTimeout(connect, 2000 * reconnectAttempts);
      }
    };

    ws.onerror = () => {
      ws?.close();
    };
  };

  connect();
}

function startHeartbeat() {
  heartbeatInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 30000);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

export function sendScan(barcode: string, deviceName: string = 'Desktop'): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'scan', barcode, deviceName }));
  }
}

export function disconnectWebSocket(): void {
  stopHeartbeat();
  if (ws) {
    ws.close();
    ws = null;
  }
}

export async function startScannerServer(): Promise<any> {
  return invoke<any>('start_scanner_server');
}

export async function getScannerServerStatus(): Promise<any> {
  return invoke<any>('get_scanner_server_status');
}

export async function generatePairingQR(): Promise<any> {
  return invoke<any>('generate_pairing_qr');
}

export async function getConnectedDevices(): Promise<any[]> {
  return invoke<any[]>('get_connected_devices');
}

export async function getScanAuditLogs(limit?: number): Promise<any[]> {
  return invoke<any[]>('get_scan_audit_logs', { limit: limit || 100 });
}

export async function scanBarcodeDirect(barcode: string, deviceName?: string, userRole?: string): Promise<any> {
  return invoke<any>('scan_barcode_direct', { barcode, deviceName: deviceName || null, userRole: userRole || null });
}
