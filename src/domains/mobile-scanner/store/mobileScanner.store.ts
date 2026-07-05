import { create } from 'zustand';

interface MobileScannerState {
  serverRunning: boolean;
  serverUrl: string;
  wsUrl: string;
  mobileUrl: string;
  localIp: string;
  port: number;
  connectedDevices: any[];
  scanHistory: any[];
  pairingQR: string | null;
  pairingUrl: string | null;
  showQRModal: boolean;

  setServerStatus: (status: any) => void;
  setConnectedDevices: (devices: any[]) => void;
  addScanResult: (result: any) => void;
  setPairingQR: (qr: string, url: string) => void;
  setShowQRModal: (show: boolean) => void;
  clearHistory: () => void;
}

export const useMobileScannerStore = create<MobileScannerState>((set) => ({
  serverRunning: false,
  serverUrl: '',
  wsUrl: '',
  mobileUrl: '',
  localIp: '',
  port: 8080,
  connectedDevices: [],
  scanHistory: [],
  pairingQR: null,
  pairingUrl: null,
  showQRModal: false,

  setServerStatus: (status) => set({
    serverRunning: true,
    wsUrl: status.wsUrl || '',
    mobileUrl: status.mobileUrl || '',
    localIp: status.ip || '',
    port: status.port || 8080,
  }),

  setConnectedDevices: (devices) => set({ connectedDevices: devices }),

  addScanResult: (result) => set((state) => ({
    scanHistory: [result, ...state.scanHistory].slice(0, 50),
  })),

  setPairingQR: (qr, url) => set({ pairingQR: qr, pairingUrl: url }),

  setShowQRModal: (show) => set({ showQRModal: show }),

  clearHistory: () => set({ scanHistory: [] }),
}));
