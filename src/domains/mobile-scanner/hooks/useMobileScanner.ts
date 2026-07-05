// useMobileScanner Hook
import { useState, useEffect, useCallback } from 'react';
import { useMobileScannerStore } from '../store/mobileScanner.store';
import {
  startScannerServer,
  getScannerServerStatus,
  generatePairingQR,
  getConnectedDevices,
  getScanAuditLogs,
} from '../services/scannerSocket';

export function useMobileScanner() {
  const store = useMobileScannerStore();
  const [loading, setLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const initServer = useCallback(async () => {
    setLoading(true);
    try {
      const status = await startScannerServer();
      store.setServerStatus(status);
    } catch (e) {
      console.error('Failed to start scanner server:', e);
    } finally {
      setLoading(false);
    }
  }, [store]);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await getScannerServerStatus();
      store.setServerStatus(status);
    } catch (e) {
      console.error(e);
    }
  }, [store]);

  const generateQR = useCallback(async () => {
    try {
      const result = await generatePairingQR();
      store.setPairingQR(result.qrCode, result.url);
      store.setShowQRModal(true);
    } catch (e) {
      console.error('Failed to generate QR:', e);
    }
  }, [store]);

  const refreshDevices = useCallback(async () => {
    try {
      const devices = await getConnectedDevices();
      store.setConnectedDevices(devices);
    } catch (e) {
      console.error(e);
    }
  }, [store]);

  const loadAuditLogs = useCallback(async () => {
    try {
      const logs = await getScanAuditLogs(50);
      setAuditLogs(logs);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    initServer();
  }, [initServer]);

  return {
    loading,
    auditLogs,
    initServer,
    refreshStatus,
    generateQR,
    refreshDevices,
    loadAuditLogs,
  };
}
